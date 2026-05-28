const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('../services/plantilla');
const { generarToken } = require('../services/token');
const { notificarFirmaTrabajador } = require('../services/email');

const router = express.Router();

const EDITOR_HTML    = path.join(__dirname, '../views/admin/editor.html');
const TRASLADOS_HTML = path.join(__dirname, '../views/admin/traslados.html');
const TABLA_TR       = 'Dynamic_traslados_trabajador';
const CAMPO_FK       = 'IdTraslado';
const ESTADOS_VALIDOS_CAMBIO = ['revisar', 'anulado', 'pendiente'];

const ROLES_ACCESO      = ['AuxiliarR','CoordinadorR','Auxiliar','Coordinador','Control','Nomina','Sistema','Juridica'];
const ROLES_VALIDAR      = ['Juridica','Sistema'];
const ROLES_PLANTILLA    = ['Juridica','Sistema'];
const ROLES_PREVIEW      = ['Juridica','Sistema'];
const ROLES_SIN_FILTRO  = ['Control','Nomina','Sistema','Juridica'];
const ROLES_REGIONAL    = ['AuxiliarR','CoordinadorR'];
const ROLES_DISPOSITIVO = ['Auxiliar','Coordinador'];

// ── Editor plantilla ────────────────────────────────────────────────────────

router.get('/plantillas/editar/:proceso', async (req, res) => {
  try {
    const plantilla = await obtenerPlantilla(req.params.proceso);
    const template = fs.readFileSync(EDITOR_HTML, 'utf8');
    const contenidoSafe = JSON.stringify(plantilla.contenido_html || '')
      .replace(/<\/script>/gi, '<\\/script>');
    const html = template
      .replace(/__PROCESO__/g, plantilla.nombre_proceso)
      .replace('__CONTENIDO_HTML__', contenidoSafe);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(404).send('Plantilla no encontrada');
  }
});

router.post('/plantillas/editar/:proceso', async (req, res) => {
  try {
    const { contenido_html } = req.body;
    await pool.execute(
      `UPDATE Maestro_Plantillas
       SET contenido_html = ?, ultima_actualizacion = NOW(), version = version + 1
       WHERE LOWER(nombre_proceso) = LOWER(?)`,
      [contenido_html, req.params.proceso]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatFecha(val) {
  if (!val) return '—';
  const s = typeof val === 'string' ? val : val.toISOString();
  return s.slice(0, 10);
}

function formatFechaHora(val) {
  if (!val) return '—';
  const s = typeof val === 'string' ? val : val.toISOString().replace('T', ' ');
  return s.slice(0, 16);
}

function paginaNoAcceso() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin acceso</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}.card{background:#fff;padding:2.5rem 2rem;border-radius:10px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.12);max-width:400px;width:90%}h2{color:#1a1a2e;margin-bottom:10px;font-size:1.2rem}p{color:#888;font-size:.9rem;margin:0}.icon{font-size:2.5rem;margin-bottom:12px}</style></head><body><div class="card"><div class="icon">🔒</div><h2>Sin acceso</h2><p>No tienes permiso para ver este módulo.</p></div></body></html>`;
}

async function computarAcceso(usuarioId) {
  if (!usuarioId) return null;
  const [uRows] = await pool.execute(
    'SELECT ID, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;
  const u = uRows[0];
  if (!ROLES_ACCESO.includes(u.Rol)) return null;

  const acceso = {
    usuarioId,
    rol: u.Rol,
    puedeValidar:          ROLES_VALIDAR.includes(u.Rol),
    puedeEditarPlantilla:  ROLES_PLANTILLA.includes(u.Rol),
    puedePrevisualizar:    ROLES_PREVIEW.includes(u.Rol),
    sinFiltro:             ROLES_SIN_FILTRO.includes(u.Rol),
    filtroSQL:           [],
    operacionesFiltro:   [],
    opsPorRegional:      {},
  };

  if (acceso.sinFiltro) {
    const [opRows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows.forEach(r => {
      const reg = r.REGIONAL;
      if (!acceso.opsPorRegional[reg]) acceso.opsPorRegional[reg] = [];
      acceso.opsPorRegional[reg].push(r['OPERACIÓN']);
    });
    acceso.operacionesFiltro = opRows.map(r => r['OPERACIÓN']).filter(Boolean);
  } else if (ROLES_REGIONAL.includes(u.Rol)) {
    const [opRows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [u.Regional]
    );
    acceso.operacionesFiltro = opRows.map(r => r['OPERACIÓN']).filter(Boolean);
    acceso.filtroSQL = acceso.operacionesFiltro;
  } else {
    if (u.Dispositivo) {
      const [opRows] = await pool.execute(
        "SELECT DISTINCT OPERACIÓN FROM Maestro_Operaciones WHERE SOCIODEMOGRAFICA = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
        [u.Dispositivo]
      );
      acceso.operacionesFiltro = opRows.map(r => r['OPERACIÓN']).filter(Boolean);
    } else {
      acceso.operacionesFiltro = u['Operación'] ? [u['Operación']] : [];
    }
    acceso.filtroSQL = acceso.operacionesFiltro;
  }

  return acceso;
}

function generarFiltroHTML(acceso) {
  const sel = (id, extra, opts) =>
    `<select id="${id}" ${extra} onchange="${id === 'filtroRegional' ? 'actualizarFiltroOp()' : 'filtrarTabla()'}"
      style="flex:1;min-width:170px;max-width:280px;padding:8px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:.87rem;color:#333">
      ${opts}
    </select>`;

  if (acceso.sinFiltro) {
    const optsReg = Object.keys(acceso.opsPorRegional).sort()
      .map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
    return sel('filtroRegional', '', `<option value="">— Todas las regionales —</option>${optsReg}`)
         + sel('filtroOrigenDoble', '', `<option value="">— Todas las operaciones —</option>`);
  }

  const opts = acceso.operacionesFiltro
    .map(op => `<option value="${esc(op)}">${esc(op)}</option>`).join('');
  return sel('filtroOrigenSimple', '', `<option value="">— Todas las operaciones —</option>${opts}`);
}

const BADGE = {
  pendiente: ['#b7860b', '#fffbea', '#f0d060'],
  validado:  ['#1a5fa8', '#eaf3ff', '#7ab3f0'],
  firmado:   ['#1a7a4a', '#eafaf1', '#6dcf9e'],
  generado:  ['#0e6655', '#e8f8f5', '#48c9b0'],
  revisar:   ['#a04000', '#fff3e0', '#f0a060'],
  anulado:   ['#a93226', '#fdedec', '#f1948a'],
};

function badge(estado) {
  const [c, bg, border] = BADGE[estado] || ['#666', '#f0f0f0', '#ccc'];
  const label = { pendiente:'Pendiente', validado:'Validado', firmado:'Firmado',
    generado:'Generado', revisar:'Revisar', anulado:'Anulado' }[estado] || estado;
  return `<span style="background:${bg};color:${c};border:1px solid ${border};border-radius:12px;padding:3px 10px;font-size:.73rem;font-weight:700;white-space:nowrap">${label}</span>`;
}

function acciones(row, puedeValidar, puedePrevisualizar, usuarioId) {
  const id = esc(row.IdTraslado);
  const usuarioEnc = encodeURIComponent(usuarioId || '');
  const btnEditar = `<button class="ba be" title="Editar" onclick="abrirEditar('${id}')">✏️ Editar</button>`;
  const btnValidar = puedeValidar ? `<button class="ba bv" onclick="validar('${id}')">✓ Validar</button>` : '';
  const btnRevisar = puedeValidar ? `<button class="ba br" onclick="cambiar('${id}','revisar')">↩ Revisar</button>` : '';
  const btnAnular  = puedeValidar ? `<button class="ba ban" onclick="cambiar('${id}','anulado')">✗ Anular</button>` : '';
  const btnPreview = puedePrevisualizar ? `<a class="ba bprev" href="/admin/traslados/${id}/preview?Usuario=${usuarioEnc}" target="_blank">👁 Ver doc</a>` : '';

  switch (row.estado_doc) {
    case 'pendiente': return `${btnPreview}${btnEditar}${btnValidar}${btnRevisar}${btnAnular}`;
    case 'validado': {
      const btnWA = row.celular_trabajador
        ? `<button class="ba bwa" onclick="abrirWhatsApp('${id}')">📱 WhatsApp</button>` : '';
      return `${btnWA}<button class="ba bv" onclick="enlace('${id}')">🔗 Enlace</button>${btnEditar}${btnRevisar}${btnAnular}`;
    }
    case 'revisar':   return `${btnEditar}${btnValidar}${btnAnular}`;
    case 'firmado':
    case 'generado':  return row.url_doc ? `<a class="ba bver" href="${esc(row.url_doc)}" target="_blank">📄 Ver</a>` : '—';
    default:          return '—';
  }
}

// ── Panel de traslados ──────────────────────────────────────────────────────

router.get('/traslados', async (req, res) => {
  try {
    const usuarioId = req.query.Usuario;
    if (!usuarioId) return res.status(403).send(paginaNoAcceso());

    const acceso = await computarAcceso(usuarioId);
    if (!acceso) return res.status(403).send(paginaNoAcceso());

    const estado = req.query.estado || '';
    const template = fs.readFileSync(TRASLADOS_HTML, 'utf8');

    let rows;
    if (acceso.sinFiltro) {
      [rows] = estado
        ? await pool.execute('SELECT * FROM Dynamic_traslados_trabajador WHERE estado_doc = ? ORDER BY Fecha_Registro DESC LIMIT 300', [estado])
        : await pool.execute('SELECT * FROM Dynamic_traslados_trabajador ORDER BY Fecha_Registro DESC LIMIT 300');
    } else if (acceso.filtroSQL.length > 0) {
      const ph = acceso.filtroSQL.map(() => '?').join(',');
      [rows] = estado
        ? await pool.execute(`SELECT * FROM Dynamic_traslados_trabajador WHERE operacion_origen IN (${ph}) AND estado_doc = ? ORDER BY Fecha_Registro DESC LIMIT 300`, [...acceso.filtroSQL, estado])
        : await pool.execute(`SELECT * FROM Dynamic_traslados_trabajador WHERE operacion_origen IN (${ph}) ORDER BY Fecha_Registro DESC LIMIT 300`, acceso.filtroSQL);
    } else {
      rows = [];
    }

    const [opRows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN"
    );
    const operaciones = opRows.map(r => r['OPERACIÓN']).filter(Boolean);

    const rowsHtml = rows.length === 0
      ? `<tr><td colspan="9" style="text-align:center;padding:48px;color:#ccc;font-size:.9rem">Sin registros en este estado</td></tr>`
      : rows.map(r => `
        <tr data-origen="${esc(r.operacion_origen)}" data-id="${esc(r.IdTraslado)}" data-celular="${esc(r.celular_trabajador || '')}" data-email="${esc(r.email_trabajador || '')}" data-nombre="${esc(r.Trabajador || '')}">
          <td>${badge(r.estado_doc)}</td>
          <td style="min-width:220px;white-space:normal;word-break:break-word" title="${esc(r.Trabajador)}">${esc(r.Trabajador)}</td>
          <td style="font-size:.82rem"><span style="color:#999">${esc(r.operacion_origen)}</span><br>→ <strong>${esc(r.operacion_destino)}</strong></td>
          <td style="font-size:.8rem">${r.celular_trabajador ? `<div>${esc(r.celular_trabajador)}</div>` : '<span style="color:#ccc">—</span>'}${r.email_trabajador ? `<div style="color:#1a5fa8">${esc(r.email_trabajador)}</div>` : ''}</td>
          <td>${formatFecha(r.fecha_traslado)}</td>
          <td style="font-size:.8rem;color:#888">${formatFechaHora(r.Fecha_Registro)}</td>
          <td style="font-size:.8rem;color:#555">${esc(r.Usuario)}</td>
          <td style="font-size:.82rem;max-width:220px;white-space:normal;word-break:break-word;line-height:1.4">${esc(r.observaciones) || '<span style="color:#ccc">—</span>'}</td>
          <td class="td-acc">${acciones(r, acceso.puedeValidar, acceso.puedePrevisualizar, acceso.usuarioId)}</td>
        </tr>`).join('');

    const safe = s => JSON.stringify(s).replace(/<\/script>/gi, '<\\/script>');
    const rolConfig = {
      usuarioId: acceso.usuarioId,
      puedeValidar: acceso.puedeValidar,
      puedeEditarPlantilla: acceso.puedeEditarPlantilla,
      puedePrevisualizar: acceso.puedePrevisualizar,
      sinFiltro: acceso.sinFiltro,
      operacionesFiltro: acceso.operacionesFiltro,
      opsPorRegional: acceso.opsPorRegional,
    };

    const usuarioEnc = encodeURIComponent(usuarioId);
    const html = template
      .replace(/__USUARIO_PARAM__/g, usuarioEnc)
      .replace('__ESTADO_ACTIVO__', esc(estado))
      .replace('__ROWS__', rowsHtml)
      .replace('__TOTAL__', rows.length)
      .replace('__OPERACIONES__', safe(operaciones))
      .replace('__ROL_CONFIG__', safe(rolConfig))
      .replace('__FILTRO_HTML__', generarFiltroHTML(acceso));

    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al cargar traslados');
  }
});

// ── Previsualización del documento ─────────────────────────────────────────

const URL_FIRMA_REPRESENTANTE_PREV =
  'https://storage.googleapis.com/logyser-recursos-corporativos/firmas-corporativas/Firma%20Representante.png';

router.get('/traslados/:id/preview', async (req, res) => {
  try {
    const acceso = await computarAcceso(req.query.Usuario);
    if (!acceso || !acceso.puedePrevisualizar) return res.status(403).send(paginaNoAcceso());

    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT * FROM Dynamic_traslados_trabajador WHERE IdTraslado = ?',
      [id]
    );
    if (!rows.length) return res.status(404).send('<p>Registro no encontrado</p>');

    const plantilla = await obtenerPlantilla('traslado');
    const datos = rows[0];

    let htmlDoc = plantilla.contenido_html || '';
    htmlDoc = htmlDoc
      .replace('{{firma_trabajador}}',
        '<div style="border:1.5px dashed #ccc;border-radius:4px;padding:8px 16px;color:#aaa;font-size:.82rem;display:inline-block;min-width:200px;text-align:center;margin-top:4px">Firma pendiente del trabajador</div>')
      .replace('{{firma_representante}}',
        `<img src="${URL_FIRMA_REPRESENTANTE_PREV}" style="max-width:240px;max-height:96px;display:block;margin-top:4px" alt="Firma representante"/>`);

    const documentoHtml = reemplazarVariables(htmlDoc, preprocesarDatos(datos));

    const trabajador = esc(datos.Trabajador || '');
    const estado = esc(datos.estado_doc || '');

    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Vista previa — ${trabajador}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #f0f2f5; }
    .topbar {
      background: #1a1a2e; color: #fff; padding: 10px 24px;
      display: flex; align-items: center; gap: 14px;
      font-size: .85rem; position: sticky; top: 0; z-index: 10;
    }
    .topbar strong { font-size: .95rem; }
    .badge {
      background: #fffbea; color: #b7860b; border: 1px solid #f0d060;
      border-radius: 10px; padding: 2px 10px; font-size: .75rem; font-weight: 700;
    }
    .doc-wrap {
      max-width: 900px; margin: 28px auto; background: #fff;
      padding: 32px; border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0,0,0,.1);
    }
    .aviso {
      background: #fffbea; border-left: 4px solid #f0d060;
      padding: 10px 16px; border-radius: 0 4px 4px 0;
      font-size: .8rem; color: #7a6000; margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <span>👁 Vista previa del documento —</span>
    <strong>${trabajador}</strong>
    <span class="badge">${estado}</span>
  </div>
  <div class="doc-wrap">
    <div class="aviso">⚠️ Esta es una vista previa del documento. La firma del trabajador aún no ha sido capturada.</div>
    ${documentoHtml}
  </div>
</body>
</html>`);
  } catch (err) {
    console.error(err);
    res.status(500).send('<p>Error al generar la vista previa</p>');
  }
});

router.post('/traslados/:id/validar', async (req, res) => {
  try {
    const acceso = await computarAcceso(req.query.Usuario);
    if (!acceso || !acceso.puedeValidar) return res.status(403).json({ ok: false, error: 'Sin autorización' });
    const { id } = req.params;
    await pool.execute("UPDATE Dynamic_traslados_trabajador SET estado_doc = 'validado' WHERE IdTraslado = ?", [id]);
    const token = await generarToken(TABLA_TR, CAMPO_FK, id);
    const url = `${req.protocol}://${req.get('host')}/doclogyser/traslado/${id}?token=${encodeURIComponent(token)}`;

    const [rows] = await pool.execute(
      'SELECT Trabajador, email_trabajador, operacion_destino, direccion_destino, fecha_traslado, hora_traslado, Usuario FROM Dynamic_traslados_trabajador WHERE IdTraslado = ?',
      [id]
    );

    let correoEnviado = false;
    if (rows.length && rows[0].email_trabajador) {
      const t = rows[0];

      const [uRows] = await pool.execute(
        'SELECT Email FROM Maestro_Usuarios WHERE ID = ?',
        [t.Usuario]
      );
      const emailRegistrador = (uRows[0] && uRows[0].Email) || '';

      const [cargoRows] = await pool.execute(
        'SELECT Cargo FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
        [t.Trabajador]
      );
      const cargo = (cargoRows[0] && cargoRows[0].Cargo) || '';

      const partes = (t.Trabajador || '').split(' ** ');
      const nombreCorto = partes.length > 1 ? partes[1].trim() : t.Trabajador;
      const fechaISO = t.fecha_traslado instanceof Date
        ? t.fecha_traslado.toISOString().slice(0, 10)
        : String(t.fecha_traslado || '').slice(0, 10);
      try {
        await notificarFirmaTrabajador({
          email:            t.email_trabajador,
          nombreCorto,
          operacionDestino: t.operacion_destino,
          direccionDestino: t.direccion_destino || '',
          fechaTraslado:    fechaISO,
          horaTraslado:     t.hora_traslado || '',
          urlFirma:         url,
          emailUsuario:     emailRegistrador,
          cargo,
        });
        correoEnviado = true;
      } catch (e) {
        console.error('Error correo trabajador:', e.message);
      }
    }

    res.json({ ok: true, url, correoEnviado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/traslados/:id/enlace', async (req, res) => {
  try {
    const acceso = await computarAcceso(req.query.Usuario);
    if (!acceso) return res.status(403).json({ ok: false, error: 'Sin autorización' });
    const { id } = req.params;
    const token = await generarToken(TABLA_TR, CAMPO_FK, id);
    const url = `${req.protocol}://${req.get('host')}/doclogyser/traslado/${id}?token=${encodeURIComponent(token)}`;
    res.json({ ok: true, url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/traslados/:id/estado', async (req, res) => {
  try {
    const acceso = await computarAcceso(req.query.Usuario);
    if (!acceso || !acceso.puedeValidar) return res.status(403).json({ ok: false, error: 'Sin autorización' });
    const { id } = req.params;
    const { estado } = req.body;
    if (!ESTADOS_VALIDOS_CAMBIO.includes(estado)) return res.status(400).json({ ok: false, error: 'Estado no permitido' });
    await pool.execute(
      'UPDATE Dynamic_traslados_trabajador SET estado_doc = ?, token_firma = NULL, token_expira = NULL WHERE IdTraslado = ?',
      [estado, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/traslados/:id/correo', async (req, res) => {
  try {
    const acceso = await computarAcceso(req.query.Usuario);
    if (!acceso) return res.status(403).json({ ok: false, error: 'Sin autorización' });
    const { id } = req.params;

    const [rows] = await pool.execute(
      'SELECT Trabajador, email_trabajador, operacion_destino, direccion_destino, fecha_traslado, hora_traslado, Usuario FROM Dynamic_traslados_trabajador WHERE IdTraslado = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    const t = rows[0];
    if (!t.email_trabajador) return res.status(400).json({ ok: false, error: 'El trabajador no tiene correo registrado' });

    const [uRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ?', [t.Usuario]);
    const emailUsuario = (uRows[0] && uRows[0].Email) || '';

    const [cargoRows] = await pool.execute(
      'SELECT Cargo FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [t.Trabajador]
    );
    const cargo = (cargoRows[0] && cargoRows[0].Cargo) || '';

    const token = await generarToken(TABLA_TR, CAMPO_FK, id);
    const url   = `${req.protocol}://${req.get('host')}/doclogyser/traslado/${id}?token=${encodeURIComponent(token)}`;

    const partes = (t.Trabajador || '').split(' ** ');
    const nombreCorto = partes.length > 1 ? partes[1].trim() : t.Trabajador;
    const fechaISO = t.fecha_traslado instanceof Date
      ? t.fecha_traslado.toISOString().slice(0, 10)
      : String(t.fecha_traslado || '').slice(0, 10);

    await notificarFirmaTrabajador({
      email:            t.email_trabajador,
      nombreCorto,
      operacionDestino: t.operacion_destino,
      direccionDestino: t.direccion_destino || '',
      fechaTraslado:    fechaISO,
      horaTraslado:     t.hora_traslado || '',
      urlFirma:         url,
      emailUsuario,
      cargo,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/traslados/:id/datos', async (req, res) => {
  try {
    const acceso = await computarAcceso(req.query.Usuario);
    if (!acceso) return res.status(403).json({ ok: false, error: 'Sin autorización' });
    const [rows] = await pool.execute('SELECT * FROM Dynamic_traslados_trabajador WHERE IdTraslado = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ ok: false });
    res.json({ ok: true, datos: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/traslados/:id/editar', async (req, res) => {
  try {
    const acceso = await computarAcceso(req.query.Usuario);
    if (!acceso) return res.status(403).json({ ok: false, error: 'Sin autorización' });
    const { id } = req.params;
    const { operacion_origen, operacion_destino, direccion_destino,
            fecha_traslado, hora_traslado, celular_trabajador, email_trabajador } = req.body;
    const [result] = await pool.execute(
      `UPDATE Dynamic_traslados_trabajador
       SET operacion_origen = ?, operacion_destino = ?, direccion_destino = ?,
           fecha_traslado = ?, hora_traslado = ?, celular_trabajador = ?, email_trabajador = ?
       WHERE IdTraslado = ? AND estado_doc IN ('pendiente','validado','revisar')`,
      [operacion_origen || null, operacion_destino, direccion_destino || null,
       fecha_traslado, hora_traslado || null, celular_trabajador || null, email_trabajador || null, id]
    );
    if (result.affectedRows === 0) return res.status(409).json({ ok: false, error: 'No editable en su estado actual' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

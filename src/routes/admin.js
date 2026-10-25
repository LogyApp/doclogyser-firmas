const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('../services/plantilla');
const { generarToken } = require('../services/token');
const { notificarFirmaTrabajador, notificarDocumentoGenerado } = require('../services/email');
const { computarAccesoNomina } = require('../services/accesoNomina');
const { obtenerPermisosTraslados, horasVigenciaEnlace } = require('../services/configTraslados');
const { v4: uuidv4 } = require('uuid');
const { generarPDF } = require('../services/renderer');
const { subirPDF } = require('../services/storage');

const router = express.Router();

const EDITOR_HTML    = path.join(__dirname, '../views/admin/editor.html');
const TRASLADOS_HTML = path.join(__dirname, '../views/admin/traslados.html');
const TABLA_TR       = 'Dynamic_traslados_trabajador';
const CAMPO_FK       = 'IdTraslado';
const ESTADOS_VALIDOS_CAMBIO = ['revisar', 'anulado', 'pendiente'];

// El editor de plantillas solo se usa para el documento de traslado.
const PLANTILLAS_EDITABLES = ['traslado'];

// ── Editor plantilla ────────────────────────────────────────────────────────

// Solo los roles de "Puede editar plantilla de traslados" (Config_Parametros).
async function puedeEditarPlantilla(usuarioId, proceso) {
  if (!PLANTILLAS_EDITABLES.includes(String(proceso || '').toLowerCase())) return false;
  const acceso = await computarAcceso(usuarioId);
  return !!(acceso && acceso.puedeEditarPlantilla);
}

router.get('/plantillas/editar/:proceso', async (req, res) => {
  try {
    if (!(await puedeEditarPlantilla(req.query.Usuario || req.query.usuario, req.params.proceso))) {
      return res.status(403).send(paginaNoAcceso());
    }
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
    if (!(await puedeEditarPlantilla(req.query.Usuario || req.query.usuario, req.params.proceso))) {
      return res.status(403).json({ ok: false, error: 'Sin autorización para editar la plantilla' });
    }
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

// Acceso a Traslados: mismo origen que la pestaña en Nómina (Maestro_Menu, nomina /
// Sección 'Traslados'). Permisos de acciones desde Config_Parametros.
async function computarAcceso(usuarioId) {
  if (!usuarioId) return null;
  const accesoNomina = await computarAccesoNomina(usuarioId, 'Traslados');
  if (!accesoNomina) return null;
  const permisos = await obtenerPermisosTraslados(accesoNomina.rol);

  return {
    usuarioId,
    rol:                  accesoNomina.rol,
    params:               permisos.params,
    puedeValidar:         permisos.puedeValidar,
    puedeEditarPlantilla: permisos.puedeEditarPlantilla,
    puedePrevisualizar:   permisos.puedePrevisualizar,
    sinFiltro:            accesoNomina.sinFiltro,
    filtroSQL:            accesoNomina.sinFiltro ? [] : accesoNomina.operacionesFiltro,
    operacionesFiltro:    accesoNomina.operacionesFiltro,
    opsPorRegional:       accesoNomina.opsPorRegional,
  };
}

// Un usuario puede ver/actuar sobre un traslado si su alcance cubre la
// operación de origen o la de destino (igual que el listado).
function trasladoEnAlcance(acceso, traslado) {
  if (!acceso || !traslado) return false;
  if (acceso.sinFiltro) return true;
  const ops = new Set(acceso.operacionesFiltro);
  return ops.has(traslado.operacion_origen) || ops.has(traslado.operacion_destino);
}

async function obtenerTrasladoEnAlcance(acceso, id) {
  const [rows] = await pool.execute('SELECT * FROM Dynamic_traslados_trabajador WHERE IdTraslado = ?', [id]);
  if (!rows.length) return { traslado: null, status: 404 };
  if (!trasladoEnAlcance(acceso, rows[0])) return { traslado: null, status: 403 };
  return { traslado: rows[0], status: 200 };
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

  const btnNoFirma = puedeValidar ? `<button class="ba bnf" onclick="marcarNoFirma('${id}')" title="Generar documento con soporte (No Firma)">📋 No Firma</button>` : '';

  switch (row.estado_doc) {
    case 'pendiente': return `${btnPreview}${btnEditar}${btnValidar}${btnRevisar}${btnAnular}${btnNoFirma}`;
    case 'validado': {
      const btnWA = row.celular_trabajador
        ? `<button class="ba bwa" onclick="abrirWhatsApp('${id}')">📱 WhatsApp</button>` : '';
      return `${btnWA}<button class="ba bv" onclick="enlace('${id}')">🔗 Enlace</button>${btnEditar}${btnRevisar}${btnAnular}${btnNoFirma}`;
    }
    case 'revisar':   return `${btnEditar}${btnValidar}${btnAnular}`;
    case 'firmado':
    case 'generado':  return row.url_doc ? `<a class="ba bver" href="${esc(row.url_doc)}" target="_blank">📄 Ver</a>` : '—';
    default:          return '—';
  }
}

// ── Panel de traslados ──────────────────────────────────────────────────────

// El panel propio de este módulo fue reemplazado por la pestaña Traslados
// dentro de Nómina (que reutiliza los endpoints /traslados/:id/... de abajo,
// sin duplicar esa lógica — ver comentario en nomina/index.html). Este acceso
// viejo solo redirige ahí, preservando el usuario.
router.get('/traslados', (req, res) => {
  const usuarioId = req.query.Usuario || req.query.usuario;
  if (!usuarioId) return res.status(403).send(paginaNoAcceso());
  res.redirect(`/nomina?usuario=${encodeURIComponent(usuarioId)}&tab=traslados&subtab=listado`);
});

// Variante JSON de GET /traslados, sin filtro de estado (se usa desde la pestaña
// de Traslados en Nómina, que calcula los conteos por estado en el cliente).
router.get('/traslados/datos', async (req, res) => {
  try {
    const usuarioId = req.query.Usuario;
    if (!usuarioId) return res.status(403).json({ ok: false, error: 'Usuario requerido' });

    const acceso = await computarAcceso(usuarioId);
    if (!acceso) return res.status(403).json({ ok: false, error: 'No autorizado' });

    let rows;
    if (acceso.sinFiltro) {
      [rows] = await pool.execute('SELECT * FROM Dynamic_traslados_trabajador ORDER BY Fecha_Registro DESC LIMIT 300');
    } else if (acceso.filtroSQL.length > 0) {
      // Un usuario ve un traslado si su operación es el origen O el destino —
      // así quien recibe el traslado también lo ve, no solo quien lo envía.
      const ph = acceso.filtroSQL.map(() => '?').join(',');
      [rows] = await pool.execute(
        `SELECT * FROM Dynamic_traslados_trabajador WHERE operacion_origen IN (${ph}) OR operacion_destino IN (${ph}) ORDER BY Fecha_Registro DESC LIMIT 300`,
        [...acceso.filtroSQL, ...acceso.filtroSQL]
      );
    } else {
      rows = [];
    }

    const rolConfig = {
      usuarioId: acceso.usuarioId,
      puedeValidar: acceso.puedeValidar,
      puedeEditarPlantilla: acceso.puedeEditarPlantilla,
      puedePrevisualizar: acceso.puedePrevisualizar,
      sinFiltro: acceso.sinFiltro,
      operacionesFiltro: acceso.operacionesFiltro,
      opsPorRegional: acceso.opsPorRegional,
    };

    res.json({ ok: true, rows, rolConfig });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Error al cargar traslados' });
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
    const { traslado, status } = await obtenerTrasladoEnAlcance(acceso, id);
    if (!traslado) return res.status(status).send(status === 404 ? '<p>Registro no encontrado</p>' : paginaNoAcceso());

    const plantilla = await obtenerPlantilla('traslado');
    const datos = traslado;

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
    const alcance = await obtenerTrasladoEnAlcance(acceso, id);
    if (!alcance.traslado) return res.status(alcance.status).json({ ok: false, error: alcance.status === 404 ? 'Registro no encontrado' : 'Sin autorización' });
    await pool.execute("UPDATE Dynamic_traslados_trabajador SET estado_doc = 'validado' WHERE IdTraslado = ?", [id]);
    const token = await generarToken(TABLA_TR, CAMPO_FK, id, 'token_firma', 'token_expira', horasVigenciaEnlace(acceso.params));
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
    const alcance = await obtenerTrasladoEnAlcance(acceso, id);
    if (!alcance.traslado) return res.status(alcance.status).json({ ok: false, error: alcance.status === 404 ? 'Registro no encontrado' : 'Sin autorización' });
    const token = await generarToken(TABLA_TR, CAMPO_FK, id, 'token_firma', 'token_expira', horasVigenciaEnlace(acceso.params));
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
    const alcance = await obtenerTrasladoEnAlcance(acceso, id);
    if (!alcance.traslado) return res.status(alcance.status).json({ ok: false, error: alcance.status === 404 ? 'Registro no encontrado' : 'Sin autorización' });
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

    const alcance = await obtenerTrasladoEnAlcance(acceso, id);
    if (!alcance.traslado) return res.status(alcance.status).json({ ok: false, error: alcance.status === 404 ? 'Registro no encontrado' : 'Sin autorización' });
    const t = alcance.traslado;
    if (!t.email_trabajador) return res.status(400).json({ ok: false, error: 'El trabajador no tiene correo registrado' });

    const [uRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ?', [t.Usuario]);
    const emailUsuario = (uRows[0] && uRows[0].Email) || '';

    const [cargoRows] = await pool.execute(
      'SELECT Cargo FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [t.Trabajador]
    );
    const cargo = (cargoRows[0] && cargoRows[0].Cargo) || '';

    const token = await generarToken(TABLA_TR, CAMPO_FK, id, 'token_firma', 'token_expira', horasVigenciaEnlace(acceso.params));
    const url   = `${req.protocol}://${req.get('host')}/doclogyser/traslado/${id}?token=${encodeURIComponent(token)}`;

    const partes = (t.Trabajador || '').split(' ** ');
    const nombreCorto = partes.length > 1 ? partes[1].trim() : t.Trabajador;
    const fechaISO = t.fecha_traslado instanceof Date
      ? t.fecha_traslado.toISOString().slice(0, 10)
      : String(t.fecha_traslado || '').slice(0, 10);

    let correoEnviado = false;
    try {
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
      correoEnviado = true;
    } catch (e) {
      console.error('Error correo trabajador:', e.message);
    }

    res.json({ ok: true, url, correoEnviado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/traslados/:id/datos', async (req, res) => {
  try {
    const acceso = await computarAcceso(req.query.Usuario);
    if (!acceso) return res.status(403).json({ ok: false, error: 'Sin autorización' });
    const alcance = await obtenerTrasladoEnAlcance(acceso, req.params.id);
    if (!alcance.traslado) return res.status(alcance.status).json({ ok: false, error: alcance.status === 404 ? 'Registro no encontrado' : 'Sin autorización' });
    res.json({ ok: true, datos: alcance.traslado });
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
    const alcance = await obtenerTrasladoEnAlcance(acceso, id);
    if (!alcance.traslado) return res.status(alcance.status).json({ ok: false, error: alcance.status === 404 ? 'Registro no encontrado' : 'Sin autorización' });
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

router.post('/traslados/:id/no-firma', async (req, res) => {
  try {
    const acceso = await computarAcceso(req.query.Usuario);
    if (!acceso || !acceso.puedeValidar) {
      return res.status(403).json({ ok: false, error: 'Sin autorización para validar o cerrar traslados' });
    }

    const { id } = req.params;
    const { anotacion = 'El trabajador no firma,\nse soporta por correo electrónico' } = req.body;

    const alcance = await obtenerTrasladoEnAlcance(acceso, id);
    if (!alcance.traslado) return res.status(alcance.status).json({ ok: false, error: alcance.status === 404 ? 'Registro de traslado no encontrado' : 'Sin autorización' });
    const t = alcance.traslado;

    if (t.estado_doc === 'generado' && t.url_doc) {
      return res.status(400).json({ ok: false, error: 'El documento ya fue generado anteriormente' });
    }

    const plantilla = await obtenerPlantilla('traslado');

    const nowBogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const dd = String(nowBogota.getDate()).padStart(2, '0');
    const mm = String(nowBogota.getMonth() + 1).padStart(2, '0');
    const yyyy = nowBogota.getFullYear();
    const hh = String(nowBogota.getHours()).padStart(2, '0');
    const min = String(nowBogota.getMinutes()).padStart(2, '0');
    const fechaSoporteTexto = `${dd}/${mm}/${yyyy} ${hh}:${min}`;

    const noFirmaHtml = `
      <div style="border:1.5px dashed #c0392b;border-radius:4px;padding:8px 12px;color:#c0392b;font-size:8pt;font-weight:bold;line-height:1.4;display:inline-block;text-align:center;font-family:Arial,sans-serif;">
        ${String(anotacion).replace(/\n/g, '<br>')}<br>
        <span style="font-size:7pt;color:#555;font-weight:normal;">Fecha soporte: ${fechaSoporteTexto}</span>
      </div>
    `;

    let htmlPdf = plantilla.contenido_html || '';
    htmlPdf = htmlPdf
      .replace('{{firma_trabajador}}', noFirmaHtml)
      .replace(
        '{{firma_representante}}',
        `<img src="${URL_FIRMA_REPRESENTANTE_PREV}" style="max-width:220px;max-height:90px;display:block;" alt="Firma representante"/>`
      );
    const htmlFinal = reemplazarVariables(htmlPdf, preprocesarDatos(t));

    const pdfBuffer = await generarPDF(htmlFinal);
    const idTraslado = t['IdTraslado'] || id;
    const urlDoc = await subirPDF(t['Identificación'], idTraslado, pdfBuffer);

    await pool.execute(
      `UPDATE \`${plantilla.tabla_datos}\`
       SET url_doc = ?, estado_doc = 'generado', token_firma = NULL, token_expira = NULL,
           firma_trabajador = NULL, url_firma = NULL
       WHERE \`${plantilla.id_campo_fk}\` = ?`,
      [urlDoc, id]
    );

    const [opRows] = await pool.execute(
      'SELECT REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ?',
      [t.operacion_destino]
    );
    const regional = opRows.length ? opRows[0].REGIONAL : null;

    const [vinRows] = await pool.execute(
      'SELECT Estado, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [t['Identificación']]
    );
    const estado = vinRows.length ? vinRows[0].Estado : null;
    const fechaIngreso = vinRows.length ? vinRows[0]['Fecha de Ingreso'] : null;

    const newId = uuidv4();
    const obsDoc = (anotacion || 'El trabajador no firma (soporte correo electrónico)').replace(/\n/g, ' ');
    await pool.execute(
      `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
        Justificacion_Solicitud, FechaRegistro, Usuario)
       VALUES (?, 'PEND', ?, ?, ?, ?, ?, '50', 'TRAS', ?, ?, 'Ver', NULL, NULL, ?, ?)`,
      [
        newId,
        regional,
        t.operacion_destino,
        t['Identificación'],
        estado,
        fechaIngreso,
        urlDoc,
        obsDoc,
        t.Fecha_Registro,
        t.Usuario,
      ]
    );

    if (vinRows.length) {
      await pool.execute(
        `UPDATE \`Maestro_Vinculación\`
         SET Operación = ?, Usuario = ?, \`Fecha Actualización\` = ?
         WHERE Identificación = ?
         ORDER BY \`Fecha de Ingreso\` DESC
         LIMIT 1`,
        [t.operacion_destino, t.Usuario, t.Fecha_Registro, t['Identificación']]
      );
    }

    const fechaTrasladoStr = t.fecha_traslado
      ? (typeof t.fecha_traslado === 'string' ? t.fecha_traslado : t.fecha_traslado.toISOString()).slice(0, 10)
      : null;

    if (fechaTrasladoStr) {
      const diaTraslado = parseInt(fechaTrasladoStr.slice(8, 10), 10);

      if (diaTraslado !== 1 && diaTraslado !== 16) {
        const [areaRows] = await pool.execute(
          'SELECT Area FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
          [t['Identificación']]
        );
        const area = areaRows.length ? areaRows[0].Area : null;

        let fechaFinal = null;
        const [mfRows] = await pool.execute(
          'SELECT Quincena, Año FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1',
          [fechaTrasladoStr]
        );
        if (mfRows.length) {
          const [cqRows] = await pool.execute(
            'SELECT `Fecha Final` FROM Config_Quincenas WHERE Quincena = ? AND Año = ? LIMIT 1',
            [mfRows[0].Quincena, mfRows[0].Año]
          );
          if (cqRows.length) fechaFinal = cqRows[0]['Fecha Final'];
        }

        await pool.execute(
          `INSERT INTO Dynamic_Registro_Asistencia
           (IdRegistro, Operación, Area, Evento, Novedad, \`Apoyo de Otra Operación\`,
            Trabajador, Trabajador2, Día, \`Fecha Final\`,
            \`Hora Entrada\`, \`Hora Salida\`, \`Operación a la que apoya\`,
            Incapacidad, \`Cod Diagnostico\`, Diagnostico,
            \`PDF Incapacidad\`, \`PDF Historia Clinica\`, \`PDF Soporte\`,
            Origen, \`Fecha Registro\`, Usuario, Contador, Contador2, Disponible)
           VALUES (?, ?, ?, 'Novedad', 'Traslado', 'NO',
                   NULL, ?, ?, ?,
                   NULL, NULL, NULL,
                   NULL, NULL, NULL,
                   NULL, NULL, ?,
                   ?, ?, 'Sistema', NULL, NULL, 0)`,
          [
            uuidv4(),
            t.operacion_origen,
            area,
            t.Trabajador,
            fechaTrasladoStr,
            fechaFinal,
            urlDoc,
            t.operacion_origen,
            t.Fecha_Registro,
          ]
        );
      }
    }

    const [uRows] = await pool.execute(
      'SELECT Email FROM Maestro_Usuarios WHERE ID = ?', [t.Usuario]
    );
    const emailUsuario = (uRows[0] && uRows[0].Email) || '';

    const [cargoRows] = await pool.execute(
      'SELECT Cargo FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [t.Trabajador]
    );
    const cargo = (cargoRows[0] && cargoRows[0].Cargo) || '';

    const partesTrab = (t.Trabajador || '').split(' ** ');
    const nombreTrabajador = partesTrab.length > 1 ? partesTrab[1].trim() : t.Trabajador;

    notificarDocumentoGenerado({
      nombreTrabajador,
      operacionDestino:  t.operacion_destino,
      direccionDestino:  t.direccion_destino || '',
      fechaTraslado:     t.fecha_traslado,
      horaTraslado:      t.hora_traslado || '',
      urlDoc,
      emailUsuario,
      cargo,
    }).catch(e => console.error('[admin] Error correo generado (no-firma):', e.message));

    res.json({ ok: true, url_doc: urlDoc });
  } catch (err) {
    console.error('[admin] Error en no-firma traslado:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

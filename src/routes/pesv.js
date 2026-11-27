// SST › PESV (/pesv): Declaración de cumplimiento del Plan Estratégico de Seguridad Vial (SST-F-025), mismo flujo del ARO.
// Quién ve la pestaña: Maestro_Menu sst / PESV (Acceso 1 todo, 2 su regional, 3 sus operaciones).
// Qué puede hacer: Config_Parametros sst / PESV (crear, eliminar, editarFirmado, eliminarFirmado; ver configSst.js).
// Flujo: se escogen los trabajadores, se genera el enlace de firma (/pesv/firmar?t=), el trabajador lee el documento
// y firma (firma registrada o nueva), la Líder SST firma con su firma registrada y el PDF queda como documento 96.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { computarAccesoSst } = require('../services/accesoSst');
const { rolPuedeSst, puedeProcesarRetiradosSst } = require('../services/configSst');
const { subirFirma, obtenerUrlFirmaReciente, descargarFirmaBase64PorUrl } = require('../services/storage');
const { notificarFirmaPESV } = require('../services/email');
const { crearNotificacionDocInicialSST } = require('../services/notificacionesService');
const pesv = require('../services/pesv');
const { htmlVolverPortal } = require('../services/docSstPortal');

const router = express.Router();
const HTML_FIRMA = path.join(__dirname, '../views/pesv/firmar.html');

function urlBase(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}
const urlFirma = (req, token) => `${urlBase(req)}/pesv/firmar?t=${encodeURIComponent(token)}`;

function nombreSinCedula(trabajador) {
  const partes = String(trabajador || '').split(' ** ');
  return (partes.length > 1 ? partes[1] : partes[0]).trim();
}

function ahoraBogota() {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

async function accesoPesv(usuario) {
  return computarAccesoSst(usuario, pesv.SECCION);
}

function enAlcance(acceso, operacion) {
  return acceso.sinFiltro || (acceso.operacionesFiltro || []).includes(operacion);
}

async function obtenerPesv(id) {
  const [[a]] = await pool.execute('SELECT * FROM Dynamic_pesv WHERE id_pesv = ? LIMIT 1', [id]);
  return a || null;
}

function paginaMensaje(titulo, texto) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${titulo}</title></head>
<body style="font-family:Arial,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px">
<div style="background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.06);max-width:440px;text-align:center">
<h2 style="color:#1B2A5E;margin-top:0">${titulo}</h2><p style="color:#64748b;line-height:1.5">${texto}</p></div></body></html>`;
}

// ── Página de firma del trabajador (enlace con token) ────────────────────────
router.get('/firmar', async (req, res) => {
  try {
    const token = String(req.query.t || '').trim();
    if (!token) return res.status(400).send(paginaMensaje('Enlace no válido', 'Este enlace de firma no es válido. Solicite a SST un nuevo enlace.'));
    const [[a]] = await pool.execute('SELECT * FROM Dynamic_pesv WHERE token_firma = ? LIMIT 1', [token]);
    if (!a) return res.status(404).send(paginaMensaje('Enlace no vigente', 'Esta declaración ya fue firmada o el enlace ya no está vigente. Si necesita firmarla, solicite a SST un nuevo enlace.'));
    const firmaBase64 = await obtenerUrlFirmaReciente(String(a.identificacion))
      .then(u => (u ? descargarFirmaBase64PorUrl(u) : null)).catch(() => null);
    const config = JSON.stringify({
      token,
      nombre: nombreSinCedula(a.nombre_trabajador),
      identificacion: String(a.identificacion),
      cargo: a.cargo || '',
      firmaBase64,
    }).replace(/<\/script>/gi, '<\\/script>');
    const documento = await pesv.htmlDocumento(a);
    res.send(fs.readFileSync(HTML_FIRMA, 'utf8').replace('__CONFIG_FIRMA__', () => config).replace('__DOCUMENTO__', () => documento)
      .replace('</body>', () => htmlVolverPortal(req, a) + '</body>'));
  } catch (err) {
    console.error('[pesv] GET /firmar:', err);
    res.status(500).send(paginaMensaje('Error', 'No se pudo cargar el documento. Intente de nuevo en unos minutos.'));
  }
});

// El trabajador firma: usa su firma registrada o dibuja una nueva. Se genera el PDF (documento 96).
router.post('/api/firmar', async (req, res) => {
  try {
    const { token, usarFirmaRegistrada, firmaBase64 } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Enlace no válido' });
    const [[a]] = await pool.execute('SELECT * FROM Dynamic_pesv WHERE token_firma = ? LIMIT 1', [String(token)]);
    if (!a) return res.status(409).json({ error: 'Esta declaración ya fue firmada o el enlace ya no está vigente.' });

    let url;
    if (usarFirmaRegistrada) {
      url = await obtenerUrlFirmaReciente(String(a.identificacion)).catch(() => null);
      if (!url) return res.status(400).json({ error: 'No tiene una firma registrada; por favor dibuje su firma.' });
    } else {
      if (!firmaBase64) return res.status(400).json({ error: 'Debe dibujar su firma.' });
      url = await subirFirma(String(a.identificacion), Buffer.from(String(firmaBase64).replace(/^data:.*;base64,/, ''), 'base64'));
    }

    const cfg = await pesv.configuracion();
    const sst = await pesv.firmanteSst(cfg.rolSst);
    const ahora = ahoraBogota();
    const [upd] = await pool.execute(
      `UPDATE Dynamic_pesv SET url_firma = ?, fecha_firma = ?, token_firma = NULL, url_firma_sst = ?, nombre_sst = ?, cargo_sst = ?
        WHERE id_pesv = ? AND token_firma = ?`,
      [url, ahora, sst.urlFirma, sst.nombre || null, sst.cargo || null, a.id_pesv, String(token)]
    );
    if (!upd.affectedRows) return res.status(409).json({ error: 'Esta declaración ya fue firmada.' });

    const firmado = await obtenerPesv(a.id_pesv);
    const urlDoc = await pesv.generarPdf(firmado);
    await pool.execute('UPDATE Dynamic_pesv SET url_doc = ? WHERE id_pesv = ?', [urlDoc, a.id_pesv]);
    await pesv.registrarDocumentoTrabajador(firmado, urlDoc, null);
    const nombre = nombreSinCedula(firmado.nombre_trabajador);
    crearNotificacionDocInicialSST(pool, {
      subtipo: 'PESV', referencia_id: firmado.id_pesv, identificacion: firmado.identificacion, nombre_trabajador: nombre,
      operacion: firmado.operacion, regional: firmado.regional, titulo: 'Declaración PESV firmada',
      mensaje: `${nombre} firmó la declaración del Plan Estratégico de Seguridad Vial`, resultado: 'FIRMADO', url_doc: urlDoc, usuarioCreador: firmado.usuario,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[pesv] POST /api/firmar:', err);
    res.status(500).json({ error: 'No se pudo registrar la firma. Intente de nuevo.' });
  }
});

// ── Pestaña ──────────────────────────────────────────────────────────────────
router.get('/api/registros', async (req, res) => {
  try {
    const acceso = await accesoPesv(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const conds = [];
    const params = [];
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) return res.json({ registros: [], permisos: {} });
      conds.push(`(a.operacion IN (${acceso.operacionesFiltro.map(() => '?').join(',')}) OR a.usuario = ?)`);
      params.push(...acceso.operacionesFiltro, acceso.usuarioId);
    }
    const [rows] = await pool.execute(
      `SELECT a.id_pesv, a.identificacion, a.nombre_trabajador, a.cargo, a.operacion, a.regional, a.version_formato,
              a.token_firma, a.fecha_firma, a.url_doc, a.usuario, a.fecha_creacion, u.Nombre AS nombre_creador,
              seg.Celular AS celular, seg.Email AS email
         FROM Dynamic_pesv a
         LEFT JOIN Maestro_Usuarios u ON u.ID = a.usuario
         LEFT JOIN \`Maestro_Segmentación\` seg ON seg.\`Identificación\` = a.identificacion
        ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
        ORDER BY a.fecha_creacion DESC
        LIMIT 2000`,
      params
    );
    const permiso = async (accion) => rolPuedeSst(acceso.rol, pesv.SECCION, accion);
    const cfg = await pesv.configuracion();
    res.json({
      registros: rows.map(r => ({
        id: r.id_pesv, radicado: pesv.radicado(r.id_pesv), identificacion: String(r.identificacion), trabajador: nombreSinCedula(r.nombre_trabajador),
        cargo: r.cargo || '', operacion: r.operacion || '', regional: r.regional || '', version: r.version_formato || '',
        firmado: !!r.url_doc, fechaFirma: r.fecha_firma, urlDoc: r.url_doc || '', fechaCreacion: r.fecha_creacion,
        creador: r.nombre_creador || r.usuario, propio: r.usuario === acceso.usuarioId,
        celular: r.celular ? String(r.celular) : '', tieneEmail: !!r.email,
        urlFirma: r.token_firma ? urlFirma(req, r.token_firma) : '',
      })),
      permisos: {
        crear: await permiso('crear'), eliminar: await permiso('eliminar'),
        editarFirmado: await permiso('editarFirmado'), eliminarFirmado: await permiso('eliminarFirmado'),
        esSistema: acceso.rol === 'Sistema', correoHabilitado: cfg.correoHabilitado,
        puedeProcesarRetirados: await puedeProcesarRetiradosSst(acceso.rol),
      },
      opsPorRegional: acceso.opsPorRegional || {},
      cargos: cfg.cargos,
    });
  } catch (err) {
    console.error('[pesv] GET /api/registros:', err);
    res.status(500).json({ error: 'No se pudieron cargar las declaraciones PESV' });
  }
});

// Trabajadores activos de una operación (cargos de Config_Parametros; vacío = todos) y si ya tienen declaración firmada o pendiente
router.get('/api/trabajadores', async (req, res) => {
  try {
    const acceso = await accesoPesv(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const { operacion } = req.query;
    if (!operacion || !enAlcance(acceso, operacion)) return res.status(400).json({ error: 'Escoja una operación de su alcance.' });
    const cfg = await pesv.configuracion();
    const puedeRetirados = await puedeProcesarRetiradosSst(acceso.rol);
    const condEstado = puedeRetirados ? "v.Estado IN ('Activo', 'Retirado')" : "v.Estado = 'Activo'";
    const [rows] = await pool.execute(
      `SELECT v.\`Identificación\` AS identificacion, v.Trabajador, v.Cargo, v.Estado,
              (SELECT MAX(d.fecha_firma) FROM Dynamic_pesv d WHERE d.identificacion = v.\`Identificación\` AND d.url_doc IS NOT NULL) AS ultimaFirma,
              (SELECT COUNT(*) FROM Dynamic_pesv d WHERE d.identificacion = v.\`Identificación\` AND d.url_doc IS NULL) AS pendientes,
              (SELECT MAX(m.FechaRegistro) FROM Maestro_docTrabajador m WHERE m.\`Identificación\` = v.\`Identificación\` AND m.TipoDocumento = ?) AS ultimoDocumento
         FROM \`Maestro_Vinculación\` v
        WHERE ${condEstado} AND v.\`Operación\` = ?
        ORDER BY v.Trabajador`,
      [pesv.ID_DOC_TRABAJADOR, operacion]
    );
    res.json({
      trabajadores: rows.filter(r => pesv.cargoPermitido(cfg.cargos, r.Cargo)).map(r => ({
        identificacion: String(r.identificacion), nombre: nombreSinCedula(r.Trabajador), cargo: r.Cargo || '',
        estado: r.Estado || 'Activo',
        ultimaFirma: r.ultimaFirma, pendiente: Number(r.pendientes) > 0, ultimoDocumento: r.ultimoDocumento,
      })),
    });
  } catch (err) {
    console.error('[pesv] GET /api/trabajadores:', err);
    res.status(500).json({ error: 'No se pudieron cargar los trabajadores' });
  }
});

// Crea la declaración de uno o varios trabajadores (si ya tiene una pendiente, se reutiliza su enlace)
router.post('/api/crear', async (req, res) => {
  try {
    const acceso = await accesoPesv(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, pesv.SECCION, 'crear'))) return res.status(403).json({ error: 'Su rol no puede generar declaraciones PESV.' });
    const ids = [...new Set((Array.isArray(req.body && req.body.identificaciones) ? req.body.identificaciones : []).map(String))].slice(0, 300);
    if (!ids.length) return res.status(400).json({ error: 'Escoja al menos un trabajador.' });
    const cfg = await pesv.configuracion();
    const enviarCorreo = !!(req.body && req.body.enviarCorreo) && cfg.correoHabilitado;
    const puedeRetirados = await puedeProcesarRetiradosSst(acceso.rol);
    const [[usu]] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [acceso.usuarioId]);
    const [[plantilla]] = await pool.execute("SELECT version_formato FROM Maestro_Plantillas WHERE nombre_proceso = 'PESV' ORDER BY activo DESC, version DESC LIMIT 1");

    const resultados = [];
    for (const identificacion of ids) {
      const [[v]] = await pool.execute(
        `SELECT \`Id Vinculación\` AS idv, Trabajador, Cargo, \`Operación\` AS operacion, Regional, Estado
           FROM \`Maestro_Vinculación\` WHERE \`Identificación\` = ? ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
        [identificacion]
      );
      if (!v || !enAlcance(acceso, v.operacion) || !pesv.cargoPermitido(cfg.cargos, v.Cargo)) {
        resultados.push({ identificacion, error: 'No se encontró el trabajador, no es de su alcance o su cargo no aplica para la declaración PESV.' });
        continue;
      }
      const esRetirado = String(v.Estado || '').toLowerCase() === 'retirado';
      if (esRetirado && !puedeRetirados) {
        resultados.push({ identificacion, error: 'Su rol no está autorizado para realizar procesos a personal retirado.' });
        continue;
      }
      let [[pend]] = await pool.execute('SELECT id_pesv, token_firma FROM Dynamic_pesv WHERE identificacion = ? AND url_doc IS NULL AND token_firma IS NOT NULL LIMIT 1', [identificacion]);
      let reutilizado = !!pend;
      if (!pend) {
        pend = { id_pesv: uuidv4(), token_firma: crypto.randomBytes(24).toString('hex') };
        await pool.execute(
          `INSERT INTO Dynamic_pesv (id_pesv, identificacion, id_vinculacion, nombre_trabajador, cargo, operacion, regional, version_formato, token_firma, usuario, fecha_creacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [pend.id_pesv, identificacion, v.idv, nombreSinCedula(v.Trabajador), v.Cargo, v.operacion, v.Regional,
            (plantilla && plantilla.version_formato) || '03', pend.token_firma, acceso.usuarioId, ahoraBogota()]
        );
      }
      const enlace = urlFirma(req, pend.token_firma);
      const [[seg]] = await pool.execute('SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1', [identificacion]);
      let correo = false;
      if (enviarCorreo && !esRetirado && seg && seg.Email) {
        correo = await notificarFirmaPESV({ email: seg.Email, nombreTrabajador: nombreSinCedula(v.Trabajador), cargo: v.Cargo, operacion: v.operacion, urlFirma: enlace, emailUsuario: usu && usu.Email })
          .catch(e => { console.error('[pesv] Correo de firma:', e.message); return false; });
      }
      resultados.push({ identificacion, id: pend.id_pesv, trabajador: nombreSinCedula(v.Trabajador), urlFirma: enlace, reutilizado,
        celular: seg && seg.Celular ? String(seg.Celular) : '', correo });
    }
    res.json({ ok: true, resultados });
  } catch (err) {
    console.error('[pesv] POST /api/crear:', err);
    res.status(500).json({ error: 'No se pudo generar la declaración PESV' });
  }
});

// Reenviar el enlace por correo
router.post('/api/registro/:id/enviar-correo', async (req, res) => {
  try {
    const acceso = await accesoPesv(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, pesv.SECCION, 'crear'))) return res.status(403).json({ error: 'No autorizado' });
    const a = await obtenerPesv(req.params.id);
    if (!a || !enAlcance(acceso, a.operacion)) return res.status(404).json({ error: 'No se encontró la declaración.' });
    if (a.url_doc || !a.token_firma) return res.status(409).json({ error: 'Esta declaración ya fue firmada.' });
    const [[vEst]] = await pool.execute('SELECT Estado FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1', [a.identificacion]);
    if (vEst && String(vEst.Estado || '').toLowerCase() === 'retirado') {
      return res.status(400).json({ error: 'No se pueden enviar correos a personal retirado; copie el enlace de firma directamente.' });
    }
    if (!(await pesv.configuracion()).correoHabilitado) return res.status(400).json({ error: 'Los correos de la declaración PESV están desactivados en Config_Parametros.' });
    const [[seg]] = await pool.execute('SELECT Email FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1', [a.identificacion]);
    if (!seg || !seg.Email) return res.status(400).json({ error: 'El trabajador no tiene correo registrado.' });
    const [[usu]] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [acceso.usuarioId]);
    await notificarFirmaPESV({ email: seg.Email, nombreTrabajador: nombreSinCedula(a.nombre_trabajador), cargo: a.cargo, operacion: a.operacion, urlFirma: urlFirma(req, a.token_firma), emailUsuario: usu && usu.Email });
    res.json({ ok: true, email: seg.Email });
  } catch (err) {
    console.error('[pesv] POST enviar-correo:', err);
    res.status(500).json({ error: 'No se pudo enviar el correo' });
  }
});

// Regenerar el PDF con la plantilla vigente (mismas firmas)
router.post('/api/registro/:id/regenerar', async (req, res) => {
  try {
    const acceso = await accesoPesv(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, pesv.SECCION, 'editarFirmado'))) return res.status(403).json({ error: 'Su rol no puede regenerar el PDF.' });
    const a = await obtenerPesv(req.params.id);
    if (!a || !a.url_doc) return res.status(404).json({ error: 'La declaración no está firmada.' });
    const urlDoc = await pesv.generarPdf(a);
    await pool.execute('UPDATE Dynamic_pesv SET url_doc = ? WHERE id_pesv = ?', [urlDoc, a.id_pesv]);
    await pesv.registrarDocumentoTrabajador(a, urlDoc, a.url_doc);
    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[pesv] POST regenerar:', err);
    res.status(500).json({ error: 'No se pudo regenerar el PDF' });
  }
});

// Eliminar: pendiente (Sistema cualquiera; los demás los propios) o firmada (rol de eliminarFirmado, quita el documento 96)
router.delete('/api/registro/:id', async (req, res) => {
  try {
    const acceso = await accesoPesv(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const a = await obtenerPesv(req.params.id);
    if (!a || !enAlcance(acceso, a.operacion)) return res.status(404).json({ error: 'No se encontró la declaración.' });
    if (a.url_doc) {
      if (!(await rolPuedeSst(acceso.rol, pesv.SECCION, 'eliminarFirmado'))) return res.status(403).json({ error: 'Su rol no puede eliminar una declaración firmada.' });
      await pool.execute('DELETE FROM Maestro_docTrabajador WHERE `Identificación` = ? AND Prefijo = ? AND Doc = ?', [a.identificacion, pesv.PREFIJO_DOC, a.url_doc]);
    } else {
      if (!(await rolPuedeSst(acceso.rol, pesv.SECCION, 'eliminar'))) return res.status(403).json({ error: 'Su rol no puede eliminar declaraciones PESV.' });
      if (acceso.rol !== 'Sistema' && a.usuario !== acceso.usuarioId) return res.status(403).json({ error: 'Solo puede eliminar las declaraciones que usted generó.' });
    }
    await pool.execute('DELETE FROM Dynamic_pesv WHERE id_pesv = ?', [a.id_pesv]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[pesv] DELETE:', err);
    res.status(500).json({ error: 'No se pudo eliminar la declaración' });
  }
});

module.exports = router;

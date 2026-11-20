// SST › ARO (/aro). Quién ve la pestaña: Maestro_Menu sst / ARO (Acceso 1 todo, 2 su regional, 3 sus operaciones).
// Qué puede hacer: Config_Parametros sst / ARO (crear, eliminar, editarFirmado, eliminarFirmado; ver configSst.js).
// Flujo (como Prueba de Consumo): se escogen los trabajadores, se genera el enlace de firma (/aro/firmar?t=),
// el trabajador lee el documento y firma (firma registrada o nueva), y el PDF queda en su carpeta como documento 7.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { computarAccesoSst } = require('../services/accesoSst');
const { rolPuedeSst } = require('../services/configSst');
const { subirFirma, obtenerUrlFirmaReciente, descargarFirmaBase64PorUrl } = require('../services/storage');
const { notificarFirmaARO } = require('../services/email');
const aro = require('../services/aro');

const router = express.Router();
const HTML_FIRMA = path.join(__dirname, '../views/aro/firmar.html');

function urlBase(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}
const urlFirma = (req, token) => `${urlBase(req)}/aro/firmar?t=${encodeURIComponent(token)}`;

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

async function accesoAro(usuario) {
  return computarAccesoSst(usuario, aro.SECCION);
}

function enAlcance(acceso, operacion) {
  return acceso.sinFiltro || (acceso.operacionesFiltro || []).includes(operacion);
}

async function obtenerAro(id) {
  const [[a]] = await pool.execute('SELECT * FROM Dynamic_aro WHERE id_aro = ? LIMIT 1', [id]);
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
    const [[a]] = await pool.execute('SELECT * FROM Dynamic_aro WHERE token_firma = ? LIMIT 1', [token]);
    if (!a) return res.status(404).send(paginaMensaje('Enlace no vigente', 'Este ARO ya fue firmado o el enlace ya no está vigente. Si necesita firmarlo, solicite a SST un nuevo enlace.'));
    const firmaBase64 = await obtenerUrlFirmaReciente(String(a.identificacion))
      .then(u => (u ? descargarFirmaBase64PorUrl(u) : null)).catch(() => null);
    const config = JSON.stringify({
      token,
      nombre: nombreSinCedula(a.nombre_trabajador),
      identificacion: String(a.identificacion),
      cargo: a.cargo || '',
      firmaBase64,
    }).replace(/<\/script>/gi, '<\\/script>');
    const documento = await aro.htmlDocumento(a);
    res.send(fs.readFileSync(HTML_FIRMA, 'utf8').replace('__CONFIG_FIRMA__', () => config).replace('__DOCUMENTO__', () => documento));
  } catch (err) {
    console.error('[aro] GET /firmar:', err);
    res.status(500).send(paginaMensaje('Error', 'No se pudo cargar el documento. Intente de nuevo en unos minutos.'));
  }
});

// El trabajador firma: usa su firma registrada o dibuja una nueva. Se genera el PDF (documento 7).
router.post('/api/firmar', async (req, res) => {
  try {
    const { token, usarFirmaRegistrada, firmaBase64 } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Enlace no válido' });
    const [[a]] = await pool.execute('SELECT * FROM Dynamic_aro WHERE token_firma = ? LIMIT 1', [String(token)]);
    if (!a) return res.status(409).json({ error: 'Este ARO ya fue firmado o el enlace ya no está vigente.' });

    let url;
    if (usarFirmaRegistrada) {
      url = await obtenerUrlFirmaReciente(String(a.identificacion)).catch(() => null);
      if (!url) return res.status(400).json({ error: 'No tiene una firma registrada; por favor dibuje su firma.' });
    } else {
      if (!firmaBase64) return res.status(400).json({ error: 'Debe dibujar su firma.' });
      url = await subirFirma(String(a.identificacion), Buffer.from(String(firmaBase64).replace(/^data:.*;base64,/, ''), 'base64'));
    }

    const cfg = await aro.configuracion();
    const sst = await aro.firmanteSst(cfg.rolSst);
    const ahora = ahoraBogota();
    const [upd] = await pool.execute(
      `UPDATE Dynamic_aro SET url_firma = ?, fecha_firma = ?, token_firma = NULL, url_firma_sst = ?, nombre_sst = ?, cargo_sst = ?
        WHERE id_aro = ? AND token_firma = ?`,
      [url, ahora, sst.urlFirma, sst.nombre || null, sst.cargo || null, a.id_aro, String(token)]
    );
    if (!upd.affectedRows) return res.status(409).json({ error: 'Este ARO ya fue firmado.' });

    const firmado = await obtenerAro(a.id_aro);
    const urlDoc = await aro.generarPdf(firmado);
    await pool.execute('UPDATE Dynamic_aro SET url_doc = ? WHERE id_aro = ?', [urlDoc, a.id_aro]);
    await aro.registrarDocumentoTrabajador(firmado, urlDoc, null);
    res.json({ ok: true });
  } catch (err) {
    console.error('[aro] POST /api/firmar:', err);
    res.status(500).json({ error: 'No se pudo registrar la firma. Intente de nuevo.' });
  }
});

// ── Pestaña ──────────────────────────────────────────────────────────────────
router.get('/api/aros', async (req, res) => {
  try {
    const acceso = await accesoAro(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const conds = [];
    const params = [];
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) return res.json({ aros: [], permisos: {} });
      conds.push(`(a.operacion IN (${acceso.operacionesFiltro.map(() => '?').join(',')}) OR a.usuario = ?)`);
      params.push(...acceso.operacionesFiltro, acceso.usuarioId);
    }
    const [rows] = await pool.execute(
      `SELECT a.id_aro, a.identificacion, a.nombre_trabajador, a.cargo, a.operacion, a.regional, a.version_formato,
              a.token_firma, a.fecha_firma, a.url_doc, a.usuario, a.fecha_creacion, u.Nombre AS nombre_creador,
              seg.Celular AS celular, seg.Email AS email
         FROM Dynamic_aro a
         LEFT JOIN Maestro_Usuarios u ON u.ID = a.usuario
         LEFT JOIN \`Maestro_Segmentación\` seg ON seg.\`Identificación\` = a.identificacion
        ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
        ORDER BY a.fecha_creacion DESC
        LIMIT 2000`,
      params
    );
    const permiso = async (accion) => rolPuedeSst(acceso.rol, aro.SECCION, accion);
    const cfg = await aro.configuracion();
    res.json({
      aros: rows.map(r => ({
        id: r.id_aro, radicado: aro.radicado(r.id_aro), identificacion: String(r.identificacion), trabajador: nombreSinCedula(r.nombre_trabajador),
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
      },
      opsPorRegional: acceso.opsPorRegional || {},
      cargos: cfg.cargos,
    });
  } catch (err) {
    console.error('[aro] GET /api/aros:', err);
    res.status(500).json({ error: 'No se pudieron cargar los ARO' });
  }
});

// Trabajadores activos de una operación con los cargos del ARO, y si ya tienen ARO firmado o pendiente
router.get('/api/trabajadores', async (req, res) => {
  try {
    const acceso = await accesoAro(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const { operacion } = req.query;
    if (!operacion || !enAlcance(acceso, operacion)) return res.status(400).json({ error: 'Escoja una operación de su alcance.' });
    const cfg = await aro.configuracion();
    const [rows] = await pool.execute(
      `SELECT v.\`Identificación\` AS identificacion, v.Trabajador, v.Cargo,
              (SELECT MAX(d.fecha_firma) FROM Dynamic_aro d WHERE d.identificacion = v.\`Identificación\` AND d.url_doc IS NOT NULL) AS ultimaFirma,
              (SELECT COUNT(*) FROM Dynamic_aro d WHERE d.identificacion = v.\`Identificación\` AND d.url_doc IS NULL) AS pendientes,
              (SELECT MAX(m.FechaRegistro) FROM Maestro_docTrabajador m WHERE m.\`Identificación\` = v.\`Identificación\` AND m.TipoDocumento = ?) AS ultimoDocumento
         FROM \`Maestro_Vinculación\` v
        WHERE v.Estado = 'Activo' AND v.\`Operación\` = ?
        ORDER BY v.Trabajador`,
      [aro.ID_DOC_TRABAJADOR, operacion]
    );
    res.json({
      trabajadores: rows.filter(r => aro.cargoPermitido(cfg.cargos, r.Cargo)).map(r => ({
        identificacion: String(r.identificacion), nombre: nombreSinCedula(r.Trabajador), cargo: r.Cargo || '',
        ultimaFirma: r.ultimaFirma, pendiente: Number(r.pendientes) > 0, ultimoDocumento: r.ultimoDocumento,
      })),
    });
  } catch (err) {
    console.error('[aro] GET /api/trabajadores:', err);
    res.status(500).json({ error: 'No se pudieron cargar los trabajadores' });
  }
});

// Crea el ARO de uno o varios trabajadores (si ya tiene uno pendiente, se reutiliza su enlace)
router.post('/api/crear', async (req, res) => {
  try {
    const acceso = await accesoAro(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, aro.SECCION, 'crear'))) return res.status(403).json({ error: 'Su rol no puede generar ARO.' });
    const ids = [...new Set((Array.isArray(req.body && req.body.identificaciones) ? req.body.identificaciones : []).map(String))].slice(0, 300);
    if (!ids.length) return res.status(400).json({ error: 'Escoja al menos un trabajador.' });
    const cfg = await aro.configuracion();
    const enviarCorreo = !!(req.body && req.body.enviarCorreo) && cfg.correoHabilitado;
    const [[usu]] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [acceso.usuarioId]);
    const [[plantilla]] = await pool.execute("SELECT version_formato FROM Maestro_Plantillas WHERE nombre_proceso = 'ARO' ORDER BY activo DESC, version DESC LIMIT 1");

    const resultados = [];
    for (const identificacion of ids) {
      const [[v]] = await pool.execute(
        `SELECT \`Id Vinculación\` AS idv, Trabajador, Cargo, \`Operación\` AS operacion, Regional
           FROM \`Maestro_Vinculación\` WHERE \`Identificación\` = ? AND Estado = 'Activo' ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
        [identificacion]
      );
      if (!v || !enAlcance(acceso, v.operacion) || !aro.cargoPermitido(cfg.cargos, v.Cargo)) {
        resultados.push({ identificacion, error: 'No está activo, no es de su alcance o su cargo no aplica para el ARO.' });
        continue;
      }
      let [[pend]] = await pool.execute('SELECT id_aro, token_firma FROM Dynamic_aro WHERE identificacion = ? AND url_doc IS NULL AND token_firma IS NOT NULL LIMIT 1', [identificacion]);
      let reutilizado = !!pend;
      if (!pend) {
        pend = { id_aro: uuidv4(), token_firma: crypto.randomBytes(24).toString('hex') };
        await pool.execute(
          `INSERT INTO Dynamic_aro (id_aro, identificacion, id_vinculacion, nombre_trabajador, cargo, operacion, regional, version_formato, token_firma, usuario, fecha_creacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [pend.id_aro, identificacion, v.idv, nombreSinCedula(v.Trabajador), v.Cargo, v.operacion, v.Regional,
            (plantilla && plantilla.version_formato) || '04', pend.token_firma, acceso.usuarioId, ahoraBogota()]
        );
      }
      const enlace = urlFirma(req, pend.token_firma);
      const [[seg]] = await pool.execute('SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1', [identificacion]);
      let correo = false;
      if (enviarCorreo && seg && seg.Email) {
        correo = await notificarFirmaARO({ email: seg.Email, nombreTrabajador: nombreSinCedula(v.Trabajador), cargo: v.Cargo, operacion: v.operacion, urlFirma: enlace, emailUsuario: usu && usu.Email })
          .catch(e => { console.error('[aro] Correo de firma:', e.message); return false; });
      }
      resultados.push({ identificacion, id: pend.id_aro, trabajador: nombreSinCedula(v.Trabajador), urlFirma: enlace, reutilizado,
        celular: seg && seg.Celular ? String(seg.Celular) : '', correo });
    }
    res.json({ ok: true, resultados });
  } catch (err) {
    console.error('[aro] POST /api/crear:', err);
    res.status(500).json({ error: 'No se pudo generar el ARO' });
  }
});

// Reenviar el enlace por correo
router.post('/api/aro/:id/enviar-correo', async (req, res) => {
  try {
    const acceso = await accesoAro(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, aro.SECCION, 'crear'))) return res.status(403).json({ error: 'No autorizado' });
    const a = await obtenerAro(req.params.id);
    if (!a || !enAlcance(acceso, a.operacion)) return res.status(404).json({ error: 'No se encontró el ARO.' });
    if (a.url_doc || !a.token_firma) return res.status(409).json({ error: 'Este ARO ya fue firmado.' });
    if (!(await aro.configuracion()).correoHabilitado) return res.status(400).json({ error: 'Los correos del ARO están desactivados en Config_Parametros.' });
    const [[seg]] = await pool.execute('SELECT Email FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1', [a.identificacion]);
    if (!seg || !seg.Email) return res.status(400).json({ error: 'El trabajador no tiene correo registrado.' });
    const [[usu]] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [acceso.usuarioId]);
    await notificarFirmaARO({ email: seg.Email, nombreTrabajador: nombreSinCedula(a.nombre_trabajador), cargo: a.cargo, operacion: a.operacion, urlFirma: urlFirma(req, a.token_firma), emailUsuario: usu && usu.Email });
    res.json({ ok: true, email: seg.Email });
  } catch (err) {
    console.error('[aro] POST enviar-correo:', err);
    res.status(500).json({ error: 'No se pudo enviar el correo' });
  }
});

// Regenerar el PDF con la plantilla vigente (mismas firmas)
router.post('/api/aro/:id/regenerar', async (req, res) => {
  try {
    const acceso = await accesoAro(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, aro.SECCION, 'editarFirmado'))) return res.status(403).json({ error: 'Su rol no puede regenerar el PDF.' });
    const a = await obtenerAro(req.params.id);
    if (!a || !a.url_doc) return res.status(404).json({ error: 'El ARO no está firmado.' });
    const urlDoc = await aro.generarPdf(a);
    await pool.execute('UPDATE Dynamic_aro SET url_doc = ? WHERE id_aro = ?', [urlDoc, a.id_aro]);
    await aro.registrarDocumentoTrabajador(a, urlDoc, a.url_doc);
    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[aro] POST regenerar:', err);
    res.status(500).json({ error: 'No se pudo regenerar el PDF' });
  }
});

// Eliminar: pendiente (Sistema cualquiera; los demás los propios) o firmado (rol de eliminarFirmado, quita el documento 7)
router.delete('/api/aro/:id', async (req, res) => {
  try {
    const acceso = await accesoAro(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const a = await obtenerAro(req.params.id);
    if (!a || !enAlcance(acceso, a.operacion)) return res.status(404).json({ error: 'No se encontró el ARO.' });
    if (a.url_doc) {
      if (!(await rolPuedeSst(acceso.rol, aro.SECCION, 'eliminarFirmado'))) return res.status(403).json({ error: 'Su rol no puede eliminar un ARO firmado.' });
      await pool.execute('DELETE FROM Maestro_docTrabajador WHERE `Identificación` = ? AND Prefijo = ? AND Doc = ?', [a.identificacion, aro.PREFIJO_DOC, a.url_doc]);
    } else {
      if (!(await rolPuedeSst(acceso.rol, aro.SECCION, 'eliminar'))) return res.status(403).json({ error: 'Su rol no puede eliminar ARO.' });
      if (acceso.rol !== 'Sistema' && a.usuario !== acceso.usuarioId) return res.status(403).json({ error: 'Solo puede eliminar los ARO que usted generó.' });
    }
    await pool.execute('DELETE FROM Dynamic_aro WHERE id_aro = ?', [a.id_aro]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[aro] DELETE:', err);
    res.status(500).json({ error: 'No se pudo eliminar el ARO' });
  }
});

module.exports = router;

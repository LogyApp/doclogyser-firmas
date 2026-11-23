// SST › Documentación Inicial › INGE (/inge). Quién ve la subpestaña: Maestro_Menu sst / INGE (Acceso 1 todo,
// 2 su regional, 3 sus operaciones). Qué puede hacer: Config_Parametros sst / INGE (crear, eliminar, editarFirmado,
// eliminarFirmado; ver configSst.js).
// Flujo (como EVIN): SST escoge a los trabajadores y el tipo (Inducción o Reinducción) y se genera el enlace
// (/inge/firmar?t=). El trabajador marca SI o NO en los 41 temas, lee la declaración y firma; el PDF queda en su
// carpeta como documento 32 (solo el último). Firma como Analista SST quien lo registra y la firma del Líder SST
// (rol de Config_Parametros) sale sola al firmar el trabajador.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { computarAccesoSst } = require('../services/accesoSst');
const { rolPuedeSst, puedeProcesarRetiradosSst } = require('../services/configSst');
const { subirFirma, obtenerUrlFirmaReciente, descargarFirmaBase64PorUrl } = require('../services/storage');
const { notificarFirmaINGE } = require('../services/email');
const { crearNotificacionDocInicialSST } = require('../services/notificacionesService');
const inge = require('../services/inge');
const { htmlVolverPortal } = require('../services/docSstPortal');

const router = express.Router();
const HTML_FIRMA = path.join(__dirname, '../views/inge/firmar.html');

function urlBase(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}
const urlFirma = (req, token) => `${urlBase(req)}/inge/firmar?t=${encodeURIComponent(token)}`;

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

async function accesoInge(usuario) {
  return computarAccesoSst(usuario, inge.SECCION);
}

function enAlcance(acceso, operacion) {
  return acceso.sinFiltro || (acceso.operacionesFiltro || []).includes(operacion);
}

async function obtenerInge(id) {
  const [[e]] = await pool.execute('SELECT * FROM Dynamic_inge WHERE id_inge = ? LIMIT 1', [id]);
  return e || null;
}

function paginaMensaje(titulo, texto) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${titulo}</title></head>
<body style="font-family:Arial,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px">
<div style="background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.06);max-width:440px;text-align:center">
<h2 style="color:#1B2A5E;margin-top:0">${titulo}</h2><p style="color:#64748b;line-height:1.5">${texto}</p></div></body></html>`;
}

// ── Página del trabajador (enlace con token) ─────────────────────────────────
router.get('/firmar', async (req, res) => {
  try {
    const token = String(req.query.t || '').trim();
    if (!token) return res.status(400).send(paginaMensaje('Enlace no válido', 'Este enlace no es válido. Solicite a SST un nuevo enlace.'));
    const [[e]] = await pool.execute('SELECT * FROM Dynamic_inge WHERE token_firma = ? LIMIT 1', [token]);
    if (!e) return res.status(404).send(paginaMensaje('Enlace no vigente', 'Este comprobante ya fue firmado o el enlace ya no está vigente. Si necesita diligenciarlo, solicite a SST un nuevo enlace.'));
    const firmaBase64 = await obtenerUrlFirmaReciente(String(e.identificacion))
      .then(u => (u ? descargarFirmaBase64PorUrl(u) : null)).catch(() => null);
    const config = JSON.stringify({
      token,
      nombre: nombreSinCedula(e.nombre_trabajador),
      identificacion: String(e.identificacion),
      cargo: e.cargo || '',
      operacion: e.operacion || '',
      tipo: e.tipo || 'Inducción',
      analista: e.nombre_analista || '',
      firmaBase64,
      formulario: inge.formularioPublico(),
    }).replace(/</g, '\\u003c');
    res.send(fs.readFileSync(HTML_FIRMA, 'utf8').replace('__CONFIG_INGE__', () => config).replace('</body>', () => htmlVolverPortal(req, e) + '</body>'));
  } catch (err) {
    console.error('[inge] GET /firmar:', err);
    res.status(500).send(paginaMensaje('Error', 'No se pudo cargar el comprobante. Intente de nuevo en unos minutos.'));
  }
});

// El trabajador envía los temas y firma (firma registrada o nueva). Se agrega la firma del Líder SST y se genera
// el PDF (documento 32).
router.post('/api/firmar', async (req, res) => {
  try {
    const { token, usarFirmaRegistrada, firmaBase64, temas } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Enlace no válido' });
    const [[e]] = await pool.execute('SELECT * FROM Dynamic_inge WHERE token_firma = ? LIMIT 1', [String(token)]);
    if (!e) return res.status(409).json({ error: 'Este comprobante ya fue firmado o el enlace ya no está vigente.' });

    const datos = inge.validarTemas(temas);
    if (datos.error) return res.status(400).json({ error: datos.error });

    let url;
    if (usarFirmaRegistrada) {
      url = await obtenerUrlFirmaReciente(String(e.identificacion)).catch(() => null);
      if (!url) return res.status(400).json({ error: 'No tiene una firma registrada; por favor dibuje su firma.' });
    } else {
      if (!firmaBase64) return res.status(400).json({ error: 'Debe dibujar su firma.' });
      url = await subirFirma(String(e.identificacion), Buffer.from(String(firmaBase64).replace(/^data:.*;base64,/, ''), 'base64'));
    }

    const cfg = await inge.configuracion();
    const lider = await inge.lider(cfg.rolLider);
    const [upd] = await pool.execute(
      `UPDATE Dynamic_inge SET temas = ?, temas_no = ?, url_firma = ?, fecha_firma = ?, token_firma = NULL,
              nombre_lider = ?, cargo_lider = ?, url_firma_lider = ?
        WHERE id_inge = ? AND token_firma = ?`,
      [JSON.stringify(datos.temas), datos.no, url, ahoraBogota(), lider.nombre || null, lider.cargo || null, lider.urlFirma,
        e.id_inge, String(token)]
    );
    if (!upd.affectedRows) return res.status(409).json({ error: 'Este comprobante ya fue firmado.' });

    const firmado = await obtenerInge(e.id_inge);
    const urlDoc = await inge.generarPdf(firmado);
    await pool.execute('UPDATE Dynamic_inge SET url_doc = ? WHERE id_inge = ?', [urlDoc, e.id_inge]);
    await inge.registrarDocumentoTrabajador(firmado, urlDoc);
    const nombre = nombreSinCedula(firmado.nombre_trabajador);
    crearNotificacionDocInicialSST(pool, {
      subtipo: 'INGE', referencia_id: firmado.id_inge, identificacion: firmado.identificacion, nombre_trabajador: nombre,
      operacion: firmado.operacion, regional: firmado.regional, titulo: `INGE firmado (${firmado.tipo || 'Inducción'})`,
      mensaje: `${nombre} firmó el Comprobante de Inducción General: ${inge.TOTAL_TEMAS - datos.no} temas SI, ${datos.no} NO`,
      resultado: datos.no ? `REFUERZO: ${datos.no} tema${datos.no === 1 ? '' : 's'} en NO` : 'FIRMADO', url_doc: urlDoc, usuarioCreador: firmado.usuario,
    });
    res.json({ ok: true, total: inge.TOTAL_TEMAS, no: datos.no });
  } catch (err) {
    console.error('[inge] POST /api/firmar:', err);
    res.status(500).json({ error: 'No se pudo registrar el comprobante. Intente de nuevo.' });
  }
});

// ── Subpestaña ───────────────────────────────────────────────────────────────
router.get('/api/inges', async (req, res) => {
  try {
    const acceso = await accesoInge(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const conds = [];
    const params = [];
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) return res.json({ inges: [], permisos: {} });
      conds.push(`(e.operacion IN (${acceso.operacionesFiltro.map(() => '?').join(',')}) OR e.usuario = ?)`);
      params.push(...acceso.operacionesFiltro, acceso.usuarioId);
    }
    const [rows] = await pool.execute(
      `SELECT e.id_inge, e.identificacion, e.nombre_trabajador, e.cargo, e.operacion, e.regional, e.ciudad, e.tipo,
              e.version_formato, e.token_firma, e.fecha_firma, e.url_doc, e.temas_no, e.nombre_analista, e.usuario,
              e.fecha_creacion, seg.Celular AS celular, seg.Email AS email
         FROM Dynamic_inge e
         LEFT JOIN \`Maestro_Segmentación\` seg ON seg.\`Identificación\` = e.identificacion
        ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
        ORDER BY e.fecha_creacion DESC
        LIMIT 2000`,
      params
    );
    const permiso = async (accion) => rolPuedeSst(acceso.rol, inge.SECCION, accion);
    const cfg = await inge.configuracion();
    const analista = await inge.analista(acceso.usuarioId);
    const lider = await inge.lider(cfg.rolLider);
    res.json({
      inges: rows.map(r => ({
        id: r.id_inge, radicado: inge.radicado(r.id_inge), identificacion: String(r.identificacion), trabajador: nombreSinCedula(r.nombre_trabajador),
        cargo: r.cargo || '', operacion: r.operacion || '', regional: r.regional || '', ciudad: r.ciudad || '',
        tipo: r.tipo || 'Inducción', version: r.version_formato || '',
        firmado: !!r.url_doc, fechaFirma: r.fecha_firma, urlDoc: r.url_doc || '', fechaCreacion: r.fecha_creacion,
        temasNo: r.url_doc ? Number(r.temas_no) || 0 : null,
        analista: r.nombre_analista || r.usuario, propio: r.usuario === acceso.usuarioId,
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
      totalTemas: inge.TOTAL_TEMAS,
      tipos: inge.TIPOS,
      analista: { nombre: analista.nombre, cargo: analista.cargo, tieneFirma: !!analista.urlFirma },
      lider: { nombre: lider.nombre, tieneFirma: !!lider.urlFirma },
    });
  } catch (err) {
    console.error('[inge] GET /api/inges:', err);
    res.status(500).json({ error: 'No se pudieron cargar los comprobantes' });
  }
});

// Trabajadores de una operación con los cargos del INGE, su último comprobante y si tienen uno pendiente
router.get('/api/trabajadores', async (req, res) => {
  try {
    const acceso = await accesoInge(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const { operacion } = req.query;
    if (!operacion || !enAlcance(acceso, operacion)) return res.status(400).json({ error: 'Escoja una operación de su alcance.' });
    const cfg = await inge.configuracion();
    const puedeRetirados = await puedeProcesarRetiradosSst(acceso.rol);
    const condEstado = puedeRetirados ? "v.Estado IN ('Activo', 'Retirado')" : "v.Estado = 'Activo'";
    const [rows] = await pool.execute(
      `SELECT v.\`Identificación\` AS identificacion, v.Trabajador, v.Cargo, v.Estado,
              (SELECT COUNT(*) FROM Dynamic_inge d WHERE d.identificacion = v.\`Identificación\` AND d.url_doc IS NULL) AS pendientes,
              (SELECT MAX(d.fecha_firma) FROM Dynamic_inge d WHERE d.identificacion = v.\`Identificación\` AND d.url_doc IS NOT NULL) AS ultimaFirma,
              (SELECT MAX(m.FechaRegistro) FROM Maestro_docTrabajador m WHERE m.\`Identificación\` = v.\`Identificación\` AND m.TipoDocumento = ?) AS ultimoDocumento
         FROM \`Maestro_Vinculación\` v
        WHERE ${condEstado} AND v.\`Operación\` = ?
        ORDER BY v.Trabajador`,
      [inge.ID_DOC_TRABAJADOR, operacion]
    );
    res.json({
      trabajadores: rows.filter(r => inge.cargoPermitido(cfg.cargos, r.Cargo)).map(r => ({
        identificacion: String(r.identificacion), nombre: nombreSinCedula(r.Trabajador), cargo: r.Cargo || '',
        estado: r.Estado || 'Activo', pendiente: Number(r.pendientes) > 0, ultimaFirma: r.ultimaFirma, ultimoDocumento: r.ultimoDocumento,
      })),
    });
  } catch (err) {
    console.error('[inge] GET /api/trabajadores:', err);
    res.status(500).json({ error: 'No se pudieron cargar los trabajadores' });
  }
});

// Crea el INGE de uno o varios trabajadores (si ya tiene uno pendiente, se reutiliza su enlace)
router.post('/api/crear', async (req, res) => {
  try {
    const acceso = await accesoInge(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, inge.SECCION, 'crear'))) return res.status(403).json({ error: 'Su rol no puede generar comprobantes de inducción.' });
    const body = req.body || {};
    const ids = [...new Set((Array.isArray(body.identificaciones) ? body.identificaciones : []).map(String))].slice(0, 300);
    if (!ids.length) return res.status(400).json({ error: 'Escoja al menos un trabajador.' });
    const tipo = inge.TIPOS.find(t => t === body.tipo);
    if (!tipo) return res.status(400).json({ error: 'Escoja si es Inducción o Reinducción.' });

    const cfg = await inge.configuracion();
    const enviarCorreo = !!body.enviarCorreo && cfg.correoHabilitado;
    const puedeRetirados = await puedeProcesarRetiradosSst(acceso.rol);
    const analista = await inge.analista(acceso.usuarioId);
    const [[usu]] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [acceso.usuarioId]);
    const [[plantilla]] = await pool.execute("SELECT version_formato FROM Maestro_Plantillas WHERE nombre_proceso = 'INGE' ORDER BY activo DESC, version DESC LIMIT 1");

    const resultados = [];
    for (const identificacion of ids) {
      const [[v]] = await pool.execute(
        `SELECT \`Id Vinculación\` AS idv, Trabajador, Cargo, \`Operación\` AS operacion, Regional, Estado, \`Fecha de Ingreso\` AS ingreso
           FROM \`Maestro_Vinculación\` WHERE \`Identificación\` = ? ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
        [identificacion]
      );
      if (!v || !enAlcance(acceso, v.operacion) || !inge.cargoPermitido(cfg.cargos, v.Cargo)) {
        resultados.push({ identificacion, error: 'No se encontró el trabajador, no es de su alcance o su cargo no aplica para el INGE.' });
        continue;
      }
      const esRetirado = String(v.Estado || '').toLowerCase() === 'retirado';
      if (esRetirado && !puedeRetirados) {
        resultados.push({ identificacion, error: 'Su rol no está autorizado para realizar procesos a personal retirado.' });
        continue;
      }
      let [[pend]] = await pool.execute('SELECT id_inge, token_firma FROM Dynamic_inge WHERE identificacion = ? AND url_doc IS NULL AND token_firma IS NOT NULL LIMIT 1', [identificacion]);
      const reutilizado = !!pend;
      if (!pend) {
        pend = { id_inge: uuidv4(), token_firma: crypto.randomBytes(24).toString('hex') };
        await pool.execute(
          `INSERT INTO Dynamic_inge (id_inge, identificacion, id_vinculacion, nombre_trabajador, cargo, operacion, regional, ciudad,
                                     fecha_ingreso, tipo, version_formato, nombre_analista, cargo_analista, url_firma_analista,
                                     token_firma, usuario, fecha_creacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [pend.id_inge, identificacion, v.idv, nombreSinCedula(v.Trabajador), v.Cargo, v.operacion, v.Regional,
            await inge.ciudadDeOperacion(v.operacion), v.ingreso || null, tipo, (plantilla && plantilla.version_formato) || '05',
            analista.nombre || null, analista.cargo || null, analista.urlFirma, pend.token_firma, acceso.usuarioId, ahoraBogota()]
        );
      }
      const enlace = urlFirma(req, pend.token_firma);
      const [[seg]] = await pool.execute('SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1', [identificacion]);
      let correo = false;
      if (enviarCorreo && !esRetirado && seg && seg.Email) {
        correo = await notificarFirmaINGE({ email: seg.Email, nombreTrabajador: nombreSinCedula(v.Trabajador), cargo: v.Cargo, operacion: v.operacion, tipo, urlFirma: enlace, emailUsuario: usu && usu.Email })
          .catch(err => { console.error('[inge] Correo:', err.message); return false; });
      }
      resultados.push({ identificacion, id: pend.id_inge, trabajador: nombreSinCedula(v.Trabajador), urlFirma: enlace, reutilizado,
        celular: seg && seg.Celular ? String(seg.Celular) : '', correo });
    }
    res.json({ ok: true, resultados });
  } catch (err) {
    console.error('[inge] POST /api/crear:', err);
    res.status(500).json({ error: 'No se pudo generar el comprobante' });
  }
});

// Reenviar el enlace por correo
router.post('/api/inge/:id/enviar-correo', async (req, res) => {
  try {
    const acceso = await accesoInge(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, inge.SECCION, 'crear'))) return res.status(403).json({ error: 'No autorizado' });
    const e = await obtenerInge(req.params.id);
    if (!e || !enAlcance(acceso, e.operacion)) return res.status(404).json({ error: 'No se encontró el comprobante.' });
    if (e.url_doc || !e.token_firma) return res.status(409).json({ error: 'Este comprobante ya fue firmado.' });
    const [[vEst]] = await pool.execute('SELECT Estado FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1', [e.identificacion]);
    if (vEst && String(vEst.Estado || '').toLowerCase() === 'retirado') {
      return res.status(400).json({ error: 'No se pueden enviar correos a personal retirado; copie el enlace directamente.' });
    }
    if (!(await inge.configuracion()).correoHabilitado) return res.status(400).json({ error: 'Los correos del INGE están desactivados en Config_Parametros.' });
    const [[seg]] = await pool.execute('SELECT Email FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1', [e.identificacion]);
    if (!seg || !seg.Email) return res.status(400).json({ error: 'El trabajador no tiene correo registrado.' });
    const [[usu]] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [acceso.usuarioId]);
    await notificarFirmaINGE({ email: seg.Email, nombreTrabajador: nombreSinCedula(e.nombre_trabajador), cargo: e.cargo, operacion: e.operacion, tipo: e.tipo, urlFirma: urlFirma(req, e.token_firma), emailUsuario: usu && usu.Email });
    res.json({ ok: true, email: seg.Email });
  } catch (err) {
    console.error('[inge] POST enviar-correo:', err);
    res.status(500).json({ error: 'No se pudo enviar el correo' });
  }
});

// Regenerar el PDF con la plantilla vigente (mismos temas y firmas)
router.post('/api/inge/:id/regenerar', async (req, res) => {
  try {
    const acceso = await accesoInge(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, inge.SECCION, 'editarFirmado'))) return res.status(403).json({ error: 'Su rol no puede regenerar el PDF.' });
    const e = await obtenerInge(req.params.id);
    if (!e || !e.url_doc) return res.status(404).json({ error: 'El comprobante no está firmado.' });
    const urlDoc = await inge.generarPdf(e);
    await pool.execute('UPDATE Dynamic_inge SET url_doc = ? WHERE id_inge = ?', [urlDoc, e.id_inge]);
    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[inge] POST regenerar:', err);
    res.status(500).json({ error: 'No se pudo regenerar el PDF' });
  }
});

// Eliminar: pendiente (Sistema cualquiera; los demás los propios) o firmado (rol de eliminarFirmado; su documento 32
// sale de la carpeta y, si el trabajador tiene otro comprobante firmado, el más reciente queda en su lugar)
router.delete('/api/inge/:id', async (req, res) => {
  try {
    const acceso = await accesoInge(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const e = await obtenerInge(req.params.id);
    if (!e || !enAlcance(acceso, e.operacion)) return res.status(404).json({ error: 'No se encontró el comprobante.' });
    if (e.url_doc) {
      if (!(await rolPuedeSst(acceso.rol, inge.SECCION, 'eliminarFirmado'))) return res.status(403).json({ error: 'Su rol no puede eliminar un comprobante firmado.' });
      await pool.execute('DELETE FROM Maestro_docTrabajador WHERE `Identificación` = ? AND Prefijo = ? AND Doc = ?', [e.identificacion, inge.PREFIJO_DOC, e.url_doc]);
    } else {
      if (!(await rolPuedeSst(acceso.rol, inge.SECCION, 'eliminar'))) return res.status(403).json({ error: 'Su rol no puede eliminar comprobantes.' });
      if (acceso.rol !== 'Sistema' && e.usuario !== acceso.usuarioId) return res.status(403).json({ error: 'Solo puede eliminar los comprobantes que usted generó.' });
    }
    await pool.execute('DELETE FROM Dynamic_inge WHERE id_inge = ?', [e.id_inge]);
    if (e.url_doc) await inge.restaurarUltimoDocumento(e.identificacion);
    res.json({ ok: true });
  } catch (err) {
    console.error('[inge] DELETE:', err);
    res.status(500).json({ error: 'No se pudo eliminar el comprobante' });
  }
});

module.exports = router;

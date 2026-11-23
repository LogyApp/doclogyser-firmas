// SST › Documentación Inicial › EVIN (/evin). Quién ve la subpestaña: Maestro_Menu sst / EVIN (Acceso 1 todo,
// 2 su regional, 3 sus operaciones). Qué puede hacer: Config_Parametros sst / EVIN (crear, eliminar, editarFirmado,
// eliminarFirmado; ver configSst.js).
// Flujo (como ARO): SST escoge a los trabajadores, el tipo (Inducción o Reinducción) y las observaciones, y se genera
// el enlace (/evin/firmar?t=). El trabajador califica los aspectos de la inducción, responde las 27 preguntas y firma;
// se califica sola y el PDF queda en su carpeta como documento 29 (solo el último). Firma como Responsable de
// Inducción quien la creó.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { computarAccesoSst } = require('../services/accesoSst');
const { rolPuedeSst, puedeProcesarRetiradosSst } = require('../services/configSst');
const { subirFirma, obtenerUrlFirmaReciente, descargarFirmaBase64PorUrl } = require('../services/storage');
const { notificarFirmaEVIN } = require('../services/email');
const { crearNotificacionDocInicialSST } = require('../services/notificacionesService');
const evin = require('../services/evin');
const { htmlVolverPortal } = require('../services/docSstPortal');

const router = express.Router();
const HTML_FIRMA = path.join(__dirname, '../views/evin/firmar.html');
const MAX_OBSERVACIONES = 2000;

function urlBase(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}
const urlFirma = (req, token) => `${urlBase(req)}/evin/firmar?t=${encodeURIComponent(token)}`;

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

async function accesoEvin(usuario) {
  return computarAccesoSst(usuario, evin.SECCION);
}

function enAlcance(acceso, operacion) {
  return acceso.sinFiltro || (acceso.operacionesFiltro || []).includes(operacion);
}

async function obtenerEvin(id) {
  const [[e]] = await pool.execute('SELECT * FROM Dynamic_evin WHERE id_evin = ? LIMIT 1', [id]);
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
    const [[e]] = await pool.execute('SELECT * FROM Dynamic_evin WHERE token_firma = ? LIMIT 1', [token]);
    if (!e) return res.status(404).send(paginaMensaje('Enlace no vigente', 'Esta evaluación ya fue respondida o el enlace ya no está vigente. Si necesita presentarla, solicite a SST un nuevo enlace.'));
    const firmaBase64 = await obtenerUrlFirmaReciente(String(e.identificacion))
      .then(u => (u ? descargarFirmaBase64PorUrl(u) : null)).catch(() => null);
    const config = JSON.stringify({
      token,
      nombre: nombreSinCedula(e.nombre_trabajador),
      identificacion: String(e.identificacion),
      cargo: e.cargo || '',
      operacion: e.operacion || '',
      tipo: e.tipo || 'Inducción',
      responsable: e.nombre_responsable || '',
      firmaBase64,
      formulario: evin.formularioPublico(),
    }).replace(/</g, '\\u003c');
    res.send(fs.readFileSync(HTML_FIRMA, 'utf8').replace('__CONFIG_EVIN__', () => config).replace('</body>', () => htmlVolverPortal(req, e) + '</body>'));
  } catch (err) {
    console.error('[evin] GET /firmar:', err);
    res.status(500).send(paginaMensaje('Error', 'No se pudo cargar la evaluación. Intente de nuevo en unos minutos.'));
  }
});

// El trabajador envía sus respuestas y firma (firma registrada o nueva). Se califica y se genera el PDF (documento 29).
router.post('/api/firmar', async (req, res) => {
  try {
    const { token, usarFirmaRegistrada, firmaBase64, aspectos, respuestas } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Enlace no válido' });
    const [[e]] = await pool.execute('SELECT * FROM Dynamic_evin WHERE token_firma = ? LIMIT 1', [String(token)]);
    if (!e) return res.status(409).json({ error: 'Esta evaluación ya fue respondida o el enlace ya no está vigente.' });

    const datos = evin.validarRespuestas(aspectos, respuestas);
    if (datos.error) return res.status(400).json({ error: datos.error });

    let url;
    if (usarFirmaRegistrada) {
      url = await obtenerUrlFirmaReciente(String(e.identificacion)).catch(() => null);
      if (!url) return res.status(400).json({ error: 'No tiene una firma registrada; por favor dibuje su firma.' });
    } else {
      if (!firmaBase64) return res.status(400).json({ error: 'Debe dibujar su firma.' });
      url = await subirFirma(String(e.identificacion), Buffer.from(String(firmaBase64).replace(/^data:.*;base64,/, ''), 'base64'));
    }

    const cfg = await evin.configuracion();
    const resultado = evin.calificar(datos.respuestas, cfg.minimo);
    const [upd] = await pool.execute(
      `UPDATE Dynamic_evin SET aspectos = ?, respuestas = ?, correctas = ?, porcentaje = ?, aprobado = ?,
              url_firma = ?, fecha_firma = ?, token_firma = NULL
        WHERE id_evin = ? AND token_firma = ?`,
      [JSON.stringify(datos.aspectos), JSON.stringify(datos.respuestas), resultado.correctas, resultado.porcentaje,
        resultado.aprobado ? 1 : 0, url, ahoraBogota(), e.id_evin, String(token)]
    );
    if (!upd.affectedRows) return res.status(409).json({ error: 'Esta evaluación ya fue respondida.' });

    const firmada = await obtenerEvin(e.id_evin);
    const urlDoc = await evin.generarPdf(firmada);
    await pool.execute('UPDATE Dynamic_evin SET url_doc = ? WHERE id_evin = ?', [urlDoc, e.id_evin]);
    await evin.registrarDocumentoTrabajador(firmada, urlDoc);
    const nombre = nombreSinCedula(firmada.nombre_trabajador);
    crearNotificacionDocInicialSST(pool, {
      subtipo: 'EVIN', referencia_id: firmada.id_evin, identificacion: firmada.identificacion, nombre_trabajador: nombre,
      operacion: firmada.operacion, regional: firmada.regional, titulo: `EVIN respondida (${firmada.tipo || 'Inducción'}, intento ${firmada.intento || 1})`,
      mensaje: `${nombre} respondió la EVIN: ${resultado.correctas} de ${resultado.total}`,
      resultado: resultado.aprobado ? 'APROBADO' : 'REPROBADO', puntaje: `${resultado.porcentaje}%`, url_doc: urlDoc, usuarioCreador: firmada.usuario,
    });
    // Al trabajador se le muestra su resultado, no cuáles respuestas eran las correctas
    res.json({ ok: true, correctas: resultado.correctas, total: resultado.total, porcentaje: resultado.porcentaje, aprobado: resultado.aprobado });
  } catch (err) {
    console.error('[evin] POST /api/firmar:', err);
    res.status(500).json({ error: 'No se pudo registrar la evaluación. Intente de nuevo.' });
  }
});

// ── Subpestaña ───────────────────────────────────────────────────────────────
router.get('/api/evins', async (req, res) => {
  try {
    const acceso = await accesoEvin(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const conds = [];
    const params = [];
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) return res.json({ evins: [], permisos: {} });
      conds.push(`(e.operacion IN (${acceso.operacionesFiltro.map(() => '?').join(',')}) OR e.usuario = ?)`);
      params.push(...acceso.operacionesFiltro, acceso.usuarioId);
    }
    const [rows] = await pool.execute(
      `SELECT e.id_evin, e.identificacion, e.nombre_trabajador, e.cargo, e.operacion, e.regional, e.ciudad, e.tipo, e.intento,
              e.version_formato, e.token_firma, e.fecha_firma, e.url_doc, e.correctas, e.porcentaje, e.aprobado,
              e.nombre_responsable, e.usuario, e.fecha_creacion, seg.Celular AS celular, seg.Email AS email,
              (SELECT d.id_evin FROM Dynamic_evin d WHERE d.identificacion = e.identificacion AND d.url_doc IS NOT NULL
                ORDER BY d.fecha_firma DESC LIMIT 1) AS ultima_firmada
         FROM Dynamic_evin e
         LEFT JOIN \`Maestro_Segmentación\` seg ON seg.\`Identificación\` = e.identificacion
        ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
        ORDER BY e.fecha_creacion DESC
        LIMIT 2000`,
      params
    );
    const permiso = async (accion) => rolPuedeSst(acceso.rol, evin.SECCION, accion);
    const cfg = await evin.configuracion();
    const resp = await evin.responsable(acceso.usuarioId);
    res.json({
      evins: rows.map(r => ({
        id: r.id_evin, radicado: evin.radicado(r.id_evin), identificacion: String(r.identificacion), trabajador: nombreSinCedula(r.nombre_trabajador),
        cargo: r.cargo || '', operacion: r.operacion || '', regional: r.regional || '', ciudad: r.ciudad || '',
        tipo: r.tipo || 'Inducción', intento: Number(r.intento) || 1, version: r.version_formato || '',
        firmado: !!r.url_doc, fechaFirma: r.fecha_firma, urlDoc: r.url_doc || '', fechaCreacion: r.fecha_creacion,
        correctas: r.correctas, porcentaje: r.porcentaje == null ? null : Number(r.porcentaje), aprobado: Number(r.aprobado) === 1,
        // El aviso (segundo intento o reinducción) solo sale en la última evaluación firmada del trabajador
        aviso: r.ultima_firmada === r.id_evin ? evin.avisoResultado(r) : '',
        responsable: r.nombre_responsable || r.usuario, propio: r.usuario === acceso.usuarioId,
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
      minimo: cfg.minimo,
      totalPreguntas: evin.TOTAL_PREGUNTAS,
      tipos: evin.TIPOS,
      responsable: { nombre: resp.nombre, cargo: resp.cargo, tieneFirma: !!resp.urlFirma },
    });
  } catch (err) {
    console.error('[evin] GET /api/evins:', err);
    res.status(500).json({ error: 'No se pudieron cargar las evaluaciones' });
  }
});

// Trabajadores de una operación con los cargos de la EVIN, su última evaluación y si tienen una pendiente
router.get('/api/trabajadores', async (req, res) => {
  try {
    const acceso = await accesoEvin(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const { operacion } = req.query;
    if (!operacion || !enAlcance(acceso, operacion)) return res.status(400).json({ error: 'Escoja una operación de su alcance.' });
    const cfg = await evin.configuracion();
    const puedeRetirados = await puedeProcesarRetiradosSst(acceso.rol);
    const condEstado = puedeRetirados ? "v.Estado IN ('Activo', 'Retirado')" : "v.Estado = 'Activo'";
    const [rows] = await pool.execute(
      `SELECT v.\`Identificación\` AS identificacion, v.Trabajador, v.Cargo, v.Estado,
              (SELECT COUNT(*) FROM Dynamic_evin d WHERE d.identificacion = v.\`Identificación\` AND d.url_doc IS NULL) AS pendientes,
              (SELECT MAX(m.FechaRegistro) FROM Maestro_docTrabajador m WHERE m.\`Identificación\` = v.\`Identificación\` AND m.TipoDocumento = ?) AS ultimoDocumento
         FROM \`Maestro_Vinculación\` v
        WHERE ${condEstado} AND v.\`Operación\` = ?
        ORDER BY v.Trabajador`,
      [evin.ID_DOC_TRABAJADOR, operacion]
    );
    const ids = rows.map(r => r.identificacion);
    const ultimas = {};
    if (ids.length) {
      const [firmadas] = await pool.execute(
        `SELECT identificacion, fecha_firma, aprobado, intento, porcentaje, url_doc FROM Dynamic_evin
          WHERE url_doc IS NOT NULL AND identificacion IN (${ids.map(() => '?').join(',')}) ORDER BY fecha_firma DESC`,
        ids
      );
      firmadas.forEach(f => { if (!ultimas[f.identificacion]) ultimas[f.identificacion] = f; });
    }
    res.json({
      trabajadores: rows.filter(r => evin.cargoPermitido(cfg.cargos, r.Cargo)).map(r => {
        const u = ultimas[r.identificacion];
        return {
          identificacion: String(r.identificacion), nombre: nombreSinCedula(r.Trabajador), cargo: r.Cargo || '',
          estado: r.Estado || 'Activo', pendiente: Number(r.pendientes) > 0, ultimoDocumento: r.ultimoDocumento,
          ultima: u ? { fecha: u.fecha_firma, aprobado: Number(u.aprobado) === 1, porcentaje: Number(u.porcentaje), aviso: evin.avisoResultado(u) } : null,
        };
      }),
    });
  } catch (err) {
    console.error('[evin] GET /api/trabajadores:', err);
    res.status(500).json({ error: 'No se pudieron cargar los trabajadores' });
  }
});

// Crea la EVIN de uno o varios trabajadores (si ya tiene una pendiente, se reutiliza su enlace)
router.post('/api/crear', async (req, res) => {
  try {
    const acceso = await accesoEvin(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, evin.SECCION, 'crear'))) return res.status(403).json({ error: 'Su rol no puede generar evaluaciones de inducción.' });
    const body = req.body || {};
    const ids = [...new Set((Array.isArray(body.identificaciones) ? body.identificaciones : []).map(String))].slice(0, 300);
    if (!ids.length) return res.status(400).json({ error: 'Escoja al menos un trabajador.' });
    const tipo = evin.TIPOS.find(t => t === body.tipo);
    if (!tipo) return res.status(400).json({ error: 'Escoja si es Inducción o Reinducción.' });
    const observaciones = String(body.observaciones || '').trim();
    if (observaciones.length > MAX_OBSERVACIONES) return res.status(400).json({ error: `Las observaciones no pueden superar ${MAX_OBSERVACIONES} caracteres.` });

    const cfg = await evin.configuracion();
    const enviarCorreo = !!body.enviarCorreo && cfg.correoHabilitado;
    const puedeRetirados = await puedeProcesarRetiradosSst(acceso.rol);
    const resp = await evin.responsable(acceso.usuarioId);
    const [[usu]] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [acceso.usuarioId]);
    const [[plantilla]] = await pool.execute("SELECT version_formato FROM Maestro_Plantillas WHERE nombre_proceso = 'EVIN' ORDER BY activo DESC, version DESC LIMIT 1");

    const resultados = [];
    for (const identificacion of ids) {
      const [[v]] = await pool.execute(
        `SELECT \`Id Vinculación\` AS idv, Trabajador, Cargo, \`Operación\` AS operacion, Regional, Estado
           FROM \`Maestro_Vinculación\` WHERE \`Identificación\` = ? ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
        [identificacion]
      );
      if (!v || !enAlcance(acceso, v.operacion) || !evin.cargoPermitido(cfg.cargos, v.Cargo)) {
        resultados.push({ identificacion, error: 'No se encontró el trabajador, no es de su alcance o su cargo no aplica para la EVIN.' });
        continue;
      }
      const esRetirado = String(v.Estado || '').toLowerCase() === 'retirado';
      if (esRetirado && !puedeRetirados) {
        resultados.push({ identificacion, error: 'Su rol no está autorizado para realizar procesos a personal retirado.' });
        continue;
      }
      let [[pend]] = await pool.execute('SELECT id_evin, token_firma FROM Dynamic_evin WHERE identificacion = ? AND url_doc IS NULL AND token_firma IS NOT NULL LIMIT 1', [identificacion]);
      const reutilizado = !!pend;
      let intento = null;
      if (!pend) {
        pend = { id_evin: uuidv4(), token_firma: crypto.randomBytes(24).toString('hex') };
        intento = await evin.siguienteIntento(identificacion);
        await pool.execute(
          `INSERT INTO Dynamic_evin (id_evin, identificacion, id_vinculacion, nombre_trabajador, cargo, operacion, regional, ciudad,
                                     tipo, intento, version_formato, observaciones, nombre_responsable, cargo_responsable,
                                     url_firma_responsable, token_firma, usuario, fecha_creacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [pend.id_evin, identificacion, v.idv, nombreSinCedula(v.Trabajador), v.Cargo, v.operacion, v.Regional,
            await evin.ciudadDeOperacion(v.operacion), tipo, intento, (plantilla && plantilla.version_formato) || '04',
            observaciones || null, resp.nombre || null, resp.cargo || null, resp.urlFirma, pend.token_firma, acceso.usuarioId, ahoraBogota()]
        );
      }
      const enlace = urlFirma(req, pend.token_firma);
      const [[seg]] = await pool.execute('SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1', [identificacion]);
      let correo = false;
      if (enviarCorreo && !esRetirado && seg && seg.Email) {
        correo = await notificarFirmaEVIN({ email: seg.Email, nombreTrabajador: nombreSinCedula(v.Trabajador), cargo: v.Cargo, operacion: v.operacion, tipo, urlFirma: enlace, emailUsuario: usu && usu.Email })
          .catch(err => { console.error('[evin] Correo:', err.message); return false; });
      }
      resultados.push({ identificacion, id: pend.id_evin, trabajador: nombreSinCedula(v.Trabajador), urlFirma: enlace, reutilizado, intento,
        celular: seg && seg.Celular ? String(seg.Celular) : '', correo });
    }
    res.json({ ok: true, resultados });
  } catch (err) {
    console.error('[evin] POST /api/crear:', err);
    res.status(500).json({ error: 'No se pudo generar la evaluación' });
  }
});

// Reenviar el enlace por correo
router.post('/api/evin/:id/enviar-correo', async (req, res) => {
  try {
    const acceso = await accesoEvin(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, evin.SECCION, 'crear'))) return res.status(403).json({ error: 'No autorizado' });
    const e = await obtenerEvin(req.params.id);
    if (!e || !enAlcance(acceso, e.operacion)) return res.status(404).json({ error: 'No se encontró la evaluación.' });
    if (e.url_doc || !e.token_firma) return res.status(409).json({ error: 'Esta evaluación ya fue respondida.' });
    const [[vEst]] = await pool.execute('SELECT Estado FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1', [e.identificacion]);
    if (vEst && String(vEst.Estado || '').toLowerCase() === 'retirado') {
      return res.status(400).json({ error: 'No se pueden enviar correos a personal retirado; copie el enlace directamente.' });
    }
    if (!(await evin.configuracion()).correoHabilitado) return res.status(400).json({ error: 'Los correos de la EVIN están desactivados en Config_Parametros.' });
    const [[seg]] = await pool.execute('SELECT Email FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1', [e.identificacion]);
    if (!seg || !seg.Email) return res.status(400).json({ error: 'El trabajador no tiene correo registrado.' });
    const [[usu]] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [acceso.usuarioId]);
    await notificarFirmaEVIN({ email: seg.Email, nombreTrabajador: nombreSinCedula(e.nombre_trabajador), cargo: e.cargo, operacion: e.operacion, tipo: e.tipo, urlFirma: urlFirma(req, e.token_firma), emailUsuario: usu && usu.Email });
    res.json({ ok: true, email: seg.Email });
  } catch (err) {
    console.error('[evin] POST enviar-correo:', err);
    res.status(500).json({ error: 'No se pudo enviar el correo' });
  }
});

// Regenerar el PDF con la plantilla vigente (mismas respuestas y firmas)
router.post('/api/evin/:id/regenerar', async (req, res) => {
  try {
    const acceso = await accesoEvin(req.query.usuario);
    if (!acceso || !(await rolPuedeSst(acceso.rol, evin.SECCION, 'editarFirmado'))) return res.status(403).json({ error: 'Su rol no puede regenerar el PDF.' });
    const e = await obtenerEvin(req.params.id);
    if (!e || !e.url_doc) return res.status(404).json({ error: 'La evaluación no está respondida.' });
    const urlDoc = await evin.generarPdf(e);
    await pool.execute('UPDATE Dynamic_evin SET url_doc = ? WHERE id_evin = ?', [urlDoc, e.id_evin]);
    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[evin] POST regenerar:', err);
    res.status(500).json({ error: 'No se pudo regenerar el PDF' });
  }
});

// Eliminar: pendiente (Sistema cualquiera; los demás las propias) o firmada (rol de eliminarFirmado; su documento 29
// sale de la carpeta y, si el trabajador tiene otra evaluación firmada, la más reciente queda en su lugar)
router.delete('/api/evin/:id', async (req, res) => {
  try {
    const acceso = await accesoEvin(req.query.usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const e = await obtenerEvin(req.params.id);
    if (!e || !enAlcance(acceso, e.operacion)) return res.status(404).json({ error: 'No se encontró la evaluación.' });
    if (e.url_doc) {
      if (!(await rolPuedeSst(acceso.rol, evin.SECCION, 'eliminarFirmado'))) return res.status(403).json({ error: 'Su rol no puede eliminar una evaluación respondida.' });
      await pool.execute('DELETE FROM Maestro_docTrabajador WHERE `Identificación` = ? AND Prefijo = ? AND Doc = ?', [e.identificacion, evin.PREFIJO_DOC, e.url_doc]);
    } else {
      if (!(await rolPuedeSst(acceso.rol, evin.SECCION, 'eliminar'))) return res.status(403).json({ error: 'Su rol no puede eliminar evaluaciones.' });
      if (acceso.rol !== 'Sistema' && e.usuario !== acceso.usuarioId) return res.status(403).json({ error: 'Solo puede eliminar las evaluaciones que usted generó.' });
    }
    await pool.execute('DELETE FROM Dynamic_evin WHERE id_evin = ?', [e.id_evin]);
    if (e.url_doc) await evin.restaurarUltimoDocumento(e.identificacion);
    res.json({ ok: true });
  } catch (err) {
    console.error('[evin] DELETE:', err);
    res.status(500).json({ error: 'No se pudo eliminar la evaluación' });
  }
});

module.exports = router;

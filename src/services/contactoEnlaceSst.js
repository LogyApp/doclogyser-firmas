const pool = require('./db');
const { computarAccesoSst } = require('./accesoSst');
const { rolPuedeSst } = require('./configSst');
const { obtenerConfigAts } = require('./atsService');

const TIPOS = {
  ev: {
    seccion: 'Evaluación SST',
    consulta: `SELECT c.identificacion, c.usuario, c.url_doc, c.firma_trabajador,
      (SELECT v.\`Operación\` FROM Maestro_Vinculación v WHERE v.Identificación = c.identificacion
       ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1) AS operacion
      FROM Maestro_evaluacionsst c WHERE c.id_evaluacion = ? FOR UPDATE`,
  },
  pc: {
    seccion: 'Prueba de Consumo', permiteCreador: true,
    consulta: `SELECT c.identificacion, c.usuario, c.url_doc, c.firma_trabajador,
      COALESCE((SELECT v.\`Operación\` FROM Maestro_Vinculación v WHERE v.Identificación = c.identificacion
       ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1), c.operacion) AS operacion
      FROM Dynamic_pruebaconsumo c WHERE c.idprueba = ? FOR UPDATE`,
  },
  csst: {
    seccion: 'Compromiso SST', permiteCreador: true,
    consulta: `SELECT c.identificaciontrabajador AS identificacion, c.usuario, c.url_doc, c.firma_trabajador,
      (SELECT v.\`Operación\` FROM Maestro_Vinculación v WHERE v.Identificación = c.identificaciontrabajador
       AND v.Estado = 'Activo' LIMIT 1) AS operacion
      FROM Dynamic_compromisosst c WHERE c.idcsst = ? FOR UPDATE`,
  },
  aro: {
    seccion: 'ARO', permiteCreador: true,
    consulta: 'SELECT identificacion, usuario, operacion, url_doc, url_firma AS firma_trabajador FROM Dynamic_aro WHERE id_aro = ? FOR UPDATE',
  },
  pesv: {
    seccion: 'PESV', permiteCreador: true,
    consulta: 'SELECT identificacion, usuario, operacion, url_doc, url_firma AS firma_trabajador FROM Dynamic_pesv WHERE id_pesv = ? FOR UPDATE',
  },
  evin: {
    seccion: 'EVIN', permiteCreador: true,
    consulta: 'SELECT identificacion, usuario, operacion, url_doc, url_firma AS firma_trabajador FROM Dynamic_evin WHERE id_evin = ? FOR UPDATE',
  },
  inge: {
    seccion: 'INGE', permiteCreador: true,
    consulta: 'SELECT identificacion, usuario, operacion, url_doc, url_firma AS firma_trabajador FROM Dynamic_inge WHERE id_inge = ? FOR UPDATE',
  },
  ats: {
    seccion: 'ATS',
    consulta: `SELECT t.identificacion, a.operacion, t.estado_firma
      FROM Dynamic_ats_trabajadores t JOIN Dynamic_ats a ON a.id_ats = t.id_ats
      WHERE t.id_item = ? FOR UPDATE`,
  },
  'cm-apertura': {
    seccion: 'Casos Medicos', accion: 'actas', permisoCreador: true, estadoRequerido: 1,
    consulta: `SELECT identificacion, usuario, operacion, estado_general_id, url_acta_apertura AS url_doc,
      COALESCE(NULLIF(firma_apertura, ''), url_firma_apertura) AS firma_trabajador
      FROM Maestro_casosmedicos WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
  },
  'cm-cierre': {
    seccion: 'Casos Medicos', accion: 'actas', permisoCreador: true, estadoRequerido: 2,
    consulta: `SELECT identificacion, usuario, operacion, estado_general_id, url_acta_cierre AS url_doc,
      COALESCE(NULLIF(firma_cierre, ''), url_firma_cierre) AS firma_trabajador
      FROM Maestro_casosmedicos WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
  },
};

async function gestionarContacto(tipo, id, usuario, datos) {
  const config = Object.hasOwn(TIPOS, tipo) ? TIPOS[tipo] : null;
  if (!config || !id || !usuario) return { status: 400, error: 'Tipo, registro y usuario son requeridos.' };
  if (datos && (typeof datos.email !== 'string' || typeof datos.celular !== 'string')) {
    return { status: 400, error: 'Correo y celular son requeridos.' };
  }
  const acceso = await computarAccesoSst(usuario, config.seccion);
  const permiso = acceso && (tipo === 'ats'
    ? (await obtenerConfigAts(acceso.rol)).puedeRegistrar
    : await rolPuedeSst(acceso.rol, config.seccion, config.accion || 'crear'));
  if (!acceso || (!permiso && !config.permisoCreador)) return { status: 403, error: 'No autorizado para actualizar el contacto.' };

  return pool.withTransaction(async conn => {
    const [rows] = await conn.execute(config.consulta, [id]);
    if (!rows.length) return { status: 404, error: 'Registro no encontrado.' };
    const registro = rows[0];
    if (!permiso && String(registro.usuario || '').trim().toLowerCase() !== String(acceso.usuarioId).trim().toLowerCase()) {
      return { status: 403, error: 'No autorizado para actualizar el contacto.' };
    }
    if (!acceso.sinFiltro && !(acceso.operacionesFiltro || []).includes(registro.operacion)
        && !(config.permiteCreador && String(registro.usuario) === String(acceso.usuarioId))) {
      return { status: 403, error: 'No tienes acceso a este registro.' };
    }
    if (registro.url_doc || registro.firma_trabajador || registro.estado_firma === 'ACEPTADA'
        || (config.estadoRequerido && Number(registro.estado_general_id) !== config.estadoRequerido)) {
      return { status: 409, error: 'El trabajador ya firmó o el registro está cerrado.' };
    }
    if (!registro.identificacion) return { status: 400, error: 'El registro no tiene identificación de trabajador.' };
    if (!datos) {
      const [contactos] = await conn.execute(
        'SELECT Email, Celular FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
        [registro.identificacion]
      );
      return { ok: true, email: contactos.length ? contactos[0].Email || '' : '', celular: contactos.length ? contactos[0].Celular || '' : '' };
    }
    const email = datos.email.trim();
    const celular = datos.celular.trim();
    await conn.execute(
      `INSERT INTO Maestro_Segmentación (Identificación, Email, Celular) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE Email = VALUES(Email), Celular = VALUES(Celular)`,
      [registro.identificacion, email || null, celular || null]
    );
    if (tipo === 'ats') {
      await conn.execute('UPDATE Dynamic_ats_trabajadores SET email = ?, celular = ? WHERE id_item = ?',
        [email || null, celular || null, id]);
    }
    return { ok: true, email, celular, ...(config.estadoRequerido ? { identificacion: registro.identificacion } : {}) };
  });
}

module.exports = { gestionarContacto };

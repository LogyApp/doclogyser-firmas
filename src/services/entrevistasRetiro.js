// Parámetros y campana de Talent Hub › Entrevistas de Retiro.
// Config_Parametros Modulo 'talenthub', Seccion 'Entrevistas de Retiro'
// (migraciones/2026-11-19_talenthub_entrevistas_retiro.sql). Sin la fila se usan los roles por defecto.
const pool = require('./db');

const SECCION = 'Entrevistas de Retiro';
const P_REGENERAR = 'Roles que pueden regenerar entrevistas de retiro';
const P_NOTIFICAR = 'Roles notificados de nuevas entrevistas de retiro';
const ROLES_DEFECTO = 'Sistema, CoorSelección, Directorth, Juridica, Nomina';

const normalizar = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

async function listaRoles(concepto) {
  try {
    const [rows] = await pool.execute(
      "SELECT Parametro FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = ? AND Concepto = ? LIMIT 1",
      [SECCION, concepto]
    );
    const valor = rows.length ? String(rows[0].Parametro || '') : ROLES_DEFECTO;
    return valor.split(',').map((r) => r.trim()).filter(Boolean);
  } catch (_) {
    return ROLES_DEFECTO.split(',').map((r) => r.trim());
  }
}

async function puedeRegenerarEntrevistas(rol) {
  const r = normalizar(rol);
  return !!r && (await listaRoles(P_REGENERAR)).some((x) => normalizar(x) === r);
}

// Campana: una notificación por usuario de los roles configurados cuando un trabajador diligencia
// su entrevista. No falla el envío del formulario si algo sale mal.
async function notificarNuevaEntrevista({ idEvaluacion, vin, urlPdf, motivoPrincipal }) {
  try {
    const roles = await listaRoles(P_NOTIFICAR);
    if (!roles.length) return;
    const [usuarios] = await pool.execute(
      `SELECT ID FROM Maestro_Usuarios WHERE Rol IN (${roles.map(() => '?').join(',')})`, roles
    );
    const partes = String(vin.Trabajador || '').split(' ** ');
    const nombre = (partes.length > 1 ? partes[1] : vin.Trabajador || '').trim();
    const motivo = String(motivoPrincipal || '').trim();
    for (const u of usuarios) {
      await pool.execute(
        `INSERT INTO Maestro_notificaciones
           (usuario_id, modulo, subtipo, referencia_id, identificacion_trabajador, nombre_trabajador,
            operacion, regional, titulo, mensaje, url_doc, leido, fecha_creacion)
         SELECT ?, 'entrevistasretiro', 'entrevista', ?, ?, ?, ?, ?, 'Nueva entrevista de retiro', ?, ?, 0, NOW()
          WHERE NOT EXISTS (SELECT 1 FROM Maestro_notificaciones WHERE usuario_id = ? AND modulo = 'entrevistasretiro' AND referencia_id = ?)`,
        [u.ID, idEvaluacion, String(vin['Identificación'] || ''), nombre, vin['Operación'] || null, vin.Regional || null,
          `${nombre} diligenció su entrevista de retiro${motivo ? ` (motivo: ${motivo})` : ''}.`, urlPdf || null,
          u.ID, idEvaluacion]
      );
    }
  } catch (err) {
    console.error('[entrevistasRetiro] No se pudo crear la notificación:', err.message);
  }
}

module.exports = { puedeRegenerarEntrevistas, notificarNuevaEntrevista, ROLES_DEFECTO, P_REGENERAR, P_NOTIFICAR, SECCION };

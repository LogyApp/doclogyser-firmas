const pool = require('./db');
const { resolverResponsablesRetiro } = require('./configRetiro');

// ── Notificación de nuevo ingreso ───────────────────────────────────────────
// Se dispara al "FINALIZAR Y ENVIAR A SOCIODEMOGRÁFICA" en Selección
// (POST /seleccion/finalizar-contratacion), una vez confirmada la transacción.
//
// - El grupo lo define Config_Cargo_Laboral.Notificar del cargo (1, 2 o 3).
//   Cualquier otro valor (o cargo sin configurar) → no se notifica.
// - Los destinatarios de cada grupo salen de Config_Parametros
//   (Modulo 'talenthub', Seccion 'Sociodemografica'), por Rol.
//   Auxiliar/AuxiliarR/Coordinador/CoordinadorR se resuelven según la Operación
//   del trabajador (misma lógica de Retiros).
// - Quien finalizó el proceso siempre va en copia.
const MODULO  = 'talenthub';
const SECCION = 'Sociodemografica';
const MARCA_NOTIFICADO = '[NI]';

const P = {
  GRUPO_1_PARA: 'Notificación de ingreso grupo 1 - Para:',
  GRUPO_2_PARA: 'Notificación de ingreso grupo 2 - Para:',
  GRUPO_3_PARA: 'Notificación de ingreso grupo 3 - Para:',
  COPIA:        'Notificación de ingreso - Copia:',
  HABILITAR:    'Habilitar notificaciones de correo en Ingresos',
};

const DEFAULTS = {
  [P.GRUPO_1_PARA]: 'Nomina, Facturación, Contabilidad, LiderSst, CoorSelección, Inventario, Cuentas, Directorth, Calidad',
  [P.GRUPO_2_PARA]: 'Nomina, LiderSst, CoorSelección, Directorth, Calidad',
  [P.GRUPO_3_PARA]: 'Auxiliar, AuxiliarR, Coordinador, CoordinadorR',
  [P.COPIA]:        'Sistema',
  [P.HABILITAR]:    '1',
};

const PARA_POR_GRUPO = { 1: P.GRUPO_1_PARA, 2: P.GRUPO_2_PARA, 3: P.GRUPO_3_PARA };
const ROLES_RESPONSABLES = ['Auxiliar', 'AuxiliarR', 'Coordinador', 'CoordinadorR'];

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerParametrosIngreso() {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO, SECCION]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    return mapa;
  } catch (err) {
    console.error('[notificacionIngreso] No se pudieron leer los parámetros, se usan los valores por defecto:', err.message);
    return {};
  }
}

function valorParametro(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS[concepto];
}

function listaParametro(params, concepto) {
  return String(valorParametro(params, concepto) || '').split(',').map(s => s.trim()).filter(Boolean);
}

function parametroActivo(params, concepto) {
  return ['1', 'true', 'si', 'yes'].includes(normalizarTexto(valorParametro(params, concepto)));
}

// Grupo de notificación del cargo (Config_Cargo_Laboral.Notificar), o null.
async function obtenerGrupoCargo(cargo) {
  if (!cargo) return null;
  const [rows] = await pool.execute(
    'SELECT Notificar FROM `Config_Cargo_Laboral` WHERE TRIM(Cargo) = TRIM(?) LIMIT 1',
    [cargo]
  );
  const grupo = rows.length ? Number(rows[0].Notificar) : NaN;
  return PARA_POR_GRUPO[grupo] ? grupo : null;
}

async function correosPorRoles(roles, operacion) {
  const esResponsable = r => ROLES_RESPONSABLES.some(x => normalizarTexto(x) === normalizarTexto(r));
  const rolesResp  = roles.filter(esResponsable);
  const rolesOtros = roles.filter(r => !esResponsable(r));
  const correos = [];
  if (rolesResp.length && operacion) {
    const responsables = await resolverResponsablesRetiro(operacion, rolesResp);
    correos.push(...responsables.map(r => r.Email));
  }
  if (rolesOtros.length) {
    const [rows] = await pool.execute(
      `SELECT Email FROM Maestro_Usuarios
       WHERE Rol IN (${rolesOtros.map(() => '?').join(',')}) AND Email IS NOT NULL AND Email <> ''`,
      rolesOtros
    );
    correos.push(...rows.map(r => r.Email));
  }
  return correos;
}

function unicos(correos) {
  const vistos = new Set();
  return correos.map(c => String(c || '').trim()).filter(c => {
    const clave = c.toLowerCase();
    if (!c || !c.includes('@') || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

// Para / Copia del correo de ingreso. Devuelve { notificar:false, motivo } si no aplica.
async function obtenerDestinatariosIngreso({ cargo, operacion, usuarioRegistro }) {
  const params = await obtenerParametrosIngreso();
  if (!parametroActivo(params, P.HABILITAR)) return { notificar: false, motivo: 'desactivado' };

  const grupo = await obtenerGrupoCargo(cargo);
  if (!grupo) return { notificar: false, motivo: 'cargo sin grupo de notificación' };

  const para  = await correosPorRoles(listaParametro(params, PARA_POR_GRUPO[grupo]), operacion);
  const copia = await correosPorRoles(listaParametro(params, P.COPIA), operacion);

  if (usuarioRegistro) {
    const [uRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioRegistro]);
    if (uRows.length && uRows[0].Email) copia.push(uRows[0].Email);
  }

  const paraUnicos = unicos(para);
  const enPara = new Set(paraUnicos.map(c => c.toLowerCase()));
  const copiaUnicos = unicos(copia).filter(c => !enPara.has(c.toLowerCase()));
  if (!paraUnicos.length && !copiaUnicos.length) return { notificar: false, motivo: 'sin destinatarios' };
  return { notificar: true, grupo, para: paraUnicos, copia: copiaUnicos };
}

async function marcarNotificado(idVinculacion) {
  await pool.execute(
    `UPDATE \`Maestro_Vinculación\`
     SET \`Observaciones Vinculación\` = LEFT(CONCAT(COALESCE(\`Observaciones Vinculación\`, ''), ?), 200)
     WHERE \`Id Vinculación\` = ?`,
    [` ${MARCA_NOTIFICADO}`, idVinculacion]
  );
}

// Envía el correo de nuevo ingreso. Nunca lanza error: lo registra en el log,
// para no afectar la contratación ya confirmada.
async function notificarNuevoIngreso({ idVinculacion, trabajador, identificacion, cargo, operacion, fechaIngreso, usuarioRegistro, nombreRegistro }) {
  try {
    const dest = await obtenerDestinatariosIngreso({ cargo, operacion, usuarioRegistro });
    if (!dest.notificar) {
      console.log(`[notificacionIngreso] No se notifica ${identificacion} (${cargo}): ${dest.motivo}.`);
      return false;
    }
    const { notificarIngreso } = require('./email');
    await notificarIngreso({
      trabajador, identificacion, cargo, operacion, fechaIngreso,
      registradoPor: nombreRegistro,
      para: dest.para,
      copia: dest.copia,
    });
    if (idVinculacion) await marcarNotificado(idVinculacion);
    console.log(`[notificacionIngreso] Ingreso ${identificacion} notificado (grupo ${dest.grupo}).`);
    return true;
  } catch (err) {
    console.error(`[notificacionIngreso] Error notificando el ingreso ${identificacion}:`, err.message);
    return false;
  }
}

module.exports = {
  notificarNuevoIngreso,
  obtenerDestinatariosIngreso,
  PARAMETROS_INGRESO: P,
  DEFAULTS_INGRESO: DEFAULTS,
};

const pool = require('./db');

// TipoDocumento fijos que gestiona el módulo Logysign para el proceso de retiro
const ID_DOC_TCR  = '76'; // Terminación de Contrato
const ID_DOC_TCRP = '77'; // Terminación de Contrato — Periodo de Prueba

// ── Config_condicion_retiros ────────────────────────────────────────────────
// Reglas por motivo de retiro: qué documentos aplican y si el proceso termina
// sin trámite documental. Fuente única de verdad — reemplaza los arrays
// hardcodeados que existían antes en formretiro.js.
async function obtenerCondicionesRetiro() {
  const [rows] = await pool.execute('SELECT * FROM Config_condicion_retiros');
  const porMotivo = {};
  rows.forEach(r => { porMotivo[r.Motivo] = r; });
  return porMotivo;
}

async function obtenerCondicionRetiro(motivo) {
  const [rows] = await pool.execute(
    'SELECT * FROM Config_condicion_retiros WHERE Motivo = ? LIMIT 1',
    [motivo]
  );
  return rows[0] || null;
}

// ── Config_Doc_Trabajador ────────────────────────────────────────────────────
async function obtenerPrefijoDoc(idTipoDocumento) {
  const [rows] = await pool.execute(
    'SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = ? LIMIT 1',
    [idTipoDocumento]
  );
  return rows[0]?.Prefijo || null;
}

// ── Estado en el módulo Logysign (documentos 76 / 77) ───────────────────────
// Busca la solicitud de firma más reciente para ese trabajador + tipo de
// documento, generada DESPUÉS de la Fecha de Ingreso de la vinculación actual
// (para no arrastrar solicitudes de un vínculo laboral anterior).
async function obtenerEstadoLogysign({ identificacion, idConfigDoc, fechaIngreso }) {
  const [rows] = await pool.execute(
    `SELECT token, base_url, estado, fecha_registro
     FROM Dynamic_Logysign
     WHERE identificacion = ? AND id_config_doc = ? AND fecha_registro > ?
     ORDER BY fecha_registro DESC LIMIT 1`,
    [String(identificacion), idConfigDoc, fechaIngreso]
  );

  if (!rows.length) return { estado: null };

  const solicitud = rows[0];

  if (solicitud.estado === 'FIRMADO') {
    const [docRows] = await pool.execute(
      `SELECT Url FROM Maestro_docTrabajador
       WHERE Identificación = ? AND TipoDocumento = ? AND Fecha_Ingreso = ?
       ORDER BY FechaRegistro DESC LIMIT 1`,
      [String(identificacion), idConfigDoc, fechaIngreso]
    );
    return { estado: 'FIRMADO', url: docRows[0]?.Url || null };
  }

  const urlFirma = `${solicitud.base_url}/logysign/sign/${solicitud.token}`;
  return { estado: 'PENDIENTE', urlFirma };
}

// ── Parámetros configurables de Retiros (Config_Parametros) ─────────────────
// Modulo = 'nomina', Seccion = 'Retiros'. Cada Concepto reemplaza una regla que
// antes estaba fija en el código. Si una fila no existe en la tabla se usa el
// valor por defecto de abajo (el mismo que tenía el código), así la app sigue
// funcionando igual mientras se cargan los parámetros.
const MODULO_RETIROS  = 'nomina';
const SECCION_RETIROS = 'Retiros';

const P = {
  GESTIONAR_DOCS:            'Puede gestionar documentos de retiro',
  GESTIONAR_DOCS_REGIONAL:   'Puede gestionar documentos de retiro según regional',
  REGIONAL_SIN_GESTION:      'Regional sin gestión de documentos',
  EDITAR_RETIRO_REGISTRADO:  'Puede editar retiro registrado',
  OPERACION_NOMINA_RETIRADO: 'Operación donde Nómina debe marcar Retirado',
  EDITAR_FECHA_RETIRO:       'Puede editar Fecha de Retiro',
  MODIFICAR_ARTICULOS_PZ:    'Puede modificar artículos de Paz y Salvo guardados',
  REENVIAR_PZ_AREAS:         'Puede reenviar Paz y Salvo a áreas',
  NOTIF_PARA:                'Notificación de retiro - Para:',
  NOTIF_COPIA:               'Notificación de retiro - Copia:',
  CARGOS_COPIA_ADMIN:        'Cargos con copia administrativa',
  NOTIF_COPIA_ADMIN:         'Notificación de retiro - Copia cargos administrativos:',
  CARGOS_COPIA_SST:          'Cargos con copia SST',
  NOTIF_COPIA_SST:           'Notificación de retiro - Copia cargos SST:',
  HABILITAR_NOTIFICACIONES:  'Habilitar notificaciones de correo en Retiros',
};

const DEFAULTS_RETIROS = {
  [P.GESTIONAR_DOCS]:            'Sistema, Nomina, Asistencial',
  [P.GESTIONAR_DOCS_REGIONAL]:   'Coordinador, CoordinadorR, Auxiliar, AuxiliarR',
  [P.REGIONAL_SIN_GESTION]:      'ANTIOQUIA',
  [P.EDITAR_RETIRO_REGISTRADO]:  'Nomina, Sistema',
  [P.OPERACION_NOMINA_RETIRADO]: 'Administracion',
  [P.EDITAR_FECHA_RETIRO]:       'Nomina, Sistema',
  [P.MODIFICAR_ARTICULOS_PZ]:    'Nomina, Sistema',
  [P.REENVIAR_PZ_AREAS]:         'Nomina, Sistema',
  [P.NOTIF_PARA]:                'retiros@logyser.com',
  [P.NOTIF_COPIA]:               'admin@logyser.com, Auxiliar, AuxiliarR, Coordinador, CoordinadorR',
  [P.CARGOS_COPIA_ADMIN]:        'AUXILIAR ADMINISTRATIVO DE OPERACIÓN, AUXILIAR ADMINISTRATIVO REGIONAL, COORDINADOR LOGISTICO, COORDINADOR REGIONAL, SUBGERENTE DE OPERACIONES',
  [P.NOTIF_COPIA_ADMIN]:         'jefe.facturacion@logyser.com, jefe.contabilidad@logyser.com, gestioncalidad@logyser.com, controlcuentas@logyser.com, directorrh@logyser.com, subgerenciaoperaciones@logyser.com, administradorti@logyser.com, nomina@logyser.com, seleccion@logyser.com',
  [P.CARGOS_COPIA_SST]:          'ANALISTA DE SST, AUXILIAR SST',
  [P.NOTIF_COPIA_SST]:           'sstadmon@logyser.com',
  [P.HABILITAR_NOTIFICACIONES]:  '1',
};

// Roles que se resuelven según la Operación del trabajador (no se envía a todos
// los usuarios con ese rol). Ver resolverResponsablesRetiro.
const ROLES_POR_OPERACION = ['Auxiliar', 'Coordinador'];
const ROLES_POR_REGIONAL  = ['AuxiliarR', 'CoordinadorR'];
const ROLES_RESPONSABLES  = [...ROLES_POR_OPERACION, ...ROLES_POR_REGIONAL];

function normalizarTexto(valor) {
  return String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerParametrosRetiros() {
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO_RETIROS, SECCION_RETIROS]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    return mapa;
  } catch (err) {
    console.error('[configRetiro] No se pudieron leer los parámetros de Retiros, se usan los valores por defecto:', err.message);
    return {};
  }
}

// Valor del parámetro: el de la tabla si la fila existe (aunque esté vacía), o el
// valor por defecto si la fila no existe.
function valorParametro(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS_RETIROS[concepto];
}

function listaParametro(params, concepto) {
  return String(valorParametro(params, concepto) || '').split(',').map(s => s.trim()).filter(Boolean);
}

function estaEnParametro(params, concepto, valor) {
  if (!String(valor || '').trim()) return false;
  const buscado = normalizarTexto(valor);
  return listaParametro(params, concepto).some(item => normalizarTexto(item) === buscado);
}

function parametroActivo(params, concepto) {
  return ['1', 'true', 'si', 'sí', 'yes'].includes(normalizarTexto(valorParametro(params, concepto)));
}

// ── Permiso para gestionar/generar documentos de retiro ─────────────────────
// Regla de negocio (ver correo de Nómina, sep-2026): en la regional configurada
// en "Regional sin gestión de documentos" (ANTIOQUIA), los roles de "Puede
// gestionar documentos de retiro según regional" solo pueden marcar el retiro —
// la generación y gestión de documentos la hace Nómina. En el resto de
// regionales sí gestionan sus propios documentos.
async function puedeGenerarDocumentosRetiro(rol, regional, params) {
  const p = params || await obtenerParametrosRetiros();
  if (estaEnParametro(p, P.GESTIONAR_DOCS, rol)) return true;
  if (estaEnParametro(p, P.GESTIONAR_DOCS_REGIONAL, rol)) {
    return !estaEnParametro(p, P.REGIONAL_SIN_GESTION, regional);
  }
  return false; // Cualquier otro rol: solo puede marcar el retiro, no gestionar documentos
}

// Todos los permisos de Retiros de un usuario en una sola consulta a la tabla.
async function obtenerPermisosRetiro(rol, regional) {
  const params = await obtenerParametrosRetiros();
  return {
    params,
    puedeGenerarDocs:            await puedeGenerarDocumentosRetiro(rol, regional, params),
    puedeEditarRetiroRegistrado: estaEnParametro(params, P.EDITAR_RETIRO_REGISTRADO, rol),
    puedeEditarFechaRetiro:      estaEnParametro(params, P.EDITAR_FECHA_RETIRO, rol),
    puedeModificarArticulosPz:   estaEnParametro(params, P.MODIFICAR_ARTICULOS_PZ, rol),
    puedeReenviarPzAreas:        estaEnParametro(params, P.REENVIAR_PZ_AREAS, rol),
  };
}

// true si en esta Operación Nómina también está obligada a marcar "Retirado".
function nominaDebeMarcarRetirado(params, operacion) {
  return estaEnParametro(params, P.OPERACION_NOMINA_RETIRADO, operacion);
}

// ── Destinatarios de la notificación de retiro ─────────────────────────────
// Responsables (Auxiliar, Coordinador, AuxiliarR, CoordinadorR) de la Operación
// del trabajador. Solo se buscan los roles que estén en `roles`:
//  1. Regional: se busca la Operación del trabajador en Maestro_Usuarios.Operación;
//     con la(s) Regional(es) resultante(s) se buscan los AuxiliarR/CoordinadorR.
//  2. Operación: Auxiliar/Coordinador con Maestro_Usuarios.Operación = Operación.
//  3. Si 1 y 2 no encuentran a nadie: SOCIODEMOGRAFICA de la Operación en
//     Maestro_Operaciones, buscada dentro de Maestro_Usuarios.Dispositivo, para
//     los cuatro roles.
async function resolverResponsablesRetiro(operacion, roles = ROLES_RESPONSABLES) {
  const rolesSel = ROLES_RESPONSABLES.filter(r => roles.some(x => normalizarTexto(x) === normalizarTexto(r)));
  if (!operacion || !rolesSel.length) return [];

  const rolesRegional  = rolesSel.filter(r => ROLES_POR_REGIONAL.includes(r));
  const rolesOperacion = rolesSel.filter(r => ROLES_POR_OPERACION.includes(r));
  const encontrados = [];

  if (rolesRegional.length) {
    const [regRows] = await pool.execute(
      "SELECT DISTINCT Regional FROM Maestro_Usuarios WHERE `Operación` = ? AND Regional IS NOT NULL AND Regional <> ''",
      [operacion]
    );
    const regionales = regRows.map(r => r.Regional);
    if (regionales.length) {
      const [rows] = await pool.execute(
        `SELECT Email, Nombre, Rol FROM Maestro_Usuarios
         WHERE Rol IN (${rolesRegional.map(() => '?').join(',')})
           AND Regional IN (${regionales.map(() => '?').join(',')})
           AND Email IS NOT NULL AND Email <> ''`,
        [...rolesRegional, ...regionales]
      );
      encontrados.push(...rows);
    }
  }

  if (rolesOperacion.length) {
    const [rows] = await pool.execute(
      `SELECT Email, Nombre, Rol FROM Maestro_Usuarios
       WHERE Rol IN (${rolesOperacion.map(() => '?').join(',')}) AND \`Operación\` = ?
         AND Email IS NOT NULL AND Email <> ''`,
      [...rolesOperacion, operacion]
    );
    encontrados.push(...rows);
  }

  if (!encontrados.length) {
    const [moRows] = await pool.execute(
      'SELECT SOCIODEMOGRAFICA FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
      [operacion]
    );
    const sociodemografica = moRows.length ? String(moRows[0].SOCIODEMOGRAFICA || '').trim() : '';
    if (sociodemografica) {
      const [rows] = await pool.execute(
        `SELECT Email, Nombre, Rol FROM Maestro_Usuarios
         WHERE LOWER(Dispositivo) LIKE ?
           AND Rol IN (${rolesSel.map(() => '?').join(',')})
           AND Email IS NOT NULL AND Email <> ''`,
        [`%${sociodemografica.toLowerCase()}%`, ...rolesSel]
      );
      encontrados.push(...rows);
    }
  }

  const vistos = new Set();
  return encontrados.filter(r => {
    const clave = String(r.Email).trim().toLowerCase();
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

// Convierte una lista de Config_Parametros en correos: los valores con "@" son
// correos directos; Auxiliar/AuxiliarR/Coordinador/CoordinadorR se resuelven por
// la Operación del trabajador; cualquier otro rol envía a todos los usuarios con
// ese Rol que tengan Email.
async function resolverCorreosParametro(lista, operacion) {
  const correos = lista.filter(v => v.includes('@'));
  const roles   = lista.filter(v => !v.includes('@'));
  const rolesResp  = roles.filter(r => ROLES_RESPONSABLES.some(x => normalizarTexto(x) === normalizarTexto(r)));
  const rolesOtros = roles.filter(r => !rolesResp.includes(r));

  if (rolesResp.length) {
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
    if (!c || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

// Para / Copia de la notificación de retiro según Config_Parametros.
async function obtenerDestinatariosNotificacionRetiro({ operacion, cargo }) {
  const params = await obtenerParametrosRetiros();
  if (!parametroActivo(params, P.HABILITAR_NOTIFICACIONES)) return { habilitado: false, para: [], copia: [] };

  const para  = await resolverCorreosParametro(listaParametro(params, P.NOTIF_PARA), operacion);
  const copia = await resolverCorreosParametro(listaParametro(params, P.NOTIF_COPIA), operacion);

  if (estaEnParametro(params, P.CARGOS_COPIA_ADMIN, cargo)) {
    copia.push(...listaParametro(params, P.NOTIF_COPIA_ADMIN));
  } else if (estaEnParametro(params, P.CARGOS_COPIA_SST, cargo)) {
    copia.push(...listaParametro(params, P.NOTIF_COPIA_SST));
  }

  const paraUnicos = unicos(para);
  const enPara = new Set(paraUnicos.map(c => c.toLowerCase()));
  return { habilitado: true, para: paraUnicos, copia: unicos(copia).filter(c => !enPara.has(c.toLowerCase())) };
}

// Responsables a los que se pide confirmar "Retirado" cuando Nómina inicia la
// legalización sin marcarlo: los roles responsables configurados en
// "Notificación de retiro - Copia:", resueltos por la Operación del trabajador.
async function obtenerResponsablesConfirmarRetiro(operacion) {
  const params = await obtenerParametrosRetiros();
  if (!parametroActivo(params, P.HABILITAR_NOTIFICACIONES)) return [];
  const roles = listaParametro(params, P.NOTIF_COPIA).filter(v => !v.includes('@'));
  return resolverResponsablesRetiro(operacion, roles);
}

// ── Legalización del retiro (misma lógica que Vista_retiros_pendientes) ─────
// Documento de terminación/renuncia exigido según el motivo:
// - Renuncia + tipo Verbal: ninguno (null) — no hay carta escrita que exigir.
// - Renuncia + tipo Escrita (o sin especificar): 55 (Carta de Renuncia).
// - Motivo con TieneTCRP=1 (Periodo de Prueba): 77 (TCRP).
// - Cualquier otro motivo: 76 (TCR).
function docTerminacionRequerido(motivoRetiro, condicion, tipoRenuncia) {
  if (motivoRetiro === 'Renuncia') {
    return tipoRenuncia === 'Verbal' ? null : '55';
  }
  return condicion?.TieneTCRP ? '77' : '76';
}

// Nombres legibles de los documentos que puede exigir la legalización, para
// mostrar al usuario exactamente qué falta cuando el proceso está "en proceso".
const NOMBRES_DOC_LEGALIZACION = {
  '55': 'Carta de Renuncia',
  '76': 'Terminación de Contrato',
  '77': 'Terminación de Contrato (Periodo de Prueba)',
  '57': 'Certificado Laboral de Retiro',
  '58': 'Autorización Examen Médico de Egreso',
};

// Devuelve { legalizado, pendientes[] } usando documentos del episodio laboral
// actual, identificado por Identificación + Fecha_Ingreso. Evita que una
// legalización previa del mismo trabajador cierre un retiro posterior.
async function obtenerPendientesLegalizacion({ identificacion, motivoRetiro, fechaIngreso, fechaRetiro, tipoRenuncia }) {
  const datosPendientes = [];
  if (!fechaRetiro) datosPendientes.push('Fecha de Retiro');
  if (!String(motivoRetiro || '').trim()) datosPendientes.push('Motivo del Retiro');
  if (datosPendientes.length) return { legalizado: false, pendientes: datosPendientes };

  const condicion = await obtenerCondicionRetiro(motivoRetiro);
  if (condicion?.TerminaProceso) return { legalizado: true, pendientes: [] };

  const mismaFecha = fechaIngreso && fechaRetiro &&
    new Date(fechaIngreso).getTime() === new Date(fechaRetiro).getTime();
  if (mismaFecha) return { legalizado: true, pendientes: [] };

  const [docRows] = await pool.execute(
    `SELECT TipoDocumento FROM Maestro_docTrabajador
     WHERE Identificación = ? AND TipoDocumento IN ('47','55','76','77','57','58')
       AND DATE(Fecha_Ingreso) = DATE(?)
       AND (Validación IS NULL OR Validación <> 'ERROR')`,
    [String(identificacion), fechaIngreso]
  );
  const docsSet = new Set(docRows.map(r => String(r.TipoDocumento)));
  if (docsSet.has('47')) return { legalizado: true, pendientes: [] };

  const requerido = docTerminacionRequerido(motivoRetiro, condicion, tipoRenuncia);
  const requeridos = [requerido, '57', '58'].filter(Boolean);
  const pendientes = requeridos.filter(id => !docsSet.has(id)).map(id => NOMBRES_DOC_LEGALIZACION[id] || id);
  return { legalizado: pendientes.length === 0, pendientes };
}

// true si el retiro ya está "legalizado" (ver obtenerPendientesLegalizacion).
async function estaRetiroLegalizado(datos) {
  const { legalizado } = await obtenerPendientesLegalizacion(datos);
  return legalizado;
}

// ── Responsables de un trabajador (usado por la notificación de Tomó Cargo) ─
// Las notificaciones de retiro usan obtenerDestinatariosNotificacionRetiro.
// Busca Auxiliar/Coordinador/AuxiliarR/CoordinadorR de su Operación; si no hay
// ninguno configurado, busca por SOCIODEMOGRAFICA en Maestro_Operaciones contra
// la columna Dispositivo de Maestro_Usuarios. Si aún no hay nadie, cae a
// AuxiliarR/CoordinadorR de su Regional. Devuelve [] si no hay nadie.
async function obtenerResponsablesOperacionRegional(operacion, regional) {
  if (operacion) {
    const [rowsOp] = await pool.execute(
      `SELECT Email, Nombre, Rol FROM Maestro_Usuarios
       WHERE Rol IN ('Auxiliar','Coordinador','AuxiliarR','CoordinadorR') AND \`Operación\` = ?
         AND Email IS NOT NULL AND Email <> ''`,
      [operacion]
    );
    if (rowsOp.length) return rowsOp;

    // Fallback por SOCIODEMOGRAFICA de Maestro_Operaciones -> Dispositivo en Maestro_Usuarios
    const [moRows] = await pool.execute(
      'SELECT SOCIODEMOGRAFICA FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
      [operacion]
    );
    const sociodemografica = moRows.length ? (moRows[0].SOCIODEMOGRAFICA || '').trim() : '';
    if (sociodemografica) {
      const [rowsDisp] = await pool.execute(
        `SELECT Email, Nombre, Rol FROM Maestro_Usuarios
         WHERE LOWER(Dispositivo) LIKE ?
           AND Rol IN ('Auxiliar','Coordinador','AuxiliarR','CoordinadorR')
           AND Email IS NOT NULL AND Email <> ''`,
        [`%${sociodemografica.toLowerCase()}%`]
      );
      if (rowsDisp.length) return rowsDisp;
    }
  }
  if (!regional) return [];
  const [rowsReg] = await pool.execute(
    `SELECT Email, Nombre, Rol FROM Maestro_Usuarios
     WHERE Rol IN ('AuxiliarR','CoordinadorR') AND Regional = ?
       AND Email IS NOT NULL AND Email <> ''`,
    [regional]
  );
  return rowsReg;
}

module.exports = {
  ID_DOC_TCR,
  ID_DOC_TCRP,
  obtenerCondicionesRetiro,
  obtenerCondicionRetiro,
  obtenerPrefijoDoc,
  obtenerEstadoLogysign,
  puedeGenerarDocumentosRetiro,
  obtenerParametrosRetiros,
  obtenerPermisosRetiro,
  nominaDebeMarcarRetirado,
  obtenerDestinatariosNotificacionRetiro,
  obtenerResponsablesConfirmarRetiro,
  resolverResponsablesRetiro,
  docTerminacionRequerido,
  estaRetiroLegalizado,
  obtenerPendientesLegalizacion,
  obtenerResponsablesOperacionRegional,
  PARAMETROS_RETIROS: P,
  DEFAULTS_RETIROS,
};

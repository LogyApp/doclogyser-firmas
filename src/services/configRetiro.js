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

// ── Permiso para gestionar/generar documentos de retiro ─────────────────────
// Regla de negocio (ver correo de Nómina, sep-2026): en la Regional ANTIOQUIA,
// Coordinador/Auxiliar (administrativos) solo pueden marcar el retiro — la
// generación y gestión de documentos la hace exclusivamente Nómina, para no
// interferir en responsabilidades que no les corresponden. En el resto de
// regionales, Coordinador/Auxiliar sí gestionan sus propios documentos.
const ROLES_SIEMPRE_PUEDEN = ['Sistema', 'Nomina', 'Asistencial'];
const ROLES_CONDICIONADOS_REGIONAL = ['Coordinador', 'CoordinadorR', 'Auxiliar', 'AuxiliarR'];
const REGIONAL_RESTRINGIDA = 'ANTIOQUIA';

function puedeGenerarDocumentosRetiro(rol, regional) {
  if (ROLES_SIEMPRE_PUEDEN.includes(rol)) return true;
  if (ROLES_CONDICIONADOS_REGIONAL.includes(rol)) {
    return String(regional || '').toUpperCase() !== REGIONAL_RESTRINGIDA;
  }
  return false; // Contratación y cualquier otro rol: solo puede marcar el retiro, no gestionar documentos
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

// Devuelve { legalizado, pendientes[] }: misma lógica de estaRetiroLegalizado,
// pero además detalla qué documentos concretos faltan cuando no está legalizado.
async function obtenerPendientesLegalizacion({ identificacion, motivoRetiro, fechaIngreso, fechaRetiro, tipoRenuncia }) {
  const condicion = await obtenerCondicionRetiro(motivoRetiro);
  if (condicion?.TerminaProceso) return { legalizado: true, pendientes: [] };

  const mismaFecha = fechaIngreso && fechaRetiro &&
    new Date(fechaIngreso).getTime() === new Date(fechaRetiro).getTime();
  if (mismaFecha) return { legalizado: true, pendientes: [] };

  const [docRows] = await pool.execute(
    `SELECT TipoDocumento FROM Maestro_docTrabajador
     WHERE Identificación = ? AND TipoDocumento IN ('47','55','76','77','57','58')
       AND (Validación IS NULL OR Validación <> 'ERROR')`,
    [String(identificacion)]
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

// ── Responsables de un trabajador para notificaciones de retiro ────────────
// Busca Auxiliar/Coordinador de su Operación; si no hay ninguno configurado,
// cae a AuxiliarR/CoordinadorR de su Regional. Devuelve [] si no hay nadie.
async function obtenerResponsablesOperacionRegional(operacion, regional) {
  if (operacion) {
    const [rowsOp] = await pool.execute(
      `SELECT Email, Nombre, Rol FROM Maestro_Usuarios
       WHERE Rol IN ('Auxiliar','Coordinador') AND \`Operación\` = ?
         AND Email IS NOT NULL AND Email <> ''`,
      [operacion]
    );
    if (rowsOp.length) return rowsOp;
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
  docTerminacionRequerido,
  estaRetiroLegalizado,
  obtenerPendientesLegalizacion,
  obtenerResponsablesOperacionRegional,
};

const pool = require('./db');
const { resolverResponsablesRetiro } = require('./configRetiro');
const {
  PARAMETROS_ASPIRANTES: P,
  obtenerParametrosAspirantes,
  parametroActivo,
  listaParametro,
  normalizar,
  estadoFirmasAspirante,
  obtenerDocsFirmaParaOperacion
} = require('./docsSeleccion');

// ── Avisos por correo de la fase de firmas (Aspirantes / Selección) ─────────
// Config_Parametros talenthub/Aspirantes:
//   'Habilitar notificaciones de correo en Aspirantes'            → interruptor general (0 = apagado)
//   'Aviso al aspirante al pasar a En proceso'                    → 1/0
//   'Aviso a Selección cuando el aspirante completa las firmas'   → 1/0
//   'Aviso de firmas completas - Para:' / '- Copia:'              → Roles
// El aviso de firmas completas va además al "Responsable de Selección" de la requisición.
// Estas funciones nunca lanzan error: lo registran en el log para no afectar el proceso.

const ROLES_RESPONSABLES = ['Auxiliar', 'AuxiliarR', 'Coordinador', 'CoordinadorR'];

function unicos(correos) {
  const vistos = new Set();
  return correos.map(c => String(c || '').trim()).filter(c => {
    const clave = c.toLowerCase();
    if (!c || !c.includes('@') || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

async function correosPorRoles(roles, operacion) {
  const esResponsable = r => ROLES_RESPONSABLES.some(x => normalizar(x) === normalizar(r));
  const rolesResp = roles.filter(esResponsable);
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

async function datosAspirante(idAspirante) {
  const [rows] = await pool.execute(
    `SELECT a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido, a.identificacion,
            a.correo_electronico, r.\`Cargo Requerido\` AS cargo, r.\`Operación\` AS operacion,
            r.\`Responsable de Selección\` AS responsable
     FROM Dynamic_hv_aspirante a
     LEFT JOIN Dynamic_Requisiciones r ON r.IdRequisicion = a.IdRequisicion
     WHERE a.id_aspirante = ? LIMIT 1`,
    [idAspirante]
  );
  if (!rows.length) return null;
  const a = rows[0];
  a.nombre = [a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido]
    .filter(n => n && String(n).trim()).join(' ').trim() || 'Aspirante';
  return a;
}

async function avisoActivo(concepto) {
  const params = await obtenerParametrosAspirantes();
  return parametroActivo(params, P.HABILITAR_AVISOS) && parametroActivo(params, concepto) ? params : null;
}

// Al pasar a "En proceso": correo al aspirante con el enlace del portal. Quien hizo el cambio va en copia.
async function avisarFaseFirmas({ idAspirante, usuario, baseUrl }) {
  try {
    if (!(await avisoActivo(P.AVISO_EN_PROCESO))) return false;
    const a = await datosAspirante(idAspirante);
    if (!a || !a.correo_electronico) {
      console.log(`[avisosSeleccion] Aspirante ${idAspirante} sin correo: no se envía aviso de fase de firmas.`);
      return false;
    }
    const copia = [];
    if (usuario) {
      const [u] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
      if (u.length && u[0].Email) copia.push(u[0].Email);
    }
    const docs = await obtenerDocsFirmaParaOperacion(a.operacion);
    const { notificarAspiranteFaseFirmas } = require('./email');
    await notificarAspiranteFaseFirmas({
      correo: a.correo_electronico.trim(),
      nombreAspirante: a.nombre,
      cargo: a.cargo,
      operacion: a.operacion,
      portalUrl: `${baseUrl}/seleccion/portal/${idAspirante}`,
      totalDocumentos: docs.length,
      copia: unicos(copia)
    });
    console.log(`[avisosSeleccion] Aviso de fase de firmas enviado a ${a.identificacion}.`);
    return true;
  } catch (err) {
    console.error(`[avisosSeleccion] Error en aviso de fase de firmas (${idAspirante}):`, err.message);
    return false;
  }
}

// Cuando el aspirante completa todas las firmas: correo a Selección.
async function avisarFirmasCompletas({ idAspirante }) {
  try {
    const params = await avisoActivo(P.AVISO_FIRMAS);
    if (!params) return false;
    const a = await datosAspirante(idAspirante);
    if (!a) return false;
    const estado = await estadoFirmasAspirante(idAspirante, a.operacion);
    if (!estado.total || estado.faltantes.length) return false;

    const para = await correosPorRoles(listaParametro(params, P.AVISO_FIRMAS_PARA), a.operacion);
    if (a.responsable) {
      const [u] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE TRIM(Nombre) = TRIM(?) LIMIT 1', [a.responsable]);
      if (u.length && u[0].Email) para.push(u[0].Email);
    }
    const copia = await correosPorRoles(listaParametro(params, P.AVISO_FIRMAS_COPIA), a.operacion);
    const paraUnicos = unicos(para);
    const enPara = new Set(paraUnicos.map(c => c.toLowerCase()));
    const copiaUnicos = unicos(copia).filter(c => !enPara.has(c.toLowerCase()));
    if (!paraUnicos.length && !copiaUnicos.length) {
      console.log(`[avisosSeleccion] Sin destinatarios para el aviso de firmas completas de ${a.identificacion}.`);
      return false;
    }

    const { notificarFirmasCompletasAspirante } = require('./email');
    await notificarFirmasCompletasAspirante({
      nombreAspirante: a.nombre,
      identificacion: a.identificacion,
      cargo: a.cargo,
      operacion: a.operacion,
      totalDocumentos: estado.total,
      para: paraUnicos,
      copia: copiaUnicos
    });
    console.log(`[avisosSeleccion] Aviso de firmas completas enviado (${a.identificacion}).`);
    return true;
  } catch (err) {
    console.error(`[avisosSeleccion] Error en aviso de firmas completas (${idAspirante}):`, err.message);
    return false;
  }
}

module.exports = { avisarFaseFirmas, avisarFirmasCompletas };

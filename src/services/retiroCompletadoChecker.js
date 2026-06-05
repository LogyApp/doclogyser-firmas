/**
 * Verifica si todos los documentos de retiro de una vinculación han sido firmados
 * por el trabajador. Si es así, envía el email automático con los PDFs.
 *
 * Se llama (fire-and-forget) desde cada ruta de firma individual
 * (firmarcertificadoretiro, firmarenuncia, firmarexamenegreso, firmarcesantias)
 * justo después de invalidar el token correspondiente.
 */
const pool = require('./db');
const { notificarDocumentosRetiroConcluidos } = require('./email');

function limpiarNombre(n) {
  if (!n) return '';
  const p = String(n).split(' ** ');
  return (p.length > 1 ? p[1] : n).trim();
}

async function verificarYEnviarEmailConcluido(idVinculacion) {
  // 1. Leer estado de tokens de firma
  const [vinRows] = await pool.execute(
    `SELECT \`Identificación\`, Trabajador, \`Motivo del Retiro\`,
            token_firma_ct, token_firma_ar, token_firma_emoe, token_firma_crs
     FROM \`Maestro_Vinculación\`
     WHERE \`Id Vinculación\` = ? LIMIT 1`,
    [idVinculacion]
  );
  if (!vinRows.length) return;
  const vin = vinRows[0];

  // Si algún token sigue activo, aún hay docs pendientes de firma
  if (
    vin.token_firma_ct   !== null ||
    vin.token_firma_ar   !== null ||
    vin.token_firma_emoe !== null ||
    vin.token_firma_crs  !== null
  ) return;

  // 2. Verificar que el Paz y Salvo también esté completado (si aplica)
  const MOTIVOS_SIN_PZ = ['No tomó cargo', 'Terminación por Muerte'];
  if (!MOTIVOS_SIN_PZ.includes(vin['Motivo del Retiro'])) {
    const [pzRows] = await pool.execute(
      `SELECT estado FROM Maestro_pazysalvo
       WHERE id_vinculacion = ? ORDER BY fecha_creacion DESC LIMIT 1`,
      [idVinculacion]
    );
    if (pzRows.length && pzRows[0].estado !== 'completado') {
      // PZ aún pendiente — no enviar email de cierre todavía
      return;
    }
  }

  const identificacion = vin['Identificación'];

  // 2. Obtener email del trabajador
  const [segRows] = await pool.execute(
    'SELECT Email FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
    [identificacion]
  );
  const email = segRows[0]?.Email;
  if (!email) {
    console.warn('[retiro-concluido] Sin email para identificación', identificacion);
    return;
  }

  // 3. Obtener URLs de documentos firmados (más reciente por prefijo)
  const [docRows] = await pool.execute(
    `SELECT Prefijo, Doc FROM Maestro_docTrabajador
     WHERE Identificación = ? AND Prefijo IN ('CT', 'AR', 'EMOE', 'CRS')
     ORDER BY FechaRegistro DESC`,
    [String(identificacion)]
  );
  const docsMap = {};
  docRows.forEach(r => { if (!docsMap[r.Prefijo]) docsMap[r.Prefijo] = r.Doc; });

  // CT es obligatorio para considerar el proceso completo
  if (!docsMap['CT']) return;

  // 4. Enviar email al trabajador con CC a retiros@logyser.com
  await notificarDocumentosRetiroConcluidos({
    emailTrabajador:  email,
    nombreTrabajador: limpiarNombre(vin.Trabajador),
    urlCT:   docsMap['CT']   || null,
    urlAR:   docsMap['AR']   || null,
    urlEMOE: docsMap['EMOE'] || null,
    urlCRS:  docsMap['CRS']  || null,
  });

  console.log('[retiro-concluido] Email enviado para vinculación', idVinculacion);
}

module.exports = { verificarYEnviarEmailConcluido };

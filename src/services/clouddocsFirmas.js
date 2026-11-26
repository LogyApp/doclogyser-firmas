const crypto = require('crypto');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const pool = require('./db');
const { obtenerDocsFirmaParaOperacion, obtenerDocsSeleccion, ID_HOJA_VIDA } = require('./docsSeleccion');
const { enviarCorreoPortalAspirante, correoUsuarioPorId } = require('./email');

const storage = process.env.GCS_KEYFILE
  ? new Storage({ keyFilename: path.resolve(process.env.GCS_KEYFILE) })
  : new Storage();

const BUCKET_ASPIRANTES = process.env.BUCKET_ASPIRANTES || 'hojas_vida_logyser';
const BUCKET_EMPLEADOS = process.env.BUCKET_PDFS || 'talenthub_central';

const ROLES_DEFAULT = ['Selección', 'Archivo', 'Selección Centro', 'AuxiliarR', 'Sistema'];

/**
 * Normaliza cadenas de texto para comparaciones sin tildes ni mayúsculas
 */
function normalizar(texto) {
  return (texto || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Obtiene los roles configurados en Config_Parametros para Activos y Retirados
 */
async function obtenerRolesPermitidosFirmas() {
  try {
    const [rows] = await pool.execute(
      `SELECT Concepto, Parametro FROM Config_Parametros 
       WHERE Modulo = 'CloudDocs' AND Seccion = 'Firmas'`
    );
    let rolesActivos = [...ROLES_DEFAULT];
    let rolesRetirados = [...ROLES_DEFAULT];

    rows.forEach(r => {
      const concepto = (r.Concepto || '').toString().trim();
      const items = (r.Parametro || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
      if (concepto === 'Roles_Firmas_Trabajadores_Activos' && items.length) {
        rolesActivos = items;
      } else if (concepto === 'Roles_Firmas_Trabajadores_Retirados' && items.length) {
        rolesRetirados = items;
      }
    });

    return { rolesActivos, rolesRetirados };
  } catch (err) {
    console.error('[clouddocsFirmas] Error al leer roles de Config_Parametros:', err.message);
    return { rolesActivos: ROLES_DEFAULT, rolesRetirados: ROLES_DEFAULT };
  }
}

/**
 * Verifica si un rol tiene permiso de gestionar firmas según el estado del trabajador
 */
async function verificarPermisoFirmas(rol, estadoTrabajador) {
  const rolNorm = normalizar(rol);
  const estadoNorm = normalizar(estadoTrabajador);
  const { rolesActivos, rolesRetirados } = await obtenerRolesPermitidosFirmas();

  const lista = estadoNorm === 'retirado' ? rolesRetirados : rolesActivos;
  return lista.some(r => normalizar(r) === rolNorm);
}

/**
 * Asegura que el trabajador exista en Dynamic_hv_aspirante y tenga docs_pendientes_vinculacion = 1
 */
async function asegurarAspiranteParaTrabajador({ identificacion, usuario }) {
  const [segRows] = await pool.execute(
    'SELECT * FROM Maestro_Segmentación WHERE `Identificación` = ? LIMIT 1',
    [identificacion]
  );
  if (!segRows.length) {
    throw new Error(`Trabajador con identificación ${identificacion} no encontrado en Maestro_Segmentación`);
  }
  const seg = segRows[0];

  const [aspRows] = await pool.execute(
    'SELECT id_aspirante, estado_proceso, docs_pendientes_vinculacion, telefono, correo_electronico FROM Dynamic_hv_aspirante WHERE `identificacion` = ? LIMIT 1',
    [identificacion]
  );

  let idAspirante = '';
  if (aspRows.length) {
    idAspirante = aspRows[0].id_aspirante;
    const tel = aspRows[0].telefono || seg.Celular || null;
    const email = aspRows[0].correo_electronico || seg.Email || null;
    await pool.execute(
      `UPDATE Dynamic_hv_aspirante 
       SET docs_pendientes_vinculacion = 1,
           telefono = COALESCE(NULLIF(telefono, ''), ?),
           correo_electronico = COALESCE(NULLIF(correo_electronico, ''), ?),
           fecha_actualizacion = CURRENT_TIMESTAMP
       WHERE id_aspirante = ?`,
      [tel, email, idAspirante]
    );
  } else {
    // Generar nuevo id_aspirante de 12 caracteres hex
    idAspirante = crypto.randomBytes(6).toString('hex');
    await pool.execute(
      `INSERT INTO Dynamic_hv_aspirante (
        id_aspirante, tipo_documento, identificacion,
        primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        pais_nacimiento, departamento_nacimiento, ciudad_nacimiento, fecha_nacimiento,
        departamento_expedicion, ciudad_expedicion, fecha_expedicion,
        genero, estado_civil, direccion_barrio, departamento, ciudad,
        telefono, correo_electronico, eps, afp, rh,
        talla_pantalon, camisa_talla, zapatos_talla,
        estado_proceso, docs_pendientes_vinculacion, origen_registro, Usuario
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        'contratado', 1, 'CloudDocs', ?
      )`,
      [
        idAspirante, seg['Tipo de Documento'] || 'CC', String(identificacion),
        seg['Primer Nombre'] || null, seg['Segundo Nombre'] || null, seg['Primer Apellido'] || null, seg['Segundo Apellido'] || null,
        seg['País Nacimiento'] || 'Colombia', seg['Departamento Nacimiento'] || null, seg['Ciudad Nacimiento'] || null, seg['Fecha Nacimiento'] || null,
        seg['Departamento Expedición'] || null, seg['Ciudad Expedición'] || null, seg['Fecha Expedición'] || null,
        seg['Género'] || null, seg['Estado Civil'] || null, seg['Dirección de Residencia'] || null, seg['Departamento Residencia'] || null, seg['Ciudad de Residencia'] || null,
        seg.Celular || null, seg.Email || null, seg['EPS'] || null, seg['Pensión'] || null, seg['RH'] || null,
        seg['Pantalon'] || null, seg['Camiseta'] || null, seg['Botas'] || null,
        usuario || 'CloudDocs'
      ]
    );
  }

  return { idAspirante, seg };
}

/**
 * Obtiene el detalle completo del portal de firmas del trabajador
 */
async function obtenerDetallePortalTrabajador({ identificacion, usuario, baseUrl = '' }) {
  const { idAspirante, seg } = await asegurarAspiranteParaTrabajador({ identificacion, usuario });

  // Consultar vinculación más reciente para obtener Operación, Regional, Cargo y Estado
  const [vincRows] = await pool.execute(
    `SELECT Operación, Regional, Cargo, Estado, DATE_FORMAT(\`Fecha de Ingreso\`, '%Y-%m-%d') AS fechaIngreso
     FROM Maestro_Vinculación
     WHERE Identificación = ?
     ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
    [identificacion]
  );
  const vinc = vincRows.length ? vincRows[0] : null;

  const operacion = vinc?.Operación || seg?.Operación || '';
  const regional = vinc?.Regional || '';
  const cargo = vinc?.Cargo || '';
  const estadoTrabajador = vinc?.Estado || seg?.Estado || 'Activo';

  // Consultar Dynamic_hv_aspirante actualizado
  const [aspRows] = await pool.execute(
    'SELECT telefono, correo_electronico FROM Dynamic_hv_aspirante WHERE id_aspirante = ?',
    [idAspirante]
  );
  const asp = aspRows[0] || {};
  const telefono = asp.telefono || seg.Celular || '';
  const correo = asp.correo_electronico || seg.Email || '';

  // Documentos de firma aplicables a la operación
  const docsFirma = await obtenerDocsFirmaParaOperacion(operacion);

  // Documentos ya firmados en Dynamic_hv_documentos
  const [cargados] = await pool.execute(
    'SELECT id_config_doc, estado, gcs_path FROM Dynamic_hv_documentos WHERE id_aspirante = ?',
    [idAspirante]
  );
  const mapa = {};
  cargados.forEach(c => {
    mapa[Number(c.id_config_doc)] = c;
  });

  // También verificar si ya están en Maestro_docTrabajador
  const [docsTrab] = await pool.execute(
    'SELECT TipoDocumento, Doc FROM Maestro_docTrabajador WHERE `Identificación` = ?',
    [identificacion]
  );
  docsTrab.forEach(dt => {
    const id = Number(dt.TipoDocumento);
    if (!mapa[id]) {
      mapa[id] = { id_config_doc: id, estado: 'Firmado', gcs_path: dt.Doc };
    }
  });

  let totalFirmados = 0;
  const docsDetalle = docsFirma.map(doc => {
    const d = mapa[doc.id];
    const estaFirmado = d && ['firmado', 'aprobado'].includes(String(d.estado || '').toLowerCase());
    if (estaFirmado) totalFirmados++;
    return {
      id: doc.id,
      nombre: doc.etiqueta || doc.nombre,
      prefijo: doc.prefijo,
      firmado: estaFirmado,
      estado: d ? d.estado : 'Pendiente'
    };
  });

  // Documentos de soporte (cédula, ADRES, certificado laboral…): el trabajador completa los que le falten desde el
  // mismo enlace y quedan en su carpeta digital (ver /api/confirm-doc en routes/seleccion.js)
  const docsSoporte = (await obtenerDocsSeleccion()).aspirante
    .filter(doc => doc.id !== ID_HOJA_VIDA)
    .map(doc => {
      const d = mapa[doc.id];
      return { id: doc.id, nombre: doc.etiqueta || doc.nombre, prefijo: doc.prefijo, cargado: !!d && String(d.estado || '').toLowerCase() !== 'rechazado' };
    });

  const portalRelativo = `/seleccion/portal/${idAspirante}`;
  const portalUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}${portalRelativo}` : portalRelativo;

  const nombreCompleto = [
    seg['Primer Nombre'],
    seg['Segundo Nombre'],
    seg['Primer Apellido'],
    seg['Segundo Apellido']
  ].filter(Boolean).join(' ').trim();

  return {
    ok: true,
    id_aspirante: idAspirante,
    identificacion: String(identificacion),
    nombreCompleto: nombreCompleto || seg.Trabajador || 'Trabajador',
    telefono,
    correo,
    operacion,
    regional,
    cargo,
    estado: estadoTrabajador,
    portalRelativo,
    portalUrl,
    totalDocs: docsFirma.length,
    totalFirmados,
    docs: docsDetalle,
    docsSoporte,
    totalSoporte: docsSoporte.length,
    totalSoporteCargados: docsSoporte.filter(d => d.cargado).length
  };
}

/**
 * Actualiza el teléfono y correo de un trabajador en Dynamic_hv_aspirante y Maestro_Segmentación
 */
async function actualizarContactoTrabajador({ identificacion, telefono, correo, usuario }) {
  const tel = (telefono || '').toString().trim();
  const cor = (correo || '').toString().trim();

  await pool.execute(
    `UPDATE Dynamic_hv_aspirante 
     SET telefono = ?, correo_electronico = ?, fecha_actualizacion = CURRENT_TIMESTAMP
     WHERE identificacion = ?`,
    [tel, cor, identificacion]
  );

  await pool.execute(
    `UPDATE Maestro_Segmentación 
     SET Celular = ?, Email = ?, \`Fecha de Actualización\` = CURRENT_TIMESTAMP, usuarioactualiza = ?
     WHERE Identificación = ?`,
    [tel, cor, usuario || 'CloudDocs', identificacion]
  );

  return { ok: true };
}

/**
 * Envía el correo manual con el enlace del portal al trabajador
 */
async function enviarCorreoPortalTrabajador({ identificacion, correo, baseUrl, usuario }) {
  const detalle = await obtenerDetallePortalTrabajador({ identificacion, usuario, baseUrl });
  const cor = (correo || detalle.correo || '').trim();
  if (!cor) {
    throw new Error('El trabajador no tiene correo electrónico registrado');
  }

  if (cor !== detalle.correo) {
    await actualizarContactoTrabajador({ identificacion, telefono: detalle.telefono, correo: cor, usuario });
  }

  // Quien presiona "Enviar por correo" va en copia
  const correoQuienEnvia = await correoUsuarioPorId(usuario);

  await enviarCorreoPortalAspirante({
    correo: cor,
    nombreAspirante: detalle.nombreCompleto,
    portalUrl: detalle.portalUrl,
    copia: correoQuienEnvia ? [correoQuienEnvia] : []
  });

  const notaCopia = correoQuienEnvia && correoQuienEnvia.toLowerCase() !== cor.toLowerCase() ? ` (copia a ${correoQuienEnvia})` : '';
  return { ok: true, mensaje: `Correo enviado exitosamente a ${cor}${notaCopia}` };
}

/**
 * Sincroniza un documento firmado con Maestro_docTrabajador y copia el PDF al bucket de empleados
 */
async function sincronizarFirmaConDocTrabajador({ identificacion, idConfigDoc, prefijo, gcsPath, partes = [], usuario = 'Firma Digital' }) {
  try {
    const [vincRows] = await pool.execute(
      `SELECT Regional, Operación, Estado, DATE_FORMAT(\`Fecha de Ingreso\`, '%Y-%m-%d') AS fecha_ingreso
       FROM Maestro_Vinculación
       WHERE Identificación = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );
    if (!vincRows.length) {
      return;
    }

    const { Regional, Operación, Estado, fecha_ingreso } = vincRows[0];
    const srcBucket = storage.bucket(BUCKET_ASPIRANTES);
    const destBucket = storage.bucket(BUCKET_EMPLEADOS);

    const copiarArchivo = async (ruta) => {
      if (!ruta) return false;
      try {
        await srcBucket.file(ruta).copy(destBucket.file(ruta));
        return true;
      } catch (e) {
        console.error('[clouddocsFirmas] Error al copiar a bucket empleados:', ruta, e.message);
        return false;
      }
    };

    if (partes && partes.length) {
      for (const pt of partes) {
        const rutaParte = pt.gcsPath || pt.gcs_path;
        await copiarArchivo(rutaParte);
        const obs = pt.observaciones || null;
        
        const [existe] = await pool.execute(
          `SELECT id FROM Maestro_docTrabajador 
           WHERE \`Identificación\` = ? AND Fecha_Ingreso = ? AND TipoDocumento = ? 
             AND (Observaciones = ? OR (Observaciones IS NULL AND ? IS NULL)) LIMIT 1`,
          [identificacion, fecha_ingreso, String(idConfigDoc), obs, obs]
        );

        if (existe.length) {
          await pool.execute(
            `UPDATE Maestro_docTrabajador 
             SET Doc = ?, Estado = ?, FechaRegistro = NOW(), Usuario = ?
             WHERE id = ?`,
            [rutaParte, Estado || 'Activo', usuario, existe[0].id]
          );
        } else {
          await pool.execute(
            `INSERT INTO Maestro_docTrabajador 
             (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Usuario, Observaciones)
             VALUES (UUID(), 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [Regional, Operación, identificacion, Estado || 'Activo', fecha_ingreso, String(idConfigDoc), prefijo, rutaParte, usuario, obs]
          );
        }
      }
    } else {
      await copiarArchivo(gcsPath);
      const [existe] = await pool.execute(
        `SELECT id FROM Maestro_docTrabajador 
         WHERE \`Identificación\` = ? AND Fecha_Ingreso = ? AND TipoDocumento = ? LIMIT 1`,
        [identificacion, fecha_ingreso, String(idConfigDoc)]
      );

      if (existe.length) {
        await pool.execute(
          `UPDATE Maestro_docTrabajador 
           SET Doc = ?, Estado = ?, FechaRegistro = NOW(), Usuario = ?
           WHERE id = ?`,
          [gcsPath, Estado || 'Activo', usuario, existe[0].id]
        );
      } else {
        await pool.execute(
          `INSERT INTO Maestro_docTrabajador 
           (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso, TipoDocumento, Prefijo, Doc, Usuario, Observaciones)
           VALUES (UUID(), 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [Regional, Operación, identificacion, Estado || 'Activo', fecha_ingreso, String(idConfigDoc), prefijo, gcsPath, usuario]
        );
      }
    }
    console.log(`[clouddocsFirmas] Documento ${idConfigDoc} (${prefijo}) sincronizado a Maestro_docTrabajador para trabajador ${identificacion}`);
  } catch (err) {
    console.error('[clouddocsFirmas] Error al sincronizar con Maestro_docTrabajador:', err.message);
  }
}

module.exports = {
  obtenerRolesPermitidosFirmas,
  verificarPermisoFirmas,
  asegurarAspiranteParaTrabajador,
  obtenerDetallePortalTrabajador,
  actualizarContactoTrabajador,
  enviarCorreoPortalTrabajador,
  sincronizarFirmaConDocTrabajador
};

const puppeteer = require('puppeteer');
const pool = require('./db');
const { storage } = require('./storage');

const BUCKET_RECURSOS = process.env.BUCKET_RECURSOS || 'logyser-recursos-corporativos';
const DEFAULT_FOTO = 'https://storage.googleapis.com/logyser-recursos-corporativos/firmas-corporativas/fotos-empleados/usuario.png';
const LOGO_LOGYSER = 'https://storage.googleapis.com/logyser-recibo-public/Logyser%20sin%20Nit.png';

// Cargos típicamente operativos a excluir de la creación automática de firmas
const CARGOS_EXCLUIDOS = [
  'PADRINO', 'OPERARIO DE MONTACARGA', 'AUXILIAR DE MAQUILA',
  'MONTACARGUISTA', 'LIDER AUXILIAR LOGISTICO', 'AUXILIAR LOGISTICO'
];

/**
 * Formatea la fecha actual en yyyymmddhhmmss
 */
function formatearTimestampFoto(fecha = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const yyyy = fecha.getFullYear();
  const mm = pad(fecha.getMonth() + 1);
  const dd = pad(fecha.getDate());
  const hh = pad(fecha.getHours());
  const mi = pad(fecha.getMinutes());
  const ss = pad(fecha.getSeconds());
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

/**
 * Sube una fotografía de colaborador al bucket de recursos corporativos
 * Formato requerido: https://storage.googleapis.com/logyser-recursos-corporativos/firmas-corporativas/fotos-empleados/[Identificacion]&yyyymmddhhmmss.extención
 */
async function subirFotoEmpleado(identificacion, buffer, mimetype = 'image/png', nombreOriginal = '') {
  let extension = 'png';
  if (nombreOriginal && nombreOriginal.includes('.')) {
    const ext = nombreOriginal.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      extension = ext === 'jpeg' ? 'jpg' : ext;
    }
  } else if (mimetype) {
    if (mimetype.includes('jpeg') || mimetype.includes('jpg')) extension = 'jpg';
    else if (mimetype.includes('webp')) extension = 'webp';
    else extension = 'png';
  }

  const timestamp = formatearTimestampFoto();
  const nombreArchivo = `firmas-corporativas/fotos-empleados/${identificacion}&${timestamp}.${extension}`;
  const file = storage.bucket(BUCKET_RECURSOS).file(nombreArchivo);

  await file.save(buffer, {
    contentType: mimetype || (extension === 'png' ? 'image/png' : 'image/jpeg'),
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=86400'
    }
  });

  return `https://storage.googleapis.com/${BUCKET_RECURSOS}/${nombreArchivo}`;
}

/**
 * Sube una imagen PNG generada de firma
 */
async function subirFirmaGeneradaPNG(identificacion, bufferPng) {
  const nombreArchivo = `firmas-corporativas/generadas/${identificacion}.png`;
  const file = storage.bucket(BUCKET_RECURSOS).file(nombreArchivo);

  await file.save(bufferPng, {
    contentType: 'image/png',
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=3600'
    }
  });

  return `https://storage.googleapis.com/${BUCKET_RECURSOS}/${nombreArchivo}`;
}

/**
 * Genera la imagen PNG de la firma corporativa con Puppeteer usando el banner de fondo por área
 */
async function generarFirmaPNG(datos) {
  const area = datos.area || 'auxiliares_administrativos';
  const fondoUrl = `https://storage.googleapis.com/${BUCKET_RECURSOS}/firmas-corporativas/areas/fondo-${area}.png`;
  const fotoUrl = datos.foto_url || DEFAULT_FOTO;
  const nombre = datos.nombre || datos.Trabajador || '';
  const cargo = datos.cargo || '';
  const operacion = datos.operacion || '';
  const direccion = datos.direccion || '';
  const celular = datos.celular || '';
  const email = datos.email || '';

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0; padding: 0; width: 1444px; height: 519px;
          background-color: transparent !important;
          font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          overflow: hidden;
        }
        .main-table {
          width: 1444px;
          height: 519px;
          background-image: url('${fondoUrl}');
          background-size: cover;
          background-repeat: no-repeat;
          table-layout: fixed;
          background-color: transparent;
        }
        .avatar-wrap {
          display: inline-block;
          border: 4px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 10px 24px rgba(0,0,0,0.35);
        }
        .avatar-img {
          width: 290px;
          height: 290px;
          border-radius: 50%;
          object-fit: cover;
          display: block;
        }
        .nombre {
          margin: 0;
          font-size: 44px;
          font-weight: 800;
          color: #1F2E3A;
          line-height: 1.1;
          word-break: break-word;
          max-width: 580px;
          text-shadow: 2px 2px 0 #ffffff, -2px -2px 0 #ffffff, 2px -2px 0 #ffffff, -2px 2px 0 #ffffff, 0 0 6px #ffffff;
        }
        .cargo {
          margin: 10px 0;
          font-size: 28px;
          font-weight: 700;
          color: #C7743A;
          text-shadow: 2px 2px 0 #ffffff, -1px -1px 0 #ffffff, 0 0 4px #ffffff;
        }
        .divisor {
          width: 140px;
          height: 5px;
          background-color: #C7743A;
          margin: 18px 0;
          border-radius: 3px;
        }
        .datos-texto {
          color: #2F3B45;
          font-size: 23px;
          line-height: 1.4;
          text-shadow: 1px 1px 0 #ffffff;
        }
        .datos-texto td {
          padding-bottom: 6px;
        }
        .label-tag {
          color: #A45A2A;
          font-weight: 700;
        }
        .email-link {
          font-size: 34px;
          font-weight: 700;
          color: #1F2E3A;
          text-shadow: 2px 2px 0 #ffffff, 0 0 4px #ffffff;
        }
      </style>
    </head>
    <body>
      <table class="main-table" cellpadding="0" cellspacing="0" border="0">
        <tr style="height: 410px;">
          <td style="width: 410px; vertical-align: middle; text-align: center; padding-left: 20px;">
            <div class="avatar-wrap">
              <img src="${fotoUrl}" class="avatar-img">
            </div>
          </td>
          <td style="vertical-align: middle; padding-left: 20px; width: 630px;">
            <h1 class="nombre">${nombre}</h1>
            <p class="cargo">${cargo}</p>
            <div class="divisor"></div>
            <table cellpadding="0" cellspacing="0" border="0" class="datos-texto">
              <tr>
                <td>
                  <span class="label-tag">Sede:</span> <strong>${operacion}</strong>
                  ${direccion ? `<br><span style="font-weight: 400; font-size: 20px;">${direccion}</span>` : ''}
                </td>
              </tr>
              ${celular ? `<tr><td><span class="label-tag">Tel:</span> <strong>(+57) ${celular}</strong></td></tr>` : ''}
            </table>
          </td>
          <td style="width: 404px;"></td>
        </tr>
        <tr style="height: 109px;">
          <td colspan="3" style="vertical-align: top; text-align: left; padding-left: 55px; padding-top: 6px;">
            <span class="email-link">${email}</span>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1444, height: 519, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const buffer = await page.screenshot({ type: 'png', omitBackground: true });
    return buffer;
  } finally {
    await browser.close();
  }
}

/**
 * Consulta un empleado para el generador de firmas.
 * 1. Busca en Maestro_firma_corporativa
 * 2. Si no existe, busca en Maestro_Vinculación y Maestro_Segmentación para autocompletar
 */
async function buscarEmpleadoParaFirma(identificacion) {
  if (!identificacion) return null;
  const idStr = String(identificacion).trim();

  // 1. Buscar en Maestro_firma_corporativa
  const [rowsFirma] = await pool.query(
    'SELECT * FROM Maestro_firma_corporativa WHERE Identificacion = ? LIMIT 1',
    [idStr]
  );

  if (rowsFirma.length > 0) {
    const emp = rowsFirma[0];
    return {
      existeEnFirma: true,
      data: {
        identificacion: emp.Identificacion,
        Trabajador: emp.Trabajador,
        nombre: emp.nombre || (emp.Trabajador ? emp.Trabajador.replace(/^\d+\s*\*{1,2}\s*/, '').trim() : ''),
        cargo: emp.cargo || '',
        regional: emp.regional || '',
        operacion: emp.operacion || '',
        area: emp.area || 'auxiliares_administrativos',
        direccion: emp.direccion || '',
        email: emp.email || '',
        celular: emp.celular || '',
        foto_url: emp.foto_url || DEFAULT_FOTO,
        firma_url: emp.firma_url || ''
      }
    };
  }

  // 2. Si no está en Maestro_firma_corporativa, buscar en Maestro_Vinculación
  const [rowsVinc] = await pool.query(
    `SELECT 
      Identificación AS identificacion,
      Trabajador,
      Cargo AS cargo,
      Regional AS regional,
      \`Operación\` AS operacion,
      Estado AS estado
     FROM \`Maestro_Vinculación\`
     WHERE Identificación = ?
     ORDER BY \`Fecha de Ingreso\` DESC
     LIMIT 1`,
    [idStr]
  );

  if (rowsVinc.length > 0) {
    const v = rowsVinc[0];
    const nombreLimpio = v.Trabajador ? v.Trabajador.replace(/^\d+\s*\*{1,2}\s*/, '').trim() : '';

    // Buscar datos adicionales en Maestro_Segmentación (celular, email)
    let celularSeg = '';
    let emailSeg = '';
    try {
      const [rowsSeg] = await pool.query(
        'SELECT Celular, Email FROM `Maestro_Segmentación` WHERE Identificación = ? LIMIT 1',
        [idStr]
      );
      if (rowsSeg.length > 0) {
        celularSeg = rowsSeg[0].Celular || '';
        emailSeg = rowsSeg[0].Email || '';
      }
    } catch (e) {
      console.warn('[firmaSyncService] Segmentacion error:', e.message);
    }

    return {
      existeEnFirma: false,
      esDeVinculacion: true,
      data: {
        identificacion: v.identificacion,
        Trabajador: v.Trabajador,
        nombre: nombreLimpio,
        cargo: v.cargo || '',
        regional: v.regional || '',
        operacion: v.operacion || 'Administracion',
        area: deducirAreaPorCargo(v.cargo),
        direccion: '',
        email: emailSeg || '',
        celular: celularSeg || '',
        foto_url: DEFAULT_FOTO,
        firma_url: '',
        estadoVinculacion: v.estado
      }
    };
  }

  return {
    existeEnFirma: false,
    esDeVinculacion: false,
    data: null
  };
}

/**
 * Autocompletado o sugerencias de empleados
 */
async function buscarColaboradoresSugeridos(query) {
  if (!query || query.trim().length < 2) return [];
  const q = `%${query.trim()}%`;

  const [rows] = await pool.query(
    `SELECT 
      Identificacion AS identificacion,
      Trabajador,
      nombre,
      cargo,
      regional,
      operacion,
      area,
      foto_url
     FROM Maestro_firma_corporativa
     WHERE Identificacion LIKE ? OR nombre LIKE ? OR Trabajador LIKE ? OR cargo LIKE ?
     LIMIT 10`,
    [q, q, q, q]
  );

  return rows.map(r => ({
    identificacion: r.identificacion,
    nombre: r.nombre || (r.Trabajador ? r.Trabajador.replace(/^\d+\s*\*{1,2}\s*/, '').trim() : ''),
    cargo: r.cargo,
    regional: r.regional,
    operacion: r.operacion,
    area: r.area,
    foto_url: r.foto_url || DEFAULT_FOTO
  }));
}

/**
 * Guarda o actualiza los datos de un empleado en Maestro_firma_corporativa
 */
async function guardarEmpleadoFirma(datos, archivoFoto = null, generarPngAutomatico = true, usuarioId = null) {
  const {
    identificacion,
    nombre,
    cargo,
    regional,
    operacion,
    area,
    direccion,
    email,
    celular
  } = datos;

  if (!identificacion || !nombre) {
    throw new Error('Identificación y Nombre son obligatorios.');
  }

  let operacionLimpia = operacion || '';
  if (operacionLimpia.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'administracion') {
    operacionLimpia = 'Administración';
  }

  const usuarioParaGuardar = usuarioId || datos.usuario || datos.usuario_id || null;

  // 1. Subir foto si viene archivo
  let fotoUrl = datos.foto_url || DEFAULT_FOTO;
  if (archivoFoto && archivoFoto.buffer) {
    fotoUrl = await subirFotoEmpleado(
      identificacion,
      archivoFoto.buffer,
      archivoFoto.mimetype,
      archivoFoto.originalname
    );
  }

  // 2. Formatear Trabajador
  const trabajadorStr = `${identificacion} ** ${nombre.toUpperCase()}`;

  // 3. Upsert en Maestro_firma_corporativa
  const [existeRows] = await pool.query(
    'SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion = ? LIMIT 1',
    [identificacion]
  );

  if (existeRows.length > 0) {
    await pool.query(
      `UPDATE Maestro_firma_corporativa SET
        nombre = ?,
        cargo = ?,
        regional = ?,
        operacion = ?,
        area = ?,
        direccion = ?,
        email = ?,
        celular = ?,
        foto_url = ?,
        Trabajador = COALESCE(Trabajador, ?),
        usuario = COALESCE(?, usuario)
       WHERE Identificacion = ?`,
      [
        nombre,
        cargo || '',
        regional || '',
        operacionLimpia,
        area || 'auxiliares_administrativos',
        direccion || '',
        email || '',
        celular || '',
        fotoUrl,
        trabajadorStr,
        usuarioParaGuardar,
        identificacion
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO Maestro_firma_corporativa (
        Identificacion, Trabajador, nombre, cargo, regional, operacion,
        area, direccion, email, celular, foto_url, usuario
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        identificacion,
        trabajadorStr,
        nombre,
        cargo || '',
        regional || '',
        operacionLimpia,
        area || 'auxiliares_administrativos',
        direccion || '',
        email || '',
        celular || '',
        fotoUrl,
        usuarioParaGuardar
      ]
    );
  }

  let finalFirmaPngUrl = null;
  if (generarPngAutomatico) {
    try {
      const bufferPng = await generarFirmaPNG({
        identificacion,
        nombre,
        cargo,
        operacion: operacionLimpia,
        direccion,
        celular,
        email,
        area,
        foto_url: fotoUrl
      });
      finalFirmaPngUrl = await subirFirmaGeneradaPNG(identificacion, bufferPng);

      // Guardar firma_url en BD
      await pool.query(
        'UPDATE Maestro_firma_corporativa SET firma_url = ? WHERE Identificacion = ?',
        [finalFirmaPngUrl, identificacion]
      );
    } catch (pngErr) {
      console.warn('[firmaSyncService] Advertencia al generar PNG en guardado:', pngErr.message);
    }
  }

  return {
    ok: true,
    identificacion,
    foto_url: fotoUrl,
    firma_url: finalFirmaPngUrl
  };
}

/**
 * Retorna todos los colaboradores para el Directorio Corporativo
 */
async function listarColaboradoresDirectorio() {
  const [rows] = await pool.query(`
    SELECT 
      Identificacion AS identificacion,
      Trabajador,
      COALESCE(NULLIF(nombre, ''), (CASE WHEN Trabajador LIKE '%**%' THEN SUBSTRING_INDEX(Trabajador, '**', -1) ELSE Trabajador END)) AS nombre,
      COALESCE(cargo, 'Sin Cargo') AS cargo,
      COALESCE(regional, 'GENERAL') AS regional,
      COALESCE(
        CASE
          WHEN LOWER(operacion) IN ('administracion', 'administración') THEN 'Administración'
          ELSE operacion
        END,
        'Sede Principal'
      ) AS operacion,
      COALESCE(NULLIF(area, ''), 'auxiliares_administrativos') AS area,
      COALESCE(direccion, '') AS direccion,
      COALESCE(email, '') AS email,
      COALESCE(celular, '') AS celular,
      COALESCE(foto_url, '${DEFAULT_FOTO}') AS foto_url,
      firma_url,
      usuario
    FROM Maestro_firma_corporativa
    WHERE Identificacion IS NOT NULL
    ORDER BY area ASC, regional ASC, nombre ASC
  `);

  return rows.map(r => ({
    ...r,
    nombre: String(r.nombre || '').trim()
  }));
}

/**
 * Elimina un colaborador de Maestro_firma_corporativa (Exclusivo Rol Sistema)
 */
async function eliminarColaboradorFirma(identificacion) {
  if (!identificacion) throw new Error('Identificación requerida para eliminar.');
  const [result] = await pool.query(
    'DELETE FROM Maestro_firma_corporativa WHERE Identificacion = ?',
    [String(identificacion).trim()]
  );
  return { ok: true, eliminados: result.affectedRows };
}

/**
 * Consulta información de usuario en Maestro_Usuarios
 */
async function obtenerUsuarioPorId(usuarioId) {
  if (!usuarioId) return null;
  const uid = String(usuarioId).trim();
  const [rows] = await pool.query(
    'SELECT ID, Nombre, Rol, Colaborador, Email, Cargo FROM Maestro_Usuarios WHERE ID = ? OR LOWER(Email) = ? LIMIT 1',
    [uid, uid.toLowerCase()]
  );
  if (rows.length === 0) return null;
  return rows[0];
}

/**
 * Evalúa los permisos de edición / eliminación de un usuario sobre un registro de colaborador
 */
function verificarPermisosColaborador(usuario, colab) {
  if (!usuario) {
    return { puedeEditar: false, puedeEliminar: false, esSistema: false, esPropio: false };
  }
  const esSistema = (usuario.Rol === 'Sistema');
  if (esSistema) {
    return { puedeEditar: true, puedeEliminar: true, esSistema: true, esPropio: false };
  }

  const colabUserStr = String(usuario.Colaborador || '').trim().toLowerCase();
  const trabajadorColab = String(colab.Trabajador || '').trim().toLowerCase();
  const idColab = String(colab.Identificacion || colab.identificacion || '').trim();

  let coincide = false;
  if (colabUserStr && trabajadorColab && (colabUserStr === trabajadorColab)) {
    coincide = true;
  } else if (colabUserStr && idColab) {
    if (colabUserStr.startsWith(idColab + ' **') || colabUserStr.startsWith(idColab + '**') || colabUserStr.startsWith(idColab + ' ')) {
      coincide = true;
    }
  }

  return {
    puedeEditar: coincide,
    puedeEliminar: false,
    esSistema: false,
    esPropio: coincide
  };
}

/**
 * Sincroniza colaboradores activos de Maestro_Vinculación con Maestro_firma_corporativa
 */
async function sincronizarConVinculacion() {
  // 1. Obtener empleados activos administrativos de Maestro_Vinculación
  const [vinculados] = await pool.query(`
    SELECT 
      v.Identificación AS identificacion,
      v.Trabajador,
      v.Cargo AS cargo,
      v.Regional AS regional,
      v.\`Operación\` AS operacion
    FROM \`Maestro_Vinculación\` v
    JOIN (
      SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS MaxFecha
      FROM \`Maestro_Vinculación\`
      GROUP BY Identificación
    ) ult ON v.Identificación = ult.Identificación AND v.\`Fecha de Ingreso\` = ult.MaxFecha
    WHERE v.Estado = 'Activo'
      AND v.Identificación IS NOT NULL
      AND v.Cargo NOT IN (${CARGOS_EXCLUIDOS.map(() => '?').join(',')})
  `, CARGOS_EXCLUIDOS);

  let creados = 0;
  let actualizados = 0;

  for (const v of vinculados) {
    const id = v.identificacion;
    const [existentes] = await pool.query(
      'SELECT Identificacion, cargo, regional, operacion FROM Maestro_firma_corporativa WHERE Identificacion = ? LIMIT 1',
      [id]
    );

    let opSync = v.operacion || '';
    if (opSync.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === 'administracion') {
      opSync = 'Administración';
    }

    if (existentes.length === 0) {
      // Insertar nuevo registro base
      const nombreLimpio = v.Trabajador ? v.Trabajador.replace(/^\d+\s*\*{1,2}\s*/, '').trim() : '';
      const areaDeducida = deducirAreaPorCargo(v.cargo);

      await pool.query(`
        INSERT INTO Maestro_firma_corporativa (
          Identificacion, Trabajador, nombre, cargo, regional, operacion, area, foto_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        v.Trabajador,
        nombreLimpio,
        v.cargo,
        v.regional,
        opSync,
        areaDeducida,
        DEFAULT_FOTO
      ]);
      creados++;
    } else {
      // Actualizar cargo, regional u operacion si cambiaron en Vinculación
      const ex = existentes[0];
      if (ex.cargo !== v.cargo || ex.regional !== v.regional || ex.operacion !== opSync) {
        await pool.query(`
          UPDATE Maestro_firma_corporativa SET
            cargo = ?,
            regional = ?,
            operacion = ?
          WHERE Identificacion = ?
        `, [v.cargo, v.regional, opSync, id]);
        actualizados++;
      }
    }
  }

  return {
    ok: true,
    totalEvaluados: vinculados.length,
    creados,
    actualizados
  };
}

/**
 * Asigna automáticamente un área según el cargo del colaborador
 */
function deducirAreaPorCargo(cargoStr) {
  if (!cargoStr) return 'auxiliares_administrativos';
  const c = cargoStr.toUpperCase();

  if (c.includes('SST') || c.includes('SEGURIDAD Y SALUD') || c.includes('HSEQ')) return 'sst';
  if (c.includes('COORDINADOR')) return 'coordinadores';
  if (c.includes('GERENTE') || c.includes('GERENCIA')) return 'gerencias';
  if (c.includes('SELECCION') || c.includes('ATRACCION') || c.includes('PSICOLOG')) return 'seleccion';
  if (c.includes('NOMINA')) return 'nomina';
  if (c.includes('CONTAB') || c.includes('CONTADOR')) return 'contabilidad';
  if (c.includes('FACTURA')) return 'facturacion';
  if (c.includes('SISTEMAS') || c.includes('TECNOLOG') || c.includes('DESARROLL')) return 'tecnologia';
  if (c.includes('INVENTARIO')) return 'inventario';
  if (c.includes('JURIDIC') || c.includes('ABOGAD')) return 'juridica';
  if (c.includes('CALIDAD')) return 'calidad';
  if (c.includes('TESORER')) return 'tesoreria';
  if (c.includes('CONTRATAC')) return 'contratacion';
  if (c.includes('DOCUMENT') || c.includes('ARCHIVO')) return 'documental';
  if (c.includes('DIRECTOR') || c.includes('DIRECCION')) return 'direccion';
  if (c.includes('CUENTAS')) return 'cuentas';

  return 'auxiliares_administrativos';
}

module.exports = {
  subirFotoEmpleado,
  subirFirmaGeneradaPNG,
  generarFirmaPNG,
  buscarEmpleadoParaFirma,
  buscarColaboradoresSugeridos,
  guardarEmpleadoFirma,
  listarColaboradoresDirectorio,
  eliminarColaboradorFirma,
  obtenerUsuarioPorId,
  verificarPermisosColaborador,
  sincronizarConVinculacion,
  deducirAreaPorCargo,
  DEFAULT_FOTO,
  LOGO_LOGYSER
};

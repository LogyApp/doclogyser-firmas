const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { randomUUID } = require('crypto');
const { enviarEmailAsistencia } = require('../services/email');
const { obtenerFirmaBase64Reciente, subirPDFAstAsistencia, subirPDFGeneralAsistencia, subirEvidenciaAsistencia } = require('../services/storage');
const { generarPDFDesdeHTML } = require('../services/renderer');

const router = express.Router();
const HTML_INDEX_PATH = path.join(__dirname, '../views/participacion/index.html');
const HTML_FORM_PATH = path.join(__dirname, '../views/formparticipacion/form.html');
const HTML_SIGN_PATH = path.join(__dirname, '../views/participacion/firmar.html');

const ROLES_SIN_FILTRO = [
  'AdmSst', 'Archivo', 'Calidad', 'Contabilidad', 'Contratación', 'Control',
  'Cuentas', 'Facturación', 'Generalista', 'Juridica', 'Jurídica', 'Nomina', 'Nómina', 'LiderSst',
  'Selección', 'Selección Centro', 'Sistema', 'Administración', 'Administrador',
  'Dirección Hseq', 'Dirección Operaciones', 'Dirección RRHH', 'Gestor Nómina'
];
const ROLES_REGIONAL = ['AuxiliarR', 'CoordinadorR'];
const ROLES_DISPOSITIVO = ['Auxiliar', 'Coordinador', 'AuxSst'];
const ROLES_MODALIDAD = ['AnaSst'];

function agruparOperacionesPorRegional(rows) {
  const opsPorRegional = {};
  rows.forEach((row) => {
    const regional = row.REGIONAL || row.Regional || '';
    const operacion = row['OPERACIÓN'] || row['Operación'] || row.OPERACIÓN || row.Operacion;
    if (!regional || !operacion) return;
    if (!opsPorRegional[regional]) opsPorRegional[regional] = [];
    opsPorRegional[regional].push(operacion);
  });
  return opsPorRegional;
}

function formatYYMMDDHHSS(date) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${ss}`;
}

function formatFechaEspanol(dateVal) {
  if (!dateVal) return '';
  const date = new Date(dateVal);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function generarPDFAsistencia(id, force = false) {
  // 1. Obtener datos de cabecera y responsable
  const [[asistencia]] = await pool.execute(
    `SELECT 
      a.id_asistencia,
      a.tema,
      a.fecha,
      a.hora_inicial,
      a.hora_final,
      a.lugar,
      a.duracion,
      a.objetivo,
      a.responsable,
      a.usuario,
      v.Trabajador AS nombre_responsable,
      v.Identificación AS identificacion_responsable,
      v.Cargo AS cargo_responsable
     FROM Dynamic_formato_asistencia a
     LEFT JOIN \`Maestro_Vinculación\` v ON a.responsable = v.\`Id Vinculación\`
     WHERE a.id_asistencia = ?`,
    [id]
  );

  if (!asistencia) {
    throw new Error('Asistencia no encontrada');
  }

  // 2. Obtener asistentes
  const [items] = await pool.execute(
    'SELECT nombre_trabajador, identificacion, cargo FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ?',
    [id]
  );

  // 3. Resolver firmas del bucket de GCS
  let todasFirmadas = true;
  const asistentesConFirma = [];

  for (const item of items) {
    const firmaBase64 = await obtenerFirmaBase64Reciente(item.identificacion).catch(() => null);
    if (!firmaBase64) {
      todasFirmadas = false;
    }
    asistentesConFirma.push({
      ...item,
      firmaBase64,
    });
  }

  // Si no están completas (no hay firma física en GCS para todos) y no es forzado, retornar error
  if (!todasFirmadas && !force) {
    throw new Error('Faltan firmas de asistentes en el sistema.');
  }

  // 4. Obtener firma del responsable
  let firmaResponsableBase64 = null;
  if (asistencia.identificacion_responsable) {
    firmaResponsableBase64 = await obtenerFirmaBase64Reciente(asistencia.identificacion_responsable).catch(() => null);
  }

  // 5. Construir HTML para el PDF
  let filasAsistentesHtml = '';
  let num = 1;
  for (const ast of asistentesConFirma) {
    const imgFirma = ast.firmaBase64 
      ? `<img src="${ast.firmaBase64}" style="height: 38px; display: block; margin: 0 auto;" />` 
      : '<span style="color: #ccc; font-size: 8px;">Pendiente</span>';

    let cleanNombre = ast.nombre_trabajador || '';
    if (cleanNombre.includes(' ** ')) {
      cleanNombre = cleanNombre.split(' ** ')[1];
    }

    filasAsistentesHtml += `
      <tr>
        <td style="border: 1px solid #111; padding: 6px; text-align: center;">${num++}</td>
        <td style="border: 1px solid #111; padding: 6px; font-weight: bold;">${cleanNombre}</td>
        <td style="border: 1px solid #111; padding: 6px;">${ast.identificacion}</td>
        <td style="border: 1px solid #111; padding: 6px;">${ast.cargo}</td>
        <td style="border: 1px solid #111; padding: 6px; text-align: center; vertical-align: middle;">${imgFirma}</td>
      </tr>
    `;
  }

  const imgFirmaResponsable = firmaResponsableBase64
    ? `<img src="${firmaResponsableBase64}" style="height: 55px; display: block; margin: 0 auto;" />`
    : '<div style="height: 50px; width: 200px; margin: 0 auto; border-bottom: 1px dashed #999;"></div>';

  let cleanResponsable = asistencia.nombre_responsable || '—';
  if (cleanResponsable.includes(' ** ')) {
    cleanResponsable = cleanResponsable.split(' ** ')[1];
  }

  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <style>
        * { box-sizing: border-box; }
        @page { margin: 1.2cm 1.2cm 1.2cm 1.2cm; }
        body { font-family: Arial, sans-serif; font-size: 9.5pt; color: #222; margin: 0; padding: 0; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        .header-table td { border: 1px solid #111; padding: 8px; vertical-align: middle; }
        .logo-cell { width: 140px; text-align: center; }
        .logo-cell img { height: 42px; max-width: 130px; }
        .title-cell { text-align: center; font-size: 11pt; font-weight: bold; line-height: 1.4; }
        .meta-cell { width: 140px; font-size: 8pt; line-height: 1.4; }
        
        .section-title {
          background: #d9d9d9; font-size: 9.5pt; font-weight: bold; padding: 6px;
          border: 1px solid #111; text-align: center; margin-top: 14px; margin-bottom: 0;
          text-transform: uppercase;
        }
        
        .info-table { width: 100%; border-collapse: collapse; margin-top: 0; }
        .info-table td { border: 1px solid #111; padding: 6px; vertical-align: middle; }
        .label { font-weight: bold; background: #f2f2f2; width: 15%; }
        
        .asistentes-table { width: 100%; border-collapse: collapse; margin-top: 0; }
        .asistentes-table th { border: 1px solid #111; background: #e6e6e6; padding: 6px; font-weight: bold; text-align: left; font-size: 9pt; }
        .asistentes-table td { border: 1px solid #111; padding: 5px; font-size: 8.5pt; }
        
        .firma-table { width: 60%; border-collapse: collapse; margin: 25px auto 0; }
        .firma-table td { border: 1px solid #111; padding: 12px; vertical-align: top; text-align: center; background: #fff; }
      </style>
    </head>
    <body>
      <table class="header-table">
        <tr>
          <td class="logo-cell"><img src="https://storage.googleapis.com/logyser-recibo-public/Logyser%20sin%20Nit.png" alt="LOG&SER"></td>
          <td class="title-cell">REGISTRO DE PARTICIPANTES</td>
          <td class="meta-cell">
            <strong>Código:</strong> SST-F-003<br>
            <strong>Versión:</strong> 02<br>
            <strong>Fecha:</strong> 28/05/2026
          </td>
        </tr>
      </table>

      <div class="section-title">Información Básica</div>
      <table class="info-table">
        <tr>
          <td class="label">Tema</td>
          <td colspan="5" style="font-weight: bold; font-size: 10.5pt;">${asistencia.tema}</td>
        </tr>
        <tr>
          <td class="label">Fecha</td>
          <td style="width: 18%;">${formatFechaEspanol(asistencia.fecha)}</td>
          <td class="label">Hora Inicial</td>
          <td style="width: 18%;">${asistencia.hora_inicial.slice(0, 5)}</td>
          <td class="label">Hora Final</td>
          <td style="width: 20%;">${asistencia.hora_final.slice(0, 5)}</td>
        </tr>
        <tr>
          <td class="label">Lugar</td>
          <td colspan="3">${asistencia.lugar}</td>
          <td class="label">Duración</td>
          <td>${asistencia.duracion.slice(0, 5)} Hs</td>
        </tr>
        <tr>
          <td class="label">Objetivo</td>
          <td colspan="5" style="text-align: justify;">${asistencia.objetivo || '—'}</td>
        </tr>
      </table>

      <div class="section-title">Asistentes Registrados</div>
      <table class="asistentes-table">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 40%;">Nombres y apellidos</th>
            <th style="width: 15%;">Cédula</th>
            <th style="width: 20%;">Cargo</th>
            <th style="width: 20%; text-align: center;">Firma</th>
          </tr>
        </thead>
        <tbody>
          ${filasAsistentesHtml}
        </tbody>
      </table>

      <table class="firma-table">
        <tr>
          <td>
            <p style="margin: 0 0 8px; font-weight: bold; font-size: 10pt; text-transform: uppercase;">RESPONSABLE DEL REGISTRO</p>
            <p style="margin: 3px 0; font-size: 9pt;">Nombre: <strong>${cleanResponsable}</strong></p>
            <p style="margin: 3px 0; font-size: 9pt;">Cargo: ${asistencia.cargo_responsable || '—'}</p>
            <div style="margin-top: 14px;">
              ${imgFirmaResponsable}
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  // 6. Renderizar PDF con Puppeteer
  const pdfBuffer = await generarPDFDesdeHTML(htmlCompleto);

  // 7. Guardar en carpeta de cada asistente y registrar en Maestro_docTrabajador
  const now = new Date();
  const formattedDate = formatYYMMDDHHSS(now);

  for (const ast of items) {
    const urlDoc = await subirPDFAstAsistencia(ast.identificacion, formattedDate, pdfBuffer);

    try {
      const [vinRows] = await pool.execute(
        `SELECT Regional, \`Operación\`, Identificación, Estado, \`Fecha de Ingreso\` 
         FROM \`Maestro_Vinculación\` 
         WHERE Identificación = ? 
         ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
        [ast.identificacion]
      );

      const regional = vinRows.length ? vinRows[0].Regional : null;
      const operacion = vinRows.length ? vinRows[0]['Operación'] : null;
      const estado = vinRows.length ? vinRows[0].Estado : null;
      const fechaIngreso = vinRows.length ? vinRows[0]['Fecha de Ingreso'] : null;

      const docId = randomUUID();
      await pool.execute(
        `INSERT INTO Maestro_docTrabajador
         (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
          TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario)
         VALUES (?, 'PEND', ?, ?, ?, ?, ?, 71, 'ACTASI', ?, NULL, NULL, NULL, NULL, ?)`,
        [
          docId,
          regional,
          operacion,
          ast.identificacion,
          estado,
          fechaIngreso,
          urlDoc,
          asistencia.usuario
        ]
      );
      console.log(`[participacion] [Maestro_docTrabajador] Registrado documento ACTASI para ${ast.identificacion}`);
    } catch (err) {
      console.error(`[participacion] [Maestro_docTrabajador] Error registrando documento para ${ast.identificacion}:`, err.message);
    }
  }

  // 8. Guardar copia general en la carpeta central de asistencias
  const urlGeneral = await subirPDFGeneralAsistencia(id, formattedDate, pdfBuffer);

  // 9. Actualizar url_doc en la base de datos
  await pool.execute(
    'UPDATE Dynamic_formato_asistencia SET url_doc = ? WHERE id_asistencia = ?',
    [urlGeneral, id]
  );

  return { urlGeneral, todasFirmadas };
}

async function computarAccesoParticipacion(usuarioId) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';
  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    sinFiltro: ROLES_SIN_FILTRO.includes(rol),
    operacionesFiltro: [],
    opsPorRegional: {},
    prefillResponsable: null,
  };

  let opRows = [];
  if (acceso.sinFiltro) {
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  } else if (ROLES_REGIONAL.includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.regional]
    );
    opRows = rows;
  } else if (ROLES_DISPOSITIVO.includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE SOCIODEMOGRAFICA = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.dispositivo]
    );
    opRows = rows;
  } else if (ROLES_MODALIDAD.includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE MODALIDAD = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.dispositivo]
    );
    opRows = rows;
  } else if (acceso.operacion) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.operacion]
    );
    opRows = rows;
  }

  acceso.opsPorRegional = agruparOperacionesPorRegional(opRows);
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  // Lógica de prellenado del responsable basada en el usuario actual
  const [uColRows] = await pool.execute(
    'SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
    [usuarioId]
  );
  if (uColRows.length && uColRows[0].Colaborador) {
    const [vRows] = await pool.execute(
      `SELECT \`Id Vinculación\` AS id_vinculacion, Trabajador 
       FROM \`Maestro_Vinculación\` 
       WHERE Trabajador = ? 
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [uColRows[0].Colaborador]
    );
    if (vRows.length) {
      acceso.prefillResponsable = {
        id_vinculacion: vRows[0].id_vinculacion,
        nombre: vRows[0].Trabajador,
      };
    }
  }

  return acceso;
}

// ═════ SERVIR INTERFAZ ═════
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoParticipacion(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const initialView = (req.baseUrl || '').toLowerCase().includes('/formparticipacion')
      ? 'formulario'
      : 'listado';

    const pathTemplate = initialView === 'formulario' ? HTML_FORM_PATH : HTML_INDEX_PATH;
    const html = fs.readFileSync(pathTemplate, 'utf8');

    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
      initialView,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[participacion] Error sirviendo interfaz:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// ═════ API: GET /api/usuario ═════
router.get('/api/usuario', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id requerido' });

    const [rows] = await pool.execute(
      'SELECT ID, Nombre FROM Maestro_Usuarios WHERE ID = ?',
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({
      id: rows[0].ID,
      nombre: rows[0].Nombre,
      usuario: rows[0].ID,
    });
  } catch (err) {
    console.error('[participacion] GET /api/usuario:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/responsables-buscar (SOLO IDENTIFICACIÓN) ═════
router.get('/api/responsables-buscar', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const qUpper = q.toUpperCase();

    const [rows] = await pool.execute(
      `SELECT \`Id Vinculación\` AS id_vinculacion, Trabajador, Identificación, Cargo, Operación, Regional 
       FROM \`Maestro_Vinculación\` 
       WHERE Estado = 'Activo' AND (Identificación LIKE ? OR Trabajador LIKE ?) 
       LIMIT 30`,
      [`%${qUpper}%`, `%${qUpper}%`]
    );

    res.json(rows);
  } catch (err) {
    console.error('[participacion] GET /api/responsables-buscar:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/asistentes-buscar (BÚSQUEDA GENERAL) ═════
router.get('/api/asistentes-buscar', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const qUpper = q.toUpperCase();

    const [rows] = await pool.execute(
      `SELECT \`Id Vinculación\` AS id_vinculacion, Trabajador, Identificación, Cargo, Operación, Regional 
       FROM \`Maestro_Vinculación\` 
       WHERE Estado = 'Activo' AND (Identificación LIKE ? OR Trabajador LIKE ?) 
       LIMIT 30`,
      [`%${qUpper}%`, `%${qUpper}%`]
    );

    res.json(rows);
  } catch (err) {
    console.error('[participacion] GET /api/asistentes-buscar:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/trabajadores-por-operacion ═════
router.get('/api/trabajadores-por-operacion', async (req, res) => {
  try {
    const { regional, operacion } = req.query;
    if (!regional || !operacion) {
      return res.status(400).json({ error: 'regional y operacion requeridos' });
    }

    const [rows] = await pool.execute(
      `SELECT \`Id Vinculación\` AS id_vinculacion, Trabajador, Identificación AS identificacion, Cargo, Operación, Regional 
       FROM \`Maestro_Vinculación\` 
       WHERE Estado = 'Activo' AND Regional = ? AND Operación = ?
       ORDER BY Trabajador`,
      [regional, operacion]
    );

    res.json(rows);
  } catch (err) {
    console.error('[participacion] GET /api/trabajadores-por-operacion:', err);
    res.status(500).json([]);
  }
});

// ═════ API: GET /api/conteos-filtros ═════
router.get('/api/conteos-filtros', async (req, res) => {
  try {
    const { usuario, tema, regional, operacion, fechaDesde, fechaHasta } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoParticipacion(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const baseConds = [];
    const baseParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ regionales: {}, operaciones: {} });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      baseConds.push(`(v.Operación IN (${ph}) OR a.usuario = ?)`);
      baseParams.push(...acceso.operacionesFiltro, usuario);
    }

    const sharedConds = [];
    const sharedParams = [];

    if (tema) {
      sharedConds.push('a.tema LIKE ?');
      sharedParams.push(`%${tema}%`);
    }
    if (fechaDesde) {
      sharedConds.push('a.fecha >= ?');
      sharedParams.push(fechaDesde);
    }
    if (fechaHasta) {
      sharedConds.push('a.fecha <= ?');
      sharedParams.push(fechaHasta);
    }

    // 1. Regionales (Excluye regional)
    const regConds = [...baseConds, ...sharedConds];
    const regParams = [...baseParams, ...sharedParams];
    if (operacion) {
      regConds.push('v.Operación = ?');
      regParams.push(operacion);
    }
    const regWhere = regConds.length ? `WHERE ${regConds.join(' AND ')}` : '';

    const [regRows] = await pool.execute(
      `SELECT v.Regional, COUNT(*) AS total
       FROM Dynamic_formato_asistencia a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.responsable = v.\`Id Vinculación\`
       ${regWhere}
       GROUP BY v.Regional`,
      regParams
    );

    // 2. Operaciones (Excluye operacion)
    const opConds = [...baseConds, ...sharedConds];
    const opParams = [...baseParams, ...sharedParams];
    if (regional) {
      opConds.push('v.Regional = ?');
      opParams.push(regional);
    }
    const opWhere = opConds.length ? `WHERE ${opConds.join(' AND ')}` : '';

    const [opRows] = await pool.execute(
      `SELECT v.Operación AS operacion, COUNT(*) AS total
       FROM Dynamic_formato_asistencia a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.responsable = v.\`Id Vinculación\`
       ${opWhere}
       GROUP BY v.Operación`,
      opParams
    );

    const regionales = {};
    regRows.forEach(r => {
      if (r.Regional) regionales[r.Regional] = r.total;
    });

    const operaciones = {};
    opRows.forEach(o => {
      if (o.operacion) operaciones[o.operacion] = o.total;
    });

    res.json({ regionales, operaciones });
  } catch (err) {
    console.error('[participacion] GET /api/conteos-filtros:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/asistencias ═════
router.get('/api/asistencias', async (req, res) => {
  try {
    const { usuario, tema, regional, operacion, fechaDesde, fechaHasta } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoParticipacion(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    // Filtros de rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json([]);
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`(v.Operación IN (${ph}) OR a.usuario = ?)`);
      params.push(...acceso.operacionesFiltro, usuario);
    }

    // Filtros de busqueda
    if (tema) { conds.push('a.tema LIKE ?'); params.push(`%${tema}%`); }
    if (regional) { conds.push('v.Regional = ?'); params.push(regional); }
    if (operacion) { conds.push('v.Operación = ?'); params.push(operacion); }
    if (fechaDesde) { conds.push('a.fecha >= ?'); params.push(fechaDesde); }
    if (fechaHasta) { conds.push('a.fecha <= ?'); params.push(fechaHasta); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT 
        a.id_asistencia,
        a.tema,
        a.fecha,
        a.hora_inicial,
        a.hora_final,
        a.duracion,
        a.lugar,
        a.objetivo,
        a.responsable,
        a.url_doc,
        a.usuario,
        a.fecha_creacion,
        v.Trabajador AS nombre_responsable,
        v.Regional AS regional_responsable,
        v.Operación AS operacion_responsable
       FROM Dynamic_formato_asistencia a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.responsable = v.\`Id Vinculación\`
       ${where}
       ORDER BY a.fecha DESC, a.fecha_creacion DESC
       LIMIT 500`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('[participacion] GET /api/asistencias:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /api/asistencia/:id ═════
router.get('/api/asistencia/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [[asistencia]] = await pool.execute(
      `SELECT 
        a.*, 
        v.Trabajador AS nombre_responsable,
        v.Identificación AS identificacion_responsable,
        v.Cargo AS cargo_responsable,
        v.Regional AS regional_responsable,
        v.Operación AS operacion_responsable,
        u.Nombre AS nombre_creador
       FROM Dynamic_formato_asistencia a
       LEFT JOIN \`Maestro_Vinculación\` v ON a.responsable = v.\`Id Vinculación\`
       LEFT JOIN \`Maestro_Usuarios\` u ON a.usuario = u.ID
       WHERE a.id_asistencia = ?`,
      [id]
    );

    if (!asistencia) {
      return res.status(404).json({ error: 'Formato no encontrado' });
    }

    const [items] = await pool.execute(
      `SELECT 
        i.*,
        s.Celular AS celular,
        s.Email AS email
       FROM Dynamic_formato_itemsAsistencia i
       LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = i.identificacion
       WHERE i.id_asistencia = ?`,
      [id]
    );

    // Resolver de forma asíncrona si tienen firmas en el bucket de GCS y si están aceptadas
    const itemsConFirmaStatus = await Promise.all(items.map(async (item) => {
      const tieneFirmaGcs = await obtenerFirmaBase64Reciente(item.identificacion).catch(() => null);
      
      let estadoFirma = 'SIN_FIRMA';
      if (item.firma_asistente) {
        estadoFirma = 'ACEPTADA';
      } else if (tieneFirmaGcs) {
        estadoFirma = 'PREFILLED';
      }

      return {
        ...item,
        tiene_firma: !!tieneFirmaGcs,
        estado_firma: estadoFirma,
      };
    }));

    const [evidencias] = await pool.execute(
      `SELECT id_evidencia, url_evidencia FROM Dynamic_formato_evidencias WHERE id_asistencia = ?`,
      [id]
    );

    res.json({ ...asistencia, items: itemsConFirmaStatus, evidencias });
  } catch (err) {
    console.error('[participacion] GET /api/asistencia/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/asistencias ═════
router.post('/api/asistencias', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { tema, fecha, hora_inicial, hora_final, lugar, objetivo, responsable, usuario, asistentes, evidencias } = req.body;

    if (!tema || !fecha || !hora_inicial || !hora_final || !lugar || !responsable || !usuario) {
      return res.status(400).json({ error: 'Faltan campos requeridos en la información básica.' });
    }

    if (!Array.isArray(asistentes) || asistentes.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un asistente.' });
    }

    await conn.beginTransaction();

    // 1. Insertar Cabecera
    const [result] = await conn.execute(
      `INSERT INTO Dynamic_formato_asistencia
       (tema, fecha, hora_inicial, hora_final, lugar, objetivo, responsable, usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tema, fecha, hora_inicial, hora_final, lugar, objetivo || '', responsable, usuario]
    );
    const idAsistencia = result.insertId;

    // 2. Traer información de cada asistente de Maestro_Vinculación para cachear en itemsAsistencia
    for (const idVinculacion of asistentes) {
      const [vinRows] = await conn.execute(
        `SELECT Trabajador, Identificación, Cargo, Operación, Regional 
         FROM \`Maestro_Vinculación\` 
         WHERE \`Id Vinculación\` = ? LIMIT 1`,
        [idVinculacion]
      );

      if (vinRows.length) {
        const v = vinRows[0];
        await conn.execute(
          `INSERT INTO Dynamic_formato_itemsAsistencia
           (id_asistencia, id_vinculacion, nombre_trabajador, identificacion, cargo, operacion, regional)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [idAsistencia, idVinculacion, v.Trabajador, v.Identificación, v.Cargo, v.Operación, v.Regional]
        );
      }
    }

    // 3. Subir fotos de evidencia a GCS e insertar en DB
    if (Array.isArray(evidencias) && evidencias.length > 0) {
      for (const ev of evidencias) {
        if (ev.base64) {
          const buffer = Buffer.from(ev.base64.replace(/^data:.*;base64,/, ''), 'base64');
          const urlGcs = await subirEvidenciaAsistencia(idAsistencia, ev.filename, buffer, ev.contentType);
          await conn.execute(
            `INSERT INTO Dynamic_formato_evidencias (id_asistencia, url_evidencia) VALUES (?, ?)`,
            [idAsistencia, urlGcs]
          );
        }
      }
    }

    await conn.commit();
    res.status(201).json({ ok: true, id_asistencia: idAsistencia });
  } catch (err) {
    await conn.rollback();
    console.error('[participacion] POST /api/asistencias:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: PUT /api/asistencia/:id ═════
router.put('/api/asistencia/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { tema, fecha, hora_inicial, hora_final, lugar, objetivo, responsable, usuario, asistentes, evidencias } = req.body;

    if (!tema || !fecha || !hora_inicial || !hora_final || !lugar || !responsable || !usuario) {
      return res.status(400).json({ error: 'Faltan campos requeridos en la información básica.' });
    }

    if (!Array.isArray(asistentes) || asistentes.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un asistente.' });
    }

    await conn.beginTransaction();

    // 1. Actualizar Cabecera
    await conn.execute(
      `UPDATE Dynamic_formato_asistencia
       SET tema = ?, fecha = ?, hora_inicial = ?, hora_final = ?, lugar = ?, objetivo = ?, responsable = ?, usuario = ?, url_doc = NULL
       WHERE id_asistencia = ?`,
      [tema, fecha, hora_inicial, hora_final, lugar, objetivo || '', responsable, usuario, id]
    );

    // 2. Guardar estado de firmas aceptadas antes de borrar para re-aplicarlas si el asistente aún está en la lista
    const [prevItems] = await conn.execute(
      'SELECT id_vinculacion, firma_asistente FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ? AND firma_asistente IS NOT NULL',
      [id]
    );
    const firmasAceptadasMap = {};
    prevItems.forEach(item => {
      firmasAceptadasMap[item.id_vinculacion] = item.firma_asistente;
    });

    // 3. Eliminar items anteriores
    await conn.execute(
      'DELETE FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ?',
      [id]
    );

    // 4. Insertar nuevos asistentes
    for (const idVinculacion of asistentes) {
      const [vinRows] = await conn.execute(
        `SELECT Trabajador, Identificación, Cargo, Operación, Regional 
         FROM \`Maestro_Vinculación\` 
         WHERE \`Id Vinculación\` = ? LIMIT 1`,
        [idVinculacion]
      );

      if (vinRows.length) {
        const v = vinRows[0];
        const firmaPreviaAceptada = firmasAceptadasMap[idVinculacion] || null;

        await conn.execute(
          `INSERT INTO Dynamic_formato_itemsAsistencia
           (id_asistencia, id_vinculacion, nombre_trabajador, identificacion, cargo, operacion, regional, firma_asistente)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, idVinculacion, v.Trabajador, v.Identificación, v.Cargo, v.Operación, v.Regional, firmaPreviaAceptada]
        );
      }
    }

    // 5. Manejar fotos de evidencia (eliminar anteriores y volver a insertar guardadas + nuevas)
    await conn.execute('DELETE FROM Dynamic_formato_evidencias WHERE id_asistencia = ?', [id]);
    if (Array.isArray(evidencias) && evidencias.length > 0) {
      for (const ev of evidencias) {
        if (ev.url_evidencia) {
          // Mantener foto existente
          await conn.execute(
            `INSERT INTO Dynamic_formato_evidencias (id_asistencia, url_evidencia) VALUES (?, ?)`,
            [id, ev.url_evidencia]
          );
        } else if (ev.base64) {
          // Subir nueva foto
          const buffer = Buffer.from(ev.base64.replace(/^data:.*;base64,/, ''), 'base64');
          const urlGcs = await subirEvidenciaAsistencia(id, ev.filename, buffer, ev.contentType);
          await conn.execute(
            `INSERT INTO Dynamic_formato_evidencias (id_asistencia, url_evidencia) VALUES (?, ?)`,
            [id, urlGcs]
          );
        }
      }
    }

    await conn.commit();
    res.json({ ok: true, id_asistencia: id });
  } catch (err) {
    await conn.rollback();
    console.error('[participacion] PUT /api/asistencia/:id:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: DELETE /api/asistencia/:id ═════
router.delete('/api/asistencia/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { usuario } = req.query;

    if (!usuario) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const acceso = await computarAccesoParticipacion(usuario);
    if (!acceso || acceso.rol !== 'Sistema') {
      return res.status(403).json({ error: 'Solo el rol de Sistema puede eliminar registros.' });
    }

    await conn.beginTransaction();
    await conn.execute('DELETE FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ?', [id]);
    await conn.execute('DELETE FROM Dynamic_formato_evidencias WHERE id_asistencia = ?', [id]);
    await conn.execute('DELETE FROM Dynamic_formato_asistencia WHERE id_asistencia = ?', [id]);
    await conn.commit();

    res.json({ ok: true, id_asistencia: id });
  } catch (err) {
    await conn.rollback();
    console.error('[participacion] DELETE /api/asistencia/:id:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ═════ API: PATCH /api/asistencia/:id/guardar-contacto ═════
router.patch('/api/asistencia/:id/guardar-contacto', async (req, res) => {
  try {
    const { identificacion, celular, email } = req.body;
    if (!identificacion) {
      return res.status(400).json({ error: 'identificacion requerida' });
    }

    await pool.execute(
      `INSERT INTO \`Maestro_Segmentación\` (Identificación, Celular, Email)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE Celular = ?, Email = ?`,
      [identificacion, celular || null, email || null, celular || null, email || null]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[participacion] PATCH /api/asistencia/:id/guardar-contacto:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: POST /api/asistencia/:id/enviar-notificacion ═════
router.post('/api/asistencia/:id/enviar-notificacion', async (req, res) => {
  try {
    const { id } = req.params;
    const { id_item_asistencia, enviarATodos } = req.body;

    const [[asistencia]] = await pool.execute(
      'SELECT tema, fecha, lugar, url_doc FROM Dynamic_formato_asistencia WHERE id_asistencia = ?',
      [id]
    );
    if (!asistencia) {
      return res.status(404).json({ error: 'Formato no encontrado' });
    }

    let items = [];
    if (enviarATodos) {
      [items] = await pool.execute(
        `SELECT i.id_item_asistencia, i.nombre_trabajador, i.identificacion, s.Email 
         FROM Dynamic_formato_itemsAsistencia i 
         LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = i.identificacion
         WHERE i.id_asistencia = ?`,
        [id]
      );
    } else {
      [items] = await pool.execute(
        `SELECT i.id_item_asistencia, i.nombre_trabajador, i.identificacion, s.Email 
         FROM Dynamic_formato_itemsAsistencia i 
         LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = i.identificacion
         WHERE i.id_asistencia = ? AND i.id_item_asistencia = ?`,
        [id, id_item_asistencia]
      );
    }

    let enviados = 0;
    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');

    for (const item of items) {
      if (item.Email) {
        // Enlace para firmar que se incluye en el correo
        const urlFirmaLink = `${protocol}://${host}/participacion/firmar?item=${item.id_item_asistencia}`;
        
        await enviarEmailAsistencia({
          email: item.Email,
          trabajador: item.nombre_trabajador,
          tema: asistencia.tema,
          fecha: asistencia.fecha,
          lugar: asistencia.lugar,
          urlDoc: urlFirmaLink, // El botón del correo apunta a la vista de firma del asistente
        });
        enviados++;
      }
    }

    res.json({ ok: true, enviados });
  } catch (err) {
    console.error('[participacion] POST /api/asistencia/:id/enviar-notificacion:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/asistencia/:id/generar-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.body;

    const result = await generarPDFAsistencia(id, !!force);

    res.json({
      ok: true,
      url_doc: result.urlGeneral,
      firmasCompletas: result.todasFirmadas,
    });
  } catch (err) {
    console.error('[participacion] POST /api/asistencia/:id/generar-pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: GET /firmar (PÁGINA DE FIRMA TRABAJADOR) ═════
router.get('/firmar', async (req, res) => {
  try {
    const { item } = req.query;
    if (!item) return res.status(400).send('<h2>Parámetro item requerido</h2>');

    const [[ast]] = await pool.execute(
      `SELECT 
        i.*, 
        a.tema, a.fecha, a.lugar, 
        v.Trabajador AS nombre_responsable
       FROM Dynamic_formato_itemsAsistencia i
       INNER JOIN Dynamic_formato_asistencia a ON i.id_asistencia = a.id_asistencia
       LEFT JOIN \`Maestro_Vinculación\` v ON a.responsable = v.\`Id Vinculación\`
       WHERE i.id_item_asistencia = ? LIMIT 1`,
      [item]
    );

    if (!ast) return res.status(404).send('<h2>Registro de asistente no encontrado</h2>');

    const htmlFirma = fs.readFileSync(HTML_SIGN_PATH, 'utf8');
    
    // Resolvemos firma del bucket de GCS
    const firmaBase64 = await obtenerFirmaBase64Reciente(ast.identificacion).catch(() => null);

    const config = JSON.stringify({
      id_item_asistencia: ast.id_item_asistencia,
      tema: ast.tema,
      fecha: ast.fecha,
      lugar: ast.lugar,
      nombre_responsable: ast.nombre_responsable,
      nombre_trabajador: ast.nombre_trabajador,
      identificacion: ast.identificacion,
      cargo: ast.cargo,
      firmaBase64,
    });

    res.send(htmlFirma.replace('__CONFIG_FIRMA__', config));
  } catch (err) {
    console.error('[participacion] GET /firmar:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

router.post('/api/firmar-asistente', async (req, res) => {
  try {
    const { id_item_asistencia, firmaBase64, aceptarExistente } = req.body;
    if (!id_item_asistencia) {
      return res.status(400).json({ error: 'id_item_asistencia requerido' });
    }

    const [[itemInfo]] = await pool.execute(
      'SELECT id_asistencia, identificacion FROM Dynamic_formato_itemsAsistencia WHERE id_item_asistencia = ? LIMIT 1',
      [id_item_asistencia]
    );
    if (!itemInfo) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    let urlFirma = 'ACEPTADA';

    if (!aceptarExistente && firmaBase64) {
      // Dibujó una nueva firma, la subimos a GCS
      const buffer = Buffer.from(firmaBase64.replace(/^data:.*;base64,/, ''), 'base64');
      const { subirFirma } = require('../services/storage');
      urlFirma = await subirFirma(itemInfo.identificacion, buffer);
    }

    await pool.execute(
      'UPDATE Dynamic_formato_itemsAsistencia SET firma_asistente = ? WHERE id_item_asistencia = ?',
      [urlFirma, id_item_asistencia]
    );

    // Verificar si todos los asistentes de este formato han firmado (firma_asistente no es NULL)
    const [[countPending]] = await pool.execute(
      'SELECT COUNT(*) AS pending FROM Dynamic_formato_itemsAsistencia WHERE id_asistencia = ? AND firma_asistente IS NULL',
      [itemInfo.id_asistencia]
    );

    let pdfGenerado = false;
    let urlDoc = null;

    if (countPending.pending === 0) {
      try {
        const result = await generarPDFAsistencia(itemInfo.id_asistencia, false);
        urlDoc = result.urlGeneral;
        pdfGenerado = true;
        console.log(`[participacion] PDF generado automáticamente al completar todas las firmas para asistencia ${itemInfo.id_asistencia}`);
      } catch (pdfErr) {
        console.warn(`[participacion] No se pudo generar PDF automáticamente al completar firmas para asistencia ${itemInfo.id_asistencia}:`, pdfErr.message);
      }
    }

    res.json({ ok: true, pdfGenerado, urlDoc });
  } catch (err) {
    console.error('[participacion] POST /api/firmar-asistente:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

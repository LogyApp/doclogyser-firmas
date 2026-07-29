const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { obtenerFirmaBase64Reciente, obtenerUrlFirmaReciente, subirFirma, subirPDFConfirmacionInventario } = require('../services/storage');
const { notificarConfirmacionInventario } = require('../services/email');
const { generarPDF } = require('../services/renderer');

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/inventario/index.html');

const ROLES_SIN_FILTRO = [
  'AdmSst', 'Archivo', 'Calidad', 'Contabilidad', 'Control',
  'Cuentas', 'Facturación', 'Juridica', 'Jurídica', 'Nomina', 'Nómina', 'LiderSst',
  'Sistema', 'Dirección RRHH'
];
const ROLES_REGIONAL = ['AuxiliarR', 'CoordinadorR'];
const ROLES_MODALIDAD = ['AnaSst'];
const ROLES_EXCLUIDOS = ['Generalista', 'Selección Centro', 'Selección', 'Contratación'];

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

async function computarAccesoInventario(usuarioId) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  // Si el rol pertenece a los excluidos, no se autoriza
  if (ROLES_EXCLUIDOS.includes(rol)) {
    return null;
  }

  const acceso = {
    usuarioId: usuario.ID,
    usuarioNombre: usuario.Nombre || usuario.ID,
    rol,
    regional: usuario.Regional || '',
    dispositivo: usuario.Dispositivo || '',
    operacion: usuario['Operación'] || '',
    sinFiltro: false,
    operacionesFiltro: [],
    opsPorRegional: {},
  };

  const tieneDispositivo = acceso.dispositivo && acceso.dispositivo.trim() !== '';

  let opRows = [];

  // 1. Acceso por dispositivo: aplica si la columna Dispositivo tiene valor y es diferente a vacío o null, sin importar el rol
  if (tieneDispositivo) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE SOCIODEMOGRAFICA = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.dispositivo]
    );
    opRows = rows;
  }
  // 2. Roles sin filtro (Acceso Total)
  else if (ROLES_SIN_FILTRO.includes(rol)) {
    acceso.sinFiltro = true;
    const [rows] = await pool.execute(
      "SELECT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    opRows = rows;
  }
  // 3. Roles regionales
  else if (ROLES_REGIONAL.includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.regional]
    );
    opRows = rows;
  }
  // 4. Roles modalidad
  else if (ROLES_MODALIDAD.includes(rol)) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE MODALIDAD = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.dispositivo]
    );
    opRows = rows;
  }
  // 5. Acceso por operación única (roles que no están relacionados y tienen vacío/null en Dispositivo)
  else if (acceso.operacion) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.operacion]
    );
    opRows = rows;
  }

  acceso.opsPorRegional = agruparOperacionesPorRegional(opRows);
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  return acceso;
}

// Servir la interfaz HTML
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoInventario(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    }

    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[inventario] Error sirviendo interfaz:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// API para devolver los datos filtrados
router.get('/api/datos', async (req, res) => {
  try {
    const { usuario, regional, operacion } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    // Filtrar por operaciones permitidas según rol del usuario
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json([]);
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`\`Operacion\` IN (${ph})`);
      params.push(...acceso.operacionesFiltro);
    }

    // Filtros de interfaz de usuario
    if (regional) {
      conds.push('Regional = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('`Operacion` = ?');
      params.push(operacion);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const query = `
      SELECT 
        \`Regional\`,
        \`Operacion\` AS \`Operacion\`,
        \`Origen\` AS \`Origen\`,
        \`Imagen\` AS \`Imagen\`,
        \`IdArticulo\` AS \`IdArticulo\`,
        \`Articulo\` AS \`Articulo\`,
        \`Talla\` AS \`Talla\`,
        \`Referencia\` AS \`Referencia\`,
        \`Clasificación\` AS \`Clasificacion\`,
        \`Categoria\` AS \`Categoria\`,
        \`Stock Disponible\` AS \`StockDisponible\`,
        \`Valor Stock\` AS \`ValorStock\`,
        \`Observaciones\` AS \`Observaciones\`
      FROM Vista_Inventario
      ${where}
      ORDER BY Regional, Operacion, Articulo
    `;

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[inventario] GET /api/datos:', err);
    res.status(500).json({ error: err.message });
  }
});

// API para buscar la firma reciente del usuario
router.get('/api/firma-reciente', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario es requerido' });

    // Buscar Colaborador en Maestro_Usuarios
    const [uRows] = await pool.execute('SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ?', [usuario]);
    if (!uRows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const colaborador = uRows[0].Colaborador;
    const email = uRows[0].Email;

    // Buscar Identificación en Maestro_Segmentación
    const [segRows] = await pool.execute('SELECT Identificación FROM Maestro_Segmentación WHERE Trabajador = ? LIMIT 1', [colaborador]);
    if (!segRows.length) {
      return res.json({ identificacion: null, email, firmaUrl: null, firmaBase64: null });
    }

    const identificacion = segRows[0].Identificación;

    // Obtener firma reciente
    const url = await obtenerUrlFirmaReciente(identificacion);
    const base64 = await obtenerFirmaBase64Reciente(identificacion);

    res.json({
      identificacion,
      email,
      firmaUrl: url,
      firmaBase64: base64
    });
  } catch (err) {
    console.error('[inventario] GET /api/firma-reciente:', err);
    res.status(500).json({ error: err.message });
  }
});

// API para registrar confirmación de inventario (genera PDF y notifica por correo)
router.post('/api/confirmar', async (req, res) => {
  try {
    const { usuario, operacion, categoria, observaciones, mes, nuevaFirmaBase64 } = req.body;
    if (!usuario || !operacion || !categoria || !mes) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (usuario, operacion, categoria, mes)' });
    }

    // 1. Validar registro único por mes
    const [dupRows] = await pool.execute(
      'SELECT id FROM Maestro_Confirmacion WHERE operacion = ? AND categoria = ? AND mes = ? LIMIT 1',
      [operacion, categoria, mes]
    );
    if (dupRows.length > 0) {
      return res.status(400).json({ error: 'Ya se ha confirmado el inventario para esta operación, categoría y mes.' });
    }

    // 2. Obtener Colaborador y Email
    const [uRows] = await pool.execute('SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ?', [usuario]);
    if (!uRows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    const colaborador = uRows[0].Colaborador;
    const emailUsuario = uRows[0].Email;

    // 3. Obtener Identificación
    const [segRows] = await pool.execute('SELECT Identificación FROM Maestro_Segmentación WHERE Trabajador = ? LIMIT 1', [colaborador]);
    if (!segRows.length) {
      return res.status(400).json({ error: 'No se encontró la Identificación del colaborador para proceder con la firma.' });
    }
    const identificacion = segRows[0].Identificación;

    // 4. Manejo de firma
    let signatureUrl = '';
    let signatureBase64 = '';
    if (nuevaFirmaBase64 && nuevaFirmaBase64.trim() !== '') {
      const matches = nuevaFirmaBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer;
      if (matches && matches.length === 3) {
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(nuevaFirmaBase64, 'base64');
      }
      signatureUrl = await subirFirma(identificacion, buffer);
      signatureBase64 = nuevaFirmaBase64;
    } else {
      signatureUrl = await obtenerUrlFirmaReciente(identificacion);
      signatureBase64 = await obtenerFirmaBase64Reciente(identificacion);
    }

    if (!signatureUrl) {
      return res.status(400).json({ error: 'Se requiere una firma digital para confirmar el inventario. Por favor, dibuja una firma.' });
    }

    // 5. Consultar los artículos activos para el PDF
    const [items] = await pool.execute(
      `SELECT Articulo, Talla, Referencia, \`Stock Disponible\` AS StockDisponible
       FROM Vista_Inventario
       WHERE Operacion = ? AND Categoria = ?`,
      [operacion, categoria]
    );

    // 6. Generar HTML y compilar a PDF con Puppeteer
    const formattedDate = new Date().toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    let itemsRowsHtml = '';
    if (items.length > 0) {
      items.forEach((item, idx) => {
        itemsRowsHtml += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${idx + 1}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${item.Articulo || '—'}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.Referencia || 'S/N'}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.StockDisponible || 0}</td>
          </tr>
        `;
      });
    } else {
      itemsRowsHtml = `
        <tr>
          <td colspan="4" style="border: 1px solid #ddd; padding: 12px; text-align: center; color: #777;">
            No se encontraron artículos en stock para este inventario.
          </td>
        </tr>
      `;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 10px; color: #333;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="width: 130px; vertical-align: middle;">
              <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height: 52px;" alt="LOG&SER">
            </td>
            <td style="text-align: center; font-size: 14pt; font-weight: bold; line-height: 1.5; color: #1e3c72; vertical-align: middle;">
              ACTA DE CONFIRMACIÓN DE INVENTARIO DE ${categoria.toUpperCase()}<br>
              SEDE: ${operacion.toUpperCase()}
            </td>
          </tr>
        </table>

        <div style="margin-bottom: 20px; font-size: 10pt; line-height: 1.6; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px;">
          <strong>Fecha Registro:</strong> ${formattedDate}<br>
          <strong>Período (Mes):</strong> ${mes} (Mensual)<br>
          <strong>Responsable:</strong> ${colaborador} (C.C. ${identificacion})<br>
          <strong>Área:</strong> Inventario
          ${observaciones ? `<br><strong>Observaciones:</strong> ${observaciones}` : ''}
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 40px;">
          <thead>
            <tr style="background-color: #e2e8f0;">
              <th style="border: 1px solid #ddd; padding: 8px; width: 10%; text-align: center;">ÍTEM</th>
              <th style="border: 1px solid #ddd; padding: 8px; width: 55%; text-align: left;">DESCRIPCIÓN DEL ARTÍCULO</th>
              <th style="border: 1px solid #ddd; padding: 8px; width: 20%; text-align: center;">SERIAL / IDENTIFICADOR</th>
              <th style="border: 1px solid #ddd; padding: 8px; width: 15%; text-align: center;">CANTIDAD</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>

        <div style="page-break-inside: avoid; margin-top: 50px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div style="border-bottom: 1.5px solid #333; width: 300px; padding-bottom: 10px; margin-bottom: 8px;">
            <img src="${signatureBase64}" style="max-height: 80px; max-width: 250px; object-fit: contain;" alt="Firma">
          </div>
          <div style="font-size: 10pt; font-weight: bold; color: #1e3c72; text-transform: uppercase;">
            FIRMA RESPONSABLE DE SEDE
          </div>
          <div style="font-size: 9pt; color: #555; margin-top: 4px;">
            Nombre: ${colaborador}<br>
            C.C.: ${identificacion}
          </div>
        </div>
      </div>
    `;

    const pdfBuffer = await generarPDF(htmlContent, {
      margin: { top: '15mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });

    // 7. Subir PDF a GCS
    const cleanOp = operacion.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanCat = categoria.replace(/[^a-zA-Z0-9]/g, '_');
    const cleanMes = mes.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `confirmacion_${cleanOp}_${cleanCat}_${cleanMes}_${Date.now()}.pdf`;
    
    const pdfUrl = await subirPDFConfirmacionInventario(fileName, pdfBuffer);

    // 8. Insertar en DB
    await pool.execute(
      `INSERT INTO Maestro_Confirmacion 
       (area, periodo, usuario, observaciones, operacion, categoria, mes, fecha_confirmacion, firma_url, pdf_url)
       VALUES ('Inventario', 'mensual', ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [usuario, observaciones || null, operacion, categoria, mes, signatureUrl, pdfUrl]
    );

    // 9. Configurar destinatarios del correo según Categoría
    let emailRecipients = ['admin@logyser.com'];
    const catUpper = categoria.trim().toUpperCase();

    if (catUpper === 'TECNOLOGIA') {
      emailRecipients.push('administradorti@logyser.com');
    } else if (catUpper === 'ACTIVO FIJO' || catUpper === 'ACTIVOS FIJOS') {
      emailRecipients.push('controlcuentas@logyser.com');
    } else if (catUpper === 'HERRAMIENTA' || catUpper === 'HERRAMIENTAS') {
      emailRecipients.push('controlcuentas@logyser.com');
    } else if (catUpper === 'DOTACION' || catUpper === 'DOTACIÓN') {
      emailRecipients.push('controlcuentas@logyser.com', 'auxiliarcompras@logyser.com', 'logyserinventarios@gmail.com');
    } else if (catUpper === 'EPP') {
      emailRecipients.push('sstadmon@logyser.com');
    }

    if (catUpper !== 'EPP') {
      emailRecipients.push('subgerenciaoperaciones@logyser.com');
    }

    // Disparar correo en segundo plano
    notificarConfirmacionInventario({
      operacion,
      categoria,
      mes,
      usuarioNombre: colaborador,
      emailUsuario: emailUsuario,
      pdfUrl,
      destinatarios: emailRecipients
    }).catch(mailErr => console.error('[inventario] Error enviando correo de confirmación:', mailErr));

    res.json({ ok: true, pdfUrl });
  } catch (err) {
    console.error('[inventario] POST /api/confirmar:', err);
    res.status(500).json({ error: err.message });
  }
});

// API para obtener el historial de confirmaciones de inventario
router.get('/api/confirmaciones', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    // Filtrar según operaciones permitidas del rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json([]);
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`operacion IN (${ph})`);
      params.push(...acceso.operacionesFiltro);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const query = `
      SELECT 
        c.id,
        c.area,
        c.periodo,
        c.usuario,
        u.Nombre AS usuarioNombre,
        c.observaciones,
        c.operacion,
        c.categoria,
        c.mes,
        c.fecha_confirmacion AS fechaConfirmacion,
        c.firma_url AS firmaUrl,
        c.pdf_url AS pdfUrl
      FROM Maestro_Confirmacion c
      LEFT JOIN Maestro_Usuarios u ON c.usuario = u.ID
      ${where}
      ORDER BY c.fecha_confirmacion DESC
    `;

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[inventario] GET /api/confirmaciones:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const pool = require('../services/db');
const { obtenerFirmaBase64Reciente, obtenerUrlFirmaReciente, subirFirma, subirPDFConfirmacionInventario, storage } = require('../services/storage');
const { notificarConfirmacionInventario, notificarTransferenciaDespachada, notificarTransferenciaRecibida } = require('../services/email');
const { generarPDF } = require('../services/renderer');
const { computarAccesoInventario, agruparOperacionesPorRegional } = require('../services/accesoInventario');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const HTML_PATH = path.join(__dirname, '../views/inventario/index.html');

const ROLES_SIN_FILTRO = [
  'AdmSst', 'Archivo', 'Calidad', 'Contabilidad', 'Control',
  'Cuentas', 'Facturación', 'Juridica', 'Jurídica', 'Nomina', 'Nómina', 'LiderSst',
  'Sistema', 'Dirección RRHH'
];
const ROLES_REGIONAL = ['AuxiliarR', 'CoordinadorR'];
const ROLES_MODALIDAD = ['AnaSst'];
const ROLES_EXCLUIDOS = ['Generalista', 'Selección Centro', 'Selección', 'Contratación'];

// Resuelve los correos de Auxiliar/Coordinador/AuxiliarR/CoordinadorR responsables de una
// Operación destino (para notificaciones de transferencia de Kardex). Si no hay nadie asignado
// puntualmente a esa Operación, cae a AuxiliarR/CoordinadorR de la Regional (misma lógica que
// obtenerCcEmails en logysignScheduler.js).
async function resolverDestinatariosTransferencia(operacionDestino, regionalDestino) {
  const emails = [];
  try {
    if (operacionDestino) {
      const [opRows] = await pool.execute(
        'SELECT Email FROM Maestro_Usuarios WHERE `Operación` = ? AND Rol IN ("Auxiliar", "Coordinador", "AuxiliarR", "CoordinadorR") AND Email IS NOT NULL AND Email != ""',
        [operacionDestino]
      );
      opRows.forEach(r => emails.push(r.Email));
    }
    if (!emails.length && regionalDestino) {
      const [regRows] = await pool.execute(
        'SELECT Email FROM Maestro_Usuarios WHERE Regional = ? AND Rol IN ("AuxiliarR", "CoordinadorR") AND Email IS NOT NULL AND Email != ""',
        [regionalDestino]
      );
      regRows.forEach(r => emails.push(r.Email));
    }
  } catch (err) {
    console.error('[inventario] Error resolviendo destinatarios de transferencia:', err.message);
  }
  return [...new Set(emails.filter(Boolean).map(e => e.trim()))];
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
    const { usuario, regional, operacion, clasificacion, categoria, search } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = [];
    const securityParams = [];

    // Restringir categorías si aplica (Acceso 4, 5, 6)
    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`\`Categoria\` IN (${ph})`);
      securityParams.push(...acceso.filtroCategorias);
    }

    // Security filter based on role/permissions
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [], counts: { regionales: {}, operaciones: {}, clasificaciones: {}, categorias: {} } });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`\`Operacion\` IN (${ph})`);
      securityParams.push(...acceso.operacionesFiltro);
    }

    // Build filter objects
    const fReg = regional ? { cond: '`Regional` = ?', param: regional } : null;
    const fOp = operacion ? { cond: '`Operacion` = ?', param: operacion } : null;
    const fCls = clasificacion ? { cond: '`Clasificación` = ?', param: clasificacion } : null;
    const fCat = categoria ? { cond: '`Categoria` = ?', param: categoria } : null;
    const fSearch = search ? { cond: '(`Articulo` LIKE ? OR `Referencia` LIKE ?)', param: `%${search}%` } : null;

    // Helper to join filters safely
    const buildWhere = (filtersList) => {
      const c = [...securityConds];
      const p = [...securityParams];
      filtersList.forEach(f => {
        if (f) {
          c.push(f.cond);
          if (f.cond.includes('LIKE')) {
            p.push(f.param, f.param);
          } else {
            p.push(f.param);
          }
        }
      });
      return {
        where: c.length ? `WHERE ${c.join(' AND ')}` : '',
        params: p
      };
    };

    // 1. Fetch filtered items (limit 500 rows for speed)
    const listFilter = buildWhere([fReg, fOp, fCls, fCat, fSearch]);
    const listQuery = `
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
        \`Observaciones\` AS \`Observaciones\`,
        \`Placa\` AS \`Placa\`
      FROM Vista_Inventario
      ${listFilter.where}
      ORDER BY Regional, Operacion, Articulo
      LIMIT 500
    `;
    // 1. Prepare parallel queries for items, faceted counts, and consolidated stats
    const cReg = buildWhere([fOp, fCls, fCat, fSearch]);
    const cOp = buildWhere([fReg, fCls, fCat, fSearch]);
    const cCls = buildWhere([fReg, fOp, fCat, fSearch]);
    const cCat = buildWhere([fReg, fOp, fCls, fSearch]);

    const statsQuery = `
      SELECT 
        COUNT(DISTINCT \`IdArticulo\`) AS distinctArticles,
        SUM(\`Stock Disponible\`) AS totalStock,
        SUM(\`Valor Stock\`) AS totalValue
      FROM Vista_Inventario
      ${listFilter.where}
    `;

    const [
      [results],
      [regRows],
      [opRows],
      [clsRows],
      [catRows],
      [[statsRow]]
    ] = await Promise.all([
      pool.execute(listQuery, listFilter.params),
      pool.execute(`SELECT \`Regional\`, IFNULL(SUM(\`Stock Disponible\`), 0) as total FROM Vista_Inventario ${cReg.where} GROUP BY \`Regional\``, cReg.params),
      pool.execute(`SELECT \`Operacion\`, IFNULL(SUM(\`Stock Disponible\`), 0) as total FROM Vista_Inventario ${cOp.where} GROUP BY \`Operacion\``, cOp.params),
      pool.execute(`SELECT \`Clasificación\` AS Clasificacion, IFNULL(SUM(\`Stock Disponible\`), 0) as total FROM Vista_Inventario ${cCls.where} GROUP BY \`Clasificación\``, cCls.params),
      pool.execute(`SELECT \`Categoria\`, IFNULL(SUM(\`Stock Disponible\`), 0) as total FROM Vista_Inventario ${cCat.where} GROUP BY \`Categoria\``, cCat.params),
      pool.execute(statsQuery, listFilter.params)
    ]);

    const regCounts = {};
    regRows.forEach(r => { if (r.Regional !== null) regCounts[r.Regional] = Number(r.total); });

    const opCounts = {};
    opRows.forEach(r => { if (r.Operacion !== null) opCounts[r.Operacion] = Number(r.total); });

    const clsCounts = {};
    clsRows.forEach(r => { if (r.Clasificacion !== null) clsCounts[r.Clasificacion] = Number(r.total); });

    const catCounts = {};
    catRows.forEach(r => { if (r.Categoria !== null) catCounts[r.Categoria] = Number(r.total); });

    const stats = statsRow || {};

    res.json({
      results,
      counts: {
        regionales: regCounts,
        operaciones: opCounts,
        clasificaciones: clsCounts,
        categorias: catCounts
      },
      stats: {
        distinctArticles: stats.distinctArticles || 0,
        totalStock: stats.totalStock || 0,
        totalValue: stats.totalValue || 0
      }
    });
  } catch (err) {
    console.error('[inventario] GET /api/datos:', err);
    res.status(500).json({ error: err.message });
  }
});

// API para actualizar la placa de un artículo
router.post('/api/placa', async (req, res) => {
  try {
    const { usuario, idArticulo, placa } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!idArticulo) {
      return res.status(400).json({ error: 'idArticulo es requerido' });
    }

    // Validar acceso del usuario
    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Validar que placa sea solo números o vacía
    if (placa && placa.trim() !== '' && !/^\d+$/.test(placa)) {
      return res.status(400).json({ error: 'La placa solo debe contener números' });
    }

    // Actualizar placa en la base de datos
    const [result] = await pool.execute(
      'UPDATE Dynamic_Articulos SET Placa = ? WHERE Id = ?',
      [placa && placa.trim() !== '' ? placa.trim() : null, idArticulo]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Artículo no encontrado en la base de datos' });
    }

    res.json({ success: true, message: 'Placa actualizada con éxito' });
  } catch (err) {
    console.error('[inventario] POST /api/placa:', err);
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

    let identificacion = null;
    if (colaborador) {
      // Buscar Identificación en Maestro_Segmentación
      const [segRows] = await pool.execute('SELECT Identificación FROM Maestro_Segmentación WHERE TRIM(Trabajador) = TRIM(?) LIMIT 1', [colaborador]);
      if (segRows.length > 0) {
        identificacion = segRows[0].Identificación;
      } else if (colaborador.includes('**')) {
        // Fallback robusto: extraer ID del texto '12345 ** NOMBRE'
        identificacion = colaborador.split('**')[0].trim();
      }
    }

    if (!identificacion) {
      return res.json({ identificacion: null, email, firmaUrl: null, firmaBase64: null });
    }

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

    // Validar acceso del usuario
    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado para confirmar inventario.' });
    }

    // Si el rol tiene categorías restringidas, verificar que la categoría elegida esté permitida
    if (acceso.filtroCategorias && !acceso.filtroCategorias.includes(categoria)) {
      return res.status(403).json({ error: `Su rol solo le permite confirmar las categorías: ${acceso.filtroCategorias.join(', ')}` });
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
      `SELECT Articulo, Talla, Referencia, Imagen, \`Stock Disponible\` AS StockDisponible
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
        const imgHtml = item.Imagen
          ? `<img src="${item.Imagen}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" alt="">`
          : `<span style="font-size: 1.2rem;">📦</span>`;
        itemsRowsHtml += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${idx + 1}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${imgHtml}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${item.Articulo || '—'}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.Referencia || 'S/N'}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.StockDisponible || 0}</td>
          </tr>
        `;
      });
    } else {
      itemsRowsHtml = `
        <tr>
          <td colspan="5" style="border: 1px solid #ddd; padding: 12px; text-align: center; color: #777;">
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
              <th style="border: 1px solid #ddd; padding: 8px; width: 8%; text-align: center;">ÍTEM</th>
              <th style="border: 1px solid #ddd; padding: 8px; width: 10%; text-align: center;">IMAGEN</th>
              <th style="border: 1px solid #ddd; padding: 8px; width: 47%; text-align: left;">DESCRIPCIÓN DEL ARTÍCULO</th>
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

    // 7. Obtener Prefijo para TipoDocumento = 86 y generar nombre del archivo
    let prefijo = 'ACTINV';
    try {
      const [docRows] = await pool.execute(
        'SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = 86 LIMIT 1'
      );
      if (docRows.length && docRows[0].Prefijo) {
        prefijo = docRows[0].Prefijo.trim();
      }
    } catch (errPrefijo) {
      console.warn('[inventario] Error consultando Prefijo Id 86:', errPrefijo.message);
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `${prefijo}.${timestamp}.pdf`;
    
    const pdfUrl = await subirPDFConfirmacionInventario(fileName, pdfBuffer);

    // 8. Insertar en Maestro_Confirmacion
    await pool.execute(
      `INSERT INTO Maestro_Confirmacion 
       (area, periodo, usuario, observaciones, operacion, categoria, mes, fecha_confirmacion, firma_url, pdf_url)
       VALUES ('Inventario', 'mensual', ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [usuario, observaciones || null, operacion, categoria, mes, signatureUrl, pdfUrl]
    );

    // 9. Obtener Regional de Maestro_Operaciones e insertar en Maestro_docEmpresa
    let regional = null;
    try {
      const [opRows] = await pool.execute(
        'SELECT `REGIONAL` FROM `Maestro_Operaciones` WHERE `OPERACIÓN` = ? LIMIT 1',
        [operacion]
      );
      if (opRows.length && opRows[0].REGIONAL) {
        regional = opRows[0].REGIONAL;
      }
    } catch (errOp) {
      console.warn('[inventario] Error consultando regional:', errOp.message);
    }

    const docEmpresaId = randomUUID();
    const obsClean = observaciones ? String(observaciones).substring(0, 512) : null;

    try {
      await pool.execute(
        `INSERT INTO \`Maestro_docEmpresa\` (
          \`id\`,
          \`Validación\`,
          \`Regional\`,
          \`Operación\`,
          \`TipoDocumento\`,
          \`Prefijo\`,
          \`Observaciones\`,
          \`Visualizar\`,
          \`Solicitud\`,
          \`Justificacion_Solicitud\`,
          \`FechaRegistro\`,
          \`Usuario\`,
          \`Url\`,
          \`Usuario_Solicitud\`,
          \`Estado_Solicitud\`
        ) VALUES (?, 'PEND', ?, ?, '86', ?, ?, NULL, NULL, NULL, NOW(), ?, ?, NULL, NULL)`,
        [
          docEmpresaId,
          regional,
          operacion,
          prefijo,
          obsClean,
          usuario,
          pdfUrl
        ]
      );
    } catch (errDocEmp) {
      console.error('[inventario] Error insertando en Maestro_docEmpresa:', errDocEmp);
    }

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
      emailRecipients.push('controlcuentas@logyser.com', 'auxiliarcompras@logyser.com');
    } else if (catUpper === 'EPP') {
      emailRecipients.push('sstadmon@logyser.com', 'analistasst@logyser.com');
    } else if (catUpper === 'PAPELERIA' || catUpper === 'PAPELERÍA') {
      emailRecipients.push('controlcuentas@logyser.com');
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

// API para obtener el historial de confirmaciones de inventario con filtros facetados
router.get('/api/confirmaciones', async (req, res) => {
  try {
    const { usuario, regional, operacion, periodo, categoria } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = [];
    const securityParams = [];

    // Restringir categorías si aplica (Acceso 4, 5, 6)
    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`c.categoria IN (${ph})`);
      securityParams.push(...acceso.filtroCategorias);
    }

    // Filtrar según operaciones permitidas del rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [], counts: { regionales: {}, operaciones: {}, periodos: {}, categorias: {} }, stats: { totalConfirmaciones: 0 } });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`c.operacion IN (${ph})`);
      securityParams.push(...acceso.operacionesFiltro);
    }

    // Build filters
    const fReg = regional ? { cond: `(SELECT DISTINCT o.REGIONAL FROM Maestro_Operaciones o WHERE o.OPERACIÓN = c.operacion LIMIT 1) = ?`, param: regional } : null;
    const fOp = operacion ? { cond: 'c.operacion = ?', param: operacion } : null;
    const fPer = periodo ? { cond: 'c.mes = ?', param: periodo } : null;
    const fCat = categoria ? { cond: 'c.categoria = ?', param: categoria } : null;

    const buildWhere = (filtersList) => {
      const c = [...securityConds];
      const p = [...securityParams];
      filtersList.forEach(f => {
        if (f) {
          c.push(f.cond);
          p.push(f.param);
        }
      });
      return {
        where: c.length ? `WHERE ${c.join(' AND ')}` : '',
        params: p
      };
    };

    // 1. Fetch filtered rows
    const listFilter = buildWhere([fReg, fOp, fPer, fCat]);
    const listQuery = `
      SELECT 
        c.id,
        c.area,
        c.periodo,
        c.usuario,
        u.Nombre AS usuarioNombre,
        c.observaciones,
        c.operacion,
        (SELECT DISTINCT o.REGIONAL FROM Maestro_Operaciones o WHERE o.OPERACIÓN = c.operacion LIMIT 1) AS regional,
        c.categoria,
        c.mes,
        c.fecha_confirmacion AS fechaConfirmacion,
        c.firma_url AS firmaUrl,
        c.pdf_url AS pdfUrl
      FROM Maestro_Confirmacion c
      LEFT JOIN Maestro_Usuarios u ON c.usuario = u.ID
      ${listFilter.where}
      ORDER BY c.fecha_confirmacion DESC
      LIMIT 500
    `;
    const [results] = await pool.execute(listQuery, listFilter.params);

    // 2. Faceted counts
    // regional count (exclude regional filter)
    const cReg = buildWhere([fOp, fPer, fCat]);
    const [regRows] = await pool.execute(`
      SELECT 
        (SELECT DISTINCT o.REGIONAL FROM Maestro_Operaciones o WHERE o.OPERACIÓN = c.operacion LIMIT 1) AS regional,
        COUNT(*) as total 
      FROM Maestro_Confirmacion c 
      ${cReg.where} 
      GROUP BY regional
    `, cReg.params);
    const regCounts = {};
    regRows.forEach(r => { if (r.regional !== null && r.regional !== undefined) regCounts[r.regional] = r.total; });

    // operacion count (exclude operacion filter)
    const cOp = buildWhere([fReg, fPer, fCat]);
    const [opRows] = await pool.execute(`
      SELECT c.operacion, COUNT(*) as total 
      FROM Maestro_Confirmacion c 
      ${cOp.where} 
      GROUP BY c.operacion
    `, cOp.params);
    const opCounts = {};
    opRows.forEach(r => { if (r.operacion !== null) opCounts[r.operacion] = r.total; });

    // periodo count (exclude periodo filter)
    const cPer = buildWhere([fReg, fOp, fCat]);
    const [perRows] = await pool.execute(`
      SELECT c.mes, COUNT(*) as total 
      FROM Maestro_Confirmacion c 
      ${cPer.where} 
      GROUP BY c.mes
    `, cPer.params);
    const perCounts = {};
    perRows.forEach(r => { if (r.mes !== null) perCounts[r.mes] = r.total; });

    // categoria count (exclude categoria filter)
    const cCat = buildWhere([fReg, fOp, fPer]);
    const [catRows] = await pool.execute(`
      SELECT c.categoria, COUNT(*) as total 
      FROM Maestro_Confirmacion c 
      ${cCat.where} 
      GROUP BY c.categoria
    `, cCat.params);
    const catCounts = {};
    catRows.forEach(r => { if (r.categoria !== null) catCounts[r.categoria] = r.total; });

    // 3. Consolidated stats
    const statsQuery = `
      SELECT COUNT(*) AS totalConfirmaciones
      FROM Maestro_Confirmacion c
      ${listFilter.where}
    `;
    const [[stats]] = await pool.execute(statsQuery, listFilter.params);

    res.json({
      results,
      counts: {
        regionales: regCounts,
        operaciones: opCounts,
        periodos: perCounts,
        categorias: catCounts
      },
      stats: {
        totalConfirmaciones: stats.totalConfirmaciones || 0
      }
    });

  } catch (err) {
    console.error('[inventario] GET /api/confirmaciones:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ENDPOINTS DE KARDEX INTEGRADOS
// ==========================================

router.get('/api/kardex/datos', async (req, res) => {
  try {
    const { usuario, regional, operacion, categoria, tipoMovimiento, idArticulo, search } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = [];
    const securityParams = [];

    // Restringir categorías si aplica (Acceso 4, 5, 6)
    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`k.\`Categoria\` IN (${ph})`);
      securityParams.push(...acceso.filtroCategorias);
    }

    // Security filter based on role/permissions
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [], counts: { regionales: {}, operaciones: {}, categorias: {}, movimientos: {} } });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`k.\`Operación\` IN (${ph})`);
      securityParams.push(...acceso.operacionesFiltro);
    }

    // Build filter objects
    const fReg = regional ? { cond: 'k.`Regional` = ?', param: regional } : null;
    const fOp = operacion ? { cond: 'k.`Operación` = ?', param: operacion } : null;
    const fCat = categoria ? { cond: 'k.`Categoria` = ?', param: categoria } : null;
    const fMov = tipoMovimiento ? { cond: 'k.`TipoMovimiento` = ?', param: tipoMovimiento } : null;
    const fIdArt = idArticulo ? { cond: 'k.`IdArticulo` = ?', param: idArticulo } : null;
    const fSearch = search ? { cond: '(a.Articulo LIKE ? OR a.Referencia LIKE ? OR k.UsuarioAsignado LIKE ? OR k.Acta LIKE ? OR k.Observaciones LIKE ? OR k.UsuarioRegistro LIKE ?)', param: `%${search}%` } : null;

    // Helper to join filters safely
    const buildKardexWhere = (filtersList) => {
      const c = [...securityConds];
      const p = [...securityParams];
      filtersList.forEach(f => {
        if (f) {
          c.push(f.cond);
          if (f.cond.includes('LIKE')) {
            p.push(f.param, f.param, f.param, f.param, f.param, f.param);
          } else {
            p.push(f.param);
          }
        }
      });
      return {
        where: c.length ? `WHERE ${c.join(' AND ')}` : '',
        params: p
      };
    };

    // 1. Fetch filtered items (limit 500 rows for speed)
    const listFilter = buildKardexWhere([fReg, fOp, fCat, fMov, fIdArt, fSearch]);
    const listQuery = `
      SELECT 
        k.IdKardex,
        k.FechaMovimiento,
        k.TipoMovimiento,
        k.Regional,
        k.\`Operación\` AS Operacion,
        k.\`OperaciónDestino\` AS OperacionDestino,
        k.Categoria,
        k.IdArticulo,
        a.Articulo,
        a.Referencia,
        a.Imagen,
        k.Cantidad,
        k.UsuarioAsignado,
        (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v
         WHERE v.\`Identificación\` = k.UsuarioAsignado
         ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1) AS TrabajadorAsignado,
        k.Acta,
        da.Url_Acta AS UrlActa,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones,
        k.FechaRegistro
      FROM Dynamic_Kardex k
      LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id
      LEFT JOIN Dynamic_Actas da ON da.IdActa = k.Acta
      ${listFilter.where}
      ORDER BY k.FechaRegistro DESC
      LIMIT 500
    `;
    // Prepare parallel queries for list, faceted counts, and consolidated stats
    const cReg = buildKardexWhere([fOp, fCat, fMov, fIdArt, fSearch]);
    const cOp = buildKardexWhere([fReg, fCat, fMov, fIdArt, fSearch]);
    const cCat = buildKardexWhere([fReg, fOp, fMov, fIdArt, fSearch]);
    const cMov = buildKardexWhere([fReg, fOp, fCat, fIdArt, fSearch]);

    const statsQuery = `
      SELECT 
        COUNT(*) AS totalMov,
        SUM(CASE WHEN k.Cantidad > 0 THEN 1 ELSE 0 END) AS totalEnt,
        SUM(CASE WHEN k.Cantidad < 0 THEN 1 ELSE 0 END) AS totalSal
      FROM Dynamic_Kardex k
      LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id
      ${listFilter.where}
    `;

    const [
      [results],
      [regRows],
      [opRows],
      [catRows],
      [movRows],
      [[statsRow]]
    ] = await Promise.all([
      pool.execute(listQuery, listFilter.params),
      pool.execute(`SELECT k.\`Regional\`, IFNULL(SUM(ABS(k.Cantidad)), 0) as total FROM Dynamic_Kardex k LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id ${cReg.where} GROUP BY k.\`Regional\``, cReg.params),
      pool.execute(`SELECT k.\`Operación\` AS Operacion, IFNULL(SUM(ABS(k.Cantidad)), 0) as total FROM Dynamic_Kardex k LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id ${cOp.where} GROUP BY k.\`Operación\``, cOp.params),
      pool.execute(`SELECT k.\`Categoria\`, IFNULL(SUM(ABS(k.Cantidad)), 0) as total FROM Dynamic_Kardex k LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id ${cCat.where} GROUP BY k.\`Categoria\``, cCat.params),
      pool.execute(`SELECT k.\`TipoMovimiento\`, IFNULL(SUM(ABS(k.Cantidad)), 0) as total FROM Dynamic_Kardex k LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id ${cMov.where} GROUP BY k.\`TipoMovimiento\``, cMov.params),
      pool.execute(statsQuery, listFilter.params)
    ]);

    const regCounts = {};
    regRows.forEach(r => { if (r.Regional !== null) regCounts[r.Regional] = Number(r.total); });

    const opCounts = {};
    opRows.forEach(r => { if (r.Operacion !== null) opCounts[r.Operacion] = Number(r.total); });

    const catCounts = {};
    catRows.forEach(r => { if (r.Categoria !== null) catCounts[r.Categoria] = Number(r.total); });

    const movCounts = {};
    movRows.forEach(r => { if (r.TipoMovimiento !== null) movCounts[r.TipoMovimiento] = Number(r.total); });

    const stats = statsRow || {};

    res.json({
      results,
      counts: {
        regionales: regCounts,
        operaciones: opCounts,
        categorias: catCounts,
        movimientos: movCounts
      },
      stats: {
        totalMov: stats.totalMov || 0,
        totalEnt: stats.totalEnt || 0,
        totalSal: stats.totalSal || 0
      }
    });
  } catch (err) {
    console.error('[inventario] GET /api/kardex/datos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API para devolver el historial de Kardex de un artículo específico
router.get('/api/kardex/articulo/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, regional, operacion } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = ['k.IdArticulo = ?'];
    const params = [id];

    // Filtro de seguridad por rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json([]);
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`k.\`Operación\` IN (${ph})`);
      params.push(...acceso.operacionesFiltro);
    }

    // Filtros adicionales por selección de UI
    if (regional) {
      conds.push('k.`Regional` = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('k.`Operación` = ?');
      params.push(operacion);
    }

    const where = conds.join(' AND ');
    const query = `
      SELECT 
        k.IdKardex,
        k.FechaMovimiento,
        k.TipoMovimiento,
        k.Regional,
        k.\`Operación\` AS Operacion,
        k.\`OperaciónDestino\` AS OperacionDestino,
        k.Categoria,
        k.Cantidad,
        k.UsuarioAsignado,
        (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v
         WHERE v.\`Identificación\` = k.UsuarioAsignado
         ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1) AS TrabajadorAsignado,
        k.Acta,
        da.Url_Acta AS UrlActa,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones,
        k.FechaRegistro
      FROM Dynamic_Kardex k
      LEFT JOIN Dynamic_Actas da ON da.IdActa = k.Acta
      WHERE ${where}
      ORDER BY k.FechaMovimiento DESC, k.FechaRegistro DESC
    `;

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[inventario] GET /api/kardex/articulo/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kardex/eliminar - Elimina uno o más registros de Kardex (sólo Inventario o Sistema)
router.post('/api/kardex/eliminar', async (req, res) => {
  try {
    const { usuario, ids } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!ids || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids (array) es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso || (acceso.rol !== 'Inventario' && acceso.rol !== 'Sistema')) {
      return res.status(403).json({ error: 'No autorizado. Permisos exclusivos de Inventario o Sistema.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const query = `DELETE FROM Dynamic_Kardex WHERE IdKardex IN (${placeholders})`;
    await pool.execute(query, ids);

    res.json({ success: true, message: `${ids.length} registro(s) eliminado(s) exitosamente.` });
  } catch (err) {
    console.error('[inventario] POST /api/kardex/eliminar error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kardex/editar - Edita un registro de Kardex (sólo Inventario o Sistema)
router.post('/api/kardex/editar', async (req, res) => {
  try {
    const {
      usuario,
      IdKardex,
      FechaMovimiento,
      TipoMovimiento,
      Regional,
      Operacion, // mapped to `Operación`
      OperacionDestino, // mapped to `OperaciónDestino`
      Categoria,
      IdArticulo,
      Cantidad,
      UsuarioAsignado,
      Acta,
      ValorUnitario,
      Observaciones
    } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!IdKardex) {
      return res.status(400).json({ error: 'IdKardex es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso || (acceso.rol !== 'Inventario' && acceso.rol !== 'Sistema')) {
      return res.status(403).json({ error: 'No autorizado. Permisos exclusivos de Inventario o Sistema.' });
    }

    const query = `
      UPDATE Dynamic_Kardex 
      SET 
        FechaMovimiento = ?,
        TipoMovimiento = ?,
        Regional = ?,
        \`Operación\` = ?,
        \`OperaciónDestino\` = ?,
        Categoria = ?,
        IdArticulo = ?,
        Cantidad = ?,
        UsuarioAsignado = ?,
        Acta = ?,
        ValorUnitario = ?,
        Observaciones = ?
      WHERE IdKardex = ?
    `;

    const params = [
      FechaMovimiento,
      TipoMovimiento,
      Regional,
      Operacion,
      OperacionDestino || null,
      Categoria,
      parseInt(IdArticulo) || 0,
      parseInt(Cantidad) || 0,
      UsuarioAsignado || null,
      Acta || null,
      parseFloat(ValorUnitario) || 0,
      Observaciones || null,
      IdKardex
    ];

    await pool.execute(query, params);
    res.json({ success: true, message: 'Registro de Kardex actualizado exitosamente.' });
  } catch (err) {
    console.error('[inventario] POST /api/kardex/editar error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PESTAÑA ARTICULOS: APIS
// ==========================================

// 1. GET /api/articulos/datos - Obtiene artículos con filtros y conteos facetados
router.get('/api/articulos/datos', async (req, res) => {
  try {
    const { usuario, categoria, clasificacion, search } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    // Restringir categorías si aplica (Acceso 4, 5, 6)
    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      conds.push(`a.Categoria IN (${ph})`);
      params.push(...acceso.filtroCategorias);
    }

    // Filters
    if (categoria) {
      conds.push('a.Categoria = ?');
      params.push(categoria);
    }
    if (clasificacion) {
      conds.push('a.ClaseArticulo = ?');
      params.push(clasificacion);
    }
    if (search) {
      conds.push('(a.Articulo LIKE ? OR a.Referencia LIKE ? OR a.Elemento LIKE ? OR CAST(a.Id AS CHAR) LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const listQuery = `
      SELECT 
        Id,
        Imagen,
        Elemento,
        Talla,
        Referencia,
        Articulo,
        a.Categoria,
        Proveedor,
        Costo,
        \`Fecha Registro\` AS fechaRegistro,
        Usuario,
        ClaseArticulo,
        Placa,
        cci.Condicion,
        (SELECT IFNULL(SUM(k.Cantidad), 0) FROM Dynamic_Kardex k WHERE k.IdArticulo = a.Id) AS Stock,
        (SELECT COUNT(*) FROM Dynamic_Kardex k WHERE k.IdArticulo = a.Id) AS KardexCount,
        (SELECT COUNT(DISTINCT i.IdActa) FROM Dynamic_Actas_Items i WHERE i.IdArticulo = a.Id) AS ActasCount
      FROM Dynamic_Articulos a
      LEFT JOIN Config_Categoria_Inventario cci ON cci.Categoria = a.Categoria
      ${where}
      ORDER BY Id DESC
      LIMIT 500
    `;

    // Faceted Counts
    // Categoria count
    const condsCat = [];
    const paramsCat = [];
    if (clasificacion) { condsCat.push('ClaseArticulo = ?'); paramsCat.push(clasificacion); }
    if (search) { condsCat.push('(Articulo LIKE ? OR Referencia LIKE ? OR Elemento LIKE ?)'); paramsCat.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const whereCat = condsCat.length ? `WHERE ${condsCat.join(' AND ')}` : '';

    // ClaseArticulo count
    const condsCls = [];
    const paramsCls = [];
    if (categoria) { condsCls.push('Categoria = ?'); paramsCls.push(categoria); }
    if (search) { condsCls.push('(Articulo LIKE ? OR Referencia LIKE ? OR Elemento LIKE ?)'); paramsCls.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const whereCls = condsCls.length ? `WHERE ${condsCls.join(' AND ')}` : '';

    const [
      [results],
      [catRows],
      [clsRows]
    ] = await Promise.all([
      pool.execute(listQuery, params),
      pool.execute(`SELECT Categoria, IFNULL(SUM((SELECT IFNULL(SUM(Cantidad), 0) FROM Dynamic_Kardex WHERE IdArticulo = Dynamic_Articulos.Id)), 0) as total FROM Dynamic_Articulos ${whereCat} GROUP BY Categoria`, paramsCat),
      pool.execute(`SELECT ClaseArticulo, IFNULL(SUM((SELECT IFNULL(SUM(Cantidad), 0) FROM Dynamic_Kardex WHERE IdArticulo = Dynamic_Articulos.Id)), 0) as total FROM Dynamic_Articulos ${whereCls} GROUP BY ClaseArticulo`, paramsCls)
    ]);

    const catCounts = {};
    catRows.forEach(r => { if (r.Categoria) catCounts[r.Categoria] = Number(r.total); });

    const clsCounts = {};
    clsRows.forEach(r => { if (r.ClaseArticulo) clsCounts[r.ClaseArticulo] = Number(r.total); });

    res.json({
      results,
      counts: {
        categorias: catCounts,
        clasificaciones: clsCounts
      }
    });

  } catch (err) {
    console.error('[inventario] GET /api/articulos/datos:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/articulos/guardar - Crear o Editar un Artículo (Solo Operación Administración)
router.post('/api/articulos/guardar', upload.single('imagenArchivo'), async (req, res) => {
  try {
    const { usuario, id, imagen, elemento, talla, referencia, categoria, proveedor, costo, claseArticulo, placa } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const cleanElemento = elemento ? elemento.trim().toUpperCase() : null;
    const cleanClase = claseArticulo ? claseArticulo.trim().toUpperCase() : null;

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Verificar si pertenece a la Operación Administracion o tiene Rol AuxiliarR/Auxiliar
    const opUpper = (acceso.operacion || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const esAdministracion = opUpper === 'ADMINISTRACION' || ['AuxiliarR', 'Auxiliar'].includes(acceso.rol);
    if (!esAdministracion) {
      return res.status(403).json({ error: 'Solo los usuarios de la Operación Administración o con Rol AuxiliarR/Auxiliar pueden gestionar artículos.' });
    }

    // Placa solo aplica cuando la Condicion de la Categoria es 'Recuperable' (Config_Categoria_Inventario).
    // Se ignora cualquier valor recibido para otras condiciones, para que no sea bypasseable desde la API.
    let placaFinal = placa || null;
    if (placaFinal) {
      const [[catRow]] = await pool.execute(
        'SELECT Condicion FROM Config_Categoria_Inventario WHERE Categoria = ? LIMIT 1',
        [categoria || null]
      );
      if (!catRow || catRow.Condicion !== 'Recuperable') {
        placaFinal = null;
      }
    }

    let publicUrl = imagen || null;

    if (id && req.file) {
      const bucketName = 'logyser-recursos-corporativos';
      const prefix = 'image-articulos/';
      const ext = path.extname(req.file.originalname) || '.png';
      const fileName = `${id}${ext}`;
      const fullPath = `${prefix}${fileName}`;

      const gcsFile = storage.bucket(bucketName).file(fullPath);
      await gcsFile.save(req.file.buffer, {
        contentType: req.file.mimetype,
        public: true
      });
      publicUrl = `https://storage.googleapis.com/${bucketName}/${fullPath}`;
    }

    if (id) {
      // Editar
      const query = `
        UPDATE Dynamic_Articulos SET
          Imagen = ?,
          Elemento = ?,
          Talla = ?,
          Referencia = ?,
          Categoria = ?,
          Proveedor = ?,
          Costo = ?,
          ClaseArticulo = ?,
          Placa = ?
        WHERE Id = ?
      `;
      const params = [
        publicUrl,
        cleanElemento,
        talla || null,
        referencia || null,
        categoria || null,
        proveedor || null,
        costo ? parseFloat(costo) : null,
        cleanClase,
        placaFinal,
        parseInt(id)
      ];
      await pool.execute(query, params);
      res.json({ success: true, message: 'Artículo actualizado exitosamente.', url: publicUrl });
    } else {
      // Crear
      const query = `
        INSERT INTO Dynamic_Articulos 
        (Imagen, Elemento, Talla, Referencia, Categoria, Proveedor, Costo, \`Fecha Registro\`, Usuario, ClaseArticulo, Placa)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
      `;
      const params = [
        publicUrl,
        cleanElemento,
        talla || null,
        referencia || null,
        categoria || null,
        proveedor || null,
        costo ? parseFloat(costo) : null,
        acceso.usuarioNombre,
        cleanClase,
        placaFinal
      ];
      await pool.execute(query, params);
      res.json({ success: true, message: 'Artículo creado exitosamente.' });
    }
  } catch (err) {
    console.error('[inventario] POST /api/articulos/guardar error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/articulos/guardar-masivo - Guardar múltiples artículos a la vez (Solo Operación Administración)
router.post('/api/articulos/guardar-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario, articulos } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!Array.isArray(articulos) || articulos.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos un artículo para guardar' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Verificar si pertenece a la Operación Administracion o tiene Rol AuxiliarR/Auxiliar
    const opUpper = (acceso.operacion || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const esAdministracion = opUpper === 'ADMINISTRACION' || ['AuxiliarR', 'Auxiliar'].includes(acceso.rol);
    if (!esAdministracion) {
      return res.status(403).json({ error: 'Solo los usuarios de la Operación Administración o con Rol AuxiliarR/Auxiliar pueden gestionar artículos.' });
    }

    await conn.beginTransaction();

    const insertQuery = `
      INSERT INTO Dynamic_Articulos 
      (Imagen, Elemento, Talla, Referencia, Categoria, Proveedor, Costo, \`Fecha Registro\`, Usuario, ClaseArticulo, Placa)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
    `;

    for (const art of articulos) {
      if (!art.elemento || !art.elemento.trim()) {
        throw new Error('El campo Elemento es obligatorio en todos los registros.');
      }
      
      const cleanElemento = art.elemento.trim().toUpperCase();
      const cleanClase = art.claseArticulo ? art.claseArticulo.trim().toUpperCase() : null;

      const params = [
        art.imagen || null,
        cleanElemento,
        art.talla || null,
        art.referencia || null,
        art.categoria || null,
        art.proveedor || null,
        art.costo ? parseFloat(art.costo) : null,
        acceso.usuarioNombre,
        cleanClase,
        art.placa || null
      ];
      await conn.execute(insertQuery, params);
    }

    await conn.commit();
    res.json({ success: true, message: `${articulos.length} artículos guardados exitosamente en la base de datos.` });

  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/articulos/guardar-masivo error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// 4. POST /api/articulos/eliminar - Eliminar artículos de forma masiva (Solo Rol Inventario o Sistema)
router.post('/api/articulos/eliminar', async (req, res) => {
  try {
    const { usuario, ids } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    if (!ids || !ids.length) {
      return res.status(400).json({ error: 'No se especificaron IDs para eliminar' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Verificar si el rol es Inventario o Sistema
    if (acceso.rol !== 'Inventario' && acceso.rol !== 'Sistema') {
      return res.status(403).json({ error: 'Solo los usuarios con Rol Inventario o Sistema pueden eliminar artículos.' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const query = `DELETE FROM Dynamic_Articulos WHERE Id IN (${placeholders})`;
    await pool.execute(query, ids.map(id => parseInt(id)));

    res.json({ success: true, message: `${ids.length} artículos eliminados exitosamente.` });
  } catch (err) {
    console.error('[inventario] POST /api/articulos/eliminar error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/articulos/stock/:id - Obtiene el stock por regional/operación para la ventana emergente
router.get('/api/articulos/stock/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const query = `
      SELECT 
        \`Regional\` AS regional, 
        \`Operacion\` AS operacion, 
        \`Stock Disponible\` AS stock
      FROM Vista_Inventario
      WHERE IdArticulo = ? AND \`Stock Disponible\` > 0
      ORDER BY \`Regional\`, \`Operacion\`
    `;
    const [rows] = await pool.execute(query, [parseInt(id) || 0]);
    res.json(rows);
  } catch (err) {
    console.error('[inventario] GET /api/articulos/stock error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5b. GET /api/articulos/:id/actas - Actas de Entrega que han usado este artículo (Dynamic_Actas_Items)
router.get('/api/articulos/:id/actas', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'ArtÍculos');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const query = `
      SELECT DISTINCT da.IdActa, da.operacion AS Operacion, da.Fecha_Entrega AS FechaEntrega, da.Url_Acta AS UrlActa,
        da.identificacion AS Identificacion,
        COALESCE(
          (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v WHERE v.\`Identificación\` = da.identificacion ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1),
          (SELECT s.Trabajador FROM \`Maestro_Segmentación\` s WHERE s.\`Identificación\` = da.identificacion LIMIT 1)
        ) AS Trabajador
      FROM Dynamic_Actas_Items i
      JOIN Dynamic_Actas da ON da.IdActa = i.IdActa
      WHERE i.IdArticulo = ?
      ORDER BY da.Fecha_Entrega DESC
    `;
    const [rows] = await pool.execute(query, [parseInt(id) || 0]);
    res.json(rows);
  } catch (err) {
    console.error('[inventario] GET /api/articulos/:id/actas error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/articulos/elementos - Obtiene los elementos únicos y sus imágenes
router.get('/api/articulos/elementos', async (req, res) => {
  try {
    const [uniqueElements] = await pool.execute(`
      SELECT Elemento, COUNT(*) AS total, MAX(Categoria) AS Categoria, MAX(ClaseArticulo) AS ClaseArticulo
      FROM Dynamic_Articulos 
      GROUP BY Elemento 
      ORDER BY Elemento
    `);

    const [allImages] = await pool.execute(`
      SELECT Elemento, Imagen, \`Fecha Registro\` AS fechaRegistro 
      FROM Dynamic_Articulos 
      WHERE Imagen IS NOT NULL AND Imagen != ''
      ORDER BY Elemento, \`Fecha Registro\` DESC, Id DESC
    `);

    const elementImagesMap = {};
    allImages.forEach(row => {
      if (!elementImagesMap[row.Elemento]) {
        elementImagesMap[row.Elemento] = [];
      }
      elementImagesMap[row.Elemento].push({
        url: row.Imagen,
        fecha: row.fechaRegistro
      });
    });

    const results = uniqueElements.map(el => {
      const imagesList = elementImagesMap[el.Elemento] || [];
      const distinctUrls = [...new Set(imagesList.map(img => img.url))];
      
      let sugerencia = null;
      let tieneMultiplesUrls = distinctUrls.length > 1;

      if (imagesList.length > 0) {
        sugerencia = imagesList[0].url;
      }

      return {
        elemento: el.Elemento,
        total: el.total,
        categoria: el.Categoria || 'OTRO',
        claseArticulo: el.ClaseArticulo || 'OTRO',
        imagen: distinctUrls.length === 1 ? distinctUrls[0] : (sugerencia || null),
        tieneMultiplesUrls,
        distinctCount: distinctUrls.length,
        sugerencia
      };
    });

    res.json({ results });
  } catch (err) {
    console.error('[inventario] GET /api/articulos/elementos error:', err);
    res.status(500).json({ error: 'Error al obtener los elementos únicos' });
  }
});

// 7. POST /api/articulos/elementos/guardar-imagen - Sube una imagen a GCS y la asocia a todos los registros del Elemento
router.post('/api/articulos/elementos/guardar-imagen', upload.single('imagen'), async (req, res) => {
  try {
    const { elemento } = req.body;
    const file = req.file;

    if (!elemento || !elemento.trim()) {
      return res.status(400).json({ error: 'El nombre del elemento es requerido.' });
    }
    if (!file) {
      return res.status(400).json({ error: 'Debe cargar un archivo de imagen.' });
    }

    const bucketName = 'logyser-recursos-corporativos';
    const prefix = 'image-articulos/';
    const ext = path.extname(file.originalname) || '.png';
    const cleanElementoName = elemento.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const timestamp = Date.now();
    const fileName = `${cleanElementoName}_${timestamp}${ext}`;
    const fullPath = `${prefix}${fileName}`;

    const gcsFile = storage.bucket(bucketName).file(fullPath);
    await gcsFile.save(file.buffer, {
      contentType: file.mimetype,
      public: true
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fullPath}`;

    // Actualizar todos los registros de ese elemento
    await pool.execute(
      'UPDATE Dynamic_Articulos SET Imagen = ? WHERE Elemento = ?',
      [publicUrl, elemento.trim()]
    );

    res.json({
      message: `Imagen subida y asociada a todos los registros de "${elemento.trim()}" exitosamente.`,
      url: publicUrl
    });
  } catch (err) {
    console.error('[inventario] POST /api/articulos/elementos/guardar-imagen error:', err);
    res.status(500).json({ error: 'Error al subir la imagen y asociar al elemento' });
  }
});

// 8. POST /api/articulos/elementos/aplicar-sugerencia - Aplica la imagen sugerida a todos los registros del Elemento
router.post('/api/articulos/elementos/aplicar-sugerencia', async (req, res) => {
  try {
    const { elemento } = req.body;
    if (!elemento || !elemento.trim()) {
      return res.status(400).json({ error: 'El nombre del elemento es requerido.' });
    }

    const [rows] = await pool.execute(`
      SELECT Imagen FROM Dynamic_Articulos 
      WHERE Elemento = ? AND Imagen IS NOT NULL AND Imagen != ''
      ORDER BY \`Fecha Registro\` DESC, Id DESC
      LIMIT 1
    `, [elemento.trim()]);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No se encontraron imágenes registradas para este elemento.' });
    }

    const mostRecentUrl = rows[0].Imagen;

    await pool.execute(
      'UPDATE Dynamic_Articulos SET Imagen = ? WHERE Elemento = ?',
      [mostRecentUrl, elemento.trim()]
    );

    res.json({
      message: `Sugerencia aplicada: Se asignó la imagen más reciente a todos los registros de "${elemento.trim()}".`,
      url: mostRecentUrl
    });
  } catch (err) {
    console.error('[inventario] POST /api/articulos/elementos/aplicar-sugerencia error:', err);
    res.status(500).json({ error: 'Error al aplicar la sugerencia de imagen' });
  }
});

// GET /api/categorias - Obtiene todas las categorías de Config_Categoria_Inventario
router.get('/api/categorias', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT DISTINCT Categoria FROM Config_Categoria_Inventario WHERE Categoria IS NOT NULL ORDER BY Categoria');
    const categories = rows.map(r => r.Categoria);
    res.json({ categories });
  } catch (err) {
    console.error('[inventario] GET /api/categorias error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// KARDEX MASIVO & PENDIENTE POR RECIBIR ENDPOINTS
// ==========================================

// GET /api/kardex-lookups - returns articles, operations, regionals, categories
// Regional/Operación se filtran según el acceso de Kardex del Rol del usuario (computarAccesoInventario).
router.get('/api/kardex-lookups', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoInventario(usuario, 'Kardex');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [artRows] = await pool.execute('SELECT Id, Articulo, Categoria, Costo FROM Dynamic_Articulos ORDER BY Articulo');
    const [opRows] = await pool.execute("SELECT DISTINCT `OPERACIÓN` AS operacion, REGIONAL AS regional FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY `OPERACIÓN`");
    const [regRows] = await pool.execute("SELECT DISTINCT Regional FROM Config_Regionales WHERE Operacion_Principal IS NOT NULL AND Operacion_Principal != '' ORDER BY Regional");
    const [catRows] = await pool.execute("SELECT DISTINCT Categoria FROM Config_Categoria_Inventario WHERE (Condicion != 'No aplica' OR Condicion IS NULL) AND Categoria IS NOT NULL ORDER BY Categoria");

    let operaciones = opRows;
    let regionales = regRows.map(r => r.Regional);

    if (!acceso.sinFiltro) {
      const operacionesPermitidas = new Set(acceso.operacionesFiltro);
      operaciones = opRows.filter(o => operacionesPermitidas.has(o.operacion));
      const regionalesPermitidos = new Set(Object.keys(acceso.opsPorRegional));
      regionales = regionales.filter(r => regionalesPermitidos.has(r));
    }

    res.json({
      articulos: artRows,
      operaciones,
      regionales,
      // Lista completa (sin restringir por el acceso de origen del usuario), para poblar la
      // Operación Destino de una TRANSFERENCIA: cualquier usuario puede transferir a cualquier
      // operación de su misma Regional, aunque su acceso de origen esté limitado a una sola.
      operacionesTodas: opRows,
      categorias: catRows.map(c => c.Categoria)
    });
  } catch (err) {
    console.error('[inventario] GET /api/kardex-lookups error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// KARDEX MASIVO & PENDIENTE POR RECIBIR ENDPOINTS
// ==========================================

/**
 * Genera el PDF del Acta de Ingreso y verificación de inventario (Id 87 / INVREC),
 * lo sube a Google Cloud Storage y registra el documento en Maestro_docEmpresa.
 */
async function generarYGuardarActaRecepcionTransferencia({
  order,
  items,
  usuarioReceptor,
  colaboradorReceptor,
  identificacionReceptor,
  signatureBase64,
  observacionesGenerales
}) {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const fechaDespachoStr = order.FechaDespacho ? new Date(order.FechaDespacho).toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  const fechaRecepcionStr = now.toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Consultar nombre del colaborador que despachó si es posible
  let colaboradorDespacha = order.UsuarioDespacha || '—';
  try {
    const [dRows] = await pool.execute(
      'SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [order.UsuarioDespacha]
    );
    if (dRows.length && dRows[0].Colaborador) {
      colaboradorDespacha = `${dRows[0].Colaborador} (${order.UsuarioDespacha})`;
    }
  } catch (errDisp) {
    console.warn('[inventario] Error consultando despachador:', errDisp.message);
  }

  // Agrupar los artículos por UsuarioAsignado (el colaborador al que quedó asignado cada uno),
  // dando prioridad a esa columna sobre el orden plano de llegada. Sin asignación -> grupo aparte.
  const SIN_ASIGNAR_KEY = '__SIN_ASIGNAR__';
  const gruposMap = new Map();
  items.forEach(item => {
    const key = (item.UsuarioAsignado && String(item.UsuarioAsignado).trim()) || SIN_ASIGNAR_KEY;
    if (!gruposMap.has(key)) gruposMap.set(key, []);
    gruposMap.get(key).push(item);
  });

  // Resolver el nombre del trabajador por cada Identificación asignada (Maestro_Vinculación,
  // misma vinculación-más-reciente-gana que se usa en el resto del módulo).
  const nombresAsignados = {};
  for (const key of gruposMap.keys()) {
    if (key === SIN_ASIGNAR_KEY) continue;
    try {
      const [[vRow]] = await pool.execute(
        'SELECT Trabajador FROM `Maestro_Vinculación` WHERE `Identificación` = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
        [key]
      );
      nombresAsignados[key] = (vRow && vRow.Trabajador) || key;
    } catch (errNom) {
      console.warn('[inventario] Error resolviendo nombre de asignado:', errNom.message);
      nombresAsignados[key] = key;
    }
  }

  const gruposOrdenados = Array.from(gruposMap.keys()).sort((a, b) => {
    if (a === SIN_ASIGNAR_KEY) return 1;
    if (b === SIN_ASIGNAR_KEY) return -1;
    return String(nombresAsignados[a] || a).localeCompare(String(nombresAsignados[b] || b));
  });

  // Filas de la tabla de artículos, agrupadas por trabajador asignado
  let itemsRowsHtml = '';
  let totalUnidadesEnviadas = 0;
  let totalUnidadesRecibidas = 0;
  let totalUnidadesDevueltas = 0;
  let itemCounter = 0;

  gruposOrdenados.forEach(key => {
    const grupoLabel = key === SIN_ASIGNAR_KEY ? 'Sin trabajador asignado' : (nombresAsignados[key] || key);
    itemsRowsHtml += `
      <tr style="background-color: #dbeafe;">
        <td colspan="8" style="border: 1px solid #ddd; padding: 6px 8px; font-weight: bold; color: #1e3c72; font-size: 8.5pt;">👤 ${grupoLabel}</td>
      </tr>
    `;

    gruposMap.get(key).forEach(item => {
      itemCounter++;
      const cantEnviada = item.CantidadDespachada !== undefined ? Number(item.CantidadDespachada) : Math.abs(Number(item.Cantidad) || 0);
      const cantRecibida = item.CantidadRecibida !== undefined ? Number(item.CantidadRecibida) : cantEnviada;
      const cantDevuelta = item.CantidadDevuelta !== undefined ? Number(item.CantidadDevuelta) : Math.max(0, cantEnviada - cantRecibida);

      totalUnidadesEnviadas += cantEnviada;
      totalUnidadesRecibidas += cantRecibida;
      totalUnidadesDevueltas += cantDevuelta;

      const novedadItem = item.Novedad
        ? `<span style="color: #c2410c; font-weight: bold;">⚠️ ${item.Novedad}</span>`
        : (cantDevuelta > 0 ? `<span style="color: #dc2626; font-weight: bold;">⚠️ Incompleto (-${cantDevuelta})</span>` : '<span style="color: #16a34a;">Conforme</span>');

      const imgHtml = item.Imagen
        ? `<img src="${item.Imagen}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;" alt="">`
        : `<span style="font-size: 1.2rem;">📦</span>`;

      const devueltoHtml = cantDevuelta > 0
        ? `<span style="color: #dc2626; font-weight: bold;">-${cantDevuelta} (Retornado)</span>`
        : `<span style="color: #64748b;">0</span>`;

      itemsRowsHtml += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle;">${itemCounter}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle;">${imgHtml}</td>
          <td style="border: 1px solid #ddd; padding: 6px; vertical-align: middle;">
            <strong>${item.Articulo || 'Artículo'}</strong>
            ${item.Referencia && item.Referencia !== '—' ? `<br><span style="font-size: 8pt; color: #666;">Ref: ${item.Referencia}</span>` : ''}
            ${item.Talla && item.Talla !== '—' ? `<br><span style="font-size: 8pt; color: #666;">Talla: ${item.Talla}</span>` : ''}
          </td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle;">${item.Categoria || item.CategoriaArticulo || 'General'}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle; font-weight: bold;">${cantEnviada}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle; font-weight: bold; color: ${cantDevuelta > 0 ? '#ea580c' : '#16a34a'};">${cantRecibida}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle; font-size: 8.5pt;">${devueltoHtml}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center; vertical-align: middle; font-size: 8.5pt;">${novedadItem}</td>
        </tr>
      `;
    });
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 10px; color: #333;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr>
          <td style="width: 130px; vertical-align: middle;">
            <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height: 50px;" alt="LOG&SER">
          </td>
          <td style="text-align: center; font-size: 13pt; font-weight: bold; line-height: 1.4; color: #1e3c72; vertical-align: middle;">
            ACTA DE INGRESO Y VERIFICACIÓN DE INVENTARIO<br>
            <span style="font-size: 10pt; color: #555; font-weight: normal;">TRANSFERENCIA DE INVENTARIO ENTRE SEDES</span>
          </td>
        </tr>
      </table>

      <div style="margin-bottom: 16px; font-size: 9.5pt; line-height: 1.6; background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 50%; padding-bottom: 4px;"><strong>No. Pedido / Transferencia:</strong> ${order.Id}</td>
            <td style="width: 50%; padding-bottom: 4px;"><strong>Regional:</strong> ${order.Regional || '—'}</td>
          </tr>
          <tr>
            <td style="padding-bottom: 4px;"><strong>Sede / Operación Origen:</strong> ${order.OperacionOrigen || '—'}</td>
            <td style="padding-bottom: 4px;"><strong>Sede / Operación Destino:</strong> ${order.OperacionDestino || '—'}</td>
          </tr>
          <tr>
            <td style="padding-bottom: 4px;"><strong>Fecha Despacho (Envío):</strong> ${fechaDespachoStr}</td>
            <td style="padding-bottom: 4px;"><strong>Fecha Recepción (Verificación):</strong> ${fechaRecepcionStr}</td>
          </tr>
          <tr>
            <td style="padding-bottom: 4px;"><strong>Despachado Por:</strong> ${colaboradorDespacha}</td>
            <td style="padding-bottom: 4px;"><strong>Recibido Por:</strong> ${colaboradorReceptor} (C.C. ${identificacionReceptor})</td>
          </tr>
          ${order.Observaciones ? `<tr><td colspan="2" style="padding-top: 4px;"><strong>Obs. Despacho:</strong> ${order.Observaciones}</td></tr>` : ''}
          ${observacionesGenerales ? `<tr><td colspan="2" style="padding-top: 4px; color: #c2410c;"><strong>Novedades / Observaciones de Recepción:</strong> ${observacionesGenerales}</td></tr>` : ''}
        </table>
      </div>

      <div style="margin-bottom: 8px; font-size: 10pt; font-weight: bold; color: #1e3c72;">
        ARTÍCULOS RECIBIDOS Y VERIFICADOS EN FÍSICO:
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #e2e8f0;">
            <th style="border: 1px solid #ddd; padding: 6px; width: 5%; text-align: center;">ÍTEM</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 8%; text-align: center;">IMAGEN</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 35%; text-align: left;">DESCRIPCIÓN DEL ARTÍCULO</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 12%; text-align: center;">CATEGORÍA</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 10%; text-align: center;">CANT. ENVIADA</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 10%; text-align: center;">CANT. RECIBIDA</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 10%; text-align: center;">DIF. RETORNADA</th>
            <th style="border: 1px solid #ddd; padding: 6px; width: 10%; text-align: center;">ESTADO / NOVEDAD</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
          <tr style="background-color: #f1f5f9; font-weight: bold;">
            <td colspan="4" style="border: 1px solid #ddd; padding: 6px; text-align: right;">TOTALES:</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${totalUnidadesEnviadas}</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center; color: #16a34a;">${totalUnidadesRecibidas}</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center; color: ${totalUnidadesDevueltas > 0 ? '#dc2626' : '#64748b'};">${totalUnidadesDevueltas}</td>
            <td style="border: 1px solid #ddd; padding: 6px;"></td>
          </tr>
        </tbody>
      </table>

      <div style="font-size: 8.5pt; color: #555; margin-bottom: 30px; text-align: justify; line-height: 1.4;">
        Certifico mediante la presente acta que he recibido y verificado físicamente el estado y cantidad de los elementos relacionados en esta transferencia de inventario para la operación destino, dejando constancia de las novedades u observaciones indicadas anteriormente.
      </div>

      <div style="page-break-inside: avoid; margin-top: 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="border-bottom: 1.5px solid #333; width: 280px; padding-bottom: 6px; margin-bottom: 6px;">
          ${signatureBase64 ? `<img src="${signatureBase64}" style="max-height: 70px; max-width: 240px; object-fit: contain;" alt="Firma">` : '<div style="height: 50px;"></div>'}
        </div>
        <div style="font-size: 9.5pt; font-weight: bold; color: #1e3c72; text-transform: uppercase;">
          FIRMA RESPONSABLE QUE RECIBE
        </div>
        <div style="font-size: 8.5pt; color: #555; margin-top: 2px;">
          Nombre: ${colaboradorReceptor}<br>
          C.C.: ${identificacionReceptor}
        </div>
      </div>
    </div>
  `;

  const pdfBuffer = await generarPDF(htmlContent, {
    margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' }
  });

  // Consultar Prefijo para TipoDocumento = 87
  let prefijo = 'INVREC';
  try {
    const [docRows] = await pool.execute(
      'SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = 87 LIMIT 1'
    );
    if (docRows.length && docRows[0].Prefijo) {
      prefijo = docRows[0].Prefijo.trim();
    }
  } catch (errPrefijo) {
    console.warn('[inventario] Error consultando Prefijo Id 87:', errPrefijo.message);
  }

  const fileName = `${prefijo}.${timestamp}.pdf`;
  const pdfUrl = await subirPDFConfirmacionInventario(fileName, pdfBuffer);

  // Obtener Regional de la OperacionDestino
  let regional = order.Regional || null;
  try {
    const [opRows] = await pool.execute(
      'SELECT `REGIONAL` FROM `Maestro_Operaciones` WHERE `OPERACIÓN` = ? LIMIT 1',
      [order.OperacionDestino]
    );
    if (opRows.length && opRows[0].REGIONAL) {
      regional = opRows[0].REGIONAL;
    }
  } catch (errOp) {
    console.warn('[inventario] Error consultando regional:', errOp.message);
  }

  // Insertar en Maestro_docEmpresa
  const docEmpresaId = randomUUID();
  const obsClean = observacionesGenerales ? String(observacionesGenerales).substring(0, 512) : (order.Observaciones ? String(order.Observaciones).substring(0, 512) : null);

  try {
    await pool.execute(
      `INSERT INTO \`Maestro_docEmpresa\` (
        \`id\`,
        \`Validación\`,
        \`Regional\`,
        \`Operación\`,
        \`TipoDocumento\`,
        \`Prefijo\`,
        \`Observaciones\`,
        \`Visualizar\`,
        \`Solicitud\`,
        \`Justificacion_Solicitud\`,
        \`FechaRegistro\`,
        \`Usuario\`,
        \`Url\`,
        \`Usuario_Solicitud\`,
        \`Estado_Solicitud\`
      ) VALUES (?, 'PEND', ?, ?, '87', ?, ?, NULL, NULL, NULL, NOW(), ?, ?, NULL, NULL)`,
      [
        docEmpresaId,
        regional,
        order.OperacionDestino,
        prefijo,
        obsClean,
        usuarioReceptor,
        pdfUrl
      ]
    );
  } catch (errDocEmp) {
    console.error('[inventario] Error insertando en Maestro_docEmpresa:', errDocEmp);
  }

  return { pdfUrl, fileName, prefijo };
}

// POST /api/kardex/guardar-masivo - saves list of kardex rows and groups transfers under Kardex_Pendiente parent orders
router.post('/api/kardex/guardar-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario, movimientos } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }
    if (!Array.isArray(movimientos) || movimientos.length === 0) {
      return res.status(400).json({ error: 'Debe enviar al menos un movimiento' });
    }

    const [uRowsDespacha] = await conn.execute(
      'SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuario]
    );
    const usuarioColaborador = uRowsDespacha.length ? (uRowsDespacha[0].Colaborador || usuario) : usuario;
    const usuarioEmailDespacha = uRowsDespacha.length ? uRowsDespacha[0].Email : null;

    await conn.beginTransaction();

    // Group transfers by Operacion (Origen) + OperacionDestino
    const transferGroups = new Map();
    const nonTransferMovs = [];
    const transferenciasParaNotificar = [];

    for (const mov of movimientos) {
      if (mov.TipoMovimiento === 'TRANSFERENCIA') {
        const key = `${mov.Operacion || ''}|${mov.OperacionDestino || ''}`;
        if (!transferGroups.has(key)) {
          transferGroups.set(key, {
            operacionOrigen: mov.Operacion,
            operacionDestino: mov.OperacionDestino,
            regional: mov.Regional || null,
            fechaMovimiento: mov.FechaMovimiento || null,
            observaciones: mov.Observaciones || null,
            items: []
          });
        }
        transferGroups.get(key).items.push(mov);
      } else {
        nonTransferMovs.push(mov);
      }
    }

    // Process Transfer Groups
    for (const [key, group] of transferGroups.entries()) {
      const idKardexPendiente = `TR-${Date.now()}-${randomUUID().slice(0, 6)}`.toUpperCase();

      // Retrieve regional of OperacionDestino if not available
      let regional = group.regional;
      if (!regional) {
        const [[destOp]] = await conn.execute(
          'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
          [group.operacionDestino]
        );
        regional = destOp?.REGIONAL || null;
      }

      let fechaInsert = group.fechaMovimiento ? new Date(group.fechaMovimiento) : new Date();
      if (isNaN(fechaInsert.getTime())) fechaInsert = new Date();

      // Insert parent record into Kardex_Pendiente
      await conn.execute(
        `INSERT INTO Kardex_Pendiente
         (Id, IdKardexOriginal, Procesado, Procesando, Novedad, OperacionOrigen, OperacionDestino, Regional, FechaDespacho, UsuarioDespacha, UsuarioRecibe, FechaRecibido, Estado, Observaciones, NovedadGeneral, Url_Acta, Firma_Url)
         VALUES (?, NULL, 0, 0, '', ?, ?, ?, ?, ?, NULL, NULL, 'PENDIENTE', ?, NULL, NULL, NULL)`,
        [
          idKardexPendiente,
          group.operacionOrigen,
          group.operacionDestino,
          regional,
          fechaInsert,
          usuario,
          group.observaciones
        ]
      );

      // Insert each transfer item into Dynamic_Kardex
      for (const mov of group.items) {
        const idKardex = randomUUID().replace(/-/g, '').toLowerCase();
        let qty = parseInt(mov.Cantidad);
        if (isNaN(qty)) throw new Error(`Cantidad inválida para artículo con ID ${mov.IdArticulo}`);
        qty = -Math.abs(qty); // Outgoing quantity from origin

        const idArticulo = parseInt(mov.IdArticulo);
        const valUnitario = mov.ValorUnitario ? parseFloat(mov.ValorUnitario) : 0;
        const obs = mov.Observaciones || null;
        const movFecha = mov.FechaMovimiento ? new Date(mov.FechaMovimiento) : fechaInsert;
        const usrAsignado = mov.UsuarioAsignado ? String(mov.UsuarioAsignado).trim() : null;

        await conn.execute(
          `INSERT INTO Dynamic_Kardex
           (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
            \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
            Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
           VALUES (?, ?, 'TRANSFERENCIA', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(), ?, NULL)`,
          [
            idKardex,
            isNaN(movFecha.getTime()) ? fechaInsert : movFecha,
            regional,
            group.operacionOrigen,
            group.operacionDestino,
            mov.Categoria || null,
            idArticulo,
            qty,
            usrAsignado,
            valUnitario,
            usuario,
            obs,
            idKardexPendiente
          ]
        );
      }

      const categorias = [...new Set(group.items.map(mov => mov.Categoria).filter(Boolean))].join(', ') || 'General';
      transferenciasParaNotificar.push({
        operacionOrigen: group.operacionOrigen,
        operacionDestino: group.operacionDestino,
        regional,
        categorias
      });
    }

    // Process Non-transfer movements
    for (const mov of nonTransferMovs) {
      const idKardex = randomUUID().replace(/-/g, '').toLowerCase();
      const tipo = mov.TipoMovimiento;
      let qty = parseInt(mov.Cantidad);
      if (isNaN(qty)) throw new Error(`Cantidad inválida para artículo con ID ${mov.IdArticulo}`);

      const regional = mov.Regional || null;
      const operacion = mov.Operacion;
      const categoria = mov.Categoria || null;
      const idArticulo = parseInt(mov.IdArticulo);
      const valUnitario = mov.ValorUnitario ? parseFloat(mov.ValorUnitario) : 0;
      const obs = mov.Observaciones || null;
      const fechaMov = mov.FechaMovimiento || null;
      const usrAsignado = mov.UsuarioAsignado ? String(mov.UsuarioAsignado).trim() : null;

      let fechaInsert = fechaMov ? new Date(fechaMov) : new Date();
      if (isNaN(fechaInsert.getTime())) fechaInsert = new Date();

      await conn.execute(
        `INSERT INTO Dynamic_Kardex
         (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
          \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
          Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(), NULL, NULL)`,
        [
          idKardex,
          fechaInsert,
          tipo,
          regional,
          operacion,
          categoria,
          idArticulo,
          qty,
          usrAsignado,
          valUnitario,
          usuario,
          obs
        ]
      );
    }

    await conn.commit();
    res.json({ message: 'Movimientos guardados exitosamente.' });

    // Notificar despacho de cada transferencia (en segundo plano, ya con la transacción confirmada)
    for (const t of transferenciasParaNotificar) {
      resolverDestinatariosTransferencia(t.operacionDestino, t.regional)
        .then(rolesEmails => {
          const destinatarios = [...new Set([usuarioEmailDespacha, ...rolesEmails].filter(Boolean))];
          if (!destinatarios.length) return;
          return notificarTransferenciaDespachada({
            operacionOrigen: t.operacionOrigen,
            operacionDestino: t.operacionDestino,
            categoria: t.categorias,
            usuarioNombre: usuarioColaborador,
            destinatarios
          });
        })
        .catch(mailErr => console.error('[inventario] Error enviando correo de transferencia despachada:', mailErr));
    }
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/kardex/guardar-masivo error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/kardex-pendiente - pending transfers view grouped by transfer order
router.get('/api/kardex-pendiente', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = ['kp.Procesado = 0'];
    const securityParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [] });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`(kp.OperacionDestino IN (${ph}) OR (kp.OperacionDestino IS NULL AND k.\`OperaciónDestino\` IN (${ph})))`);
      securityParams.push(...acceso.operacionesFiltro, ...acceso.operacionesFiltro);
    }

    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`(k.Categoria IN (${ph}) OR k.Categoria IS NULL)`);
      securityParams.push(...acceso.filtroCategorias);
    }

    const query = `
      SELECT 
        kp.Id AS IdPedido,
        kp.IdKardexOriginal,
        kp.Procesado,
        kp.Procesando,
        kp.OperacionOrigen,
        kp.OperacionDestino,
        kp.Regional,
        kp.FechaDespacho,
        kp.UsuarioDespacha,
        kp.Estado,
        kp.Observaciones AS ObservacionesPedido,
        kp.NovedadGeneral,
        k.IdKardex,
        k.IdArticulo,
        k.FechaMovimiento,
        k.Regional AS RegionalKardex,
        k.\`Operación\` AS OpOrigenKardex,
        k.\`OperaciónDestino\` AS OpDestinoKardex,
        ABS(k.Cantidad) AS Cantidad,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones AS ObservacionesItem,
        k.Novedad AS NovedadItem,
        a.Articulo,
        a.Imagen,
        a.Categoria,
        a.Talla,
        a.Referencia
      FROM Kardex_Pendiente kp
      LEFT JOIN Dynamic_Kardex k ON (k.Kpendiente = kp.Id OR (kp.IdKardexOriginal IS NOT NULL AND k.IdKardex = kp.IdKardexOriginal))
      LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
      WHERE ${securityConds.join(' AND ')}
      ORDER BY kp.FechaDespacho DESC, k.FechaMovimiento DESC
    `;

    const [rows] = await pool.execute(query, securityParams);

    // Group rows into Orders
    const ordersMap = new Map();

    for (const row of rows) {
      const orderId = row.IdPedido || row.IdKardexOriginal;
      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          Id: orderId,
          IdKardexOriginal: row.IdKardexOriginal,
          Procesado: row.Procesado,
          Procesando: row.Procesando,
          OperacionOrigen: row.OperacionOrigen || row.OpOrigenKardex || '—',
          OperacionDestino: row.OperacionDestino || row.OpDestinoKardex || '—',
          Regional: row.Regional || row.RegionalKardex || '—',
          FechaDespacho: row.FechaDespacho || row.FechaMovimiento,
          UsuarioDespacha: row.UsuarioDespacha || row.UsuarioRegistro || '—',
          Estado: row.Estado || 'PENDIENTE',
          Observaciones: row.ObservacionesPedido || row.ObservacionesItem || '',
          NovedadGeneral: row.NovedadGeneral || '',
          items: []
        });
      }

      if (row.IdKardex || row.IdArticulo) {
        ordersMap.get(orderId).items.push({
          IdKardex: row.IdKardex || row.IdKardexOriginal,
          IdArticulo: row.IdArticulo,
          Articulo: row.Articulo || 'Artículo sin nombre',
          Imagen: row.Imagen || null,
          Categoria: row.Categoria || 'General',
          Talla: row.Talla || '—',
          Referencia: row.Referencia || '—',
          Cantidad: row.Cantidad || 0,
          ValorUnitario: row.ValorUnitario || 0,
          UsuarioRegistro: row.UsuarioRegistro,
          Observaciones: row.ObservacionesItem || '',
          Novedad: row.NovedadItem || ''
        });
      }
    }

    const results = Array.from(ordersMap.values()).map(order => {
      const totalUnidades = order.items.reduce((sum, item) => sum + (Number(item.Cantidad) || 0), 0);
      return {
        ...order,
        totalArticulos: order.items.length,
        totalUnidades
      };
    });

    res.json({ results });
  } catch (err) {
    console.error('[inventario] GET /api/kardex-pendiente error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/kardex-pendiente/:id/novedad - register transfer novelty (order or item level)
router.patch('/api/kardex-pendiente/:id/novedad', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, novedad, idKardex } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    if (idKardex) {
      // Update item novelty in Dynamic_Kardex
      await pool.execute(
        'UPDATE Dynamic_Kardex SET Novedad = ? WHERE IdKardex = ?',
        [novedad || '', idKardex]
      );
    } else {
      // Update general novelty on Kardex_Pendiente
      await pool.execute(
        'UPDATE Kardex_Pendiente SET NovedadGeneral = ? WHERE Id = ? OR IdKardexOriginal = ?',
        [novedad || '', id, id]
      );
    }

    res.json({ ok: true, message: 'Novedad registrada exitosamente.' });
  } catch (err) {
    console.error('[inventario] PATCH /api/kardex-pendiente/:id/novedad error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kardex-pendiente/recibir-orden - receive a transfer order with custom quantities, return diff to origin, signature and generate verification acta
router.post('/api/kardex-pendiente/recibir-orden', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      usuario,
      idPedido,
      cantidadesRecibidas, // { [idKardex]: number }
      novedadesItems, // { [idKardex]: "novedad..." }
      observacionesGenerales,
      firmaBase64,
      useRecentSignature
    } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!idPedido) return res.status(400).json({ error: 'idPedido requerido' });

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    // Consultar información del receptor (Maestro_Usuarios y Maestro_Segmentación)
    const [uRows] = await conn.execute(
      'SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuario]
    );
    if (!uRows.length) return res.status(404).json({ error: 'Usuario receptor no encontrado' });

    const colaboradorReceptor = uRows[0].Colaborador || usuario;
    let identificacionReceptor = usuario;
    try {
      const [segRows] = await conn.execute(
        'SELECT `Identificación` FROM `Maestro_Segmentación` WHERE TRIM(Trabajador) = TRIM(?) LIMIT 1',
        [colaboradorReceptor]
      );
      if (segRows.length && segRows[0].Identificación) {
        identificacionReceptor = segRows[0].Identificación;
      } else if (colaboradorReceptor.includes('**')) {
        identificacionReceptor = colaboradorReceptor.split('**')[0].trim();
      }
    } catch (errSeg) {
      console.warn('[inventario] Error consultando identificación en Maestro_Segmentación:', errSeg.message);
    }

    // Manejo de firma
    let signatureUrl = null;
    let signatureBase64 = null;

    if (firmaBase64 && firmaBase64.startsWith('data:image')) {
      signatureUrl = await subirFirma(identificacionReceptor, firmaBase64);
      signatureBase64 = firmaBase64;
    } else if (useRecentSignature) {
      signatureUrl = await obtenerUrlFirmaReciente(identificacionReceptor);
      signatureBase64 = await obtenerFirmaBase64Reciente(identificacionReceptor);
    }

    if (!signatureUrl || !signatureBase64) {
      return res.status(400).json({ error: 'Se requiere la firma digital del responsable que recibe.' });
    }

    await conn.beginTransaction();

    // 1. Obtener pedido pendiente y bloquear fila
    const [[order]] = await conn.execute(
      'SELECT * FROM Kardex_Pendiente WHERE (Id = ? OR IdKardexOriginal = ?) LIMIT 1 FOR UPDATE',
      [idPedido, idPedido]
    );

    if (!order) {
      throw new Error(`El pedido de transferencia ${idPedido} no existe.`);
    }
    if (order.Procesado) {
      throw new Error(`El pedido ${idPedido} ya fue recibido previamente.`);
    }

    // 2. Obtener los ítems transferidos
    const [items] = await conn.execute(
      `SELECT k.*, a.Articulo, a.Imagen, a.Categoria AS CategoriaArticulo, a.Talla, a.Referencia
       FROM Dynamic_Kardex k
       LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
       WHERE (k.Kpendiente = ? OR (k.IdKardex = ? AND k.TipoMovimiento = 'TRANSFERENCIA'))
         AND k.Cantidad < 0
       FOR UPDATE`,
      [order.Id, order.IdKardexOriginal || order.Id]
    );

    if (!items.length) {
      throw new Error(`No se encontraron artículos vinculados al pedido ${idPedido}.`);
    }

    const operacionDestino = order.OperacionDestino || items[0].OperaciónDestino;
    if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(operacionDestino)) {
      throw new Error(`No estás autorizado para recibir en la operación destino: ${operacionDestino}`);
    }

    // Regional de destino
    const [[destOp]] = await conn.execute(
      'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
      [operacionDestino]
    );
    const destRegional = destOp?.REGIONAL || order.Regional || items[0].Regional;

    // Regional de origen (para devoluciones por faltantes)
    let origRegional = order.Regional || items[0].Regional;
    if (order.OperacionOrigen) {
      const [[origOp]] = await conn.execute(
        'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
        [order.OperacionOrigen]
      );
      if (origOp?.REGIONAL) origRegional = origOp.REGIONAL;
    }

    // 3. Procesar cada ítem: entrada a destino y devolución automática a origen si hay diferencia
    const itemsParaActa = [];

    for (const item of items) {
      const novedadItem = (novedadesItems && novedadesItems[item.IdKardex]) 
        ? String(novedadesItems[item.IdKardex]).trim() 
        : (item.Novedad || '');

      if (novedadItem) {
        await conn.execute(
          'UPDATE Dynamic_Kardex SET Novedad = ? WHERE IdKardex = ?',
          [novedadItem, item.IdKardex]
        );
      }

      const cantDespachada = Math.abs(item.Cantidad);
      let cantRecibida = cantDespachada;
      if (cantidadesRecibidas && cantidadesRecibidas[item.IdKardex] !== undefined) {
        const parsed = parseInt(cantidadesRecibidas[item.IdKardex]);
        if (!isNaN(parsed) && parsed >= 0) {
          cantRecibida = Math.min(cantDespachada, parsed);
        }
      }
      const cantDevuelta = cantDespachada - cantRecibida;

      // Inserción en Destino (solo si cantRecibida > 0)
      if (cantRecibida > 0) {
        const newIdKardex = randomUUID().replace(/-/g, '').toLowerCase();
        const obsItem = novedadItem ? `RECEPCION TRANSFERENCIA - NOVEDAD: ${novedadItem}` : 'GENERADO POR EL SISTEMA - RECEPCION TRANSFERENCIA';
        const usrAsignado = item.UsuarioAsignado ? String(item.UsuarioAsignado).trim() : null;

        await conn.execute(
          `INSERT INTO Dynamic_Kardex
           (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
            \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
            Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
           VALUES (?, NOW(), 'ENTRADA', ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(), ?, ?)`,
          [
            newIdKardex,
            destRegional,
            operacionDestino,
            item.Categoria || item.CategoriaArticulo || 'General',
            item.IdArticulo,
            cantRecibida,
            usrAsignado,
            item.ValorUnitario || 0,
            usuario,
            obsItem,
            order.Id,
            novedadItem || null
          ]
        );
      }

      // Devolución automática al origen si hubo faltante (cantDevuelta > 0)
      if (cantDevuelta > 0) {
        const idKardexDev = randomUUID().replace(/-/g, '').toLowerCase();
        const obsDev = `DEVOLUCION AUTOMATICA POR NOVEDAD EN TRANSFERENCIA ${order.Id}${novedadItem ? ': ' + novedadItem : ''}`;
        const novedadDev = novedadItem ? `Devolución por novedad: ${novedadItem}` : `Devolución automática por faltante (${cantDevuelta} unds)`;

        await conn.execute(
          `INSERT INTO Dynamic_Kardex
           (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
            \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
            Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
           VALUES (?, NOW(), 'TRANSFERENCIA', ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, NOW(), ?, ?)`,
          [
            idKardexDev,
            origRegional,
            order.OperacionOrigen,
            item.Categoria || item.CategoriaArticulo || 'General',
            item.IdArticulo,
            cantDevuelta, // Entrada positiva al origen
            item.ValorUnitario || 0,
            usuario,
            obsDev,
            order.Id,
            novedadDev
          ]
        );
      }

      itemsParaActa.push({
        ...item,
        CantidadDespachada: cantDespachada,
        CantidadRecibida: cantRecibida,
        CantidadDevuelta: cantDevuelta,
        Novedad: novedadItem
      });
    }

    // 4. Actualizar Kardex_Pendiente
    await conn.execute(
      `UPDATE Kardex_Pendiente
       SET Estado = 'RECIBIDO',
           Procesado = 1,
           UsuarioRecibe = ?,
           FechaRecibido = NOW(),
           NovedadGeneral = ?,
           Firma_Url = ?
       WHERE Id = ?`,
      [
        usuario,
        observacionesGenerales || null,
        signatureUrl,
        order.Id
      ]
    );

    // 5. Generar PDF "Acta de Ingreso y verificación de inventario" y subir a Storage
    const orderParaActa = {
      ...order,
      OperacionDestino: operacionDestino,
      Regional: destRegional
    };

    const { pdfUrl } = await generarYGuardarActaRecepcionTransferencia({
      order: orderParaActa,
      items: itemsParaActa,
      usuarioReceptor: usuario,
      colaboradorReceptor,
      identificacionReceptor,
      signatureBase64,
      observacionesGenerales
    });

    // Guardar Url_Acta en Kardex_Pendiente
    await conn.execute(
      'UPDATE Kardex_Pendiente SET Url_Acta = ? WHERE Id = ?',
      [pdfUrl, order.Id]
    );

    await conn.commit();
    res.json({
      success: true,
      message: 'Transferencia recibida exitosamente y Acta de Ingreso generada.',
      pdfUrl
    });

    // Notificar al usuario que despachó que su transferencia ya fue recibida (en segundo plano)
    const categoriaRecibida = [...new Set(itemsParaActa.map(it => it.Categoria || it.CategoriaArticulo).filter(Boolean))].join(', ') || 'General';
    pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [order.UsuarioDespacha])
      .then(([rows]) => {
        const emailDespacha = rows.length ? rows[0].Email : null;
        if (!emailDespacha) return;
        return notificarTransferenciaRecibida({
          operacionOrigen: order.OperacionOrigen,
          operacionDestino,
          categoria: categoriaRecibida,
          colaboradorReceptor,
          pdfUrl,
          emailUsuarioDespacha: emailDespacha
        });
      })
      .catch(mailErr => console.error('[inventario] Error enviando correo de transferencia recibida:', mailErr));
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/kardex-pendiente/recibir-orden error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/kardex-pendiente/recibir-masivo - massive reception of multiple transfer orders
router.post('/api/kardex-pendiente/recibir-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      usuario,
      ids,
      cantidadesRecibidas,
      novedadesItems,
      observacionesGenerales,
      firmaBase64,
      useRecentSignature
    } = req.body;

    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un pedido para recibir' });
    }

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    // Consultar información del receptor (Maestro_Usuarios y Maestro_Segmentación)
    const [uRows] = await conn.execute(
      'SELECT Colaborador, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
      [usuario]
    );
    if (!uRows.length) return res.status(404).json({ error: 'Usuario receptor no encontrado' });

    const colaboradorReceptor = uRows[0].Colaborador || usuario;
    let identificacionReceptor = usuario;
    try {
      const [segRows] = await conn.execute(
        'SELECT `Identificación` FROM `Maestro_Segmentación` WHERE TRIM(Trabajador) = TRIM(?) LIMIT 1',
        [colaboradorReceptor]
      );
      if (segRows.length && segRows[0].Identificación) {
        identificacionReceptor = segRows[0].Identificación;
      } else if (colaboradorReceptor.includes('**')) {
        identificacionReceptor = colaboradorReceptor.split('**')[0].trim();
      }
    } catch (errSeg) {
      console.warn('[inventario] Error consultando identificación en Maestro_Segmentación:', errSeg.message);
    }

    // Manejo de firma
    let signatureUrl = null;
    let signatureBase64 = null;

    if (firmaBase64 && firmaBase64.startsWith('data:image')) {
      signatureUrl = await subirFirma(identificacionReceptor, firmaBase64);
      signatureBase64 = firmaBase64;
    } else if (useRecentSignature) {
      signatureUrl = await obtenerUrlFirmaReciente(identificacionReceptor);
      signatureBase64 = await obtenerFirmaBase64Reciente(identificacionReceptor);
    }

    if (!signatureUrl || !signatureBase64) {
      return res.status(400).json({ error: 'Se requiere la firma digital del responsable que recibe.' });
    }

    await conn.beginTransaction();

    const pdfUrlsGeneradas = [];

    for (const idPedido of ids) {
      const [[order]] = await conn.execute(
        'SELECT * FROM Kardex_Pendiente WHERE (Id = ? OR IdKardexOriginal = ?) LIMIT 1 FOR UPDATE',
        [idPedido, idPedido]
      );

      if (!order || order.Procesado) continue;

      const [items] = await conn.execute(
        `SELECT k.*, a.Articulo, a.Imagen, a.Categoria AS CategoriaArticulo, a.Talla, a.Referencia
         FROM Dynamic_Kardex k
         LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
         WHERE (k.Kpendiente = ? OR (k.IdKardex = ? AND k.TipoMovimiento = 'TRANSFERENCIA'))
           AND k.Cantidad < 0
         FOR UPDATE`,
        [order.Id, order.IdKardexOriginal || order.Id]
      );

      if (!items.length) continue;

      const operacionDestino = order.OperacionDestino || items[0].OperaciónDestino;
      if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(operacionDestino)) {
        continue;
      }

      const [[destOp]] = await conn.execute(
        'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
        [operacionDestino]
      );
      const destRegional = destOp?.REGIONAL || order.Regional || items[0].Regional;

      // Regional de origen (para devoluciones)
      let origRegional = order.Regional || items[0].Regional;
      if (order.OperacionOrigen) {
        const [[origOp]] = await conn.execute(
          'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
          [order.OperacionOrigen]
        );
        if (origOp?.REGIONAL) origRegional = origOp.REGIONAL;
      }

      const itemsParaActa = [];

      for (const item of items) {
        const novedadItem = (novedadesItems && novedadesItems[item.IdKardex]) 
          ? String(novedadesItems[item.IdKardex]).trim() 
          : (item.Novedad || '');

        if (novedadItem) {
          await conn.execute(
            'UPDATE Dynamic_Kardex SET Novedad = ? WHERE IdKardex = ?',
            [novedadItem, item.IdKardex]
          );
        }

        const cantDespachada = Math.abs(item.Cantidad);
        let cantRecibida = cantDespachada;
        if (cantidadesRecibidas && cantidadesRecibidas[item.IdKardex] !== undefined) {
          const parsed = parseInt(cantidadesRecibidas[item.IdKardex]);
          if (!isNaN(parsed) && parsed >= 0) {
            cantRecibida = Math.min(cantDespachada, parsed);
          }
        }
        const cantDevuelta = cantDespachada - cantRecibida;

        // Inserción en Destino (si cantRecibida > 0)
        if (cantRecibida > 0) {
          const newIdKardex = randomUUID().replace(/-/g, '').toLowerCase();
          const obsItem = novedadItem ? `RECEPCION TRANSFERENCIA - NOVEDAD: ${novedadItem}` : 'GENERADO POR EL SISTEMA - RECEPCION TRANSFERENCIA';
          const usrAsignado = item.UsuarioAsignado ? String(item.UsuarioAsignado).trim() : null;

          await conn.execute(
            `INSERT INTO Dynamic_Kardex
             (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
              \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
              Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
             VALUES (?, NOW(), 'ENTRADA', ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NOW(), ?, ?)`,
            [
              newIdKardex,
              destRegional,
              operacionDestino,
              item.Categoria || item.CategoriaArticulo || 'General',
              item.IdArticulo,
              cantRecibida,
              usrAsignado,
              item.ValorUnitario || 0,
              usuario,
              obsItem,
              order.Id,
              novedadItem || null
            ]
          );
        }

        // Devolución automática al origen si hubo faltante (cantDevuelta > 0)
        if (cantDevuelta > 0) {
          const idKardexDev = randomUUID().replace(/-/g, '').toLowerCase();
          const obsDev = `DEVOLUCION AUTOMATICA POR NOVEDAD EN TRANSFERENCIA ${order.Id}${novedadItem ? ': ' + novedadItem : ''}`;
          const novedadDev = novedadItem ? `Devolución por novedad: ${novedadItem}` : `Devolución automática por faltante (${cantDevuelta} unds)`;

          await conn.execute(
            `INSERT INTO Dynamic_Kardex
             (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
              \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
              Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro, Kpendiente, Novedad)
             VALUES (?, NOW(), 'TRANSFERENCIA', ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, NOW(), ?, ?)`,
            [
              idKardexDev,
              origRegional,
              order.OperacionOrigen,
              item.Categoria || item.CategoriaArticulo || 'General',
              item.IdArticulo,
              cantDevuelta,
              item.ValorUnitario || 0,
              usuario,
              obsDev,
              order.Id,
              novedadDev
            ]
          );
        }

        itemsParaActa.push({
          ...item,
          CantidadDespachada: cantDespachada,
          CantidadRecibida: cantRecibida,
          CantidadDevuelta: cantDevuelta,
          Novedad: novedadItem
        });
      }

      await conn.execute(
        `UPDATE Kardex_Pendiente
         SET Estado = 'RECIBIDO',
             Procesado = 1,
             UsuarioRecibe = ?,
             FechaRecibido = NOW(),
             NovedadGeneral = ?,
             Firma_Url = ?
         WHERE Id = ?`,
        [
          usuario,
          observacionesGenerales || null,
          signatureUrl,
          order.Id
        ]
      );

      const orderParaActa = {
        ...order,
        OperacionDestino: operacionDestino,
        Regional: destRegional
      };

      const { pdfUrl } = await generarYGuardarActaRecepcionTransferencia({
        order: orderParaActa,
        items: itemsParaActa,
        usuarioReceptor: usuario,
        colaboradorReceptor,
        identificacionReceptor,
        signatureBase64,
        observacionesGenerales
      });

      await conn.execute(
        'UPDATE Kardex_Pendiente SET Url_Acta = ? WHERE Id = ?',
        [pdfUrl, order.Id]
      );

      const categoriaRecibida = [...new Set(itemsParaActa.map(it => it.Categoria || it.CategoriaArticulo).filter(Boolean))].join(', ') || 'General';
      pdfUrlsGeneradas.push({
        idPedido: order.Id,
        pdfUrl,
        operacionOrigen: order.OperacionOrigen,
        operacionDestino,
        categoria: categoriaRecibida,
        usuarioDespacha: order.UsuarioDespacha
      });
    }

    await conn.commit();
    res.json({
      success: true,
      message: `${pdfUrlsGeneradas.length} pedidos de transferencia recibidos exitosamente y Actas generadas.`,
      actas: pdfUrlsGeneradas
    });

    // Notificar a cada usuario que despachó que su transferencia ya fue recibida (en segundo plano)
    for (const t of pdfUrlsGeneradas) {
      pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [t.usuarioDespacha])
        .then(([rows]) => {
          const emailDespacha = rows.length ? rows[0].Email : null;
          if (!emailDespacha) return;
          return notificarTransferenciaRecibida({
            operacionOrigen: t.operacionOrigen,
            operacionDestino: t.operacionDestino,
            categoria: t.categoria,
            colaboradorReceptor,
            pdfUrl: t.pdfUrl,
            emailUsuarioDespacha: emailDespacha
          });
        })
        .catch(mailErr => console.error('[inventario] Error enviando correo de transferencia recibida:', mailErr));
    }
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/kardex-pendiente/recibir-masivo error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/kardex-pendiente/historial - received transfers history
router.get('/api/kardex-pendiente/historial', async (req, res) => {
  try {
    const { usuario, regional, operacion, fechaInicio, fechaFin, search } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'pendienteRecibir') || await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = ['kp.Procesado = 1'];
    const params = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [] });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`(kp.OperacionDestino IN (${ph}) OR (kp.OperacionDestino IS NULL AND k.\`OperaciónDestino\` IN (${ph})))`);
      params.push(...acceso.operacionesFiltro, ...acceso.operacionesFiltro);
    }

    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      conds.push(`(k.Categoria IN (${ph}) OR k.Categoria IS NULL)`);
      params.push(...acceso.filtroCategorias);
    }

    if (regional) {
      conds.push('kp.Regional = ?');
      params.push(regional);
    }

    if (operacion) {
      conds.push('kp.OperacionDestino = ?');
      params.push(operacion);
    }

    if (fechaInicio) {
      conds.push('DATE(kp.FechaRecibido) >= ?');
      params.push(fechaInicio);
    }

    if (fechaFin) {
      conds.push('DATE(kp.FechaRecibido) <= ?');
      params.push(fechaFin);
    }

    const query = `
      SELECT 
        kp.Id AS IdPedido,
        kp.IdKardexOriginal,
        kp.Procesado,
        kp.OperacionOrigen,
        kp.OperacionDestino,
        kp.Regional,
        kp.FechaDespacho,
        kp.UsuarioDespacha,
        kp.UsuarioRecibe,
        kp.FechaRecibido,
        kp.Estado,
        kp.Observaciones AS ObservacionesPedido,
        kp.NovedadGeneral,
        kp.Url_Acta,
        kp.Firma_Url,
        k.IdKardex,
        k.IdArticulo,
        k.TipoMovimiento,
        k.Regional AS RegionalKardex,
        k.\`Operación\` AS OpKardex,
        k.Cantidad,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones AS ObservacionesItem,
        k.Novedad AS NovedadItem,
        a.Articulo,
        a.Imagen,
        a.Categoria,
        a.Talla,
        a.Referencia
      FROM Kardex_Pendiente kp
      LEFT JOIN Dynamic_Kardex k ON (k.Kpendiente = kp.Id OR (kp.IdKardexOriginal IS NOT NULL AND k.IdKardex = kp.IdKardexOriginal))
      LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
      WHERE ${conds.join(' AND ')}
      ORDER BY kp.FechaRecibido DESC, kp.FechaDespacho DESC
    `;

    const [rows] = await pool.execute(query, params);

    const ordersMap = new Map();

    for (const row of rows) {
      const orderId = row.IdPedido || row.IdKardexOriginal;
      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          Id: orderId,
          IdKardexOriginal: row.IdKardexOriginal,
          Procesado: row.Procesado,
          OperacionOrigen: row.OperacionOrigen || '—',
          OperacionDestino: row.OperacionDestino || '—',
          Regional: row.Regional || row.RegionalKardex || '—',
          FechaDespacho: row.FechaDespacho,
          FechaRecibido: row.FechaRecibido,
          UsuarioDespacha: row.UsuarioDespacha || '—',
          UsuarioRecibe: row.UsuarioRecibe || '—',
          Estado: row.Estado || 'RECIBIDO',
          Observaciones: row.ObservacionesPedido || '',
          NovedadGeneral: row.NovedadGeneral || '',
          Url_Acta: row.Url_Acta || null,
          Firma_Url: row.Firma_Url || null,
          itemsDespachados: [],
          itemsRecibidos: [],
          itemsDevueltos: []
        });
      }

      const ord = ordersMap.get(orderId);
      if (row.IdKardex || row.IdArticulo) {
        const itemObj = {
          IdKardex: row.IdKardex,
          IdArticulo: row.IdArticulo,
          Articulo: row.Articulo || 'Artículo sin nombre',
          Imagen: row.Imagen || null,
          Categoria: row.Categoria || 'General',
          Talla: row.Talla || '—',
          Referencia: row.Referencia || '—',
          Cantidad: Number(row.Cantidad) || 0,
          TipoMovimiento: row.TipoMovimiento,
          Operacion: row.OpKardex,
          Observaciones: row.ObservacionesItem || '',
          Novedad: row.NovedadItem || ''
        };

        if (row.Cantidad < 0) {
          ord.itemsDespachados.push(itemObj);
        } else if (row.TipoMovimiento === 'ENTRADA') {
          ord.itemsRecibidos.push(itemObj);
        } else if (row.TipoMovimiento === 'TRANSFERENCIA' && row.OpKardex === ord.OperacionOrigen) {
          ord.itemsDevueltos.push(itemObj);
        }
      }
    }

    let results = Array.from(ordersMap.values()).map(order => {
      const totalEnviadas = order.itemsDespachados.reduce((s, it) => s + Math.abs(it.Cantidad), 0);
      const totalRecibidas = order.itemsRecibidos.reduce((s, it) => s + Math.abs(it.Cantidad), 0);
      const totalDevueltas = order.itemsDevueltos.reduce((s, it) => s + Math.abs(it.Cantidad), 0);
      const totalArticulos = order.itemsDespachados.length || order.itemsRecibidos.length;

      return {
        ...order,
        totalArticulos,
        totalEnviadas,
        totalRecibidas,
        totalDevueltas
      };
    });

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      results = results.filter(o => 
        (o.Id || '').toLowerCase().includes(s) ||
        (o.OperacionOrigen || '').toLowerCase().includes(s) ||
        (o.OperacionDestino || '').toLowerCase().includes(s) ||
        (o.UsuarioRecibe || '').toLowerCase().includes(s) ||
        (o.UsuarioDespacha || '').toLowerCase().includes(s) ||
        (o.Observaciones || '').toLowerCase().includes(s) ||
        (o.NovedadGeneral || '').toLowerCase().includes(s) ||
        o.itemsDespachados.some(it => (it.Articulo || '').toLowerCase().includes(s)) ||
        o.itemsRecibidos.some(it => (it.Articulo || '').toLowerCase().includes(s))
      );
    }

    res.json({ results, total: results.length });
  } catch (err) {
    console.error('[inventario] GET /api/kardex-pendiente/historial error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventario/ajustar - Manual inventory adjustment (saves AJUSTE to Kardex)
router.post('/api/inventario/ajustar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario, idArticulo, regional, operacion, nuevaCantidad, cantidadActual } = req.body;
    if (!usuario || !idArticulo || !operacion || nuevaCantidad === undefined || cantidadActual === undefined) {
      return res.status(400).json({ error: 'Campos requeridos incompletos.' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado.' });
    }

    const parsedNueva = parseInt(nuevaCantidad);
    const parsedActual = parseInt(cantidadActual);
    if (isNaN(parsedNueva) || isNaN(parsedActual)) {
      return res.status(400).json({ error: 'Cantidades inválidas.' });
    }

    const diff = parsedNueva - parsedActual;
    if (diff === 0) {
      return res.status(400).json({ error: 'La nueva cantidad es igual a la actual.' });
    }

    // 1. Fetch Costo and Categoria from Dynamic_Articulos
    const [[articulo]] = await conn.execute(
      'SELECT Costo, Categoria FROM Dynamic_Articulos WHERE Id = ? LIMIT 1',
      [idArticulo]
    );
    if (!articulo) {
      return res.status(404).json({ error: 'Artículo no encontrado en la base de datos.' });
    }

    const costo = articulo.Costo ? parseFloat(articulo.Costo) : 0;
    const categoria = articulo.Categoria || 'General';

    // 2. Insert AJUSTE movement into Dynamic_Kardex
    const idKardex = randomUUID().replace(/-/g, '').toLowerCase();
    
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO Dynamic_Kardex
       (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
        \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
        Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro)
       VALUES (?, NOW(), 'AJUSTE', ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, '-Ajuste manual-', NOW())`,
      [
        idKardex,
        regional || null,
        operacion,
        categoria,
        idArticulo,
        diff,
        costo,
        usuario
      ]
    );

    await conn.commit();
    res.json({ success: true, message: 'Ajuste guardado exitosamente.' });
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/inventario/ajustar error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;

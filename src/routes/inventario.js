const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { obtenerFirmaBase64Reciente, obtenerUrlFirmaReciente, subirFirma, subirPDFConfirmacionInventario, storage } = require('../services/storage');
const { notificarConfirmacionInventario } = require('../services/email');
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
        s.Trabajador AS TrabajadorAsignado,
        k.Acta,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones,
        k.FechaRegistro
      FROM Dynamic_Kardex k
      LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id
      LEFT JOIN Maestro_Segmentación s ON k.UsuarioAsignado = s.Identificación
      ${listFilter.where}
      ORDER BY k.FechaMovimiento DESC, k.FechaRegistro DESC
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
        k.Acta,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones,
        k.FechaRegistro
      FROM Dynamic_Kardex k
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
      conds.push(`Categoria IN (${ph})`);
      params.push(...acceso.filtroCategorias);
    }

    // Filters
    if (categoria) {
      conds.push('Categoria = ?');
      params.push(categoria);
    }
    if (clasificacion) {
      conds.push('ClaseArticulo = ?');
      params.push(clasificacion);
    }
    if (search) {
      conds.push('(Articulo LIKE ? OR Referencia LIKE ? OR Elemento LIKE ? OR CAST(Id AS CHAR) LIKE ?)');
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
        Categoria,
        Proveedor,
        Costo,
        \`Fecha Registro\` AS fechaRegistro,
        Usuario,
        ClaseArticulo,
        Placa,
        (SELECT IFNULL(SUM(k.Cantidad), 0) FROM Dynamic_Kardex k WHERE k.IdArticulo = a.Id) AS Stock
      FROM Dynamic_Articulos a
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
        placa || null,
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
        placa || null
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
const { randomUUID } = require('crypto');

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

// POST /api/kardex/guardar-masivo - saves list of kardex rows
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

    await conn.beginTransaction();

    for (const mov of movimientos) {
      const idKardex = randomUUID().replace(/-/g, '').toLowerCase();
      const tipo = mov.TipoMovimiento;
      let qty = parseInt(mov.Cantidad);
      if (isNaN(qty)) {
        throw new Error(`Cantidad inválida para artículo con ID ${mov.IdArticulo}`);
      }

      if (tipo === 'TRANSFERENCIA') {
        qty = -Math.abs(qty);
      }

      const regional = mov.Regional || null;
      const operacion = mov.Operacion;
      const opDestino = (tipo === 'TRANSFERENCIA') ? (mov.OperacionDestino || null) : null;
      const categoria = mov.Categoria || null;
      const idArticulo = parseInt(mov.IdArticulo);
      const valUnitario = mov.ValorUnitario ? parseFloat(mov.ValorUnitario) : 0;
      const obs = mov.Observaciones || null;
      const fechaMov = mov.FechaMovimiento || null;

      let fechaInsert = fechaMov ? new Date(fechaMov) : new Date();
      if (isNaN(fechaInsert.getTime())) {
        fechaInsert = new Date();
      }

      await conn.execute(
        `INSERT INTO Dynamic_Kardex
         (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
          \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
          Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NOW())`,
        [
          idKardex,
          fechaInsert,
          tipo,
          regional,
          operacion,
          opDestino,
          categoria,
          idArticulo,
          qty,
          valUnitario,
          usuario,
          obs
        ]
      );

      if (tipo === 'TRANSFERENCIA') {
        await conn.execute(
          `INSERT INTO Kardex_Pendiente
           (IdKardexOriginal, Procesado, Procesando, Novedad)
           VALUES (?, 0, 0, '')`,
          [idKardex]
        );
      }
    }

    await conn.commit();
    res.json({ message: 'Movimientos guardados exitosamente.' });
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/kardex/guardar-masivo error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// GET /api/kardex-pendiente - pending transfers view
router.get('/api/kardex-pendiente', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const securityConds = ['kp.Procesado = 0'];
    const securityParams = [];

    if (acceso.filtroCategorias) {
      const ph = acceso.filtroCategorias.map(() => '?').join(',');
      securityConds.push(`k.Categoria IN (${ph})`);
      securityParams.push(...acceso.filtroCategorias);
    }

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [] });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`k.OperaciónDestino IN (${ph})`);
      securityParams.push(...acceso.operacionesFiltro);
    }

    const query = `
      SELECT kp.IdKardexOriginal, kp.Procesado, kp.Procesando, kp.Novedad,
             k.FechaMovimiento, k.Regional, k.\`Operación\` AS OperacionOrigen, k.OperaciónDestino,
             k.Cantidad, k.UsuarioRegistro, k.Observaciones, k.ValorUnitario,
             a.Articulo, a.Imagen, a.Categoria
      FROM Kardex_Pendiente kp
      JOIN Dynamic_Kardex k ON k.IdKardex = kp.IdKardexOriginal
      LEFT JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
      WHERE ${securityConds.join(' AND ')}
      ORDER BY k.FechaMovimiento DESC
    `;

    const [rows] = await pool.execute(query, securityParams);
    res.json({ results: rows });
  } catch (err) {
    console.error('[inventario] GET /api/kardex-pendiente error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/kardex-pendiente/:id/novedad - register transfer novelty
router.patch('/api/kardex-pendiente/:id/novedad', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, novedad } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const [[registro]] = await pool.execute(
      `SELECT k.\`OperaciónDestino\` AS OperacionDestino, k.Categoria
       FROM Kardex_Pendiente kp
       JOIN Dynamic_Kardex k ON k.IdKardex = kp.IdKardexOriginal
       WHERE kp.IdKardexOriginal = ?`,
      [id]
    );
    if (!registro) {
      return res.status(404).json({ error: 'Registro pendiente no encontrado' });
    }
    if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(registro.OperacionDestino)) {
      return res.status(403).json({ error: 'Usuario no autorizado para este registro' });
    }
    if (acceso.filtroCategorias && !acceso.filtroCategorias.includes(registro.Categoria)) {
      return res.status(403).json({ error: 'Usuario no autorizado para este registro' });
    }

    await pool.execute(
      'UPDATE Kardex_Pendiente SET Novedad = ? WHERE IdKardexOriginal = ?',
      [novedad || '', id]
    );

    res.json({ ok: true, message: 'Novedad registrada exitosamente.' });
  } catch (err) {
    console.error('[inventario] PATCH /api/kardex-pendiente/:id/novedad error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/kardex-pendiente/recibir-masivo - massive transfer receive
router.post('/api/kardex-pendiente/recibir-masivo', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { usuario, ids } = req.body;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario requerido' });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un registro' });
    }

    const acceso = await computarAccesoInventario(usuario, 'Inventario');
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    await conn.beginTransaction();

    for (const idOriginal of ids) {
      const [[pendiente]] = await conn.execute(
        'SELECT * FROM Kardex_Pendiente WHERE IdKardexOriginal = ? LIMIT 1 FOR UPDATE',
        [idOriginal]
      );
      if (!pendiente || pendiente.Procesado) {
        throw new Error(`El registro ${idOriginal} ya fue procesado o no existe`);
      }

      const [[originalKardex]] = await conn.execute(
        'SELECT * FROM Dynamic_Kardex WHERE IdKardex = ? LIMIT 1 FOR UPDATE',
        [idOriginal]
      );
      if (!originalKardex) {
        throw new Error(`Registro original ${idOriginal} no encontrado`);
      }

      if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(originalKardex.OperaciónDestino)) {
        throw new Error(`No autorizado para recibir el registro ${idOriginal}`);
      }
      if (acceso.filtroCategorias && !acceso.filtroCategorias.includes(originalKardex.Categoria)) {
        throw new Error(`No autorizado para recibir el registro ${idOriginal}`);
      }

      const [[destOp]] = await conn.execute(
        'SELECT DISTINCT REGIONAL FROM Maestro_Operaciones WHERE `OPERACIÓN` = ? LIMIT 1',
        [originalKardex.OperaciónDestino]
      );
      const destRegional = destOp?.REGIONAL || originalKardex.Regional;

      const newIdKardex = randomUUID().replace(/-/g, '').toLowerCase();

      await conn.execute(
        `INSERT INTO Dynamic_Kardex
         (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`,
          \`OperaciónDestino\`, Categoria, IdArticulo, Cantidad, UsuarioAsignado,
          Acta, ValorUnitario, UsuarioRegistro, Observaciones, FechaRegistro)
         VALUES (?, NOW(), 'ENTRADA', ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?, NOW())`,
        [
          newIdKardex,
          destRegional,
          originalKardex.OperaciónDestino,
          originalKardex.Categoria,
          originalKardex.IdArticulo,
          Math.abs(originalKardex.Cantidad),
          originalKardex.ValorUnitario || 0,
          usuario,
          'GENERADO POR EL SISTEMA - RECEPCION TRANSFERENCIA'
        ]
      );

      await conn.execute(
        'UPDATE Kardex_Pendiente SET Procesado = 1 WHERE IdKardexOriginal = ?',
        [idOriginal]
      );
      await conn.execute(
        'DELETE FROM Kardex_Pendiente WHERE IdKardexOriginal = ?',
        [idOriginal]
      );
    }

    await conn.commit();
    res.json({ message: 'Registros recibidos y agregados al Kardex exitosamente.' });
  } catch (err) {
    await conn.rollback();
    console.error('[inventario] POST /api/kardex-pendiente/recibir-masivo error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
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

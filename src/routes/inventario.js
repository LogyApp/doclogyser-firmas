const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/inventario/index.html');

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

async function computarAccesoInventario(usuarioId) {
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

module.exports = router;

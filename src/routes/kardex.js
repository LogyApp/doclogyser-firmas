const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/kardex/index.html');

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

  if (tieneDispositivo) {
    const [rows] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE SOCIODEMOGRAFICA = ? AND REGIONAL != 'INACTIVO' ORDER BY OPERACIÓN",
      [acceso.dispositivo]
    );
    opRows = rows;
  } else if (ROLES_SIN_FILTRO.includes(rol)) {
    acceso.sinFiltro = true;
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

// Servir la interfaz HTML de Kardex
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
    console.error('[kardex] Error sirviendo interfaz:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// API para devolver los datos de Kardex filtrados
router.get('/api/datos', async (req, res) => {
  try {
    const { usuario, regional, operacion, categoria, tipoMovimiento } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const conds = [];
    const params = [];

    // Filtro de seguridad por rol
    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json([]);
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      conds.push(`k.\`Operación\` IN (${ph})`);
      params.push(...acceso.operacionesFiltro);
    }

    // Filtros opcionales
    if (regional) {
      conds.push('k.`Regional` = ?');
      params.push(regional);
    }
    if (operacion) {
      conds.push('k.`Operación` = ?');
      params.push(operacion);
    }
    if (categoria) {
      conds.push('k.`Categoria` = ?');
      params.push(categoria);
    }
    if (tipoMovimiento) {
      conds.push('k.`TipoMovimiento` = ?');
      params.push(tipoMovimiento);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const query = `
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
        k.Acta,
        k.ValorUnitario,
        k.UsuarioRegistro,
        k.Observaciones,
        k.FechaRegistro
      FROM Dynamic_Kardex k
      LEFT JOIN Dynamic_Articulos a ON k.IdArticulo = a.Id
      ${where}
      ORDER BY k.FechaMovimiento DESC, k.FechaRegistro DESC
      LIMIT 2000
    `;

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[kardex] GET /api/datos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// API para devolver el historial de Kardex de un artículo específico
router.get('/api/articulo/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, regional, operacion } = req.query;
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }

    const acceso = await computarAccesoInventario(usuario);
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
    console.error('[kardex] GET /api/articulo/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

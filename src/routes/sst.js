const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');

const router = express.Router();
const HTML_INDEX_PATH = path.join(__dirname, '../views/sst/index.html');

const ROLES_SIN_FILTRO = [
  'Sistema', 'AdmSst', 'LiderSst', 'Dirección Hseq', 'Administración', 'Administrador'
];
const ROLES_REGIONAL = ['AuxiliarR', 'CoordinadorR'];
const ROLES_DISPOSITIVO = ['AuxSst', 'Auxiliar', 'Coordinador'];
const ROLES_MODALIDAD = ['AnaSst'];

async function computarAccesoSST(usuarioId) {
  if (!usuarioId) return null;

  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol, Regional, Dispositivo, `Operación` FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;

  const usuario = uRows[0];
  const rol = usuario.Rol || '';

  // Todos los roles autorizados para interactuar con SST
  const ALLOWED_ROLES = [
    'AdmSst', 'AnaSst', 'AuxSst', 'LiderSst', 'Sistema',
    'Dirección Hseq', 'Dirección Operaciones', 'Dirección RRHH',
    'Administración', 'Administrador', 'Generalista', 'Calidad', 'Juridica', 'Jurídica'
  ];

  if (!ALLOWED_ROLES.includes(rol)) {
    // Si no está explícitamente en la lista principal, permitir si tiene rol con prefijo Sst o Sistema
    if (!rol.toLowerCase().includes('sst') && rol !== 'Sistema') {
      return null;
    }
  }

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

  // Agrupar operaciones por regional
  const map = {};
  opRows.forEach((row) => {
    const reg = row.REGIONAL || row.Regional;
    const op = row.OPERACIÓN || row.Operación;
    if (reg && op) {
      if (!map[reg]) map[reg] = [];
      map[reg].push(op);
    }
  });

  acceso.opsPorRegional = map;
  acceso.operacionesFiltro = opRows.map((row) => row['OPERACIÓN'] || row['Operación']).filter(Boolean);

  return acceso;
}

// Servir la vista unificada de SST
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoSST(usuario);
    if (!acceso) {
      return res.status(403).send('<h2>Error: Usuario no autorizado para el módulo SST</h2>');
    }

    if (!fs.existsSync(HTML_INDEX_PATH)) {
      return res.status(500).send('<h2>Error: Plantilla de interfaz no encontrada</h2>');
    }

    const html = fs.readFileSync(HTML_INDEX_PATH, 'utf8');

    const config = JSON.stringify({
      ...acceso,
      regionalesFiltro: Object.keys(acceso.opsPorRegional),
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[sst] Error serving SST hub:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

module.exports = router;

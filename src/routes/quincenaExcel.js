const express = require('express');
const pool = require('../services/db');
const { computarAccesoNomina } = require('../services/accesoNomina');

// Nómina · Quincena Excel (Maestro_Visual_Excel)
// Cada operación tiene una fila con la Quincena que trae el Excel de nómina (Power Query) desde
// las vistas vista_datanomina / vista_horahombre; el Excel filtra el año. Aquí solo se cambia la
// Quincena (valores de Maestro_Fechas). Usuario y Fecha Registro se guardan solos.
// Acceso: Maestro_Menu (nomina / Quincena_Excel). 1 = todas, 2 = regional, 3 = operación.
const router = express.Router();
const SECCION = 'Quincena_Excel';

function ahoraBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}

async function exigirAcceso(req, res) {
  const usuario = req.query.usuario || (req.body && req.body.usuario);
  if (!usuario) { res.status(400).json({ error: 'usuario requerido' }); return null; }
  const acceso = await computarAccesoNomina(usuario, SECCION);
  if (!acceso) { res.status(403).json({ error: 'No autorizado para Quincena Excel' }); return null; }
  return acceso;
}

function operacionPermitida(acceso, operacion) {
  return acceso.sinFiltro || (acceso.operacionesFiltro || []).includes(operacion);
}

// Quincenas únicas de Maestro_Fechas, en orden del año (1. Enero Q1 … 12. Diciembre Q2)
async function listarQuincenas() {
  const [rows] = await pool.execute(
    'SELECT `Quincena` AS quincena FROM `Maestro_Fechas` WHERE `Quincena` IS NOT NULL AND `Quincena` <> \'\' ' +
    'GROUP BY `Quincena` ORDER BY MIN(`Mes`), MIN(`Día`)'
  );
  return rows.map(r => r.quincena);
}

router.get('/api/registros', async (req, res) => {
  try {
    const acceso = await exigirAcceso(req, res);
    if (!acceso) return;

    const [rows] = await pool.execute(
      `SELECT v.\`Operación\` AS operacion, v.\`Quincena\` AS quincena, v.\`Usuario\` AS usuario,
              DATE_FORMAT(v.\`Fecha Registro\`, '%Y-%m-%d %H:%i') AS fechaRegistro,
              o.\`REGIONAL\` AS regional
       FROM \`Maestro_Visual_Excel\` v
       LEFT JOIN (SELECT \`OPERACIÓN\`, MAX(\`REGIONAL\`) AS REGIONAL FROM \`Maestro_Operaciones\` GROUP BY \`OPERACIÓN\`) o
         ON o.\`OPERACIÓN\` = v.\`Operación\`
       ORDER BY v.\`Operación\``
    );
    const registros = rows.filter(r => operacionPermitida(acceso, r.operacion));

    const [hoy] = await pool.execute(
      'SELECT `Quincena` AS quincena FROM `Maestro_Fechas` WHERE `Fecha` = ? LIMIT 1',
      [ahoraBogota().slice(0, 10)]
    );

    res.json({
      ok: true,
      registros,
      quincenas: await listarQuincenas(),
      quincenaActual: hoy.length ? hoy[0].quincena : null,
    });
  } catch (err) {
    console.error('[quincenaExcel] GET /api/registros:', err);
    res.status(500).json({ error: 'No se pudieron cargar las quincenas por operación.' });
  }
});

router.put('/api/registros', async (req, res) => {
  try {
    const acceso = await exigirAcceso(req, res);
    if (!acceso) return;

    const operacion = String(req.body.operacion || '').trim();
    const quincena = String(req.body.quincena || '').trim();
    if (!operacion || !quincena) return res.status(400).json({ error: 'Operación y Quincena son obligatorias.' });
    if (!operacionPermitida(acceso, operacion)) {
      return res.status(403).json({ error: 'No tienes acceso a esa operación.' });
    }
    if (!(await listarQuincenas()).includes(quincena)) {
      return res.status(400).json({ error: `La quincena "${quincena}" no existe en Maestro_Fechas.` });
    }

    const fecha = ahoraBogota();
    const [r] = await pool.execute(
      'UPDATE `Maestro_Visual_Excel` SET `Quincena` = ?, `Usuario` = ?, `Fecha Registro` = ? WHERE `Operación` = ?',
      [quincena, acceso.usuarioId, fecha, operacion]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'La operación no está en Maestro_Visual_Excel.' });

    res.json({ ok: true, registro: { operacion, quincena, usuario: acceso.usuarioId, fechaRegistro: fecha.slice(0, 16) } });
  } catch (err) {
    console.error('[quincenaExcel] PUT /api/registros:', err);
    res.status(500).json({ error: 'No se pudo guardar la quincena.' });
  }
});

module.exports = router;

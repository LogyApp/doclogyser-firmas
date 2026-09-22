const express = require('express');
const fs      = require('fs');
const path    = require('path');
const pool    = require('../services/db');
const { computarAccesoNomina } = require('../services/accesoNomina');
const { obtenerCondicionesRetiro, puedeGenerarDocumentosRetiro } = require('../services/configRetiro');
const { calcularPermisosVinculacion } = require('../services/permisosVinculacion');

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth() + 1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

const router = express.Router();
const NOMINA_HTML = path.join(__dirname, '../views/nomina/index.html');

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}div{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:400px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div><h2>Error</h2><p>${mensaje}</p></div></body></html>`;
}

function resumenAcceso(acceso) {
  if (!acceso) return null;
  return {
    sinFiltro:        acceso.sinFiltro,
    regionalesFiltro: Object.keys(acceso.opsPorRegional).sort(),
    opsPorRegional:   acceso.opsPorRegional,
  };
}

// ── GET / ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(paginaError('Parámetro ?usuario requerido'));

    // Cada pestaña (Retiro/Activo) tiene su propio Acceso en Maestro_Menu_Nomina.
    // Secuencial (no Promise.all) para no abrir varias conexiones nuevas a la vez
    // contra Cloud SQL en la carga inicial de la página.
    const accesoRetiro = await computarAccesoNomina(usuario, 'Retiro');
    const accesoActivo = await computarAccesoNomina(usuario, 'Activo');
    if (!accesoRetiro && !accesoActivo) {
      return res.status(403).send(paginaError('Usuario no autorizado'));
    }

    const base = accesoRetiro || accesoActivo;
    const puedeGenerarDocs = puedeGenerarDocumentosRetiro(base.rol, base.regional);

    const template = fs.readFileSync(NOMINA_HTML, 'utf8');
    const config = JSON.stringify({
      usuario,
      usuarioNombre: base.usuarioNombre,
      rol:           base.rol,
      puedeGenerarDocs,
      tabs: {
        retiro: resumenAcceso(accesoRetiro),
        activo: resumenAcceso(accesoActivo),
      },
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[nomina GET /]', err);
    res.status(500).send(paginaError('Error interno del servidor'));
  }
});

// ── GET /api/retiros ─────────────────────────────────────────────────────
router.get('/api/retiros', async (req, res) => {
  try {
    const { usuario, regional, operacion, identificacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoNomina(usuario, 'Retiro');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const securityConds  = ["v.Estado = 'Retirado'"];
    const securityParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [], counts: { regionales: {}, operaciones: {} } });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`v.\`Operación\` IN (${ph})`);
      securityParams.push(...acceso.operacionesFiltro);
    }

    const fReg = regional      ? { cond: 'v.`Regional` = ?',           param: regional }        : null;
    const fOp  = operacion     ? { cond: 'v.`Operación` = ?',          param: operacion }       : null;
    const fId  = identificacion ? { cond: 'v.`Identificación` LIKE ?', param: `%${identificacion}%` } : null;

    const buildWhere = (filtersList) => {
      const c = [...securityConds];
      const p = [...securityParams];
      filtersList.forEach(f => { if (f) { c.push(f.cond); p.push(f.param); } });
      return { where: c.length ? `WHERE ${c.join(' AND ')}` : '', params: p };
    };

    const listFilter = buildWhere([fReg, fOp, fId]);
    const listQuery = `
      SELECT
        v.\`Id Vinculación\`     AS IdVinculacion,
        v.\`Regional\`           AS Regional,
        v.\`Operación\`          AS Operacion,
        v.\`Trabajador\`         AS Trabajador,
        v.\`Cargo\`              AS Cargo,
        v.\`Fecha de Ingreso\`   AS FechaIngreso,
        v.\`Fecha de Retiro\`    AS FechaRetiro,
        v.\`Motivo del Retiro\`  AS MotivoRetiro,
        v.ar_ciudad_regional     AS ArCiudadRegional,
        v.token_firma_ct         AS TokenFirmaCt,
        v.\`Usuario\`            AS Usuario,
        v.\`Fecha Actualización\` AS FechaActualizacion
      FROM \`Maestro_Vinculación\` v
      ${listFilter.where}
      ORDER BY v.\`Fecha de Retiro\` DESC
      LIMIT 500
    `;

    // Conteos dinámicos por Regional/Operación (excluyendo su propia dimensión del filtro)
    const cReg = buildWhere([fOp, fId]);
    const cOp  = buildWhere([fReg, fId]);

    const [[results], [regRows], [opRows]] = await Promise.all([
      pool.execute(listQuery, listFilter.params),
      pool.execute(`SELECT v.\`Regional\` AS Regional, COUNT(*) as total FROM \`Maestro_Vinculación\` v ${cReg.where} GROUP BY v.\`Regional\``, cReg.params),
      pool.execute(`SELECT v.\`Operación\` AS Operacion, COUNT(*) as total FROM \`Maestro_Vinculación\` v ${cOp.where} GROUP BY v.\`Operación\``, cOp.params),
    ]);

    // ¿Ya tiene documentos de firma generados? (misma condición que "firmaConfirmada" en generar-retiro)
    const condiciones = await obtenerCondicionesRetiro();
    const ids = results.map(r => r.IdVinculacion);
    const pzConFirma = new Set();
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      const [pzRows] = await pool.execute(
        `SELECT id_vinculacion FROM Maestro_pazysalvo WHERE id_vinculacion IN (${ph}) AND firma_responsable_url IS NOT NULL`,
        ids
      );
      pzRows.forEach(r => pzConFirma.add(r.id_vinculacion));
    }

    const resultsFinal = results.map(r => ({
      IdVinculacion:      r.IdVinculacion,
      Regional:           r.Regional,
      Operacion:          r.Operacion,
      Trabajador:         r.Trabajador,
      Cargo:              r.Cargo,
      FechaIngreso:       r.FechaIngreso,
      FechaRetiro:        r.FechaRetiro,
      Usuario:            r.Usuario,
      FechaActualizacion: r.FechaActualizacion,
      tieneDocsGenerados: !!(
        condiciones[r.MotivoRetiro]?.TerminaProceso ||
        r.ArCiudadRegional ||
        r.TokenFirmaCt ||
        pzConFirma.has(r.IdVinculacion)
      ),
    }));

    const regCounts = {};
    regRows.forEach(r => { if (r.Regional !== null) regCounts[r.Regional] = Number(r.total); });
    const opCounts = {};
    opRows.forEach(r => { if (r.Operacion !== null) opCounts[r.Operacion] = Number(r.total); });

    res.json({
      results: resultsFinal,
      counts: { regionales: regCounts, operaciones: opCounts },
    });
  } catch (err) {
    console.error('[nomina] GET /api/retiros', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/activos ─────────────────────────────────────────────────────
router.get('/api/activos', async (req, res) => {
  try {
    const { usuario, regional, operacion, identificacion } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoNomina(usuario, 'Activo');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const securityConds  = ["v.Estado = 'Activo'"];
    const securityParams = [];

    if (!acceso.sinFiltro) {
      if (!acceso.operacionesFiltro.length) {
        return res.json({ results: [], counts: { regionales: {}, operaciones: {} } });
      }
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      securityConds.push(`v.\`Operación\` IN (${ph})`);
      securityParams.push(...acceso.operacionesFiltro);
    }

    const fReg = regional      ? { cond: 'v.`Regional` = ?',           param: regional }        : null;
    const fOp  = operacion     ? { cond: 'v.`Operación` = ?',          param: operacion }       : null;
    const fId  = identificacion ? { cond: 'v.`Identificación` LIKE ?', param: `%${identificacion}%` } : null;

    const buildWhere = (filtersList) => {
      const c = [...securityConds];
      const p = [...securityParams];
      filtersList.forEach(f => { if (f) { c.push(f.cond); p.push(f.param); } });
      return { where: c.length ? `WHERE ${c.join(' AND ')}` : '', params: p };
    };

    const listFilter = buildWhere([fReg, fOp, fId]);
    const listQuery = `
      SELECT
        v.\`Id Vinculación\`     AS IdVinculacion,
        v.\`Regional\`           AS Regional,
        v.\`Operación\`          AS Operacion,
        v.\`Trabajador\`         AS Trabajador,
        v.\`Cargo\`              AS Cargo,
        v.\`Fecha de Ingreso\`   AS FechaIngreso,
        v.\`Usuario\`            AS Usuario,
        v.\`Fecha Actualización\` AS FechaActualizacion,
        v.\`Motivo del Retiro\`  AS MotivoRetiro
      FROM \`Maestro_Vinculación\` v
      ${listFilter.where}
      ORDER BY v.\`Trabajador\` ASC
      LIMIT 500
    `;

    const cReg = buildWhere([fOp, fId]);
    const cOp  = buildWhere([fReg, fId]);

    const [[results], [regRows], [opRows]] = await Promise.all([
      pool.execute(listQuery, listFilter.params),
      pool.execute(`SELECT v.\`Regional\` AS Regional, COUNT(*) as total FROM \`Maestro_Vinculación\` v ${cReg.where} GROUP BY v.\`Regional\``, cReg.params),
      pool.execute(`SELECT v.\`Operación\` AS Operacion, COUNT(*) as total FROM \`Maestro_Vinculación\` v ${cOp.where} GROUP BY v.\`Operación\``, cOp.params),
    ]);

    const regCounts = {};
    regRows.forEach(r => { if (r.Regional !== null) regCounts[r.Regional] = Number(r.total); });
    const opCounts = {};
    opRows.forEach(r => { if (r.Operacion !== null) opCounts[r.Operacion] = Number(r.total); });

    res.json({
      results,
      counts: { regionales: regCounts, operaciones: opCounts },
    });
  } catch (err) {
    console.error('[nomina] GET /api/activos', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tomo-cargo ─────────────────────────────────────────────────
// Contratación confirma que un ingreso nuevo sí tomó el cargo. Reutiliza la
// columna `Motivo del Retiro` con el valor centinela 'SI' (ya usado en el
// resto del sistema para distinguir "sin motivo real de retiro").
router.post('/api/tomo-cargo', async (req, res) => {
  try {
    const { idVinculacion, usuario } = req.body;
    if (!idVinculacion || !usuario) return res.status(400).json({ ok: false, error: 'Datos incompletos' });

    const [rows] = await pool.execute(
      'SELECT `Motivo del Retiro` FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
      [idVinculacion]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    if (rows[0]['Motivo del Retiro'] === 'SI') {
      return res.status(409).json({ ok: false, error: 'Ya se había confirmado que tomó el cargo' });
    }

    await pool.execute(
      `UPDATE \`Maestro_Vinculación\`
       SET \`Motivo del Retiro\` = 'SI', Usuario = ?, \`Fecha Actualización\` = ?
       WHERE \`Id Vinculación\` = ?`,
      [usuario, fechaHoraBogota(), idVinculacion]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[nomina] POST /api/tomo-cargo', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/vinculacion/:id ──────────────────────────────────────────────
// Datos + permisos por rol para el formulario de edición de la ficha del
// trabajador activo (se abre al hacer clic en un registro de la pestaña Activos).
router.get('/api/vinculacion/:id', async (req, res) => {
  try {
    const { usuario } = req.query;
    const idVinculacion = decodeURIComponent(req.params.id);
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoNomina(usuario, 'Activo');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [rows] = await pool.execute(
      'SELECT * FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
      [idVinculacion]
    );
    if (!rows.length) return res.status(404).json({ error: 'Vinculación no encontrada' });
    const vin = rows[0];

    if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(vin['Operación'])) {
      return res.status(403).json({ error: 'No tiene acceso a esta operación' });
    }

    const permisos = calcularPermisosVinculacion(acceso.rol, vin['Grupo Nomina']);

    const [areaRows] = await pool.execute(
      "SELECT ID, AREA FROM Config_Area WHERE `OPERACIÓN` = ? AND ADMINISTRATIVO = 'V' ORDER BY AREA",
      [vin['Operación']]
    );

    res.json({
      ok: true,
      permisos,
      areaOpciones: areaRows.map(r => ({ id: r.ID, nombre: r.AREA })),
      registro: {
        idVinculacion:     vin['Id Vinculación'],
        identificacion:    vin['Identificación'],
        trabajador:        vin['Trabajador'],
        estado:            vin['Estado'],
        cargo:             vin['Cargo'],
        regional:          vin['Regional'],
        operacion:         vin['Operación'],
        area:              vin['Area'],
        tipoContrato:      vin['Tipo de Contrato'],
        grupoNomina:       vin['Grupo Nomina'],
        productividadDtjo: vin['Productividad - Dtjo'],
        salario:           permisos.salarioVisible ? vin['Salario'] : undefined,
        auxilioTransporte: vin['Auxilio de Transporte'],
        fechaIngreso:      vin['Fecha de Ingreso'],
      },
    });
  } catch (err) {
    console.error('[nomina] GET /api/vinculacion/:id', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vinculacion/:id ─────────────────────────────────────────────
router.post('/api/vinculacion/:id', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.id);
    const { usuario, cargo, regional, operacion, area, tipoContrato, grupoNomina, productividadDtjo, salario, auxilioTransporte, fechaIngreso } = req.body;
    if (!usuario) return res.status(400).json({ ok: false, error: 'usuario requerido' });

    const acceso = await computarAccesoNomina(usuario, 'Activo');
    if (!acceso) return res.status(403).json({ ok: false, error: 'Usuario no autorizado' });

    const [rows] = await pool.execute(
      'SELECT `Operación`, `Grupo Nomina` FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
      [idVinculacion]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const actual = rows[0];

    if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(actual['Operación'])) {
      return res.status(403).json({ ok: false, error: 'No tiene acceso a esta operación' });
    }

    // Permisos calculados server-side con el Grupo Nomina actual en BD — nunca se
    // confía en lo que declare el cliente sobre qué campos puede editar.
    const permisos = calcularPermisosVinculacion(acceso.rol, actual['Grupo Nomina']);

    const campos = [];
    const valores = [];
    if (permisos.cargo && cargo !== undefined)               { campos.push('`Cargo` = ?'); valores.push(cargo); }
    if (permisos.regional && regional !== undefined)         { campos.push('`Regional` = ?'); valores.push(regional); }
    if (permisos.operacion && operacion !== undefined)       { campos.push('`Operación` = ?'); valores.push(operacion); }
    if (permisos.area && area !== undefined)                 { campos.push('`Area` = ?'); valores.push(area || null); }
    if (permisos.tipoContrato && tipoContrato !== undefined) { campos.push('`Tipo de Contrato` = ?'); valores.push(tipoContrato); }
    if (permisos.grupoNomina && grupoNomina !== undefined)   { campos.push('`Grupo Nomina` = ?'); valores.push(grupoNomina); }
    if (permisos.productividadDtjo && productividadDtjo !== undefined) { campos.push('`Productividad - Dtjo` = ?'); valores.push(productividadDtjo); }
    if (permisos.salarioEditable && salario !== undefined)   { campos.push('`Salario` = ?'); valores.push(salario || null); }
    if (permisos.auxilioTransporte && auxilioTransporte !== undefined) { campos.push('`Auxilio de Transporte` = ?'); valores.push(auxilioTransporte); }
    if (permisos.fechaIngreso && fechaIngreso !== undefined) { campos.push('`Fecha de Ingreso` = ?'); valores.push(fechaIngreso); }

    if (!campos.length) return res.json({ ok: true, sinCambios: true });

    campos.push('Usuario = ?', '`Fecha Actualización` = ?');
    valores.push(usuario, fechaHoraBogota(), idVinculacion);

    await pool.execute(
      `UPDATE \`Maestro_Vinculación\` SET ${campos.join(', ')} WHERE \`Id Vinculación\` = ?`,
      valores
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[nomina] POST /api/vinculacion/:id', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

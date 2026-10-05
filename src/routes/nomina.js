const express = require('express');
const fs      = require('fs');
const path    = require('path');
const pool    = require('../services/db');
const { computarAccesoNomina } = require('../services/accesoNomina');
const { agruparOperacionesPorRegional } = require('../services/accesoInventario');
const { obtenerCondicionesRetiro, puedeGenerarDocumentosRetiro, docTerminacionRequerido, obtenerResponsablesOperacionRegional } = require('../services/configRetiro');
const { notificarRetiro, notificarTomoCargoConfirmado } = require('../services/email');
const { marcarNotificado } = require('../services/retiroNotifier');
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

// Filtro de búsqueda libre por Trabajador/Regional/Operación (insensible a
// mayúsculas y tildes vía COLLATE utf8mb4_0900_ai_ci) o Identificación (numérica).
function filtroBusqueda(busqueda) {
  if (!busqueda) return null;
  const like = `%${busqueda}%`;
  return {
    cond: `(
      v.\`Trabajador\` COLLATE utf8mb4_0900_ai_ci LIKE ? OR
      v.\`Regional\` COLLATE utf8mb4_0900_ai_ci LIKE ? OR
      v.\`Operación\` COLLATE utf8mb4_0900_ai_ci LIKE ? OR
      v.\`Identificación\` LIKE ? OR
      v.\`Id Vinculación\` COLLATE utf8mb4_0900_ai_ci LIKE ?
    )`,
    params: [like, like, like, like, like],
  };
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

    // Cada pestaña (Retiro/Activo/Bloqueo_datos) tiene su propio Acceso en Maestro_Menu_Nomina.
    // Secuencial (no Promise.all) para no abrir varias conexiones nuevas a la vez
    // contra Cloud SQL en la carga inicial de la página.
    const accesoRetiro = await computarAccesoNomina(usuario, 'Retiro');
    const accesoActivo = await computarAccesoNomina(usuario, 'Activo');
    const accesoBloqueo = await computarAccesoNomina(usuario, 'Bloqueo_datos');
    let accesoBiometrico = await computarAccesoNomina(usuario, 'Biometrico');

    // Respaldo de roles autorizados para biométrico si no está configurado en DB
    if (!accesoBiometrico) {
      const [uRows] = await pool.execute('SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
      if (uRows.length && ['Nomina', 'Sistema', 'Control', 'Juridica', 'AdmSst', 'LiderSst', 'Asistencial'].includes(uRows[0].Rol)) {
        accesoBiometrico = { sinFiltro: true, rol: uRows[0].Rol };
      }
    }

    if (!accesoRetiro && !accesoActivo && !accesoBloqueo && !accesoBiometrico) {
      return res.status(403).send(paginaError('Usuario no autorizado'));
    }

    const base = accesoRetiro || accesoActivo || accesoBloqueo || accesoBiometrico;
    const puedeGenerarDocs = puedeGenerarDocumentosRetiro(base.rol, base.regional);
    const isSstOnly = ['AdmSst', 'LiderSst'].includes(base.rol);

    const template = fs.readFileSync(NOMINA_HTML, 'utf8');
    const config = JSON.stringify({
      usuario,
      usuarioNombre: base.usuarioNombre,
      rol:           base.rol,
      puedeGenerarDocs,
      isSstOnly,
      tabs: {
        retiro: resumenAcceso(accesoRetiro),
        activo: resumenAcceso(accesoActivo),
        bloqueo: resumenAcceso(accesoBloqueo),
        biometrico: accesoBiometrico ? { sinFiltro: accesoBiometrico.sinFiltro, isSstOnly } : null,
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
    const { usuario, regional, operacion, busqueda } = req.query;
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

    const fReg = regional  ? { cond: 'v.`Regional` = ?',  param: regional }  : null;
    const fOp  = operacion ? { cond: 'v.`Operación` = ?', param: operacion } : null;
    const fBus = filtroBusqueda(busqueda);

    const buildWhere = (filtersList) => {
      const c = [...securityConds];
      const p = [...securityParams];
      filtersList.forEach(f => { if (f) { c.push(f.cond); p.push(...(f.params || [f.param])); } });
      return { where: c.length ? `WHERE ${c.join(' AND ')}` : '', params: p };
    };

    const listFilter = buildWhere([fReg, fOp, fBus]);
    const listQuery = `
      SELECT
        v.\`Id Vinculación\`     AS IdVinculacion,
        v.\`Identificación\`     AS Identificacion,
        v.\`Regional\`           AS Regional,
        v.\`Operación\`          AS Operacion,
        v.\`Trabajador\`         AS Trabajador,
        v.\`Cargo\`              AS Cargo,
        v.\`Fecha de Ingreso\`   AS FechaIngreso,
        v.\`Fecha de Retiro\`    AS FechaRetiro,
        v.\`Motivo del Retiro\`  AS MotivoRetiro,
        v.\`Archivo Vinculación\` AS TipoRenuncia,
        v.ar_ciudad_regional     AS ArCiudadRegional,
        v.\`Fecha Legalización Retiro\` AS FechaLegalizacion,
        v.token_firma_ct         AS TokenFirmaCt,
        v.\`Usuario\`            AS Usuario,
        v.\`Fecha Actualización\` AS FechaActualizacion
      FROM \`Maestro_Vinculación\` v
      ${listFilter.where}
      ORDER BY v.\`Fecha de Retiro\` DESC
      LIMIT 500
    `;

    // Conteos dinámicos por Regional/Operación (excluyendo su propia dimensión del filtro)
    const cReg = buildWhere([fOp, fBus]);
    const cOp  = buildWhere([fReg, fBus]);

    const [[results], [regRows], [opRows]] = await Promise.all([
      pool.execute(listQuery, listFilter.params),
      pool.execute(`SELECT v.\`Regional\` AS Regional, COUNT(*) as total FROM \`Maestro_Vinculación\` v ${cReg.where} GROUP BY v.\`Regional\``, cReg.params),
      pool.execute(`SELECT v.\`Operación\` AS Operacion, COUNT(*) as total FROM \`Maestro_Vinculación\` v ${cOp.where} GROUP BY v.\`Operación\``, cOp.params),
    ]);

    // ¿Ya tiene documentos de firma generados? (misma condición que "firmaConfirmada" en gestionar-retiro)
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

    // "Legalización" replica la lógica de Vista_retiros_pendientes (Maestro_docTrabajador),
    // pero sin la fecha de corte fija de esa vista: un retiro está "legalizado" cuando ya
    // tiene el documento de terminación/renuncia requerido (ninguno si es Renuncia Verbal) +
    // Certificado (57) + Examen de egreso (58) válidos (Validación distinta de 'ERROR'), o
    // cuando existe un "Documento de Retiro" (47) que cierra el caso manualmente.
    const identificaciones = [...new Set(results.map(r => String(r.Identificacion)))];
    const docsMap = new Map(); // Identificación -> Set(TipoDocumento)
    if (identificaciones.length) {
      const ph = identificaciones.map(() => '?').join(',');
      const [docRows] = await pool.execute(
        `SELECT Identificación, TipoDocumento FROM Maestro_docTrabajador
         WHERE Identificación IN (${ph}) AND TipoDocumento IN ('47','55','76','77','57','58')
           AND (Validación IS NULL OR Validación <> 'ERROR')`,
        identificaciones
      );
      docRows.forEach(r => {
        const key = String(r.Identificación);
        if (!docsMap.has(key)) docsMap.set(key, new Set());
        docsMap.get(key).add(String(r.TipoDocumento));
      });
    }

    const resultsFinal = results.map(r => {
      const condicion = condiciones[r.MotivoRetiro];
      const terminaProceso = !!condicion?.TerminaProceso;
      const tieneDocsGenerados = !!(terminaProceso || r.ArCiudadRegional || r.TokenFirmaCt || pzConFirma.has(r.IdVinculacion));

      const docsSet = docsMap.get(String(r.Identificacion)) || new Set();
      const tieneDoc47 = docsSet.has('47');
      const requerido = docTerminacionRequerido(r.MotivoRetiro, condicion, r.TipoRenuncia);
      const tieneLos3Docs = (requerido === null || docsSet.has(requerido)) && docsSet.has('57') && docsSet.has('58');
      const mismaFechaIngresoRetiro = r.FechaIngreso && r.FechaRetiro &&
        new Date(r.FechaIngreso).getTime() === new Date(r.FechaRetiro).getTime();

      const pendiente = !terminaProceso && !mismaFechaIngresoRetiro && !tieneDoc47 && !tieneLos3Docs;
      const estadoLegalizacion = !pendiente ? 'legalizado' : (r.FechaLegalizacion ? 'en_proceso' : 'no_iniciado');

      return {
        IdVinculacion:      r.IdVinculacion,
        Regional:           r.Regional,
        Operacion:          r.Operacion,
        Trabajador:         r.Trabajador,
        Cargo:              r.Cargo,
        FechaIngreso:       r.FechaIngreso,
        FechaRetiro:        r.FechaRetiro,
        Usuario:            r.Usuario,
        FechaActualizacion: r.FechaActualizacion,
        tieneDocsGenerados,
        estadoLegalizacion,
      };
    });

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
    const { usuario, regional, operacion, busqueda } = req.query;
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

    const fReg = regional  ? { cond: 'v.`Regional` = ?',  param: regional }  : null;
    const fOp  = operacion ? { cond: 'v.`Operación` = ?', param: operacion } : null;
    const fBus = filtroBusqueda(busqueda);

    const buildWhere = (filtersList) => {
      const c = [...securityConds];
      const p = [...securityParams];
      filtersList.forEach(f => { if (f) { c.push(f.cond); p.push(...(f.params || [f.param])); } });
      return { where: c.length ? `WHERE ${c.join(' AND ')}` : '', params: p };
    };

    const listFilter = buildWhere([fReg, fOp, fBus]);
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
      ORDER BY v.\`Fecha de Ingreso\` DESC
      LIMIT 500
    `;

    const cReg = buildWhere([fOp, fBus]);
    const cOp  = buildWhere([fReg, fBus]);

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
// Notifica por correo a contratacionnacional@logyser.com, con copia a admin@logyser.com
// y a los Auxiliares/Coordinadores de la Operación (o Regional).
router.post('/api/tomo-cargo', async (req, res) => {
  try {
    const { idVinculacion, usuario } = req.body;
    if (!idVinculacion || !usuario) return res.status(400).json({ ok: false, error: 'Datos incompletos' });

    const [rows] = await pool.execute(
      `SELECT \`Id Vinculación\`, \`Identificación\`, Trabajador, Cargo, \`Operación\`, Regional,
              \`Fecha de Ingreso\`, \`Motivo del Retiro\`
       FROM \`Maestro_Vinculación\`
       WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [idVinculacion]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const vin = rows[0];
    if (vin['Motivo del Retiro'] === 'SI') {
      return res.status(409).json({ ok: false, error: 'Ya se había confirmado que tomó el cargo' });
    }

    const fechaActualizacion = fechaHoraBogota();
    await pool.execute(
      `UPDATE \`Maestro_Vinculación\`
       SET \`Motivo del Retiro\` = 'SI', Usuario = ?, \`Fecha Actualización\` = ?
       WHERE \`Id Vinculación\` = ?`,
      [usuario, fechaActualizacion, idVinculacion]
    );
    res.json({ ok: true });

    // Notificación por correo asíncrona (no bloquea la respuesta del endpoint)
    (async () => {
      try {
        let usuarioConfirmador = usuario;
        try {
          const [uRows] = await pool.execute(
            'SELECT Nombre, Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
            [usuario]
          );
          if (uRows.length && uRows[0].Nombre) {
            usuarioConfirmador = `${uRows[0].Nombre} (${uRows[0].Rol || usuario})`;
          }
        } catch (_) {}

        const responsables = await obtenerResponsablesOperacionRegional(vin['Operación'], vin.Regional);
        const ccEmails = responsables.map(r => r.Email).filter(Boolean);

        await notificarTomoCargoConfirmado({
          trabajador: vin.Trabajador,
          identificacion: vin['Identificación'],
          cargo: vin.Cargo,
          operacion: vin['Operación'],
          regional: vin.Regional,
          fechaIngreso: vin['Fecha de Ingreso'],
          fechaConfirmacion: fechaActualizacion,
          usuarioConfirmador,
          destinatariosCC: ccEmails,
        });
        console.log(`[nomina] Notificación 'Tomó Cargo' enviada para ${vin['Identificación']} (${vin.Trabajador}) | CC:`, ccEmails);
      } catch (errEmail) {
        console.error('[nomina] Error enviando correo de confirmación de tomó cargo:', errEmail);
      }
    })();
  } catch (err) {
    console.error('[nomina] POST /api/tomo-cargo', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/confirmar-estado-retirado ───────────────────────────────────
// Cierra el hueco de Antioquia: Nómina puede generar documentos sin marcar
// Estado='Retirado' (solo llena Motivo/Fecha de Retiro). Una vez Nómina
// termina, el Coordinador/Auxiliar responsable confirma aquí el cambio de
// Estado — sin tocar ningún otro campo del proceso.
const ROLES_CONFIRMAN_ESTADO = ['Coordinador', 'CoordinadorR', 'Auxiliar', 'AuxiliarR'];
router.post('/api/confirmar-estado-retirado', async (req, res) => {
  try {
    const { idVinculacion, usuario } = req.body;
    if (!idVinculacion || !usuario) return res.status(400).json({ ok: false, error: 'Datos incompletos' });

    const [uRows] = await pool.execute('SELECT Rol, Nombre, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!uRows.length || !ROLES_CONFIRMAN_ESTADO.includes(uRows[0].Rol)) {
      return res.status(403).json({ ok: false, error: 'Su rol no puede confirmar el estado de retiro' });
    }
    const usuData = uRows[0];

    const [rows] = await pool.execute(
      `SELECT \`Identificación\`, Trabajador, Cargo, \`Operación\`, Regional,
              \`Fecha de Retiro\`, Estado, \`Motivo del Retiro\`
       FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [idVinculacion]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const vin = rows[0];
    const motivo = vin['Motivo del Retiro'];
    if (vin.Estado === 'Retirado') return res.json({ ok: true, sinCambios: true });
    if (!motivo || !motivo.trim() || motivo === 'SI') {
      return res.status(400).json({ ok: false, error: 'Este registro aún no tiene un motivo de retiro registrado' });
    }

    await pool.execute(
      `UPDATE \`Maestro_Vinculación\` SET Estado = 'Retirado', Usuario = ?, \`Fecha Actualización\` = ? WHERE \`Id Vinculación\` = ?`,
      [usuario, fechaHoraBogota(), idVinculacion]
    );

    // Este es el momento en que Estado realmente pasa a Retirado (caso Antioquia,
    // Nómina ya había generado documentos antes sin marcarlo) — notificación completa.
    obtenerResponsablesOperacionRegional(vin['Operación'], vin.Regional)
      .then(destinatariosResponsables => notificarRetiro({
        trabajador:     vin.Trabajador,
        identificacion: String(vin['Identificación']),
        cargo:          vin.Cargo,
        operacion:      vin['Operación'],
        fechaRetiro:    vin['Fecha de Retiro'],
        motivoRetiro:   motivo,
        registradoPor:    usuData.Nombre || usuario,
        emailRegistrador: usuData.Email || null,
        rolRegistrador:   usuData.Rol,
        destinatariosResponsables,
      }))
      .then(() => marcarNotificado(idVinculacion))
      .catch(e => console.error('[confirmar-estado-retirado email]', e.message));

    res.json({ ok: true });
  } catch (err) {
    console.error('[nomina] POST /api/confirmar-estado-retirado', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Aviso de edición concurrente (Nomina_Edicion_Activa) ─────────────────
// No es un bloqueo real: solo avisa si alguien más abrió la misma ficha
// hace poco, para no pisar cambios sin darse cuenta.
const MINUTOS_VIGENCIA_EDICION = 10;

async function marcarEdicionYObtenerAviso(idVinculacion, usuario) {
  const [existentes] = await pool.execute(
    `SELECT Usuario, FechaHora, TIMESTAMPDIFF(MINUTE, FechaHora, NOW()) AS minutos
     FROM Nomina_Edicion_Activa WHERE IdVinculacion = ? LIMIT 1`,
    [idVinculacion]
  );
  let aviso = null;
  if (existentes.length && existentes[0].Usuario !== usuario && existentes[0].minutos < MINUTOS_VIGENCIA_EDICION) {
    aviso = { usuario: existentes[0].Usuario, minutos: existentes[0].minutos };
  }
  await pool.execute(
    `INSERT INTO Nomina_Edicion_Activa (IdVinculacion, Usuario, FechaHora) VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE Usuario = VALUES(Usuario), FechaHora = VALUES(FechaHora)`,
    [idVinculacion, usuario]
  );
  return aviso;
}

async function liberarEdicion(idVinculacion, usuario) {
  await pool.execute(
    'DELETE FROM Nomina_Edicion_Activa WHERE IdVinculacion = ? AND Usuario = ?',
    [idVinculacion, usuario]
  );
}

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

    const edicionActiva = await marcarEdicionYObtenerAviso(idVinculacion, usuario);

    const permisos = calcularPermisosVinculacion(acceso.rol, vin['Grupo Nomina']);

    const [areaRows] = await pool.execute(
      "SELECT ID, AREA FROM Config_Area WHERE `OPERACIÓN` = ? AND ADMINISTRATIVO = 'V' ORDER BY AREA",
      [vin['Operación']]
    );

    // Cargo: catálogo completo si el rol tiene Acceso=1 en Maestro_Menu_Nomina
    // (sección Activo); si no, limitado a los cargos operativos.
    const [cargoRows] = await pool.execute(
      acceso.sinFiltro
        ? 'SELECT DISTINCT Cargo FROM Config_Cargo_Laboral ORDER BY Cargo'
        : "SELECT DISTINCT Cargo FROM Config_Cargo_Laboral WHERE `Grupo Nomina` = 'Operativo' ORDER BY Cargo"
    );

    // Regional/Operación editables: catálogo completo de la empresa (no el
    // alcance del usuario), igual patrón cascada Regional→Operación de SST/Inventario.
    const [opRowsCompleto] = await pool.execute(
      "SELECT DISTINCT OPERACIÓN, REGIONAL FROM Maestro_Operaciones WHERE REGIONAL != 'INACTIVO' ORDER BY REGIONAL, OPERACIÓN"
    );
    const opsPorRegionalCompleto = agruparOperacionesPorRegional(opRowsCompleto);

    res.json({
      ok: true,
      permisos,
      edicionActiva,
      areaOpciones: areaRows.map(r => ({ id: r.ID, nombre: r.AREA })),
      cargoOpciones: cargoRows.map(r => r.Cargo),
      regionalOpciones: {
        regionales:     Object.keys(opsPorRegionalCompleto).sort(),
        opsPorRegional: opsPorRegionalCompleto,
      },
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
    await liberarEdicion(idVinculacion, usuario);
    res.json({ ok: true });
  } catch (err) {
    console.error('[nomina] POST /api/vinculacion/:id', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/vinculacion/:id/liberar ─────────────────────────────────────
// Se llama al cerrar/cancelar la ficha sin guardar, para no dejar el aviso
// de "alguien más lo está editando" activo más de lo necesario.
router.post('/api/vinculacion/:id/liberar', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.id);
    const { usuario } = req.body;
    if (!usuario) return res.status(400).json({ ok: false, error: 'usuario requerido' });
    await liberarEdicion(idVinculacion, usuario);
    res.json({ ok: true });
  } catch (err) {
    console.error('[nomina] POST /api/vinculacion/:id/liberar', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── MÓDULO BIOMÉTRICO (Pestaña Nómina) ───────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const p1 = parseFloat(lat1), l1 = parseFloat(lon1);
  const p2 = parseFloat(lat2), l2 = parseFloat(lon2);
  if (isNaN(p1) || isNaN(l1) || isNaN(p2) || isNaN(l2)) return null;

  const R = 6371e3; // Radio de la Tierra en metros
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(p2 - p1);
  const dLon = toRad(l2 - l1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(p1)) * Math.cos(toRad(p2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function obtenerCondicionesClasificacionBiometrico(isSstOnly) {
  let whereFirma = "area IN ('sst', 'coordinadores', 'auxiliares_administrativos')";
  let whereVinc = "v.Cargo IN ('AUXILIAR LOGISTICO', 'APRENDIZ')";

  if (isSstOnly) {
    whereFirma = "area = 'sst'";
    whereVinc = "1 = 0";
  }

  return { whereFirma, whereVinc };
}

async function verificarAccesoBiometricoAPI(req, res, next) {
  try {
    const usuarioId = req.query.usuario || req.body?.usuario;
    if (!usuarioId) {
      return res.status(400).json({ error: 'Parámetro usuario requerido' });
    }

    const [uRows] = await pool.execute(
      'SELECT ID, Nombre, Rol, Regional FROM Maestro_Usuarios WHERE ID = ?',
      [usuarioId]
    );

    if (!uRows.length) {
      return res.status(403).json({ error: 'Usuario no registrado' });
    }

    const u = uRows[0];
    const isSstOnly = ['AdmSst', 'LiderSst'].includes(u.Rol);
    const accesoBio = await computarAccesoNomina(usuarioId, 'Biometrico');

    if (!accesoBio && !['Juridica', 'Sistema', 'Control', 'Nomina', 'AdmSst', 'LiderSst', 'Asistencial'].includes(u.Rol)) {
      return res.status(403).json({ error: 'Rol no autorizado para biométrico' });
    }

    req.usuarioInfo = {
      usuarioId: u.ID,
      usuarioNombre: u.Nombre || u.ID,
      rol: u.Rol,
      regional: u.Regional,
      isSstOnly
    };

    next();
  } catch (err) {
    console.error('[nomina Biometrico API] Error en autorización:', err);
    res.status(500).json({ error: 'Error interno en autorización biométrico' });
  }
}

// ── GET /api/biometrico/trabajadores ─────────────────────────────────────────
router.get('/api/biometrico/trabajadores', verificarAccesoBiometricoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacionBiometrico(isSstOnly);

    const query = `
      SELECT 
        Identificacion AS identificacion, 
        MAX(Trabajador) AS nombre, 
        MAX(cargo) AS cargo, 
        MAX(operacion) AS operacion, 
        MAX(regional) AS regional, 
        'firma_corporativa' AS origen,
        CASE 
          WHEN MAX(area) = 'sst' THEN 'sst'
          WHEN MAX(area) = 'coordinadores' THEN 'coordinadores'
          WHEN MAX(area) = 'auxiliares_administrativos' THEN 'auxiliares_administrativos'
          ELSE NULL
        END AS clasificacion
      FROM Maestro_firma_corporativa
      WHERE ${whereFirma}
      GROUP BY Identificacion

      UNION ALL

      SELECT 
        v.Identificación AS identificacion, 
        MAX(v.Trabajador) AS nombre, 
        MAX(v.Cargo) AS cargo, 
        MAX(v.\`Operación\`) AS operacion, 
        MAX(v.Regional) AS regional, 
        'vinculacion' AS origen,
        CASE 
          WHEN MAX(v.Cargo) = 'AUXILIAR LOGISTICO' THEN 'auxiliares_logisticos'
          WHEN MAX(v.Cargo) = 'APRENDIZ' THEN 'aprendices'
          ELSE NULL
        END AS clasificacion
      FROM Maestro_Vinculación v
      WHERE ${whereVinc}
        AND v.Identificación IS NOT NULL
        AND v.Identificación NOT IN (
          SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
        )
      GROUP BY v.Identificación
      ORDER BY nombre ASC
    `;

    const [rows] = await pool.execute(query);
    res.json({ ok: true, trabajadores: rows });
  } catch (err) {
    console.error('[nomina Biometrico API] Error en trabajadores:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/biometrico/marcaciones ──────────────────────────────────────────
// Incluye cálculo de distancia a la Operación asignada más reciente de Maestro_Vinculación
router.get('/api/biometrico/marcaciones', verificarAccesoBiometricoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacionBiometrico(isSstOnly);
    
    const { startDate, endDate, search, clasificacion } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Parámetros startDate y endDate requeridos' });
    }

    const startStr = `${startDate} 00:00:00`;
    const endStr = `${endDate} 23:59:59`;

    let filterSql = '';
    const filterParams = [];
    if (search) {
      filterSql += ' AND (m.identificacion LIKE ? OR m.trabajador LIKE ?)';
      filterParams.push(`%${search}%`, `%${search}%`);
    }
    if (clasificacion) {
      filterSql += ' AND w.clasificacion = ?';
      filterParams.push(clasificacion);
    }

    const wSubquery = `
      SELECT
        Identificacion AS identificacion,
        CASE
          WHEN MAX(area) = 'sst' THEN 'sst'
          WHEN MAX(area) = 'coordinadores' THEN 'coordinadores'
          WHEN MAX(area) = 'auxiliares_administrativos' THEN 'auxiliares_administrativos'
          ELSE NULL
        END AS clasificacion,
        MAX(cargo) AS cargo,
        MAX(operacion) AS operacion,
        MAX(regional) AS regional
      FROM Maestro_firma_corporativa
      WHERE ${whereFirma}
      GROUP BY Identificacion

      UNION ALL

      SELECT
        v.Identificación AS identificacion,
        CASE
          WHEN MAX(v.Cargo) = 'AUXILIAR LOGISTICO' THEN 'auxiliares_logisticos'
          WHEN MAX(v.Cargo) = 'APRENDIZ' THEN 'aprendices'
          ELSE NULL
        END AS clasificacion,
        MAX(v.Cargo) AS cargo,
        MAX(v.\`Operación\`) AS operacion,
        MAX(v.Regional) AS regional
      FROM Maestro_Vinculación v
      WHERE ${whereVinc}
        AND v.Identificación IS NOT NULL
        AND v.Identificación NOT IN (
          SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
        )
      GROUP BY v.Identificación
    `;

    const vOpSubquery = `
      SELECT mv.Identificación, MAX(mv.\`Operación\`) AS operacion_asignada
      FROM Maestro_Vinculación mv
      INNER JOIN (
        SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS maxFecha
        FROM Maestro_Vinculación
        WHERE Identificación IS NOT NULL
        GROUP BY Identificación
      ) ult ON mv.Identificación = ult.Identificación AND mv.\`Fecha de Ingreso\` = ult.maxFecha
      GROUP BY mv.Identificación
    `;

    const query = `
      SELECT * FROM (
        SELECT
          m.id,
          m.identificacion,
          m.trabajador,
          m.tipo,
          m.score,
          m.latitud,
          m.longitud,
          m.precision_gps,
          m.es_manual,
          m.motivo,
          m.device_fingerprint,
          m.ip,
          m.fecha_hora,
          w.clasificacion,
          w.cargo,
          w.operacion,
          w.regional,
          v_op.operacion_asignada,
          op_asig.LATITUD AS op_lat,
          op_asig.LONGITUD AS op_lng
        FROM facial_marcaciones m
        INNER JOIN (${wSubquery}) w ON m.identificacion = w.identificacion
        LEFT JOIN (${vOpSubquery}) v_op ON m.identificacion = v_op.Identificación
        LEFT JOIN Maestro_Operaciones op_asig ON TRIM(v_op.operacion_asignada) = TRIM(op_asig.\`OPERACIÓN\`)
        WHERE m.fecha_hora >= ? AND m.fecha_hora <= ?
        ${filterSql}

        UNION ALL

        SELECT
          m.id,
          m.identificacion,
          m.trabajador,
          'SALIDA' AS tipo,
          NULL AS score,
          m.latitud_salida AS latitud,
          m.longitud_salida AS longitud,
          m.precision_gps_salida AS precision_gps,
          m.es_manual_salida AS es_manual,
          m.motivo_salida AS motivo,
          m.device_fingerprint,
          m.ip,
          m.fecha_salida AS fecha_hora,
          w.clasificacion,
          w.cargo,
          w.operacion,
          w.regional,
          v_op.operacion_asignada,
          op_asig.LATITUD AS op_lat,
          op_asig.LONGITUD AS op_lng
        FROM facial_marcaciones m
        INNER JOIN (${wSubquery}) w ON m.identificacion = w.identificacion
        LEFT JOIN (${vOpSubquery}) v_op ON m.identificacion = v_op.Identificación
        LEFT JOIN Maestro_Operaciones op_asig ON TRIM(v_op.operacion_asignada) = TRIM(op_asig.\`OPERACIÓN\`)
        WHERE m.fecha_hora >= ? AND m.fecha_hora <= ?
          AND m.fecha_salida IS NOT NULL
        ${filterSql}
      ) marcaciones
      ORDER BY fecha_hora DESC
    `;

    const params = [
      startStr, endStr, ...filterParams,
      startStr, endStr, ...filterParams
    ];

    const [rows] = await pool.execute(query, params);

    const marcacionesConDistancia = rows.map(r => {
      const distM = calcularDistanciaMetros(r.latitud, r.longitud, r.op_lat, r.op_lng);
      return {
        ...r,
        distancia_metros: distM,
      };
    });

    res.json({ ok: true, marcaciones: marcacionesConDistancia });
  } catch (err) {
    console.error('[nomina Biometrico API] Error en marcaciones:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/biometrico/movimientos ──────────────────────────────────────────
router.get('/api/biometrico/movimientos', verificarAccesoBiometricoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacionBiometrico(isSstOnly);
    
    const { startDate, endDate, search, clasificacion } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Parámetros startDate y endDate requeridos' });
    }

    const startStr = `${startDate} 00:00:00`;
    const endStr = `${endDate} 23:59:59`;

    const params = [startStr, endStr];

    let filterSql = '';
    if (search) {
      filterSql += ' AND (mov.identificacion LIKE ? OR mov.trabajador LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (clasificacion) {
      filterSql += ' AND w.clasificacion = ?';
      params.push(clasificacion);
    }

    const query = `
      SELECT 
        mov.id,
        mov.identificacion,
        mov.trabajador,
        mov.tipo,
        mov.estado,
        mov.lat_inicio,
        mov.lng_inicio,
        mov.lat_destino,
        mov.lng_destino,
        mov.direccion_destino,
        mov.ruta_dist_km,
        mov.ruta_tiempo_min,
        mov.fecha_inicio,
        mov.fecha_fin,
        mov.duracion_min,
        mov.distancia_real_km,
        mov.desvio_max_km,
        mov.velocidad_max_kmh,
        mov.velocidad_prom_kmh,
        mov.total_waypoints,
        mov.llego_destino,
        mov.device_fingerprint,
        mov.ip,
        mov.requiere_regreso,
        mov.tiempo_en_destino_min,
        w.clasificacion,
        w.cargo,
        w.operacion,
        w.regional
      FROM facial_movimientos mov
      INNER JOIN (
        SELECT 
          Identificacion AS identificacion, 
          CASE 
            WHEN MAX(area) = 'sst' THEN 'sst'
            WHEN MAX(area) = 'coordinadores' THEN 'coordinadores'
            WHEN MAX(area) = 'auxiliares_administrativos' THEN 'auxiliares_administrativos'
            ELSE NULL
          END AS clasificacion,
          MAX(cargo) AS cargo, 
          MAX(operacion) AS operacion, 
          MAX(regional) AS regional
        FROM Maestro_firma_corporativa
        WHERE ${whereFirma}
        GROUP BY Identificacion
        
        UNION ALL
        
        SELECT 
          v.Identificación AS identificacion, 
          CASE 
            WHEN MAX(v.Cargo) = 'AUXILIAR LOGISTICO' THEN 'auxiliares_logisticos'
            WHEN MAX(v.Cargo) = 'APRENDIZ' THEN 'aprendices'
            ELSE NULL
          END AS clasificacion,
          MAX(v.Cargo) AS cargo, 
          MAX(v.\`Operación\`) AS operacion, 
          MAX(v.Regional) AS regional
        FROM Maestro_Vinculación v
        WHERE ${whereVinc}
          AND v.Identificación IS NOT NULL
          AND v.Identificación NOT IN (
            SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
          )
        GROUP BY v.Identificación
      ) w ON mov.identificacion = w.identificacion
      WHERE mov.fecha_inicio >= ? AND mov.fecha_inicio <= ?
      ${filterSql}
      ORDER BY mov.fecha_inicio DESC
    `;

    const [rows] = await pool.execute(query, params);
    res.json({ ok: true, movimientos: rows });
  } catch (err) {
    console.error('[nomina Biometrico API] Error en movimientos:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/biometrico/movimientos/:id/waypoints ────────────────────────────
router.get('/api/biometrico/movimientos/:id/waypoints', verificarAccesoBiometricoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacionBiometrico(isSstOnly);
    const movimientoId = req.params.id;

    const query = `
      SELECT wp.*
      FROM facial_movimientos_waypoints wp
      INNER JOIN facial_movimientos mov ON wp.movimiento_id = mov.id
      INNER JOIN (
        SELECT Identificacion AS identificacion
        FROM Maestro_firma_corporativa
        WHERE ${whereFirma}
        GROUP BY Identificacion
        
        UNION ALL
        
        SELECT v.Identificación AS identificacion
        FROM Maestro_Vinculación v
        WHERE ${whereVinc}
          AND v.Identificación IS NOT NULL
          AND v.Identificación NOT IN (
            SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
          )
        GROUP BY v.Identificación
      ) w ON mov.identificacion = w.identificacion
      WHERE wp.movimiento_id = ?
      ORDER BY wp.secuencia ASC
    `;

    const [rows] = await pool.execute(query, [movimientoId]);
    res.json({ ok: true, waypoints: rows });
  } catch (err) {
    console.error('[nomina Biometrico API] Error en waypoints:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/biometrico/sin-salida ───────────────────────────────────────────
// Incluye cálculo de distancia a la Operación asignada más reciente de Maestro_Vinculación
router.get('/api/biometrico/sin-salida', verificarAccesoBiometricoAPI, async (req, res) => {
  try {
    const { isSstOnly } = req.usuarioInfo;
    const { whereFirma, whereVinc } = obtenerCondicionesClasificacionBiometrico(isSstOnly);
    const { date, search, clasificacion } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'Parámetro date (YYYY-MM-DD) requerido' });
    }

    const startStr = `${date} 00:00:00`;
    const endStr = `${date} 23:59:59`;

    const params = [startStr, endStr];
    
    let filterSql = '';
    if (search) {
      filterSql += ' AND (m.identificacion LIKE ? OR m.trabajador LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (clasificacion) {
      filterSql += ' AND w.clasificacion = ?';
      params.push(clasificacion);
    }

    const wSubquery = `
      SELECT 
        Identificacion AS identificacion, 
        CASE 
          WHEN MAX(area) = 'sst' THEN 'sst'
          WHEN MAX(area) = 'coordinadores' THEN 'coordinadores'
          WHEN MAX(area) = 'auxiliares_administrativos' THEN 'auxiliares_administrativos'
          ELSE NULL
        END AS clasificacion,
        MAX(cargo) AS cargo, 
        MAX(operacion) AS operacion, 
        MAX(regional) AS regional
      FROM Maestro_firma_corporativa
      WHERE ${whereFirma}
      GROUP BY Identificacion
      
      UNION ALL
      
      SELECT 
        v.Identificación AS identificacion, 
        CASE 
          WHEN MAX(v.Cargo) = 'AUXILIAR LOGISTICO' THEN 'auxiliares_logisticos'
          WHEN MAX(v.Cargo) = 'APRENDIZ' THEN 'aprendices'
          ELSE NULL
        END AS clasificacion,
        MAX(v.Cargo) AS cargo, 
        MAX(v.\`Operación\`) AS operacion, 
        MAX(v.Regional) AS regional
      FROM Maestro_Vinculación v
      WHERE ${whereVinc}
        AND v.Identificación IS NOT NULL
        AND v.Identificación NOT IN (
          SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL
        )
      GROUP BY v.Identificación
    `;

    const vOpSubquery = `
      SELECT mv.Identificación, MAX(mv.\`Operación\`) AS operacion_asignada
      FROM Maestro_Vinculación mv
      INNER JOIN (
        SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS maxFecha
        FROM Maestro_Vinculación
        WHERE Identificación IS NOT NULL
        GROUP BY Identificación
      ) ult ON mv.Identificación = ult.Identificación AND mv.\`Fecha de Ingreso\` = ult.maxFecha
      GROUP BY mv.Identificación
    `;

    const query = `
      SELECT 
        m.id,
        m.identificacion,
        m.trabajador,
        m.tipo,
        m.score,
        m.latitud,
        m.longitud,
        m.precision_gps,
        m.es_manual,
        m.motivo,
        m.fecha_hora,
        m.fecha_entrada,
        w.clasificacion,
        w.cargo,
        w.operacion,
        w.regional,
        v_op.operacion_asignada,
        op_asig.LATITUD AS op_lat,
        op_asig.LONGITUD AS op_lng
      FROM facial_marcaciones m
      INNER JOIN (${wSubquery}) w ON m.identificacion = w.identificacion
      LEFT JOIN (${vOpSubquery}) v_op ON m.identificacion = v_op.Identificación
      LEFT JOIN Maestro_Operaciones op_asig ON TRIM(v_op.operacion_asignada) = TRIM(op_asig.\`OPERACIÓN\`)
      WHERE m.tipo = 'ENTRADA'
        AND m.fecha_entrada >= ? AND m.fecha_entrada <= ?
        AND m.fecha_salida IS NULL
        ${filterSql}
      ORDER BY m.fecha_entrada DESC
    `;

    const [rows] = await pool.execute(query, params);

    const sinSalidaConDistancia = rows.map(r => {
      const distM = calcularDistanciaMetros(r.latitud, r.longitud, r.op_lat, r.op_lng);
      return {
        ...r,
        distancia_metros: distM,
      };
    });

    res.json({ ok: true, trabajadores: sinSalidaConDistancia });
  } catch (err) {
    console.error('[nomina Biometrico API] Error en turnos sin salida:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const pool = require('../services/db');
const { computarAccesoInventario } = require('../services/accesoInventario');
const { obtenerConfigDotacion, normalizarTexto } = require('../services/configInventario');
const { notificarDotacionLey } = require('../services/email');

const router = express.Router();

// ═════ Trabajadores con dotación de ley este mes ═════
// Reemplaza la vista vista_dotacion_ley: toma la vinculación activa más reciente de cada
// trabajador y deja los que cumplen aniversario de ingreso este mes (años anteriores) o
// llevan un múltiplo de "Meses entre entregas de dotación de ley" desde su mes de ingreso.
// Se consulta una sola vez por petición; filtros, conteos y paginación se hacen en memoria.
const SQL_TRABAJADORES = `
  SELECT ms.\`Identificación\` AS Identificacion, ms.Trabajador, mv.Regional, ms.\`Operación\` AS Operacion,
         mv.Cargo, mv.\`Fecha de Ingreso\` AS Fecha_Ingreso,
         ms.Chaqueta, ms.Camiseta, ms.Numero, ms.Pantalon, ms.Botas, ms.Email, ms.Celular
  FROM (
    SELECT \`Identificación\`, Regional, Cargo, \`Fecha de Ingreso\`,
           ROW_NUMBER() OVER (PARTITION BY \`Identificación\` ORDER BY \`Fecha de Ingreso\` DESC) AS rn
    FROM \`Maestro_Vinculación\`
    WHERE Estado = 'Activo'
  ) mv
  JOIN \`Maestro_Segmentación\` ms ON ms.\`Identificación\` = mv.\`Identificación\`
  WHERE mv.rn = 1
    AND MOD(MOD(MONTH(CURDATE()) - MONTH(mv.\`Fecha de Ingreso\`) + 12, 12), ?) = 0
    AND NOT (MONTH(mv.\`Fecha de Ingreso\`) = MONTH(CURDATE()) AND YEAR(mv.\`Fecha de Ingreso\`) >= YEAR(CURDATE()))`;

// Resultado guardado unos minutos para no repetir la consulta en cada búsqueda o página.
// Se borra al editar una talla o el celular.
const CACHE_MS = 2 * 60 * 1000;
let cache = null; // { meses, expira, filas }

async function obtenerTrabajadoresDotacion(meses) {
  if (cache && cache.meses === meses && cache.expira > Date.now()) return cache.filas;
  const [filas] = await pool.query(SQL_TRABAJADORES, [meses]);
  cache = { meses, expira: Date.now() + CACHE_MS, filas };
  return filas;
}

function invalidarCache() {
  cache = null;
}

function filtrarPorAcceso(filas, acceso) {
  if (acceso.sinFiltro) return filas;
  const ops = new Set(acceso.operacionesFiltro);
  return filas.filter((r) => ops.has(r.Operacion));
}

function comparar(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'es', { sensitivity: 'base' });
}

// La pestaña vive dentro de Inventario; esta dirección solo redirige allá a quien tenga acceso.
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).send('<h2>Error: Usuario no autorizado</h2>');
    res.redirect(`/inventario?usuario=${encodeURIComponent(usuario)}`);
  } catch (err) {
    console.error('[dotacionley] GET /:', err);
    res.status(500).send('<h2>Error interno</h2>');
  }
});

// ═════ API: Obtener Resumen (Regionales y Operaciones con conteo) ═════
// Filtrado según el acceso de la Sección 'DotacionLey' del Rol del usuario.
router.get('/api/resumen', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    if (!acceso.sinFiltro && !acceso.operacionesFiltro.length) {
      return res.json([]);
    }

    const cfg = await obtenerConfigDotacion();
    const filas = filtrarPorAcceso(await obtenerTrabajadoresDotacion(cfg.mesesEntreEntregas), acceso);
    const grupos = new Map();
    filas.forEach((r) => {
      const clave = `${r.Regional}|${r.Operacion}`;
      if (!grupos.has(clave)) grupos.set(clave, { Regional: r.Regional, Operacion: r.Operacion, total: 0 });
      grupos.get(clave).total++;
    });
    const rows = [...grupos.values()].sort((a, b) => comparar(a.Regional, b.Regional) || comparar(a.Operacion, b.Operacion));
    res.json(rows);
  } catch (err) {
    console.error('[dotacionley] GET /api/resumen:', err);
    res.status(500).json({ error: 'Error al consultar resumen de dotación' });
  }
});

// ═════ API: Obtener Trabajadores (Paginado y Filtrado) ═════
// Filtrado según el acceso de la Sección 'DotacionLey' del Rol del usuario.
router.get('/api/trabajadores', async (req, res) => {
  try {
    const { usuario, regional, operacion, q, page = 1, limit = 50 } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    if (!acceso.sinFiltro && !acceso.operacionesFiltro.length) {
      return res.json({ total: 0, page: parseInt(page), limit: parseInt(limit), pages: 1, rows: [] });
    }

    const cfg = await obtenerConfigDotacion();
    const busqueda = normalizarTexto(q);
    const filtradas = filtrarPorAcceso(await obtenerTrabajadoresDotacion(cfg.mesesEntreEntregas), acceso)
      .filter((r) => !regional || r.Regional === regional)
      .filter((r) => !operacion || r.Operacion === operacion)
      .filter((r) => !busqueda
        || normalizarTexto(r.Trabajador).includes(busqueda)
        || normalizarTexto(r.Identificacion).includes(busqueda))
      .sort((a, b) => comparar(a.Trabajador, b.Trabajador));

    const safeLimit = parseInt(limit) || 50;
    const safeOffset = Math.max(0, (parseInt(page) - 1) * safeLimit) || 0;
    const total = filtradas.length;

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / safeLimit),
      rows: filtradas.slice(safeOffset, safeOffset + safeLimit)
    });
  } catch (err) {
    console.error('[dotacionley] GET /api/trabajadores:', err);
    res.status(500).json({ error: 'Error al consultar lista de trabajadores' });
  }
});

function construirTallas(row, cfg) {
  const llevaNumero = cfg.cargosNumero.some((c) => normalizarTexto(c) === normalizarTexto(row.Cargo));
  return {
    pantalon: row.Pantalon || '',
    botas: row.Botas || '',
    camiseta: row.Camiseta || '',
    numero: llevaNumero ? (row.Numero || '') : '',
  };
}

function nombreCorto(trabajador) {
  const partes = String(trabajador || '').split(' ** ');
  return partes.length > 1 ? partes[1].trim() : (trabajador || '');
}

const MSG_CORREO_DESACTIVADO = 'Las notificaciones de correo de Dotación de Ley están desactivadas (Config_Parametros).';

// ═════ API: Enviar correo individual (columna Acciones) ═════
router.post('/api/enviar-correo', async (req, res) => {
  try {
    const { usuario, identificacion } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!identificacion) return res.status(400).json({ error: 'identificacion requerida' });

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const cfg = await obtenerConfigDotacion();
    if (!cfg.correoHabilitado) return res.status(403).json({ error: MSG_CORREO_DESACTIVADO });

    const filas = await obtenerTrabajadoresDotacion(cfg.mesesEntreEntregas);
    const row = filas.find((r) => String(r.Identificacion) === String(identificacion));
    if (!row) return res.status(404).json({ error: 'Colaborador no encontrado en el ámbito de dotación de ley' });

    if (!acceso.sinFiltro && !acceso.operacionesFiltro.includes(row.Operacion)) {
      return res.status(403).json({ error: 'No tienes acceso a este colaborador' });
    }

    if (!row.Email) {
      return res.status(400).json({ error: 'El colaborador no tiene correo electrónico registrado' });
    }

    await notificarDotacionLey({
      email: row.Email,
      nombreTrabajador: nombreCorto(row.Trabajador),
      tallas: construirTallas(row, cfg),
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[dotacionley] POST /api/enviar-correo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: Enviar correo masivo por Regional + Operación ═════
router.post('/api/enviar-correo-masivo', async (req, res) => {
  try {
    const { usuario, regional, operacion } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!regional || !operacion) return res.status(400).json({ error: 'regional y operacion requeridos' });

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    if (!acceso.sinFiltro) {
      const opsPermitidas = acceso.opsPorRegional[regional] || [];
      if (!opsPermitidas.includes(operacion)) {
        return res.status(403).json({ error: 'No tienes acceso a esta Regional/Operación' });
      }
    }

    const cfg = await obtenerConfigDotacion();
    if (!cfg.correoHabilitado) return res.status(403).json({ error: MSG_CORREO_DESACTIVADO });

    const rows = (await obtenerTrabajadoresDotacion(cfg.mesesEntreEntregas))
      .filter((r) => r.Regional === regional && r.Operacion === operacion);

    if (!rows.length) {
      return res.json({ ok: true, enviados: 0, sinCorreo: 0, total: 0 });
    }

    let enviados = 0;
    let sinCorreo = 0;
    for (const row of rows) {
      if (!row.Email) { sinCorreo++; continue; }
      try {
        await notificarDotacionLey({
          email: row.Email,
          nombreTrabajador: nombreCorto(row.Trabajador),
          tallas: construirTallas(row, cfg),
        });
        enviados++;
      } catch (e) {
        console.error('[dotacionley] Error enviando correo masivo a', row.Identificacion, ':', e.message);
      }
    }

    res.json({ ok: true, enviados, sinCorreo, total: rows.length });
  } catch (err) {
    console.error('[dotacionley] POST /api/enviar-correo-masivo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: Actualizar campo individual (Camiseta, Numero, Pantalon, Botas, Celular) ═════
router.post('/api/actualizar-campo', async (req, res) => {
  try {
    const { usuario, identificacion, campo, valor } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario es requerido' });
    if (!identificacion) return res.status(400).json({ error: 'identificacion es requerida' });
    if (!campo) return res.status(400).json({ error: 'campo es requerido' });

    const ALLOWED_FIELDS = ['Camiseta', 'Numero', 'Pantalon', 'Botas', 'Celular'];
    if (!ALLOWED_FIELDS.includes(campo)) {
      return res.status(400).json({ error: `Campo no permitido: ${campo}` });
    }

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    // Verificar si el colaborador existe y validar acceso a su operación
    const [[colaborador]] = await pool.execute(
      'SELECT `Identificación`, `Operación` FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
      [identificacion]
    );
    if (!colaborador) {
      return res.status(404).json({ error: 'Colaborador no encontrado en la base de datos' });
    }

    if (!acceso.sinFiltro && colaborador.Operación && !acceso.operacionesFiltro.includes(colaborador.Operación)) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este colaborador' });
    }

    let cleanVal = (valor !== undefined && valor !== null) ? String(valor).trim() : '';
    if (campo === 'Celular') {
      cleanVal = cleanVal.replace(/\D/g, '');
    } else {
      cleanVal = cleanVal.toUpperCase();
    }
    const valToSave = cleanVal !== '' ? cleanVal : null;

    await pool.execute(
      `UPDATE \`Maestro_Segmentación\` 
       SET \`${campo}\` = ?, \`Usuario\` = ?, \`Fecha de Actualización\` = NOW() 
       WHERE \`Identificación\` = ?`,
      [valToSave, acceso.usuarioNombre || usuario, identificacion]
    );

    invalidarCache();

    res.json({
      success: true,
      message: `${campo} actualizado con éxito`,
      campo,
      valor: valToSave
    });
  } catch (err) {
    console.error('[dotacionley] POST /api/actualizar-campo:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════ API: Generar Filas de Kardex para Transferencia de Dotación de Ley ═════
router.post('/api/generar-filas-kardex', async (req, res) => {
  try {
    const { usuario, regional, operacion } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario es requerido' });
    if (!regional) return res.status(400).json({ error: 'Debe seleccionar al menos una Regional.' });

    // Requiere acceso a la pestaña, un rol de "Roles que pueden enviar la dotación de ley al
    // Kardex" (Config_Parametros) y que la Regional/Operación esté dentro de su acceso.
    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });
    const cfg = await obtenerConfigDotacion(acceso.rol);
    if (!cfg.puedeEnviarKardex) {
      return res.status(403).json({ error: 'Tu rol no tiene permiso para enviar la dotación de ley al Kardex.' });
    }
    const op = String(operacion || '').trim();
    if (!acceso.sinFiltro) {
      const opsPermitidas = acceso.opsPorRegional[regional] || [];
      if (!opsPermitidas.length || (op && !opsPermitidas.includes(op))) {
        return res.status(403).json({ error: 'No tienes acceso a esta Regional/Operación' });
      }
    }

    // 1. Trabajadores de la Regional (y opcionalmente Operación) dentro del acceso del usuario
    const workers = filtrarPorAcceso(await obtenerTrabajadoresDotacion(cfg.mesesEntreEntregas), acceso)
      .filter((w) => w.Regional === regional && (!op || w.Operacion === op))
      .sort((a, b) => comparar(a.Operacion, b.Operacion) || comparar(a.Trabajador, b.Trabajador));

    if (!workers.length) {
      return res.json({
        ok: true,
        rows: [],
        totalTrabajadores: 0,
        totalFilas: 0,
        message: 'No se encontraron colaboradores en la Regional/Operación seleccionada.'
      });
    }

    // 2. Consultar reglas de Maestro_Dotacion_Cargos y catálogo de artículos de dotación
    const [rules] = await pool.execute('SELECT Operacion, Cargo, Clasificacion, Elemento FROM Maestro_Dotacion_Cargos');
    const [articles] = await pool.execute("SELECT Id, Articulo, Categoria, ClaseArticulo, Elemento, Talla, Referencia, Costo FROM Dynamic_Articulos WHERE Categoria LIKE '%DOTAC%'");

    const norm = (s) => String(s || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normElem = (s) => norm(s).replace(/\bLVM\b/g, 'LMV');

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const generatedRows = [];
    const unmapped = [];

    for (const w of workers) {
      const opDestino = w.Operacion;
      const idColaborador = String(w.Identificacion || '').trim();

      // Parte 1: BUZO
      const buzoRule = rules.find(r => 
        norm(r.Operacion) === norm(w.Operacion) && 
        norm(r.Cargo) === norm(w.Cargo) && 
        norm(r.Clasificacion) === 'BUZO'
      );

      if (buzoRule && w.Camiseta) {
        const ruleElemNorm = normElem(buzoRule.Elemento);
        const wNum = w.Numero ? String(w.Numero).trim() : '';
        let matchedArt = null;

        if (wNum) {
          // 1. Coincidencia exacta: Elemento + Talla + Número
          matchedArt = articles.find(a => 
            normElem(a.Elemento) === ruleElemNorm && 
            norm(a.Talla) === norm(w.Camiseta) && 
            norm(a.Referencia) === norm(wNum)
          );

          // 2. Coincidencia por buzo rotulado del colaborador (mismo número físico aunque varíe la talla registrada)
          if (!matchedArt) {
            matchedArt = articles.find(a => 
              normElem(a.Elemento) === ruleElemNorm && 
              norm(a.Referencia) === norm(wNum)
            );
          }

          // 3. Si no existe buzo con su número, buscar buzo genérico SIN número (nunca asignar el número de otro)
          if (!matchedArt) {
            matchedArt = articles.find(a => 
              normElem(a.Elemento) === ruleElemNorm && 
              norm(a.Talla) === norm(w.Camiseta) && 
              (!a.Referencia || String(a.Referencia).trim() === '')
            );
          }
        } else {
          // Trabajador sin número: asignar buzo genérico sin rotular
          matchedArt = articles.find(a => 
            normElem(a.Elemento) === ruleElemNorm && 
            norm(a.Talla) === norm(w.Camiseta) && 
            (!a.Referencia || String(a.Referencia).trim() === '')
          );
          if (!matchedArt) {
            matchedArt = articles.find(a => 
              normElem(a.Elemento) === ruleElemNorm && 
              norm(a.Talla) === norm(w.Camiseta)
            );
          }
        }

        if (matchedArt) {
          generatedRows.push({
            FechaMovimiento: nowStr,
            TipoMovimiento: 'TRANSFERENCIA',
            Regional: cfg.regionalOrigen,
            Operacion: cfg.operacionOrigen,
            OperacionDestino: opDestino,
            Categoria: 'DOTACIÓN',
            IdArticulo: matchedArt.Id,
            ArticuloName: matchedArt.Articulo,
            Cantidad: 1,
            ValorUnitario: matchedArt.Costo || 0,
            Observaciones: 'Dotación de Ley',
            UsuarioAsignado: idColaborador
          });
        } else {
          unmapped.push({
            identificacion: idColaborador,
            trabajador: w.Trabajador,
            operacion: opDestino,
            cargo: w.Cargo,
            tipo: 'BUZO',
            elemento: buzoRule.Elemento,
            talla: w.Camiseta,
            numero: w.Numero || ''
          });
        }
      }

      // Parte 2: PANTALON
      const pantRule = rules.find(r => 
        norm(r.Operacion) === norm(w.Operacion) && 
        norm(r.Cargo) === norm(w.Cargo) && 
        norm(r.Clasificacion) === 'PANTALON'
      );

      if (pantRule && w.Pantalon) {
        const matchedArt = articles.find(a => 
          norm(a.Elemento) === norm(pantRule.Elemento) && 
          norm(a.Talla) === norm(w.Pantalon)
        );

        if (matchedArt) {
          generatedRows.push({
            FechaMovimiento: nowStr,
            TipoMovimiento: 'TRANSFERENCIA',
            Regional: cfg.regionalOrigen,
            Operacion: cfg.operacionOrigen,
            OperacionDestino: opDestino,
            Categoria: 'DOTACIÓN',
            IdArticulo: matchedArt.Id,
            ArticuloName: matchedArt.Articulo,
            Cantidad: 1,
            ValorUnitario: matchedArt.Costo || 0,
            Observaciones: 'Dotación de Ley',
            UsuarioAsignado: idColaborador
          });
        } else {
          unmapped.push({
            identificacion: idColaborador,
            trabajador: w.Trabajador,
            operacion: opDestino,
            cargo: w.Cargo,
            tipo: 'PANTALON',
            elemento: pantRule.Elemento,
            talla: w.Pantalon
          });
        }
      }

      // Parte 3: BOTAS (solo las Regionales de "Regionales que reciben botas en la dotación de ley")
      const regionalTrabajador = norm(w.Regional || regional);
      const requiereBotas = cfg.regionalesBotas.some((r) => norm(r) === regionalTrabajador);
      if (requiereBotas) {
        const botasRule = rules.find(r =>
          norm(r.Operacion) === norm(w.Operacion) &&
          norm(r.Cargo) === norm(w.Cargo) &&
          norm(r.Clasificacion) === 'BOTAS'
        );

        if (botasRule && w.Botas) {
          const matchedArt = articles.find(a =>
            norm(a.Elemento) === norm(botasRule.Elemento) &&
            norm(a.Talla) === norm(w.Botas)
          );

          if (matchedArt) {
            generatedRows.push({
              FechaMovimiento: nowStr,
              TipoMovimiento: 'TRANSFERENCIA',
              Regional: cfg.regionalOrigen,
              Operacion: cfg.operacionOrigen,
              OperacionDestino: opDestino,
              Categoria: 'DOTACIÓN',
              IdArticulo: matchedArt.Id,
              ArticuloName: matchedArt.Articulo,
              Cantidad: 1,
              ValorUnitario: matchedArt.Costo || 0,
              Observaciones: 'Dotación de Ley',
              UsuarioAsignado: idColaborador
            });
          } else {
            unmapped.push({
              identificacion: idColaborador,
              trabajador: w.Trabajador,
              operacion: opDestino,
              cargo: w.Cargo,
              tipo: 'BOTAS',
              elemento: botasRule.Elemento,
              talla: w.Botas
            });
          }
        }
      }
    }

    res.json({
      ok: true,
      filas: generatedRows,
      rows: generatedRows,
      totalColaboradores: workers.length,
      totalTrabajadores: workers.length,
      totalFilas: generatedRows.length,
      unmapped
    });
  } catch (err) {
    console.error('[dotacionley] POST /api/generar-filas-kardex:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

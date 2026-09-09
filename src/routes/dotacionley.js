const express = require('express');
const path = require('path');
const pool = require('../services/db');
const { computarAccesoInventario } = require('../services/accesoInventario');
const { notificarDotacionLey } = require('../services/email');

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/dotacionley/index.html');

// ═════ Servir la Vista HTML ═════
router.get('/', (req, res) => {
  res.sendFile(HTML_PATH);
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

    let where = '';
    const params = [];
    if (!acceso.sinFiltro) {
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      where = `WHERE Operacion IN (${ph})`;
      params.push(...acceso.operacionesFiltro);
    }

    const [rows] = await pool.execute(
      `SELECT Regional, Operacion, COUNT(*) AS total
       FROM vista_dotacion_ley
       ${where}
       GROUP BY Regional, Operacion
       ORDER BY Regional, Operacion`,
      params
    );
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

    let where = 'WHERE 1=1';
    const params = [];

    if (!acceso.sinFiltro) {
      const ph = acceso.operacionesFiltro.map(() => '?').join(',');
      where += ` AND Operacion IN (${ph})`;
      params.push(...acceso.operacionesFiltro);
    }

    if (regional) {
      where += ' AND Regional = ?';
      params.push(regional);
    }
    if (operacion) {
      where += ' AND Operacion = ?';
      params.push(operacion);
    }
    if (q) {
      where += ' AND (Trabajador LIKE ? OR Identificacion LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }

    const safeLimit = parseInt(limit) || 50;
    const safeOffset = (parseInt(page) - 1) * safeLimit;

    // Obtener total de registros y registros paginados en paralelo
    const [
      [[{ total }]],
      [rows]
    ] = await Promise.all([
      pool.execute(`SELECT COUNT(*) AS total FROM vista_dotacion_ley ${where}`, params),
      pool.execute(
        `SELECT * FROM vista_dotacion_ley ${where}
         ORDER BY Trabajador ASC
         LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      )
    ]);

    res.json({
      total: parseInt(total),
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
      rows
    });
  } catch (err) {
    console.error('[dotacionley] GET /api/trabajadores:', err);
    res.status(500).json({ error: 'Error al consultar lista de trabajadores' });
  }
});

function construirTallas(row) {
  return {
    pantalon: row.Pantalon || '',
    botas: row.Botas || '',
    camiseta: row.Camiseta || '',
    numero: row.Cargo === 'AUXILIAR LOGISTICO' ? (row.Numero || '') : '',
  };
}

function nombreCorto(trabajador) {
  const partes = String(trabajador || '').split(' ** ');
  return partes.length > 1 ? partes[1].trim() : (trabajador || '');
}

// ═════ API: Enviar correo individual (columna Acciones) ═════
router.post('/api/enviar-correo', async (req, res) => {
  try {
    const { usuario, identificacion } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    if (!identificacion) return res.status(400).json({ error: 'identificacion requerida' });

    const acceso = await computarAccesoInventario(usuario, 'DotacionLey');
    if (!acceso) return res.status(403).json({ error: 'Usuario no autorizado' });

    const [[row]] = await pool.execute(
      'SELECT * FROM vista_dotacion_ley WHERE Identificacion = ? LIMIT 1',
      [identificacion]
    );
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
      tallas: construirTallas(row),
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

    const [rows] = await pool.execute(
      'SELECT * FROM vista_dotacion_ley WHERE Regional = ? AND Operacion = ?',
      [regional, operacion]
    );

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
          tallas: construirTallas(row),
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

    // Validar que el usuario tenga rol Sistema o Inventario
    const [uRows] = await pool.execute('SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!uRows.length || !['Sistema', 'Inventario'].includes(uRows[0].Rol)) {
      return res.status(403).json({ error: 'Opción reservada exclusivamente para usuarios con Rol Sistema o Inventario.' });
    }

    // 1. Consultar trabajadores de la Regional (y opcionalmente Operación)
    let where = 'WHERE Regional = ?';
    const params = [regional];
    if (operacion && operacion.trim()) {
      where += ' AND Operacion = ?';
      params.push(operacion.trim());
    }

    const [workers] = await pool.execute(
      `SELECT * FROM vista_dotacion_ley ${where} ORDER BY Operacion, Trabajador`,
      params
    );

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
            Regional: 'ANTIOQUIA',
            Operacion: 'Administracion',
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
            Regional: 'ANTIOQUIA',
            Operacion: 'Administracion',
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

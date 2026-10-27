const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { normalizar } = require('../services/maestroMenu');
const { computarAccesoConfiguracion, listaRoles, rolEnLista, MODULO, ROL_PROTEGIDO } = require('../services/accesoConfiguracion');

// Módulo Configuración: Parámetros (Config_Parametros) y Visual (Maestro_Menu).
// Ver cada pestaña: Maestro_Menu (configuracion). Crear, editar y eliminar: Config_Parametros
// (accesoConfiguracion.js). Ningún cambio puede dejar a Sistema sin acceso a este módulo.
const router = express.Router();
const HTML = path.join(__dirname, '../views/configuracion/index.html');

const CONCEPTOS_PERMISO = [
  ['Parametros', 'Roles que pueden crear y editar parámetros'],
  ['Visual', 'Roles que pueden crear y editar el menú'],
];

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Configuración</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f6fb;color:#1B2A5E">
<div style="text-align:center;padding:24px"><h2>Configuración</h2><p>${String(mensaje).replace(/[<>&]/g, '')}</p></div></body></html>`;
}

// Acceso al módulo y a la acción; si no lo tiene, responde y devuelve null.
async function exigir(req, res, pestana, accion = 'ver') {
  const usuario = req.query.usuario || (req.body && req.body.usuario);
  if (!usuario) { res.status(400).json({ error: 'usuario requerido' }); return null; }
  const acceso = await computarAccesoConfiguracion(usuario);
  const permiso = acceso && acceso.permisos[pestana];
  if (!permiso || !permiso[accion]) {
    const que = { ver: 'ver esta pestaña', editar: 'crear o editar aquí', eliminar: 'eliminar aquí' }[accion];
    res.status(403).json({ error: `Tu rol no tiene permiso para ${que}.` });
    return null;
  }
  return acceso;
}

function texto(valor, max, nombre, requerido = true) {
  const v = String(valor == null ? '' : valor).trim();
  if (requerido && !v) throw new Error(`${nombre} es obligatorio.`);
  if (v.length > max) throw new Error(`${nombre} admite máximo ${max} caracteres.`);
  return v;
}

// "a,  b ,c" → "a, b, c" sin repetidos (sin distinguir mayúsculas ni tildes)
function unirRoles(valor) {
  const vistos = new Set();
  return listaRoles(valor).filter((r) => {
    const n = normalizar(r);
    if (vistos.has(n)) return false;
    vistos.add(n);
    return true;
  }).join(', ');
}

function errorDuplicado(err) {
  return err && err.code === 'ER_DUP_ENTRY';
}

// Ejecuta el cambio en una transacción y verifica que Sistema conserve el módulo; si no, lo deshace.
async function conProteccion(cambio, verificar) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await cambio(conn);
    const problema = await verificar(conn);
    if (problema) {
      await conn.rollback();
      const err = new Error(problema);
      err.status = 409;
      throw err;
    }
    await conn.commit();
    return resultado;
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
}

// Sistema debe seguir viendo Parametros y Visual en Maestro_Menu.
async function verificarMenuSistema(conn) {
  const [filas] = await conn.query('SELECT Seccion, Rol FROM Maestro_Menu WHERE Modulo = ?', [MODULO]);
  for (const seccion of ['Parametros', 'Visual']) {
    const ok = filas.some((f) => normalizar(f.Seccion) === normalizar(seccion)
      && (rolEnLista(f.Rol, ROL_PROTEGIDO) || rolEnLista(f.Rol, 'Todos')));
    if (!ok) return `Este cambio dejaría al rol ${ROL_PROTEGIDO} sin la pestaña ${seccion} del módulo Configuración. No se guardó.`;
  }
  return null;
}

// Sistema debe seguir pudiendo crear y editar en Configuración (si la fila no existe, aplica Sistema).
async function verificarParametrosSistema(conn) {
  const [filas] = await conn.query('SELECT Seccion, Concepto, Parametro FROM Config_Parametros WHERE Modulo = ?', [MODULO]);
  for (const [seccion, concepto] of CONCEPTOS_PERMISO) {
    const fila = filas.find((f) => normalizar(f.Seccion) === normalizar(seccion) && normalizar(f.Concepto) === normalizar(concepto));
    if (fila && !rolEnLista(fila.Parametro, ROL_PROTEGIDO)) {
      return `"${concepto}" debe incluir al rol ${ROL_PROTEGIDO}, para no perder el acceso a Configuración. No se guardó.`;
    }
  }
  return null;
}

function responderError(res, err, etiqueta) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.validacion) return res.status(400).json({ error: err.message });
  console.error(`[configuracion] ${etiqueta}:`, err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

function validacion(fn) {
  try { return fn(); } catch (err) { err.validacion = true; throw err; }
}

// ══════════════════════════════════════════════════════════════════════════
// Página
// ══════════════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(paginaError('Parámetro ?usuario requerido'));
    const acceso = await computarAccesoConfiguracion(usuario);
    if (!acceso) return res.status(403).send(paginaError('Usuario no autorizado para el módulo de Configuración'));
    const config = JSON.stringify({
      usuarioId: acceso.usuarioId,
      usuarioNombre: acceso.usuarioNombre,
      rol: acceso.rol,
      permisos: acceso.permisos,
    }).replace(/<\/script>/gi, '<\\/script>');
    res.send(fs.readFileSync(HTML, 'utf8').replace('__CONFIG__', config));
  } catch (err) {
    console.error('[configuracion GET /]', err);
    res.status(500).send(paginaError('Error interno del servidor'));
  }
});

// Roles para elegir: los de Config_Rol y los que tienen los usuarios.
router.get('/api/roles', async (req, res) => {
  try {
    const usuario = req.query.usuario;
    const acceso = await computarAccesoConfiguracion(usuario);
    if (!acceso) return res.status(403).json({ error: 'No autorizado' });
    const [a] = await pool.query("SELECT DISTINCT Rol FROM Config_Rol WHERE Rol IS NOT NULL AND Rol <> ''");
    const [b] = await pool.query("SELECT DISTINCT Rol FROM Maestro_Usuarios WHERE Rol IS NOT NULL AND Rol <> ''");
    const porClave = new Map();
    [...a, ...b].forEach((r) => listaRoles(r.Rol).forEach((rol) => {
      const n = normalizar(rol);
      if (!porClave.has(n)) porClave.set(n, rol);
    }));
    res.json([...porClave.values()].sort((x, y) => x.localeCompare(y, 'es')));
  } catch (err) {
    responderError(res, err, 'GET /api/roles');
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Parámetros (Config_Parametros)
// ══════════════════════════════════════════════════════════════════════════
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function leerParametro(body) {
  return validacion(() => {
    const p = {
      modulo: texto(body.modulo, 50, 'Módulo'),
      seccion: texto(body.seccion, 50, 'Sección'),
      concepto: texto(body.concepto, 150, 'Concepto'),
      condicion: texto(body.condicion, 50, 'Condición'),
      parametro: String(body.parametro == null ? '' : body.parametro).trim(),
      descripcion: texto(body.descripcion, 500, 'Descripción', false),
    };
    const cond = normalizar(p.condicion);
    if (cond === 'rol') p.parametro = unirRoles(p.parametro);
    if (cond === 'booleano' && !['0', '1'].includes(p.parametro)) throw new Error('Un parámetro Booleano debe ser 1 (habilitado) o 0 (deshabilitado).');
    if ((cond === 'numero' || cond === 'filas') && !/^\d+$/.test(p.parametro)) throw new Error(`Un parámetro ${p.condicion} debe ser un número entero.`);
    if (cond === 'porcentaje' && !/^(100|[1-9]?\d)$/.test(p.parametro)) throw new Error('Un porcentaje debe ser un número entero entre 0 y 100.');
    if (cond === 'hora' && !RE_HORA.test(p.parametro)) throw new Error('La hora debe tener el formato HH:mm (24 horas).');
    return p;
  });
}

router.get('/api/parametros', async (req, res) => {
  try {
    if (!(await exigir(req, res, 'parametros'))) return;
    const [rows] = await pool.query(
      'SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion FROM Config_Parametros ORDER BY Modulo, Seccion, id'
    );
    res.json(rows.map((r) => ({
      id: r.id, modulo: r.Modulo, seccion: r.Seccion, concepto: r.Concepto,
      condicion: r.Condicion, parametro: r.Parametro, descripcion: r.Descripcion || '',
    })));
  } catch (err) {
    responderError(res, err, 'GET /api/parametros');
  }
});

router.post('/api/parametros', async (req, res) => {
  try {
    const acceso = await exigir(req, res, 'parametros', 'editar');
    if (!acceso) return;
    const p = leerParametro(req.body || {});
    if (!p.descripcion) return res.status(400).json({ error: 'La descripción es obligatoria: explica para qué sirve el parámetro.' });
    const id = await conProteccion(async (conn) => {
      const [r] = await conn.execute(
        'INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion) VALUES (?, ?, ?, ?, ?, ?)',
        [p.modulo, p.seccion, p.concepto, p.condicion, p.parametro, p.descripcion]
      );
      return r.insertId;
    }, verificarParametrosSistema);
    console.log(`[configuracion] ${acceso.usuarioId} creó Config_Parametros ${id}: ${p.modulo} / ${p.seccion} / ${p.concepto}`);
    res.json({ ok: true, id });
  } catch (err) {
    if (errorDuplicado(err)) return res.status(409).json({ error: 'Ya existe un parámetro con ese Módulo, Sección y Concepto.' });
    responderError(res, err, 'POST /api/parametros');
  }
});

router.put('/api/parametros/:id', async (req, res) => {
  try {
    const acceso = await exigir(req, res, 'parametros', 'editar');
    if (!acceso) return;
    const p = leerParametro(req.body || {});
    const filas = await conProteccion(async (conn) => {
      const [r] = await conn.execute(
        'UPDATE Config_Parametros SET Modulo = ?, Seccion = ?, Concepto = ?, Condicion = ?, Parametro = ?, Descripcion = ? WHERE id = ?',
        [p.modulo, p.seccion, p.concepto, p.condicion, p.parametro, p.descripcion || null, req.params.id]
      );
      return r.affectedRows;
    }, verificarParametrosSistema);
    if (!filas) return res.status(404).json({ error: 'El parámetro ya no existe.' });
    console.log(`[configuracion] ${acceso.usuarioId} editó Config_Parametros ${req.params.id}: ${p.modulo} / ${p.seccion} / ${p.concepto} = ${p.parametro}`);
    res.json({ ok: true });
  } catch (err) {
    if (errorDuplicado(err)) return res.status(409).json({ error: 'Ya existe otro parámetro con ese Módulo, Sección y Concepto.' });
    responderError(res, err, 'PUT /api/parametros');
  }
});

router.delete('/api/parametros/:id', async (req, res) => {
  try {
    const acceso = await exigir(req, res, 'parametros', 'eliminar');
    if (!acceso) return;
    const [[fila]] = await pool.execute('SELECT Modulo, Seccion, Concepto, Parametro FROM Config_Parametros WHERE id = ?', [req.params.id]);
    if (!fila) return res.status(404).json({ error: 'El parámetro ya no existe.' });
    await pool.execute('DELETE FROM Config_Parametros WHERE id = ?', [req.params.id]);
    console.log(`[configuracion] ${acceso.usuarioId} eliminó Config_Parametros ${req.params.id}: ${fila.Modulo} / ${fila.Seccion} / ${fila.Concepto} = ${fila.Parametro}`);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err, 'DELETE /api/parametros');
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Visual (Maestro_Menu)
// ══════════════════════════════════════════════════════════════════════════
function leerMenu(body) {
  return validacion(() => {
    const m = {
      modulo: texto(body.modulo, 50, 'Módulo'),
      seccion: texto(body.seccion, 100, 'Sección'),
      rol: unirRoles(body.rol),
      acceso: Number(body.acceso),
      etiqueta: texto(body.etiqueta, 150, 'Etiqueta', false),
      url: texto(body.url, 300, 'Url', false),
      orden: body.orden === '' || body.orden == null ? null : Number(body.orden),
      icono: texto(body.icono, 300, 'Icono', false),
      descripcion: texto(body.descripcion, 500, 'Descripción', false),
    };
    if (!m.rol) throw new Error('Selecciona al menos un rol.');
    if (m.rol.length > 1000) throw new Error('La lista de roles admite máximo 1000 caracteres.');
    if (!Number.isInteger(m.acceso) || m.acceso < 1 || m.acceso > 6) throw new Error('El acceso debe ser un número de 1 a 6.');
    if (m.orden !== null && !Number.isInteger(m.orden)) throw new Error('El orden debe ser un número entero.');
    if (m.url && !m.url.startsWith('/') && !/^https?:\/\//i.test(m.url)) throw new Error('La Url debe empezar por / o por http.');
    return m;
  });
}

// Roles de esta fila que ya están en otra fila (otro nivel de acceso) de la misma sección.
async function rolesRepetidos(m, idActual) {
  const [otras] = await pool.execute(
    'SELECT ID, Acceso, Rol FROM Maestro_Menu WHERE Modulo = ? AND Seccion = ? AND ID <> ?',
    [m.modulo, m.seccion, idActual || 0]
  );
  const avisos = [];
  otras.forEach((o) => {
    const comunes = listaRoles(m.rol).filter((r) => rolEnLista(o.Rol, r));
    if (comunes.length) avisos.push(`${comunes.join(', ')} también está en la fila de acceso ${o.Acceso}; se usa el acceso más amplio.`);
  });
  return avisos;
}

const COLUMNAS_MENU = 'Modulo = ?, Seccion = ?, Rol = ?, Acceso = ?, Etiqueta = ?, Url = ?, Orden = ?, Icono = ?, Descripcion = ?';
const valoresMenu = (m) => [m.modulo, m.seccion, m.rol, m.acceso, m.etiqueta || null, m.url || null, m.orden, m.icono || null, m.descripcion || null];

router.get('/api/menu', async (req, res) => {
  try {
    if (!(await exigir(req, res, 'visual'))) return;
    const [rows] = await pool.query(
      'SELECT ID, Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion FROM Maestro_Menu ORDER BY Modulo, Orden, Seccion, Acceso'
    );
    res.json(rows.map((r) => ({
      id: r.ID, modulo: r.Modulo, seccion: r.Seccion, rol: r.Rol, acceso: r.Acceso,
      etiqueta: r.Etiqueta || '', url: r.Url || '', orden: r.Orden, icono: r.Icono || '', descripcion: r.Descripcion || '',
    })));
  } catch (err) {
    responderError(res, err, 'GET /api/menu');
  }
});

router.post('/api/menu', async (req, res) => {
  try {
    const acceso = await exigir(req, res, 'visual', 'editar');
    if (!acceso) return;
    const m = leerMenu(req.body || {});
    const id = await conProteccion(async (conn) => {
      const [r] = await conn.execute(`INSERT INTO Maestro_Menu SET ${COLUMNAS_MENU}`, valoresMenu(m));
      return r.insertId;
    }, verificarMenuSistema);
    console.log(`[configuracion] ${acceso.usuarioId} creó Maestro_Menu ${id}: ${m.modulo} / ${m.seccion} / acceso ${m.acceso} = ${m.rol}`);
    res.json({ ok: true, id, avisos: await rolesRepetidos(m, id) });
  } catch (err) {
    if (errorDuplicado(err)) return res.status(409).json({ error: 'Ya existe una fila con ese Módulo, Sección y Acceso: agrega los roles en esa fila.' });
    responderError(res, err, 'POST /api/menu');
  }
});

router.put('/api/menu/:id', async (req, res) => {
  try {
    const acceso = await exigir(req, res, 'visual', 'editar');
    if (!acceso) return;
    const m = leerMenu(req.body || {});
    const filas = await conProteccion(async (conn) => {
      const [r] = await conn.execute(`UPDATE Maestro_Menu SET ${COLUMNAS_MENU} WHERE ID = ?`, [...valoresMenu(m), req.params.id]);
      return r.affectedRows;
    }, verificarMenuSistema);
    if (!filas) return res.status(404).json({ error: 'La fila ya no existe.' });
    console.log(`[configuracion] ${acceso.usuarioId} editó Maestro_Menu ${req.params.id}: ${m.modulo} / ${m.seccion} / acceso ${m.acceso} = ${m.rol}`);
    res.json({ ok: true, avisos: await rolesRepetidos(m, Number(req.params.id)) });
  } catch (err) {
    if (errorDuplicado(err)) return res.status(409).json({ error: 'Ya existe otra fila con ese Módulo, Sección y Acceso: agrega los roles en esa fila.' });
    responderError(res, err, 'PUT /api/menu');
  }
});

router.delete('/api/menu/:id', async (req, res) => {
  try {
    const acceso = await exigir(req, res, 'visual', 'eliminar');
    if (!acceso) return;
    const [[fila]] = await pool.execute('SELECT Modulo, Seccion, Acceso, Rol FROM Maestro_Menu WHERE ID = ?', [req.params.id]);
    if (!fila) return res.status(404).json({ error: 'La fila ya no existe.' });
    await conProteccion((conn) => conn.execute('DELETE FROM Maestro_Menu WHERE ID = ?', [req.params.id]), verificarMenuSistema);
    console.log(`[configuracion] ${acceso.usuarioId} eliminó Maestro_Menu ${req.params.id}: ${fila.Modulo} / ${fila.Seccion} / acceso ${fila.Acceso} = ${fila.Rol}`);
    res.json({ ok: true });
  } catch (err) {
    responderError(res, err, 'DELETE /api/menu');
  }
});

module.exports = router;

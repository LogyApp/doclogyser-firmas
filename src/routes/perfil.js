const express = require('express');
const multer = require('multer');
const pool = require('../services/db');
const { guardarEmpleadoFirma } = require('../services/firmaSyncService');
const { obtenerFirmaBase64Reciente, subirFirma } = require('../services/storage');
const { menuDelRol } = require('../services/maestroMenu');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function obtenerPerfilPropio(usuarioId) {
  if (!usuarioId) return { error: 'Parámetro usuario requerido', status: 400 };

  const [usuarios] = await pool.execute(
    'SELECT ID, Nombre, Rol, Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
    [usuarioId]
  );
  if (!usuarios.length) return { error: 'Usuario no registrado', status: 403 };
  const user = usuarios[0];
  if (!user.Colaborador) return { perfil: null, user };

  const [segmentos] = await pool.execute(
    `SELECT DISTINCT \`Identificación\` AS identificacion
     FROM \`Maestro_Segmentación\`
     WHERE TRIM(Trabajador) = TRIM(?) AND \`Identificación\` IS NOT NULL`,
    [user.Colaborador]
  );
  const ids = [...new Set(segmentos.map(row => String(row.identificacion).trim()).filter(Boolean))];
  if (ids.length > 1) return { error: 'El usuario está relacionado con más de una identificación; contacte a soporte.', status: 409 };
  if (!ids.length) return { perfil: null, user };

  const [perfiles] = await pool.execute(
    `SELECT Identificacion AS identificacion, nombre, cargo, regional, operacion,
            area, direccion, email, celular, foto_url, firma_url
     FROM Maestro_firma_corporativa WHERE Identificacion = ? LIMIT 1`,
    [ids[0]]
  );
  return { perfil: perfiles[0] || null, user };
}

// ─── Preferencias de UI (tema/color de acento) ──────────────────────────────
// Tabla y endpoint independientes de Maestro_firma_corporativa: a diferencia
// del resto de este archivo, cualquier cuenta con fila en Maestro_Usuarios
// (incluidas cuentas sin perfil corporativo, como "Sistema") debe poder
// guardar su tema/acento sin pasar por la validación de perfil completo.
const TEMAS_VALIDOS = ['claro', 'oscuro', 'sistema'];
const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

async function obtenerPreferenciasUI(usuarioId) {
  if (!usuarioId) return { tema: 'sistema', colorAcento: '#F55400' };
  const [rows] = await pool.execute(
    'SELECT Tema, ColorAcento FROM Maestro_Preferencias_UI WHERE ID = ? LIMIT 1',
    [usuarioId]
  );
  if (!rows.length) return { tema: 'sistema', colorAcento: '#F55400' };
  return { tema: rows[0].Tema, colorAcento: rows[0].ColorAcento };
}

router.get('/api/preferencias', async (req, res) => {
  try {
    const usuario = req.query.usuario;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const [uRows] = await pool.execute('SELECT ID FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!uRows.length) return res.status(403).json({ error: 'Usuario no registrado' });
    const prefs = await obtenerPreferenciasUI(usuario);
    res.json({ ok: true, ...prefs });
  } catch (err) {
    console.error('[perfil] GET /api/preferencias', err);
    res.status(500).json({ error: 'No se pudieron cargar las preferencias.' });
  }
});

router.post('/api/preferencias', async (req, res) => {
  try {
    const { usuario, tema, colorAcento } = req.body || {};
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });
    const [uRows] = await pool.execute('SELECT ID FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!uRows.length) return res.status(403).json({ error: 'Usuario no registrado' });

    const temaValido = TEMAS_VALIDOS.includes(tema) ? tema : 'sistema';
    const acentoValido = HEX_REGEX.test(colorAcento || '') ? colorAcento : '#F55400';

    await pool.execute(
      `INSERT INTO Maestro_Preferencias_UI (ID, Tema, ColorAcento) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE Tema = VALUES(Tema), ColorAcento = VALUES(ColorAcento)`,
      [usuario, temaValido, acentoValido]
    );

    res.json({ ok: true, tema: temaValido, colorAcento: acentoValido });
  } catch (err) {
    console.error('[perfil] POST /api/preferencias', err);
    res.status(500).json({ error: 'No se pudieron guardar las preferencias.' });
  }
});

// ─── Menú OTROS ─────────────────────────────────────────────────────────────
// Módulos y pestañas que el rol del usuario puede ver (Maestro_Menu). Las direcciones ya
// llevan el usuario.
router.get('/api/menu', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ ok: false, error: 'Parámetro usuario requerido' });
    const [usuarios] = await pool.execute('SELECT ID, Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]);
    if (!usuarios.length) return res.status(403).json({ ok: false, error: 'Usuario no registrado' });

    const conUsuario = (url) => `${url}${url.includes('?') ? '&' : '?'}usuario=${encodeURIComponent(usuarios[0].ID)}`;
    const modulos = (await menuDelRol(usuarios[0].Rol)).map((m) => ({
      ...m,
      items: m.items.map((i) => ({ etiqueta: i.etiqueta, url: conUsuario(i.url) })),
    }));
    res.json({ ok: true, modulos });
  } catch (err) {
    console.error('[perfil] GET /api/menu:', err);
    res.status(500).json({ ok: false, error: 'No se pudo cargar el menú' });
  }
});

router.get('/api', async (req, res) => {
  try {
    const result = await obtenerPerfilPropio(req.query.usuario);
    if (result.error) return res.status(result.status).json({ error: result.error });
    const preferenciasUI = await obtenerPreferenciasUI(result.user?.ID);
    if (!result.perfil) {
      return res.json({
        ok: true,
        perfil: {
          identificacion: result.user?.ID || '',
          nombre: result.user?.Nombre || result.user?.ID || 'Usuario del Sistema',
          cargo: result.user?.Rol || 'Administrador',
          regional: 'Nacional',
          operacion: 'General',
          area: 'Sistemas',
          direccion: '',
          email: '',
          celular: '',
          foto_url: null,
          firma_url: null
        },
        firmaDigital: null,
        preferenciasUI
      });
    }

    let firmaDigital = null;
    try { firmaDigital = await obtenerFirmaBase64Reciente(result.perfil.identificacion); }
    catch (err) { console.warn('[perfil] No se pudo leer la firma digital reciente:', err.message); }
    res.json({ ok: true, perfil: result.perfil, firmaDigital, preferenciasUI });
  } catch (err) {
    console.error('[perfil] GET /api', err);
    res.status(500).json({ error: 'No se pudo cargar el perfil.' });
  }
});

router.post('/api', (req, res, next) => {
  upload.single('foto')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'La foto no puede superar 10 MB.' : 'No se pudo recibir la foto.' });
    next();
  });
}, async (req, res) => {
  try {
    const result = await obtenerPerfilPropio(req.body.usuario);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (!result.perfil) return res.status(404).json({ error: 'No se encontró un perfil corporativo relacionado con este usuario.' });
    if (req.file && !['image/png', 'image/jpeg', 'image/webp'].includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'La foto debe ser PNG, JPG o WEBP.' });
    }

    const actual = result.perfil;
    const fields = {
      nombre: String(req.body.nombre || '').trim(),
      cargo: String(req.body.cargo || '').trim(),
      direccion: String(req.body.direccion || '').trim(),
      email: String(req.body.email || '').trim(),
      celular: String(req.body.celular || '').trim(),
    };
    if (!fields.nombre || !fields.cargo || !fields.email || !fields.celular) {
      return res.status(400).json({ error: 'Nombre, cargo, correo electrónico y celular son obligatorios.' });
    }
    const limits = { nombre: 100, cargo: 100, direccion: 255, email: 100, celular: 20 };
    const longField = Object.entries(fields).find(([key, value]) => value.length > limits[key]);
    if (longField) return res.status(400).json({ error: `${longField[0]} supera el máximo de ${limits[longField[0]]} caracteres.` });

    let digitalPng = null;
    if (req.body.firmaDigital) {
      const match = String(req.body.firmaDigital).match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) return res.status(400).json({ error: 'La firma dibujada debe ser un PNG válido.' });
      digitalPng = Buffer.from(match[1], 'base64');
      if (!digitalPng.length || digitalPng.length > 5 * 1024 * 1024 || digitalPng.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
        return res.status(400).json({ error: 'La firma digital debe ser un PNG válido de máximo 5 MB.' });
      }
    }

    const saved = await guardarEmpleadoFirma({
      identificacion: actual.identificacion,
      ...fields,
      regional: actual.regional,
      operacion: actual.operacion,
      area: actual.area,
      foto_url: actual.foto_url,
      usuario: result.user.ID,
    }, req.file, true, result.user.ID);

    if (digitalPng) await subirFirma(actual.identificacion, digitalPng);
    let firmaDigital = digitalPng ? req.body.firmaDigital : null;
    if (!firmaDigital) {
      try { firmaDigital = await obtenerFirmaBase64Reciente(actual.identificacion); }
      catch (err) { console.warn('[perfil] No se pudo leer la firma digital reciente:', err.message); }
    }

    let preferenciasUI = null;
    if (req.body.tema || req.body.colorAcento) {
      const temaValido = TEMAS_VALIDOS.includes(req.body.tema) ? req.body.tema : 'sistema';
      const acentoValido = HEX_REGEX.test(req.body.colorAcento || '') ? req.body.colorAcento : '#F55400';
      try {
        await pool.execute(
          `INSERT INTO Maestro_Preferencias_UI (ID, Tema, ColorAcento) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE Tema = VALUES(Tema), ColorAcento = VALUES(ColorAcento)`,
          [result.user.ID, temaValido, acentoValido]
        );
        preferenciasUI = { tema: temaValido, colorAcento: acentoValido };
      } catch (prefErr) {
        console.warn('[perfil] No se pudieron guardar preferencias UI en POST /api:', prefErr.message);
      }
    }

    res.json({
      ok: true,
      perfil: {
        ...actual,
        ...fields,
        foto_url: saved.foto_url,
        firma_url: saved.firma_url || actual.firma_url,
        firma_generada: Boolean(saved.firma_url),
      },
      firmaDigital,
      preferenciasUI,
    });
  } catch (err) {
    console.error('[perfil] POST /api', err);
    res.status(500).json({ error: err.code === 'EMPLEADO_RETIRADO' ? err.message : 'No se pudieron guardar los cambios del perfil.' });
  }
});

module.exports = router;
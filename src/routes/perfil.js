const express = require('express');
const multer = require('multer');
const pool = require('../services/db');
const { guardarEmpleadoFirma } = require('../services/firmaSyncService');
const { obtenerFirmaBase64Reciente, subirFirma } = require('../services/storage');

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

router.get('/api', async (req, res) => {
  try {
    const result = await obtenerPerfilPropio(req.query.usuario);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (!result.perfil) return res.status(404).json({ error: 'No se encontró un perfil corporativo relacionado con este usuario.' });

    let firmaDigital = null;
    try { firmaDigital = await obtenerFirmaBase64Reciente(result.perfil.identificacion); }
    catch (err) { console.warn('[perfil] No se pudo leer la firma digital reciente:', err.message); }
    res.json({ ok: true, perfil: result.perfil, firmaDigital });
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
    });
  } catch (err) {
    console.error('[perfil] POST /api', err);
    res.status(500).json({ error: err.code === 'EMPLEADO_RETIRADO' ? err.message : 'No se pudieron guardar los cambios del perfil.' });
  }
});

module.exports = router;
const express = require('express');
const path = require('path');
const multer = require('multer');
const {
  listarColaboradoresDirectorio,
  buscarEmpleadoParaFirma,
  sincronizarConVinculacion,
  guardarEmpleadoFirma,
  eliminarColaboradorFirma,
  obtenerUsuarioPorId,
  verificarPermisosColaborador
} = require('../services/firmaSyncService');

const router = express.Router();
const HTML_VIEW_PATH = path.join(__dirname, '../views/directoriocorporativo/index.html');

// Configuración Multer para carga de fotos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// 1. Vista principal del Directorio Corporativo
router.get('/', (req, res) => {
  res.sendFile(HTML_VIEW_PATH);
});

// 2. API: Consultar información y permisos del usuario según ?usuario=ID
router.get('/api/usuario-info', async (req, res) => {
  try {
    const usuarioId = req.query.usuario;
    if (!usuarioId) {
      return res.json({ ok: true, usuario: null });
    }
    const user = await obtenerUsuarioPorId(usuarioId);
    if (!user) {
      return res.json({ ok: true, usuario: null, noExiste: true });
    }
    return res.json({
      ok: true,
      usuario: {
        id: user.ID,
        nombre: user.Nombre,
        rol: user.Rol,
        colaborador: user.Colaborador,
        cargo: user.Cargo,
        email: user.Email,
        esSistema: user.Rol === 'Sistema'
      }
    });
  } catch (err) {
    console.error('[directoriocorporativo] Error en usuario-info:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 3. API: Obtener colaboradores y estadísticas para el directorio (con permisos por usuario)
router.get('/api/colaboradores', async (req, res) => {
  try {
    const usuarioId = req.query.usuario;
    let usuarioObj = null;
    if (usuarioId) {
      usuarioObj = await obtenerUsuarioPorId(usuarioId);
    }

    const lista = await listarColaboradoresDirectorio();

    // Calcular estadísticas de conteo
    const porArea = {};
    const porRegional = {};

    const colaboradoresConPermisos = lista.map(c => {
      const a = (c.area || 'auxiliares_administrativos').toLowerCase();
      porArea[a] = (porArea[a] || 0) + 1;

      const r = (c.regional || 'GENERAL').toUpperCase();
      porRegional[r] = (porRegional[r] || 0) + 1;

      const permisos = verificarPermisosColaborador(usuarioObj, c);

      return {
        ...c,
        puedeEditar: permisos.puedeEditar,
        puedeEliminar: permisos.puedeEliminar,
        esPropio: permisos.esPropio
      };
    });

    res.json({
      ok: true,
      usuarioActual: usuarioObj ? {
        id: usuarioObj.ID,
        nombre: usuarioObj.Nombre,
        rol: usuarioObj.Rol,
        esSistema: usuarioObj.Rol === 'Sistema'
      } : null,
      total: lista.length,
      estadisticas: {
        porArea,
        porRegional
      },
      colaboradores: colaboradoresConPermisos
    });
  } catch (err) {
    console.error('[directoriocorporativo] Error al listar colaboradores:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. API: Detalle individual de colaborador
router.get('/api/colaborador/:id', async (req, res) => {
  try {
    const resultado = await buscarEmpleadoParaFirma(req.params.id);
    if (!resultado || !resultado.data) {
      return res.status(404).json({ ok: false, error: 'Colaborador no encontrado' });
    }

    const usuarioId = req.query.usuario;
    let permisos = { puedeEditar: false, puedeEliminar: false, esSistema: false, esPropio: false };
    if (usuarioId) {
      const user = await obtenerUsuarioPorId(usuarioId);
      if (user) {
        permisos = verificarPermisosColaborador(user, resultado.data);
      }
    }

    res.json({
      ok: true,
      colaborador: {
        ...resultado.data,
        ...permisos
      }
    });
  } catch (err) {
    console.error('[directoriocorporativo] Error al consultar colaborador:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. API: Guardar o editar colaborador con validación estricta de permisos
router.post('/api/colaborador/guardar', upload.single('foto'), async (req, res) => {
  try {
    const usuarioId = req.body.usuario_id || req.body.usuario;
    if (!usuarioId) {
      return res.status(401).json({ ok: false, error: 'Debe especificar el usuario para guardar cambios.' });
    }

    const user = await obtenerUsuarioPorId(usuarioId);
    if (!user) {
      return res.status(403).json({ ok: false, error: 'Usuario no válido o no autorizado.' });
    }

    const esSistema = (user.Rol === 'Sistema');
    const identificacion = String(req.body.identificacion || '').trim();

    if (!identificacion) {
      return res.status(400).json({ ok: false, error: 'La identificación es requerida.' });
    }

    const actual = await buscarEmpleadoParaFirma(identificacion);
    const existe = actual && actual.data;

    let datosFinales = {};

    if (esSistema) {
      // Rol Sistema puede editar cualquier campo y crear nuevos
      datosFinales = {
        identificacion,
        nombre: req.body.nombre,
        cargo: req.body.cargo,
        regional: req.body.regional,
        operacion: req.body.operacion,
        area: req.body.area,
        direccion: req.body.direccion,
        email: req.body.email,
        celular: req.body.celular,
        foto_url: req.body.foto_url,
        usuario: user.ID
      };
    } else {
      // Regla 2.1: Si coincide Colaborador con Trabajador
      if (!existe) {
        return res.status(403).json({ ok: false, error: 'No tienes permisos para crear nuevos colaboradores.' });
      }

      const permisos = verificarPermisosColaborador(user, existe);
      if (!permisos.puedeEditar) {
        return res.status(403).json({ ok: false, error: 'Solo puedes editar tu propio registro de colaborador.' });
      }

      // Solo puede editar: nombre, cargo, direccion, email, celular y foto
      datosFinales = {
        identificacion,
        nombre: req.body.nombre || existe.nombre,
        cargo: req.body.cargo || existe.cargo,
        regional: existe.regional,       // Mantiene original
        operacion: existe.operacion,     // Mantiene original
        area: existe.area,               // Mantiene original
        direccion: req.body.direccion !== undefined ? req.body.direccion : existe.direccion,
        email: req.body.email !== undefined ? req.body.email : existe.email,
        celular: req.body.celular !== undefined ? req.body.celular : existe.celular,
        foto_url: req.body.foto_url || existe.foto_url,
        usuario: user.ID
      };
    }

    const generarPng = req.body.generarPng !== 'false';
    const resultado = await guardarEmpleadoFirma(datosFinales, req.file, generarPng, user.ID);

    res.json({ ok: true, mensaje: 'Colaborador guardado exitosamente.', resultado });
  } catch (err) {
    console.error('[directoriocorporativo] Error al guardar colaborador:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 6. API: Eliminar colaborador (Exclusivo Rol Sistema)
router.delete('/api/colaborador/:id', async (req, res) => {
  try {
    const usuarioId = req.query.usuario || req.body.usuario || req.headers['x-usuario'];
    if (!usuarioId) {
      return res.status(401).json({ ok: false, error: 'Usuario no especificado.' });
    }

    const user = await obtenerUsuarioPorId(usuarioId);
    const esSistema = user && String(user.Rol || '').trim().toLowerCase() === 'sistema';
    if (!esSistema) {
      return res.status(403).json({ ok: false, error: 'Solo los usuarios con Rol de Sistema pueden eliminar colaboradores.' });
    }

    const eliminacion = await eliminarColaboradorFirma(req.params.id);
    res.json({ ok: true, mensaje: 'Colaborador eliminado correctamente.', eliminacion });
  } catch (err) {
    console.error('[directoriocorporativo] Error al eliminar colaborador:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 7. API: Sincronizar bajo demanda con Maestro_Vinculación
router.post('/api/sincronizar', async (req, res) => {
  try {
    const resultado = await sincronizarConVinculacion();
    res.json(resultado);
  } catch (err) {
    console.error('[directoriocorporativo] Error en sincronización:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

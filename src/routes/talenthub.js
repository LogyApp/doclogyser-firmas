const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../services/db');
const { storage, obtenerFirmaBase64Reciente, subirFirma } = require('../services/storage');
const { computarAccesoTalenthub } = require('../services/accesoTalenthub');
const { guardarEmpleadoFirma } = require('../services/firmaSyncService');

const router = express.Router();
const uploadFotoPerfil = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const HTML_PATH = path.join(__dirname, '../views/talenthub/index.html');

const BUCKET_FIRMAS = process.env.BUCKET_FIRMAS || 'firmas-images';
const BUCKET_PDFS = process.env.BUCKET_PDFS || 'talenthub_central';
const BUCKET_HOJAS_VIDA = 'hojas_vida_logyser';

const BUCKETS = [BUCKET_FIRMAS, BUCKET_HOJAS_VIDA, BUCKET_PDFS];

// Tablas hijas del módulo de Selección dependientes de Dynamic_hv_aspirante (por id_aspirante)
const TABLAS_SELECCION_HIJAS = [
  'Dynamic_hv_documentos',
  'Dynamic_hv_experiencia_laboral',
  'Dynamic_hv_educacion',
  'Dynamic_hv_contacto_emergencia',
  'Dynamic_hv_familiares',
  'Dynamic_Aspirante_Hijos',
  'Dynamic_hv_referencias',
  'Dynamic_hv_seguridad',
  'Dynamic_hv_metas_personales',
  'tokens_seleccion'
];

// Tablas directas vinculadas por Identificación del trabajador
const TABLES = [
  { table: 'Dynamic_Asistencia', column: 'Cédula' },
  { table: 'Dynamic_Encuesta_Satisfaccion', column: 'identificacion' },
  { table: 'Dynamic_Actas', column: 'identificacion' },
  { table: 'Dynamic_Solicitud_Vacaciones', column: 'Identificación' },
  { table: 'Dynamic_traslados_trabajador', column: 'Identificación' },
  { table: 'Maestro_Examenes', column: 'Identificación' },
  { table: 'Maestro_Vinculación', column: 'Identificación' },
  { table: 'Maestro_firma_corporativa', column: 'Identificacion' },
  { table: 'facial_marcaciones', column: 'identificacion' },
  { table: 'facial_movimientos', column: 'identificacion' },
  { table: 'Maestro_docTrabajador', column: 'Identificación' },
  { table: 'Maestro_capacitacionsst', column: 'identificacion' },
  { table: 'Maestro_evaluacionsst', column: 'identificacion' },
  { table: 'Maestro_movilidadyriesgosst', column: 'identificacion' },
  { table: 'Maestro_ok_carpeta', column: 'Identificación' },
  { table: 'Maestro_pazysalvo', column: 'identificacion' },
  { table: 'Maestro_responsablegastos', column: 'identificacion' },
  { table: 'Dynamic_hv_aspirante', column: 'identificacion' },
  { table: 'Dynamic_Logueo_Trabajadores', column: 'Identificación' },
  { table: 'Dynamic_formato_itemsAsistencia', column: 'identificacion' },
  { table: 'Dynamic_gasto_trabajador', column: 'identificacion' },
  { table: 'Dynamic_gastos', column: 'numero_identificacion' },
  { table: 'Dynamic_compromisosst', column: 'identificaciontrabajador' },
  { table: 'Dynamic_pruebaconsumo', column: 'identificacion' },
  { table: 'Dynamic_Kardex', column: 'UsuarioAsignado' },
  { table: 'Dynamic_Logysign', column: 'identificacion' },
  { table: 'Maestro_casosmedicos', column: 'identificacion' },
  { table: 'Maestro_Segmentación', column: 'Identificación' }
];

function paginaNoAcceso(mensaje = 'No tienes permiso para ver este módulo.') {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin acceso — TalentHub</title><style>*{box-sizing:border-box}body{font-family:'Outfit',sans-serif,system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f172a;color:#cbd5e1}.card{background:#1e293b;padding:2.5rem 2rem;border-radius:12px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.4);max-width:420px;width:90%;border:1px solid #334155}h2{color:#f8fafc;margin-bottom:10px;font-size:1.3rem}p{color:#94a3b8;font-size:.9rem;margin:0 0 1.5rem}.icon{font-size:2.8rem;margin-bottom:12px}.btn{display:inline-block;padding:10px 18px;background:#5b5fc7;color:#fff;border-radius:8px;text-decoration:none;font-size:.85rem;font-weight:600}</style></head><body><div class="card"><div class="icon">🔒</div><h2>Acceso Restringido</h2><p>${mensaje}</p><a href="javascript:history.back()" class="btn">Regresar</a></div></body></html>`;
}

// ── GET / (Vista Principal TalentHub) ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { usuario, tab } = req.query;
    if (!usuario) {
      return res.status(400).send(paginaNoAcceso('Parámetro ?usuario requerido para iniciar sesión en TalentHub.'));
    }

    const acceso = await computarAccesoTalenthub(usuario);
    if (!acceso || !acceso.secciones.length) {
      return res.status(403).send(paginaNoAcceso('Tu rol actual no tiene permisos configurados en Maestro_Menu_Talenthub.'));
    }

    let activeTab = tab || 'Requisiciones';
    if (!acceso.secciones.includes(activeTab)) {
      activeTab = acceso.secciones[0];
    }
    acceso.activeTab = activeTab;

    if (!fs.existsSync(HTML_PATH)) {
      return res.status(500).send('<h2>Error: Vista de TalentHub en construcción.</h2>');
    }

    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const config = JSON.stringify(acceso).replace(/<\/script>/gi, '<\\/script>');
    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[talenthub] Error al servir la página:', err);
    res.status(500).send(paginaNoAcceso('Error interno del servidor al cargar TalentHub.'));
  }
});

// ── Perfil de Usuario Corporativo ───────────────────────────────────────────
async function obtenerPerfilTalenthub(usuarioId) {
  if (!usuarioId) return { error: 'Parámetro usuario requerido', status: 400 };

  const [usuarios] = await pool.execute(
    'SELECT ID, Nombre, Rol, Colaborador FROM Maestro_Usuarios WHERE ID = ? LIMIT 1',
    [usuarioId]
  );
  if (!usuarios.length) return { error: 'Usuario no registrado', status: 403 };

  const user = usuarios[0];
  const acceso = await computarAccesoTalenthub(user.ID);
  if (!acceso) {
    return { error: 'Usuario no autorizado para TalentHub', status: 403 };
  }
  if (!user.Colaborador) return { perfil: null, user };

  const [segmentos] = await pool.execute(
    `SELECT DISTINCT \`Identificación\` AS identificacion, Trabajador, \`Operación\` AS operacion
     FROM \`Maestro_Segmentación\`
     WHERE TRIM(Trabajador) = TRIM(?) AND \`Identificación\` IS NOT NULL`,
    [user.Colaborador]
  );
  let identificaciones = [...new Set(segmentos.map(row => String(row.identificacion).trim()).filter(Boolean))];
  if (!identificaciones.length && user.Colaborador && user.Colaborador.includes('**')) {
    const cedulaFromColab = user.Colaborador.split('**')[0].trim();
    if (cedulaFromColab) identificaciones = [cedulaFromColab];
  }

  if (identificaciones.length > 1) {
    return { error: 'El usuario está relacionado con más de una identificación; contacte al Administrador.', status: 409 };
  }
  if (!identificaciones.length) return { perfil: null, user };

  const [perfiles] = await pool.execute(
    `SELECT Identificacion AS identificacion, nombre, cargo, regional, operacion,
            area, direccion, email, celular, foto_url, firma_url
     FROM Maestro_firma_corporativa
     WHERE Identificacion = ?
     LIMIT 1`,
    [identificaciones[0]]
  );

  if (perfiles.length) {
    return { perfil: perfiles[0], user };
  }

  // Fallback si aún no existe en Maestro_firma_corporativa
  const [segRows] = await pool.execute(
    `SELECT Identificación AS identificacion, Trabajador AS nombre, \`Operación\` AS operacion
     FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1`,
    [identificaciones[0]]
  );
  const base = segRows[0] || {};
  return {
    perfil: {
      identificacion: identificaciones[0],
      nombre: base.nombre || user.Nombre || '',
      cargo: '',
      regional: acceso.regional || '',
      operacion: base.operacion || acceso.operacion || '',
      area: 'TalentHub',
      direccion: '',
      email: '',
      celular: '',
      foto_url: '',
      firma_url: ''
    },
    user
  };
}

// GET /api/perfil
router.get('/api/perfil', async (req, res) => {
  try {
    const resultado = await obtenerPerfilTalenthub(req.query.usuario);
    if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });
    if (!resultado.perfil) return res.status(404).json({ error: 'No se encontró un perfil corporativo relacionado con este usuario.' });
    let firmaDigital = null;
    try {
      firmaDigital = await obtenerFirmaBase64Reciente(resultado.perfil.identificacion);
    } catch (err) {
      console.warn('[talenthub] No se pudo leer la firma digital reciente:', err.message);
    }
    res.json({ ok: true, perfil: resultado.perfil, firmaDigital });
  } catch (err) {
    console.error('[talenthub] GET /api/perfil', err);
    res.status(500).json({ error: 'No se pudo cargar el perfil.' });
  }
});

// POST /api/perfil
router.post('/api/perfil', (req, res, next) => {
  uploadFotoPerfil.single('foto')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'La foto no puede superar 10 MB.' : 'No se pudo recibir la foto.' });
    next();
  });
}, async (req, res) => {
  try {
    const resultado = await obtenerPerfilTalenthub(req.body.usuario);
    if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });
    if (!resultado.perfil) return res.status(404).json({ error: 'No se encontró un perfil corporativo relacionado con este usuario.' });

    if (req.file && !['image/png', 'image/jpeg', 'image/webp'].includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'La foto debe ser PNG, JPG o WEBP.' });
    }

    const actual = resultado.perfil;
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    const campos = {
      nombre: [nombre, 100],
      cargo: [String(req.body.cargo || '').trim(), 100],
      direccion: [String(req.body.direccion || '').trim(), 255],
      email: [String(req.body.email || '').trim(), 100],
      celular: [String(req.body.celular || '').trim(), 20],
    };
    if (!campos.cargo[0] || !campos.email[0] || !campos.celular[0]) {
      return res.status(400).json({ error: 'Cargo, correo electrónico y celular son obligatorios para generar la firma.' });
    }
    const campoLargo = Object.entries(campos).find(([, [valor, max]]) => valor.length > max);
    if (campoLargo) return res.status(400).json({ error: `${campoLargo[0]} supera el máximo de ${campoLargo[1][1]} caracteres.` });

    let firmaDigital = null;
    if (req.body.firmaDigital) {
      const match = String(req.body.firmaDigital).match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) return res.status(400).json({ error: 'La firma digital dibujada no tiene un formato PNG válido.' });
      const firmaBuffer = Buffer.from(match[1], 'base64');
      if (!firmaBuffer.length || firmaBuffer.length > 5 * 1024 * 1024 || firmaBuffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
        return res.status(400).json({ error: 'La firma digital debe ser un PNG válido de máximo 5 MB.' });
      }
      await subirFirma(actual.identificacion, firmaBuffer);
      firmaDigital = req.body.firmaDigital;
    } else {
      try {
        firmaDigital = await obtenerFirmaBase64Reciente(actual.identificacion);
      } catch (err) {
        console.warn('[talenthub] No se pudo conservar la firma digital reciente:', err.message);
      }
    }

    const guardado = await guardarEmpleadoFirma({
      identificacion: actual.identificacion,
      nombre: campos.nombre[0],
      cargo: campos.cargo[0],
      regional: actual.regional,
      operacion: actual.operacion,
      area: actual.area || 'TalentHub',
      direccion: campos.direccion[0],
      email: campos.email[0],
      celular: campos.celular[0],
      foto_url: actual.foto_url,
      usuario: resultado.user.ID,
    }, req.file, true, resultado.user.ID);

    res.json({ ok: true, perfil: {
      ...actual,
      ...Object.fromEntries(Object.entries(campos).map(([k, [v]]) => [k, v])),
      foto_url: guardado.foto_url,
      firma_url: guardado.firma_url || actual.firma_url,
      firma_generada: Boolean(guardado.firma_url),
    }, firmaDigital });
  } catch (err) {
    console.error('[talenthub] POST /api/perfil', err);
    res.status(500).json({ error: err.code === 'EMPLEADO_RETIRADO' ? err.message : 'No se pudieron guardar los cambios del perfil.' });
  }
});

// ── API: Buscar trabajador para Integridad ──────────────────────────────────────
router.get('/api/integridad/buscar/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    const { usuario } = req.query;

    const acceso = await computarAccesoTalenthub(usuario, 'Integridad');
    if (!acceso) {
      return res.status(403).json({ error: 'No tienes permiso para acceder a la pestaña de Integridad.' });
    }

    // 1. Buscar en Maestro_Segmentación (Sociodemográfica)
    const [rows] = await pool.execute(
      `SELECT ms.Identificación AS identificacion, 
              ms.Trabajador AS nombre, 
              ms.\`Operación\` AS operacion,
              mv.Regional AS regional,
              mv.Cargo AS cargo,
              mv.Estado AS estado,
              DATE_FORMAT(mv.\`Fecha de Ingreso\`, '%Y-%m-%d') AS fechaIngreso
       FROM Maestro_Segmentación ms
       LEFT JOIN (
         SELECT v1.Identificación, v1.Regional, v1.Cargo, v1.Estado, v1.\`Fecha de Ingreso\`
         FROM Maestro_Vinculación v1
         INNER JOIN (
           SELECT Identificación, MAX(\`Fecha de Ingreso\`) AS max_fecha
           FROM Maestro_Vinculación
           GROUP BY Identificación
         ) v2 ON v1.Identificación = v2.Identificación AND v1.\`Fecha de Ingreso\` = v2.max_fecha
       ) mv ON ms.Identificación = mv.Identificación
       WHERE ms.Identificación = ? LIMIT 1`,
      [identificacion]
    );

    let t = null;
    let tieneSociodemografica = false;
    let tieneAspirante = false;

    if (rows.length) {
      t = rows[0];
      tieneSociodemografica = true;
    } else {
      // 2. Si no está en Sociodemográfica, buscar en Dynamic_hv_aspirante (Previnculación / Selección)
      const [hvRows] = await pool.execute(
        `SELECT identificacion,
                TRIM(CONCAT_WS(' ', primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)) AS nombre,
                'Selección / Aspirantes' AS operacion,
                COALESCE(departamento, ciudad, 'N/A') AS regional,
                'Aspirante' AS cargo,
                COALESCE(estado_proceso, 'Aspirante en Selección') AS estado,
                DATE_FORMAT(fecha_registro, '%Y-%m-%d') AS fechaIngreso
         FROM Dynamic_hv_aspirante
         WHERE identificacion = ? LIMIT 1`,
        [identificacion]
      );

      if (!hvRows.length) {
        return res.status(404).json({ error: 'Trabajador o aspirante no encontrado en el sistema.' });
      }

      t = hvRows[0];
      tieneSociodemografica = false;
      tieneAspirante = true;
    }

    // Conteo rápido de registros relacionados en tablas clave
    const [[cDoc]] = await pool.execute('SELECT COUNT(*) as cnt FROM Maestro_docTrabajador WHERE `Identificación` = ?', [identificacion]);
    const [[cAct]] = await pool.execute('SELECT COUNT(*) as cnt FROM Dynamic_Actas WHERE identificacion = ?', [identificacion]);
    const [[cKar]] = await pool.execute('SELECT COUNT(*) as cnt FROM Dynamic_Kardex WHERE UsuarioAsignado = ?', [identificacion]);
    const [[cBio]] = await pool.execute('SELECT COUNT(*) as cnt FROM facial_marcaciones WHERE identificacion = ?', [identificacion]);
    const [[cHv]]  = await pool.execute('SELECT COUNT(*) as cnt FROM Dynamic_hv_aspirante WHERE identificacion = ?', [identificacion]);
    const [[cMed]] = await pool.execute('SELECT COUNT(*) as cnt FROM Maestro_casosmedicos WHERE identificacion = ?', [identificacion]);

    if (tieneSociodemografica) {
      tieneAspirante = cHv.cnt > 0;
    }

    const [hvInfoRows] = await pool.execute('SELECT estado_proceso FROM Dynamic_hv_aspirante WHERE identificacion = ? LIMIT 1', [identificacion]);
    const estadoAspirante = hvInfoRows.length ? hvInfoRows[0].estado_proceso : null;

    res.json({
      ok: true,
      trabajador: {
        identificacion: t.identificacion,
        nombre: t.nombre || 'Sin nombre registrado',
        operacion: t.operacion || 'N/A',
        regional: t.regional || 'N/A',
        cargo: t.cargo || 'N/A',
        estado: t.estado || (tieneSociodemografica ? 'Activo' : 'Aspirante en Selección'),
        estadoAspirante,
        fechaIngreso: t.fechaIngreso || 'N/A',
        tieneSociodemografica,
        tieneAspirante,
        origen: tieneSociodemografica ? 'sociodemografica' : 'aspirante',
        conteos: {
          documentos: cDoc.cnt,
          actas: cAct.cnt,
          kardex: cKar.cnt,
          biometrico: cBio.cnt,
          seleccion: cHv.cnt,
          casosMedicos: cMed.cnt
        }
      }
    });
  } catch (err) {
    console.error('[talenthub] GET /api/integridad/buscar:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Historial de eliminaciones (Maestro_integridad) ───────────────────────
router.get('/api/integridad/historial', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoTalenthub(usuario, 'Integridad');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado para ver auditoría de Integridad.' });
    }

    const [rows] = await pool.execute(
      `SELECT id, identificacion, nombre_trabajador, operacion, usuario, 
              DATE_FORMAT(fecha, '%Y-%m-%d %H:%i:%s') AS fecha,
              archivo_evidencia_url, total_registros_eliminados, resumen_tablas
       FROM Maestro_integridad
       ORDER BY fecha DESC
       LIMIT 100`
    );

    res.json({ ok: true, historial: rows });
  } catch (err) {
    console.error('[talenthub] GET /api/integridad/historial:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Eliminar trabajador con reporte en GCS y registro en Maestro_integridad ───
router.post('/api/integridad/eliminar', async (req, res) => {
  const { identificacion, usuario, soloSociodemografica } = req.body;
  if (!identificacion || !usuario) {
    return res.status(400).json({ error: 'identificacion y usuario requeridos' });
  }

  try {
    const acceso = await computarAccesoTalenthub(usuario, 'Integridad');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado para ejecutar eliminaciones de integridad.' });
    }

    const esSoloSociodemo = Boolean(soloSociodemografica);
    console.log(`[talenthub-integridad] Iniciando eliminación del trabajador ${identificacion} por ${usuario} (SoloSociodemo: ${esSoloSociodemo})`);

    // Obtener información del trabajador antes de borrarlo para la evidencia
    const [wRows] = await pool.execute(
      'SELECT Trabajador, `Operación` AS Operacion FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
      [identificacion]
    );
    let nombreTrabajador = wRows.length ? wRows[0].Trabajador : '';
    let operacionTrabajador = wRows.length ? (wRows[0].Operacion || 'N/A') : '';

    if (!nombreTrabajador) {
      const [hvUser] = await pool.execute(
        "SELECT TRIM(CONCAT_WS(' ', primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)) AS nombre FROM Dynamic_hv_aspirante WHERE identificacion = ? LIMIT 1",
        [identificacion]
      );
      if (hvUser.length) {
        nombreTrabajador = hvUser[0].nombre;
        operacionTrabajador = 'Selección / Aspirantes';
      } else {
        nombreTrabajador = 'Desconocido';
        operacionTrabajador = 'N/A';
      }
    }

    const conn = await pool.getConnection();
    const resumenEliminacion = {};
    let totalEliminados = 0;

    try {
      await conn.beginTransaction();
      await conn.execute('SET foreign_key_checks = 0');

      // 1. Eliminar dependencias por Id Vinculación de Maestro_Vinculación
      const [rAuto] = await conn.execute(
        'DELETE FROM `Dynamic_AutoIngreso_Procesados` WHERE `IdVinculacion` IN (SELECT `Id Vinculación` FROM `Maestro_Vinculación` WHERE `Identificación` = ?)',
        [identificacion]
      );
      if (rAuto.affectedRows > 0) {
        resumenEliminacion['Dynamic_AutoIngreso_Procesados'] = rAuto.affectedRows;
        totalEliminados += rAuto.affectedRows;
      }

      const [rEval] = await conn.execute(
        'DELETE FROM `Maestro_evaluacionretiro` WHERE `id_vinculacion` IN (SELECT `Id Vinculación` FROM `Maestro_Vinculación` WHERE `Identificación` = ?)',
        [identificacion]
      );
      if (rEval.affectedRows > 0) {
        resumenEliminacion['Maestro_evaluacionretiro'] = rEval.affectedRows;
        totalEliminados += rEval.affectedRows;
      }

      // 2. Eliminar bitácora dependiente de Maestro_casosmedicos
      const [rBit] = await conn.execute(
        'DELETE FROM `Maestro_bitacora_cmedicos` WHERE `idcaso` IN (SELECT `id` FROM `Maestro_casosmedicos` WHERE `identificacion` = ?)',
        [identificacion]
      );
      if (rBit.affectedRows > 0) {
        resumenEliminacion['Maestro_bitacora_cmedicos'] = rBit.affectedRows;
        totalEliminados += rBit.affectedRows;
      }

      // 3. Eliminar items dependientes de Dynamic_Actas
      const [rActItems] = await conn.execute(
        'DELETE FROM `Dynamic_Actas_Items` WHERE `IdActa` IN (SELECT `IdActa` FROM `Dynamic_Actas` WHERE `identificacion` = ?)',
        [identificacion]
      );
      if (rActItems.affectedRows > 0) {
        resumenEliminacion['Dynamic_Actas_Items'] = rActItems.affectedRows;
        totalEliminados += rActItems.affectedRows;
      }

      // 4. Eliminar dependencias de Selección vinculadas por id_aspirante
      // (SOLO SE ELIMINAN SI NO ES "Solo Sociodemográfica")
      if (!esSoloSociodemo) {
        for (const tablaHija of TABLAS_SELECCION_HIJAS) {
          const [rSelHija] = await conn.execute(
            `DELETE FROM \`${tablaHija}\` WHERE \`id_aspirante\` IN (SELECT \`id_aspirante\` FROM \`Dynamic_hv_aspirante\` WHERE \`identificacion\` = ?)`,
            [identificacion]
          );
          if (rSelHija.affectedRows > 0) {
            resumenEliminacion[tablaHija] = rSelHija.affectedRows;
            totalEliminados += rSelHija.affectedRows;
          }
        }
      }

      // 5. Eliminar de todas las tablas registradas en TABLES
      for (const item of TABLES) {
        if (item.table === 'Maestro_Segmentación') continue;
        // Si es Solo Sociodemográfica, CONSERVAR Dynamic_hv_aspirante
        if (esSoloSociodemo && item.table === 'Dynamic_hv_aspirante') continue;

        const [rTbl] = await conn.execute(`DELETE FROM \`${item.table}\` WHERE \`${item.column}\` = ?`, [identificacion]);
        if (rTbl.affectedRows > 0) {
          resumenEliminacion[item.table] = rTbl.affectedRows;
          totalEliminados += rTbl.affectedRows;
        }
      }

      // 6. Eliminar de Maestro_Segmentación
      const [rSeg] = await conn.execute('DELETE FROM `Maestro_Segmentación` WHERE `Identificación` = ?', [identificacion]);
      if (rSeg.affectedRows > 0) {
        resumenEliminacion['Maestro_Segmentación'] = rSeg.affectedRows;
        totalEliminados += rSeg.affectedRows;
      }

      // 6b. Si es Solo Sociodemográfica, cambiar estado_proceso a 'En proceso' en Dynamic_hv_aspirante
      if (esSoloSociodemo) {
        const [rAsp] = await conn.execute(
          'UPDATE `Dynamic_hv_aspirante` SET `estado_proceso` = "En proceso" WHERE `identificacion` = ?',
          [identificacion]
        );
        if (rAsp.affectedRows > 0) {
          resumenEliminacion['Dynamic_hv_aspirante (estado -> En proceso)'] = `${rAsp.affectedRows} actualizado(s)`;
          console.log(`[talenthub-integridad] Se actualizó estado_proceso a "En proceso" en Dynamic_hv_aspirante para ${identificacion} (${rAsp.affectedRows} reg.)`);
        }
      }

      await conn.execute('SET foreign_key_checks = 1');
      await conn.commit();
      console.log(`[talenthub-integridad] DB completada con éxito. Registros eliminados: ${totalEliminados} (SoloSociodemo: ${esSoloSociodemo})`);
    } catch (dbErr) {
      await conn.rollback();
      throw dbErr;
    } finally {
      conn.release();
    }

    // ── 7. Generar reporte de evidencia y subir a GCS en la carpeta 'integridad/' ──
    const timestampStr = new Date().toISOString();
    const cleanDate = timestampStr.replace(/[:.]/g, '-');
    const fileName = `reporte_eliminacion_${identificacion}_${cleanDate}.html`;
    const gcsRelativePath = `integridad/${fileName}`;

    // Armar HTML de evidencia visual
    const filasTablaHtml = Object.entries(resumenEliminacion)
      .map(([tbl, cnt]) => `<tr><td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;font-weight:600">${tbl}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:700;color:#5b5fc7">${cnt}</td></tr>`)
      .join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Certificado de Eliminación — ${identificacion}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#f8fafc; color:#1e293b; padding:40px 20px; line-height:1.5; }
    .card { max-width:720px; margin:0 auto; background:#fff; border-radius:12px; padding:32px; box-shadow:0 4px 20px rgba(0,0,0,0.06); border:1px solid #e2e8f0; }
    .badge { display:inline-block; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:700; text-transform:uppercase; background:#ede9fe; color:#5b5fc7; }
    h1 { margin:16px 0 6px; font-size:22px; color:#0f172a; }
    .sub { color:#64748b; font-size:13px; margin-bottom:24px; }
    .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; background:#f1f5f9; padding:16px; border-radius:8px; margin-bottom:24px; font-size:13px; }
    .meta-item b { color:#475569; display:block; font-size:11px; text-transform:uppercase; }
    table { width:100%; border-collapse:collapse; margin-top:12px; font-size:13px; }
    th { background:#f8fafc; padding:10px 12px; border:1px solid #e2e8f0; text-align:left; color:#475569; font-size:12px; }
    .total-box { margin-top:20px; padding:14px; background:#faf5ff; border:1px solid #e9d5ff; border-radius:8px; text-align:right; font-size:15px; font-weight:700; color:#6b21a8; }
    .footer { margin-top:28px; text-align:center; font-size:11px; color:#94a3b8; border-top:1px solid #f1f5f9; padding-top:16px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Auditoría TalentHub</span>
    <h1>Reporte Oficial de Purga de Colaborador</h1>
    <div class="sub">Constancia digital de borrado seguro en cascada generado automáticamente.</div>
    <div class="meta-grid">
      <div class="meta-item"><b>Identificación</b> ${identificacion}</div>
      <div class="meta-item"><b>Colaborador</b> ${nombreTrabajador}</div>
      <div class="meta-item"><b>Operación</b> ${operacionTrabajador}</div>
      <div class="meta-item"><b>Responsable de la Acción</b> ${usuario}</div>
      <div class="meta-item"><b>Fecha y Hora</b> ${timestampStr}</div>
      <div class="meta-item"><b>Modalidad</b> ${esSoloSociodemo ? 'Solo Sociodemográfica (Aspirante pasado a "En proceso")' : 'Purga Total'}</div>
    </div>
    <h3 style="font-size:15px;margin:20px 0 8px;">Detalle de Registros Eliminados por Tabla</h3>
    <table>
      <thead>
        <tr><th>Tabla Afectada</th><th style="text-align:right">Registros Purgados</th></tr>
      </thead>
      <tbody>
        ${filasTablaHtml || '<tr><td colspan="2" style="padding:12px;text-align:center;color:#94a3b8">No se encontraron registros en las tablas maestras.</td></tr>'}
      </tbody>
    </table>
    <div class="total-box">
      Total de registros eliminados en base de datos: ${totalEliminados}
    </div>
    <div class="footer">
      LOG&SER S.A.S. — Sistema de Integridad Corporativo TalentHub — Generado de forma inmutable.
    </div>
  </div>
</body>
</html>`;

    let fileUrl = null;
    try {
      const gcsBucket = storage.bucket(BUCKET_PDFS);
      const gcsFile = gcsBucket.file(gcsRelativePath);
      await gcsFile.save(Buffer.from(htmlContent, 'utf8'), {
        contentType: 'text/html; charset=utf-8',
        resumable: false
      });
      fileUrl = `https://storage.googleapis.com/${BUCKET_PDFS}/${gcsRelativePath}`;
      console.log(`[talenthub-integridad] Evidencia guardada en GCS: ${fileUrl}`);
    } catch (gcsSaveErr) {
      console.error('[talenthub-integridad] Error guardando archivo de evidencia en GCS:', gcsSaveErr.message);
    }

    // ── 8. Registrar en Maestro_integridad ──
    const operacionConModo = esSoloSociodemo ? `${operacionTrabajador} [Solo Sociodemográfica]` : operacionTrabajador;
    try {
      await pool.execute(
        `INSERT INTO Maestro_integridad 
         (identificacion, nombre_trabajador, operacion, usuario, fecha, archivo_evidencia_url, archivo_evidencia_path, total_registros_eliminados, resumen_tablas)
         VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
        [
          identificacion,
          nombreTrabajador,
          operacionConModo,
          usuario,
          fileUrl,
          gcsRelativePath,
          totalEliminados,
          JSON.stringify(resumenEliminacion)
        ]
      );
      console.log('[talenthub-integridad] Registro creado exitosamente en Maestro_integridad.');
    } catch (auditErr) {
      console.error('[talenthub-integridad] Error registrando en Maestro_integridad:', auditErr.message);
    }

    // ── 9. Eliminación de carpetas GCS del trabajador (${identificacion}/) ──
    const bucketsABorrar = esSoloSociodemo
      ? BUCKETS.filter(b => b !== BUCKET_HOJAS_VIDA)
      : BUCKETS;

    for (const bucketName of bucketsABorrar) {
      try {
        const b = storage.bucket(bucketName);
        const [files] = await b.getFiles({ prefix: `${identificacion}/` });
        if (files.length > 0) {
          console.log(`[GCS] Eliminando ${files.length} archivos de ${bucketName} bajo ${identificacion}/`);
          await Promise.all(files.map(f => f.delete()));
        }
      } catch (gcsErr) {
        console.error(`[GCS] Error eliminando carpeta en ${bucketName}:`, gcsErr.message);
      }
    }

    res.json({
      ok: true,
      mensaje: `Trabajador ${identificacion} eliminado exitosamente.`,
      totalEliminados,
      resumen: resumenEliminacion,
      evidenciaUrl: fileUrl
    });

  } catch (err) {
    console.error('[talenthub] Error en POST /api/integridad/eliminar:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Modificar identificación de trabajador ──────────────────────────────
router.post('/api/integridad/modificar', async (req, res) => {
  const { oldIdentificacion, newIdentificacion, usuario } = req.body;
  if (!oldIdentificacion || !newIdentificacion || !usuario) {
    return res.status(400).json({ error: 'oldIdentificacion, newIdentificacion y usuario requeridos' });
  }

  if (oldIdentificacion === newIdentificacion) {
    return res.status(400).json({ error: 'La nueva identificación es idéntica a la anterior.' });
  }

  if (!/^\d+$/.test(newIdentificacion)) {
    return res.status(400).json({ error: 'La nueva identificación debe contener solo números.' });
  }

  try {
    const acceso = await computarAccesoTalenthub(usuario, 'Integridad');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado para modificar identificaciones.' });
    }

    const [existRows] = await pool.execute(
      'SELECT Identificación FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
      [newIdentificacion]
    );
    if (existRows.length) {
      return res.status(400).json({ error: `La identificación de destino (${newIdentificacion}) ya existe en el sistema.` });
    }

    console.log(`[talenthub-integridad] Modificando identificación ${oldIdentificacion} -> ${newIdentificacion} por ${usuario}`);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('SET foreign_key_checks = 0');

      // 1. Modificar en todas las tablas hijas
      for (const item of TABLES) {
        if (item.table !== 'Maestro_Segmentación') {
          await conn.execute(`UPDATE \`${item.table}\` SET \`${item.column}\` = ? WHERE \`${item.column}\` = ?`, [newIdentificacion, oldIdentificacion]);
        }
      }

      // 2. Modificar en la tabla maestra
      await conn.execute(
        'UPDATE `Maestro_Segmentación` SET `Identificación` = ? WHERE `Identificación` = ?',
        [newIdentificacion, oldIdentificacion]
      );

      // 3. Modificar contenido de URLs en Maestro_docTrabajador.Doc
      await conn.execute(
        'UPDATE `Maestro_docTrabajador` SET `Doc` = REPLACE(`Doc`, ?, ?) WHERE `Identificación` = ?',
        [oldIdentificacion, newIdentificacion, newIdentificacion]
      );

      // 4. Modificar gcs_path en Dynamic_hv_documentos
      await conn.execute(
        'UPDATE `Dynamic_hv_documentos` SET `gcs_path` = REPLACE(`gcs_path`, ?, ?) WHERE `gcs_path` LIKE ?',
        [oldIdentificacion, newIdentificacion, `%${oldIdentificacion}%`]
      );

      await conn.execute('SET foreign_key_checks = 1');
      await conn.commit();
      console.log(`[talenthub-integridad] Modificación exitosa ${oldIdentificacion} -> ${newIdentificacion}`);
    } catch (dbErr) {
      await conn.rollback();
      throw dbErr;
    } finally {
      conn.release();
    }

    // 5. Renombrar archivos en Google Cloud Storage bajo el prefijo
    for (const bucketName of BUCKETS) {
      try {
        const bucket = storage.bucket(bucketName);
        const [files] = await bucket.getFiles({ prefix: `${oldIdentificacion}/` });
        for (const file of files) {
          const oldName = file.name;
          const fileNameOnly = oldName.split('/').slice(1).join('/');
          const newFileNameOnly = fileNameOnly.split(oldIdentificacion).join(newIdentificacion);
          const newName = `${newIdentificacion}/${newFileNameOnly}`;

          await file.copy(bucket.file(newName));
          await file.delete();
        }
      } catch (gcsErr) {
        console.error(`[GCS] Error renombrando archivos en ${bucketName}:`, gcsErr.message);
      }
    }

    res.json({ ok: true, mensaje: `Identificación actualizada exitosamente de ${oldIdentificacion} a ${newIdentificacion}.` });
  } catch (err) {
    console.error('[talenthub] Error en POST /api/integridad/modificar:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── SUBMÓDULO: REQUISICIONES DE PERSONAL (Dynamic_Requisiciones) ──────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── HELPER DE PARÁMETROS CONFIGURABLES ───────────────────────────────────────
async function obtenerParametrosTalenthub() {
  const [rows] = await pool.execute(
    'SELECT `Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ?',
    ['talenthub']
  );
  const mapa = {};
  for (const r of rows) {
    mapa[r.Concepto] = r.Parametro;
    mapa[`${r.Seccion}:${r.Concepto}`] = r.Parametro;
  }
  return mapa;
}

function rolPermitidoEnParametro(rolUsuario, parametroStr) {
  if (!rolUsuario || !parametroStr) return false;
  const roles = parametroStr.split(',').map(s => s.trim().toLowerCase());
  return roles.includes(rolUsuario.trim().toLowerCase());
}

// 1. GET /api/requisiciones/catalogos
// Carga datos del usuario actual, listas desplegables de regionales, operaciones, cargos y responsables
router.get('/api/requisiciones/catalogos', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No tienes permiso para acceder al módulo de Requisiciones.' });
    }

    const rol = acceso.rol || '';
    const cargoUsuario = (acceso.cargo || '').toUpperCase().trim();
    const esAdminOp = acceso.operacion === 'Administracion';

    // Cargar parámetros dinámicos de Config_Parametros
    const paramsConfig = await obtenerParametrosTalenthub();

    // Permisos basados en parámetros de configuración
    const puedeEditarDespuesDeGuardar = rolPermitidoEnParametro(rol, paramsConfig['Editar Requisición despues de guardar']);
    const puedeVerSalario = rolPermitidoEnParametro(rol, paramsConfig['Editar y ver Salario en Requisición']);
    const puedeModificarSalario = puedeVerSalario;
    const tiempoLimiteRequisicion = parseInt(paramsConfig['Tiempo limite de Requisición']) || 8;
    const puedeVincularAspirante = rolPermitidoEnParametro(rol, paramsConfig['Responsables area de Selección']);
    const puedeEscogerResponsableVacio = rolPermitidoEnParametro(rol, paramsConfig['Escoger responsables area de Selección en Requisición']);
    const puedeEditarResponsableAsignado = rolPermitidoEnParametro(rol, paramsConfig['Editar responsables area de Selección en Requisición']);
    const puedeAgregarIntegridad = rolPermitidoEnParametro(rol, paramsConfig['Agregar Registros a Integridad']);
    const puedeEditarParametros = rolPermitidoEnParametro(rol, paramsConfig['Editar parametros de Requisiciones']);

    // Reglas de permisos adicionales
    const puedeEditarEstado = ['Selección', 'Selección Centro', 'Sistema'].includes(rol);
    const puedeEditarFechaFin = ['Selección', 'Selección Centro', 'Sistema'].includes(rol);

    // Operaciones según alcance del usuario
    let opQuery = "SELECT DISTINCT `OPERACIÓN` as operacion, `REGIONAL` as regional, `C.C.` as ciudad FROM `Maestro_Operaciones` WHERE `REGIONAL` != 'INACTIVO'";
    const opParams = [];

    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro && acceso.operacionesFiltro.length > 0) {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        opQuery += ` AND \`OPERACIÓN\` IN (${ph})`;
        opParams.push(...acceso.operacionesFiltro);
      } else if (acceso.regional) {
        opQuery += " AND `REGIONAL` = ?";
        opParams.push(acceso.regional);
      }
    }
    opQuery += " ORDER BY `OPERACIÓN` ASC";
    const [opRows] = await pool.execute(opQuery, opParams);

    // Regionales únicas permitidas
    const regionalesSet = new Set();
    opRows.forEach(r => { if (r.regional) regionalesSet.add(r.regional); });
    const regionales = Array.from(regionalesSet).sort();

    // Cargos de Config_Cargo_Laboral según Rol y Operación
    let cargosQuery = "";
    if (['Sistema', 'Selección', 'Selección Centro', 'Control'].includes(rol)) {
      cargosQuery = "SELECT `Cargo` as cargo, `Grupo Nomina` as grupoNomina FROM `Config_Cargo_Laboral` ORDER BY `Cargo` ASC";
    } else if (esAdminOp) {
      cargosQuery = "SELECT `Cargo` as cargo, `Grupo Nomina` as grupoNomina FROM `Config_Cargo_Laboral` WHERE `Grupo Nomina` = 'Administrativo' ORDER BY `Cargo` ASC";
    } else {
      cargosQuery = "SELECT `Cargo` as cargo, `Grupo Nomina` as grupoNomina FROM `Config_Cargo_Laboral` WHERE `Grupo Nomina` = 'Operativo' ORDER BY `Cargo` ASC";
    }
    const [cargoRows] = await pool.execute(cargosQuery);

    // Responsables de Selección: pobladas con Nombre y Cargo de Maestro_Usuarios según roles en "Responsables area de Selección"
    const rolesRespParam = paramsConfig['Responsables area de Selección'] || 'Selección, Selección Centro, Directorth, Generalista, AuxiliarR';
    const rolesRespLista = rolesRespParam.split(',').map(r => r.trim()).filter(Boolean);

    let respRows = [];
    if (rolesRespLista.length > 0) {
      const phRoles = rolesRespLista.map(() => '?').join(',');
      const [uRows] = await pool.execute(
        `SELECT \`ID\` as id, \`Nombre\` as nombre, \`Cargo\` as cargo, \`Rol\` as rol 
         FROM \`Maestro_Usuarios\` 
         WHERE \`Rol\` IN (${phRoles}) 
         ORDER BY \`Nombre\` ASC`,
        rolesRespLista
      );
      respRows = uRows;
    }

    const listaResponsables = respRows.map(r => ({
      id: r.id,
      nombre: r.nombre,
      cargo: r.cargo || '',
      rol: r.rol,
      label: r.cargo ? `${r.nombre} - ${r.cargo}` : r.nombre
    }));

    const operacionesFormateadas = opRows.map(o => ({
      operacion: o.operacion,
      Operacion: o.operacion,
      regional: o.regional,
      Regional: o.regional,
      ciudad: o.ciudad,
      Ciudad: o.ciudad
    }));

    const permisosObj = {
      puedeEditarDespuesDeGuardar,
      puedeVerSalario,
      puedeModificarSalario,
      tiempoLimiteRequisicion,
      puedeVincularAspirante,
      puedeEscogerResponsableVacio,
      puedeEditarResponsableAsignado,
      puedeAgregarIntegridad,
      puedeEditarParametros,
      puedeModificarEstado: puedeEditarEstado,
      puedeModificarFechaFin: puedeEditarFechaFin,
      esCoordinadorSeleccion: cargoUsuario === 'COORDINADOR DE SELECCIÓN',
      rol: acceso.rol,
      cargo: acceso.cargo,
      operacion: acceso.operacion,
      regional: acceso.regional
    };

    res.json({
      ok: true,
      usuarioInfo: {
        id: acceso.usuarioId,
        nombre: acceso.usuarioNombre,
        colaborador: acceso.colaborador,
        ...permisosObj
      },
      permisos: permisosObj,
      estados: ['EN PROCESO', 'FINALIZADO', 'SUSPENDIDO', 'CANCELADO'],
      operaciones: operacionesFormateadas,
      regionales,
      cargos: cargoRows.map(c => c.cargo),
      responsablesSeleccion: listaResponsables,
      coordinadores: listaResponsables,
      tiempoLimiteRequisicion
    });
  } catch (err) {
    console.error('[talenthub] GET /api/requisiciones/catalogos:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET /api/requisiciones
// Lista requisiciones con filtros, conteos KPI y ordenamiento dinámico
router.get('/api/requisiciones', async (req, res) => {
  try {
    const { usuario, estado, regional, operacion, cargo, q, sortBy, sortDir } = req.query;
    const fechaDesde = req.query.fechaDesde || req.query.desde;
    const fechaHasta = req.query.fechaHasta || req.query.hasta;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No tienes permiso para acceder al módulo de Requisiciones.' });
    }

    let whereClauses = ["1=1"];
    const params = [];

    // Alcance por rol / acceso
    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro && acceso.operacionesFiltro.length > 0) {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        whereClauses.push(`\`Operación\` IN (${ph})`);
        params.push(...acceso.operacionesFiltro);
      } else if (acceso.regional) {
        whereClauses.push("`Regional` = ?");
        params.push(acceso.regional);
      }
    }

    // Filtros de usuario
    if (estado && estado.toUpperCase() !== 'TODOS') {
      whereClauses.push("UPPER(`Estado`) = UPPER(?)");
      params.push(estado.trim());
    }
    if (regional && regional !== 'todas') {
      whereClauses.push("`Regional` = ?");
      params.push(regional);
    }
    if (operacion && operacion !== 'todas') {
      whereClauses.push("`Operación` = ?");
      params.push(operacion);
    }
    if (cargo && cargo !== 'todos') {
      whereClauses.push("`Cargo Requerido` = ?");
      params.push(cargo);
    }
    if (fechaDesde) {
      whereClauses.push("DATE(`Fecha Requisición`) >= ?");
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      whereClauses.push("DATE(`Fecha Requisición`) <= ?");
      params.push(fechaHasta);
    }
    if (q && q.trim()) {
      const qWild = `%${q.trim()}%`;
      whereClauses.push("(`Requisición` LIKE ? OR `Cargo Requerido` LIKE ? OR `Solicitante` LIKE ? OR `Ciudad` LIKE ? OR `Observaciones` LIKE ?)");
      params.push(qWild, qWild, qWild, qWild, qWild);
    }

    // Ordenamiento permitido
    const allowedSortCols = {
      'Fecha Requisición': '`Fecha Requisición`',
      'Requisición': '`Requisición`',
      'Estado': '`Estado`',
      'Regional': '`Regional`',
      'Operación': '`Operación`',
      'Cargo Requerido': '`Cargo Requerido`',
      'N° Personas Requeridas': '`N° Personas Requeridas`',
      'Solicitante': '`Solicitante`',
      'Responsable de Selección': '`Responsable de Selección`',
      'Ciudad': '`Ciudad`'
    };
    const sortCol = allowedSortCols[sortBy] || '`Fecha Requisición`';
    const sortDirection = (sortDir && sortDir.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    const whereSql = whereClauses.join(' AND ');

    // Consulta de registros con total_aspirantes y restricción de salario
    const paramsConfig = await obtenerParametrosTalenthub();
    const puedeVerSalario = rolPermitidoEnParametro(acceso.rol, paramsConfig['Editar y ver Salario en Requisición']);

    const [rows] = await pool.execute(
      `SELECT r.IdRequisicion, r.\`Requisición\`, 
              DATE_FORMAT(r.\`Fecha Requisición\`, '%Y-%m-%d %H:%i') as fechaRequisicion,
              r.\`Estado\`, r.\`Regional\`, r.\`Operación\`, r.\`Ciudad\`, r.\`Cargo Requerido\`, r.\`Tipo de Pago\`,
              ${puedeVerSalario ? 'r.`Salario`' : 'NULL AS `Salario`'},
              r.\`Solicitante\`, r.\`Cargo Solicitante\`, r.\`N° Personas Requeridas\`, r.\`Perfil del Cargo\`,
              r.\`Conocimientos Adicionales\`, r.\`Experiencia Requerida\`, r.\`Turno Requerido\`, r.\`Descripción del Turno\`,
              r.\`Manipulación de Alimentos - BPM\`, r.\`Requiere Curso por el Cliente\`, r.\`Descripción Curso Requerido\`,
              r.\`Motivo de la Solicitud\`, r.\`Motivo del Reemplazo\`, r.\`Duración de la Temporalidad\`, r.\`Observaciones\`,
              r.\`Dotación Requerida\`, r.\`EPP Requeridos\`,
              DATE_FORMAT(r.\`Fecha de Finalización\`, '%Y-%m-%d') as fechaFinalizacion,
              r.\`Responsable de Selección\`,
              DATE_FORMAT(r.\`Fecha Actualización\`, '%Y-%m-%d %H:%i') as fechaActualizacion,
              r.\`usuario_actualizacion\`,
              (SELECT COUNT(*) FROM \`Dynamic_hv_aspirante\` WHERE \`IdRequisicion\` = r.\`IdRequisicion\`) AS total_aspirantes
       FROM \`Dynamic_Requisiciones\` r
       WHERE ${whereSql}
       ORDER BY ${sortCol} ${sortDirection}
       LIMIT 500`,
      params
    );

    // Consulta de conteos para filtros y KPIs (bajo el alcance base del usuario)
    let baseScopeClauses = ["1=1"];
    const baseScopeParams = [];
    if (!acceso.sinFiltro) {
      if (acceso.operacionesFiltro && acceso.operacionesFiltro.length > 0) {
        const ph = acceso.operacionesFiltro.map(() => '?').join(',');
        baseScopeClauses.push(`\`Operación\` IN (${ph})`);
        baseScopeParams.push(...acceso.operacionesFiltro);
      } else if (acceso.regional) {
        baseScopeClauses.push("`Regional` = ?");
        baseScopeParams.push(acceso.regional);
      }
    }
    const baseScopeSql = baseScopeClauses.join(' AND ');

    const [kpiRows] = await pool.execute(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN UPPER(\`Estado\`) = 'EN PROCESO' THEN 1 ELSE 0 END) as enProceso,
         SUM(CASE WHEN UPPER(\`Estado\`) = 'FINALIZADO' THEN 1 ELSE 0 END) as finalizado,
         SUM(CASE WHEN UPPER(\`Estado\`) = 'SUSPENDIDO' THEN 1 ELSE 0 END) as suspendido,
         SUM(CASE WHEN UPPER(\`Estado\`) = 'CANCELADO' THEN 1 ELSE 0 END) as cancelado,
         COALESCE(SUM(\`N° Personas Requeridas\`), 0) as totalVacantes
       FROM \`Dynamic_Requisiciones\`
       WHERE ${baseScopeSql}`,
      baseScopeParams
    );

    const [facetEstados] = await pool.execute(
      `SELECT UPPER(\`Estado\`) as valor, COUNT(*) as cnt FROM \`Dynamic_Requisiciones\` WHERE ${baseScopeSql} AND \`Estado\` IS NOT NULL GROUP BY UPPER(\`Estado\`) ORDER BY cnt DESC`,
      baseScopeParams
    );

    const [facetRegionales] = await pool.execute(
      `SELECT \`Regional\` as valor, COUNT(*) as cnt FROM \`Dynamic_Requisiciones\` WHERE ${baseScopeSql} AND \`Regional\` IS NOT NULL GROUP BY \`Regional\` ORDER BY cnt DESC`,
      baseScopeParams
    );

    const [facetOperaciones] = await pool.execute(
      `SELECT \`Operación\` as valor, COUNT(*) as cnt FROM \`Dynamic_Requisiciones\` WHERE ${baseScopeSql} AND \`Operación\` IS NOT NULL GROUP BY \`Operación\` ORDER BY cnt DESC`,
      baseScopeParams
    );

    const [facetCargos] = await pool.execute(
      `SELECT \`Cargo Requerido\` as valor, COUNT(*) as cnt FROM \`Dynamic_Requisiciones\` WHERE ${baseScopeSql} AND \`Cargo Requerido\` IS NOT NULL GROUP BY \`Cargo Requerido\` ORDER BY cnt DESC`,
      baseScopeParams
    );

    res.json({
      ok: true,
      requisiciones: rows,
      kpis: kpiRows[0] || { total: 0, enProceso: 0, finalizado: 0, suspendido: 0, cancelado: 0, totalVacantes: 0 },
      facetas: {
        estados: facetEstados,
        regionales: facetRegionales,
        operaciones: facetOperaciones,
        cargos: facetCargos
      }
    });

  } catch (err) {
    console.error('[talenthub] GET /api/requisiciones:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. GET /api/requisiciones/:id
// Obtiene el detalle completo de una requisición y los candidatos vinculados (REF_ROWS) con Fecha de Ingreso y Responsable
router.get('/api/requisiciones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.query;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const [rows] = await pool.execute(
      `SELECT *,
              DATE_FORMAT(\`Fecha Requisición\`, '%Y-%m-%d %H:%i') as fechaRequisicionFormatted,
              DATE_FORMAT(\`Fecha de Finalización\`, '%Y-%m-%d') as fechaFinalizacionFormatted,
              DATE_FORMAT(\`Fecha Actualización\`, '%Y-%m-%d %H:%i') as fechaActualizacionFormatted
       FROM \`Dynamic_Requisiciones\`
       WHERE \`IdRequisicion\` = ? LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Requisición no encontrada.' });
    }

    const paramsConfig = await obtenerParametrosTalenthub();
    const puedeVerSalario = rolPermitidoEnParametro(acceso.rol, paramsConfig['Editar y ver Salario en Requisición']);
    if (!puedeVerSalario && rows[0]) {
      rows[0].Salario = null;
    }

    // Consultar candidatos vinculados a esta requisición: REF_ROWS("HV Aspirante", "IdRequisicion")
    // Con Fecha de Ingreso de Maestro_Vinculación y Usuario de Dynamic_hv_aspirante
    const [aspirantes] = await pool.execute(
      `SELECT a.id_aspirante, a.tipo_documento, a.identificacion,
              CONCAT_WS(' ', a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido) AS nombre_completo,
              a.ciudad, a.telefono, a.correo_electronico, a.estado_proceso, a.pdf_public_url, a.foto_public_url,
              a.Usuario AS responsable_aspirante,
              DATE_FORMAT(a.fecha_registro, '%Y-%m-%d %H:%i') AS fecha_registro_formatted,
              DATE_FORMAT(v.max_fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso
       FROM \`Dynamic_hv_aspirante\` a
       LEFT JOIN (
         SELECT \`Identificación\` AS id_vinc, MAX(\`Fecha de Ingreso\`) AS max_fecha_ingreso
         FROM \`Maestro_Vinculación\`
         GROUP BY \`Identificación\`
       ) v ON CAST(v.id_vinc AS CHAR) = CAST(a.identificacion AS CHAR)
       WHERE a.\`IdRequisicion\` = ?
       ORDER BY a.\`fecha_registro\` DESC`,
      [id]
    );

    res.json({ ok: true, requisicion: rows[0], aspirantes: aspirantes || [] });
  } catch (err) {
    console.error('[talenthub] GET /api/requisiciones/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3.1 GET /api/aspirantes-disponibles
// Consulta aspirantes sin requisición asignada (IdRequisicion IS NULL OR 0) con búsqueda en vivo
router.get('/api/aspirantes-disponibles', async (req, res) => {
  try {
    const { usuario, q } = req.query;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    let sql = `SELECT id_aspirante, tipo_documento, identificacion,
                      CONCAT_WS(' ', primer_nombre, segundo_nombre, primer_apellido, segundo_apellido) AS nombre_completo,
                      ciudad, telefono, correo_electronico, estado_proceso, pdf_public_url,
                      DATE_FORMAT(fecha_registro, '%Y-%m-%d') AS fecha_registro_formatted
               FROM \`Dynamic_hv_aspirante\`
               WHERE (\`IdRequisicion\` IS NULL OR \`IdRequisicion\` = 0)`;
    const params = [];

    if (q && q.trim()) {
      const qWild = `%${q.trim()}%`;
      sql += ` AND (\`identificacion\` LIKE ? OR \`primer_nombre\` LIKE ? OR \`segundo_nombre\` LIKE ? OR \`primer_apellido\` LIKE ? OR \`segundo_apellido\` LIKE ? OR \`ciudad\` LIKE ?)`;
      params.push(qWild, qWild, qWild, qWild, qWild, qWild);
    }

    sql += ` ORDER BY \`fecha_registro\` DESC LIMIT 50`;

    const [rows] = await pool.execute(sql, params);
    res.json({ ok: true, aspirantes: rows });
  } catch (err) {
    console.error('[talenthub] GET /api/aspirantes-disponibles:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3.2 POST /api/requisiciones/:id/vincular-aspirante
// Asigna un aspirante a una requisición (validando permiso Responsables area de Selección)
router.post('/api/requisiciones/:id/vincular-aspirante', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, id_aspirante } = req.body;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const paramsConfig = await obtenerParametrosTalenthub();
    const puedeVincular = rolPermitidoEnParametro(acceso.rol, paramsConfig['Responsables area de Selección']);
    if (!puedeVincular) {
      return res.status(403).json({ error: 'Solo los usuarios con rol en "Responsables area de Selección" pueden vincular aspirantes.' });
    }

    if (!id_aspirante) {
      return res.status(400).json({ error: 'id_aspirante es obligatorio.' });
    }

    const [result] = await pool.execute(
      'UPDATE `Dynamic_hv_aspirante` SET `IdRequisicion` = ?, `fecha_actualizacion` = NOW() WHERE `id_aspirante` = ?',
      [id, id_aspirante]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Aspirante no encontrado.' });
    }

    res.json({ ok: true, mensaje: 'Aspirante vinculado exitosamente a la requisición.' });
  } catch (err) {
    console.error('[talenthub] POST /api/requisiciones/:id/vincular-aspirante:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3.3 POST /api/requisiciones/:id/desvincular-aspirante
// Quita un aspirante de una requisición (NO permitido si el estado_proceso es 'Contratado')
router.post('/api/requisiciones/:id/desvincular-aspirante', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, id_aspirante } = req.body;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    if (!id_aspirante) {
      return res.status(400).json({ error: 'id_aspirante es obligatorio.' });
    }

    const [aspRows] = await pool.execute(
      'SELECT id_aspirante, estado_proceso FROM `Dynamic_hv_aspirante` WHERE `id_aspirante` = ? AND `IdRequisicion` = ? LIMIT 1',
      [id_aspirante, id]
    );
    if (!aspRows.length) {
      return res.status(404).json({ error: 'Aspirante no encontrado en esta requisición.' });
    }

    if ((aspRows[0].estado_proceso || '').trim().toLowerCase() === 'contratado') {
      return res.status(400).json({
        error: 'No es posible quitar un aspirante con estado "Contratado". Para eliminarlo debe realizarse el proceso de purga desde el módulo de Integridad.'
      });
    }

    await pool.execute(
      'UPDATE `Dynamic_hv_aspirante` SET `IdRequisicion` = NULL, `fecha_actualizacion` = NOW() WHERE `id_aspirante` = ? AND `IdRequisicion` = ?',
      [id_aspirante, id]
    );

    res.json({ ok: true, mensaje: 'Aspirante quitado de la requisición con éxito.' });
  } catch (err) {
    console.error('[talenthub] POST /api/requisiciones/:id/desvincular-aspirante:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3.4 PATCH /api/requisiciones/:id/responsable
// Asigna o edita el responsable de selección inline o en detalle según reglas de Config_Parametros
router.patch('/api/requisiciones/:id/responsable', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, responsable } = req.body;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const [rows] = await pool.execute(
      'SELECT IdRequisicion, `Requisición`, `Responsable de Selección` FROM `Dynamic_Requisiciones` WHERE `IdRequisicion` = ? LIMIT 1',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Requisición no encontrada.' });
    }
    const current = rows[0];
    const actual = (current['Responsable de Selección'] || '').trim();

    const paramsConfig = await obtenerParametrosTalenthub();
    const rol = acceso.rol || '';

    if (!actual) {
      // Requisición sin responsable: roles en "Escoger responsables area de Selección en Requisición"
      const puedeEscoger = rolPermitidoEnParametro(rol, paramsConfig['Escoger responsables area de Selección en Requisición']);
      if (!puedeEscoger) {
        return res.status(403).json({ error: 'No tienes permiso para asignar responsable a esta requisición.' });
      }
    } else {
      // Requisición con responsable: roles en "Editar responsables area de Selección en Requisición"
      const puedeEditar = rolPermitidoEnParametro(rol, paramsConfig['Editar responsables area de Selección en Requisición']);
      if (!puedeEditar) {
        return res.status(403).json({ error: 'Solo los roles autorizados pueden modificar un responsable ya asignado.' });
      }
    }

    const nuevoResponsable = responsable ? String(responsable).trim() : null;

    await pool.execute(
      `UPDATE \`Dynamic_Requisiciones\` SET
        \`Responsable de Selección\` = ?,
        \`usuario_actualizacion\` = ?,
        \`Fecha Actualización\` = CONVERT_TZ(NOW(),'SYSTEM','-05:00')
       WHERE \`IdRequisicion\` = ?`,
      [nuevoResponsable, acceso.usuarioId, id]
    );

    console.log(`[talenthub-requisiciones] Responsable de ${current['Requisición']} (ID: ${id}) actualizado a "${nuevoResponsable}" por ${acceso.usuarioId}`);
    res.json({ ok: true, mensaje: 'Responsable de Selección actualizado con éxito.', responsable: nuevoResponsable });
  } catch (err) {
    console.error('[talenthub] PATCH /api/requisiciones/:id/responsable:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. POST /api/requisiciones
// Crear una nueva requisición con lógica de trigger en Node y control de permisos
router.post('/api/requisiciones', async (req, res) => {
  try {
    const { usuario } = req.body;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No tienes permiso para crear requisiciones.' });
    }

    const rol = acceso.rol || '';
    const cargoUsuario = (acceso.cargo || '').toUpperCase().trim();
    const b = req.body;

    if (!b['Operación'] || !b['Cargo Requerido']) {
      return res.status(400).json({ error: 'Operación y Cargo Requerido son obligatorios.' });
    }

    // Calcular siguiente valor de IdRequisicion y formatear Requisición (ej. RQ01074)
    const [[maxRow]] = await pool.execute(
      'SELECT COALESCE(MAX(IdRequisicion), 0) + 1 AS nextVal FROM `Dynamic_Requisiciones`'
    );
    const nextVal = maxRow.nextVal;
    const codigoReq = 'RQ' + String(nextVal).padStart(5, '0');

    // Buscar regional y ciudad predeterminada de Maestro_Operaciones si no fueron enviadas
    let regional = b['Regional'] || '';
    let ciudad = b['Ciudad'] || '';
    if (!regional || !ciudad) {
      const [opInfo] = await pool.execute(
        'SELECT `REGIONAL` as regional, `C.C.` as ciudad FROM `Maestro_Operaciones` WHERE `OPERACIÓN` = ? LIMIT 1',
        [b['Operación']]
      );
      if (opInfo.length) {
        if (!regional) regional = opInfo[0].regional || 'SIN REGIONAL';
        if (!ciudad) ciudad = opInfo[0].ciudad || '';
      }
    }

    // Permisos de salario al crear (solo Selección y Sistema)
    const puedeEditarSalario = ['Selección', 'Sistema'].includes(rol);
    const salario = puedeEditarSalario && b['Salario'] !== undefined && b['Salario'] !== '' ? parseFloat(b['Salario']) : null;

    // Permisos de Responsable de Selección
    const puedeEditarResponsable = rol === 'Sistema' || (rol === 'Selección' && cargoUsuario === 'COORDINADOR DE SELECCIÓN');
    const responsable = puedeEditarResponsable ? (b['Responsable de Selección'] || null) : null;

    // Permisos de Fecha de Finalización
    const puedeEditarFechaFin = ['Selección', 'Selección Centro', 'Sistema'].includes(rol);
    const fechaFin = puedeEditarFechaFin && b['Fecha de Finalización'] ? b['Fecha de Finalización'] : null;

    // Reglas de campos condicionales
    const reqCurso = b['Requiere Curso por el Cliente'] === 'SI' ? 'SI' : 'NO';
    const descCurso = reqCurso === 'SI' ? (b['Descripción Curso Requerido'] || null) : null;

    const motivo = b['Motivo de la Solicitud'] || 'Ampliación de Personal';
    const motivoReemplazo = motivo === 'Reemplazo' ? (b['Motivo del Reemplazo'] || null) : null;
    const duracionTemp = motivo === 'Temporal' ? (b['Duración de la Temporalidad'] || null) : null;

    // Solicitante y Cargo Solicitante
    const solicitante = `${acceso.colaborador || acceso.usuarioNombre} - ${acceso.usuarioId}`;
    const cargoSolicitante = acceso.cargo || '';

    // Insertar registro
    await pool.execute(
      `INSERT INTO \`Dynamic_Requisiciones\` (
        \`IdRequisicion\`, \`Requisición\`, \`Fecha Requisición\`, \`Estado\`, \`Regional\`, \`Operación\`,
        \`Ciudad\`, \`Cargo Requerido\`, \`Tipo de Pago\`, \`Salario\`, \`Solicitante\`, \`Cargo Solicitante\`,
        \`N° Personas Requeridas\`, \`Perfil del Cargo\`, \`Conocimientos Adicionales\`, \`Experiencia Requerida\`,
        \`Turno Requerido\`, \`Descripción del Turno\`, \`Manipulación de Alimentos - BPM\`,
        \`Requiere Curso por el Cliente\`, \`Descripción Curso Requerido\`,
        \`Motivo de la Solicitud\`, \`Motivo del Reemplazo\`, \`Duración de la Temporalidad\`,
        \`Observaciones\`, \`Dotación Requerida\`, \`EPP Requeridos\`,
        \`Fecha de Finalización\`, \`Responsable de Selección\`,
        \`Fecha Actualización\`, \`usuario_actualizacion\`
      ) VALUES (
        ?, ?, CONVERT_TZ(NOW(),'SYSTEM','-05:00'), 'EN PROCESO', ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        CONVERT_TZ(NOW(),'SYSTEM','-05:00'), ?
      )`,
      [
        nextVal,
        codigoReq,
        regional,
        b['Operación'],
        ciudad,
        b['Cargo Requerido'],
        b['Tipo de Pago'] || 'Salario Fijo',
        salario,
        solicitante,
        cargoSolicitante,
        parseInt(b['N° Personas Requeridas']) || 1,
        b['Perfil del Cargo'] || null,
        b['Conocimientos Adicionales'] || null,
        b['Experiencia Requerida'] || null,
        b['Turno Requerido'] || 'Rotativo',
        b['Descripción del Turno'] || null,
        b['Manipulación de Alimentos - BPM'] === 'SI' ? 'SI' : 'NO',
        reqCurso,
        descCurso,
        motivo,
        motivoReemplazo,
        duracionTemp,
        b['Observaciones'] || null,
        b['Dotación Requerida'] || null,
        b['EPP Requeridos'] || null,
        fechaFin,
        responsable,
        acceso.usuarioId
      ]
    );

    console.log(`[talenthub-requisiciones] Creada requisición ${codigoReq} (ID: ${nextVal}) por ${acceso.usuarioId}`);
    res.json({ ok: true, id: nextVal, requisicion: codigoReq, mensaje: `Requisición ${codigoReq} registrada con éxito.` });

  } catch (err) {
    console.error('[talenthub] POST /api/requisiciones:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. PUT /api/requisiciones/:id
// Editar una requisición existente con validación estricta de roles y trazabilidad
router.put('/api/requisiciones/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.body;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No tienes permiso para editar requisiciones.' });
    }

    const paramsConfig = await obtenerParametrosTalenthub();
    const rol = acceso.rol || '';

    // Permiso de editar después de guardar según Config_Parametros
    const puedeEditarDespues = rolPermitidoEnParametro(rol, paramsConfig['Editar Requisición despues de guardar']);
    if (!puedeEditarDespues) {
      return res.status(403).json({ error: 'No tienes permiso para editar requisiciones después de guardadas.' });
    }

    const [existing] = await pool.execute(
      'SELECT * FROM `Dynamic_Requisiciones` WHERE `IdRequisicion` = ? LIMIT 1',
      [id]
    );
    if (!existing.length) {
      return res.status(404).json({ error: 'Requisición no encontrada.' });
    }
    const current = existing[0];

    const cargoUsuario = (acceso.cargo || '').toUpperCase().trim();
    const b = req.body;

    // Permisos especiales
    const puedeEditarEstado = ['Selección', 'Selección Centro', 'Sistema'].includes(rol);
    const puedeEditarSalario = rolPermitidoEnParametro(rol, paramsConfig['Editar y ver Salario en Requisición']);
    const puedeEditarResponsable = rol === 'Sistema' || (rol === 'Selección' && cargoUsuario === 'COORDINADOR DE SELECCIÓN');
    const puedeEditarFechaFin = ['Selección', 'Selección Centro', 'Sistema'].includes(rol);

    // Resolver campos protegidos
    const nuevoEstado = puedeEditarEstado && b['Estado'] ? String(b['Estado']).toUpperCase().trim() : (current.Estado || 'EN PROCESO').toUpperCase().trim();
    const nuevoSalario = puedeEditarSalario && b['Salario'] !== undefined ? (b['Salario'] !== '' ? parseFloat(b['Salario']) : null) : current.Salario;
    const nuevoResponsable = puedeEditarResponsable && b['Responsable de Selección'] !== undefined ? (b['Responsable de Selección'] || null) : current['Responsable de Selección'];
    const nuevaFechaFin = puedeEditarFechaFin && b['Fecha de Finalización'] !== undefined ? (b['Fecha de Finalización'] || null) : current['Fecha de Finalización'];

    // Resolver campos condicionales
    const reqCurso = b['Requiere Curso por el Cliente'] !== undefined ? (b['Requiere Curso por el Cliente'] === 'SI' ? 'SI' : 'NO') : current['Requiere Curso por el Cliente'];
    const descCurso = reqCurso === 'SI' ? (b['Descripción Curso Requerido'] || null) : null;

    const motivo = b['Motivo de la Solicitud'] || current['Motivo de la Solicitud'];
    const motivoReemplazo = motivo === 'Reemplazo' ? (b['Motivo del Reemplazo'] || null) : null;
    const duracionTemp = motivo === 'Temporal' ? (b['Duración de la Temporalidad'] || null) : null;

    await pool.execute(
      `UPDATE \`Dynamic_Requisiciones\` SET
        \`Estado\` = ?,
        \`Regional\` = ?,
        \`Operación\` = ?,
        \`Ciudad\` = ?,
        \`Cargo Requerido\` = ?,
        \`Tipo de Pago\` = ?,
        \`Salario\` = ?,
        \`N° Personas Requeridas\` = ?,
        \`Perfil del Cargo\` = ?,
        \`Conocimientos Adicionales\` = ?,
        \`Experiencia Requerida\` = ?,
        \`Turno Requerido\` = ?,
        \`Descripción del Turno\` = ?,
        \`Manipulación de Alimentos - BPM\` = ?,
        \`Requiere Curso por el Cliente\` = ?,
        \`Descripción Curso Requerido\` = ?,
        \`Motivo de la Solicitud\` = ?,
        \`Motivo del Reemplazo\` = ?,
        \`Duración de la Temporalidad\` = ?,
        \`Observaciones\` = ?,
        \`Dotación Requerida\` = ?,
        \`EPP Requeridos\` = ?,
        \`Fecha de Finalización\` = ?,
        \`Responsable de Selección\` = ?,
        \`usuario_actualizacion\` = ?,
        \`Fecha Actualización\` = CONVERT_TZ(NOW(),'SYSTEM','-05:00')
      WHERE \`IdRequisicion\` = ?`,
      [
        nuevoEstado,
        b['Regional'] || current.Regional,
        b['Operación'] || current['Operación'],
        b['Ciudad'] || current.Ciudad,
        b['Cargo Requerido'] || current['Cargo Requerido'],
        b['Tipo de Pago'] || current['Tipo de Pago'],
        nuevoSalario,
        parseInt(b['N° Personas Requeridas']) || current['N° Personas Requeridas'],
        b['Perfil del Cargo'] !== undefined ? b['Perfil del Cargo'] : current['Perfil del Cargo'],
        b['Conocimientos Adicionales'] !== undefined ? b['Conocimientos Adicionales'] : current['Conocimientos Adicionales'],
        b['Experiencia Requerida'] !== undefined ? b['Experiencia Requerida'] : current['Experiencia Requerida'],
        b['Turno Requerido'] || current['Turno Requerido'],
        b['Descripción del Turno'] !== undefined ? b['Descripción del Turno'] : current['Descripción del Turno'],
        b['Manipulación de Alimentos - BPM'] !== undefined ? b['Manipulación de Alimentos - BPM'] : current['Manipulación de Alimentos - BPM'],
        reqCurso,
        descCurso,
        motivo,
        motivoReemplazo,
        duracionTemp,
        b['Observaciones'] !== undefined ? b['Observaciones'] : current['Observaciones'],
        b['Dotación Requerida'] !== undefined ? b['Dotación Requerida'] : current['Dotación Requerida'],
        b['EPP Requeridos'] !== undefined ? b['EPP Requeridos'] : current['EPP Requeridos'],
        nuevaFechaFin,
        nuevoResponsable,
        acceso.usuarioId,
        id
      ]
    );

    console.log(`[talenthub-requisiciones] Requisición ${current['Requisición']} (ID: ${id}) actualizada por ${acceso.usuarioId}`);
    res.json({ ok: true, mensaje: `Requisición ${current['Requisición']} actualizada correctamente.` });

  } catch (err) {
    console.error('[talenthub] PUT /api/requisiciones/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/parametros/requisiciones
// Lista los parámetros de la sección Requisiciones (excepto editar parámetros) y roles de Config_Rol
router.get('/api/parametros/requisiciones', async (req, res) => {
  try {
    const { usuario } = req.query;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const [rows] = await pool.execute(
      `SELECT id, Modulo, Seccion, Concepto, Condicion, Parametro 
       FROM Config_Parametros 
       WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto != 'Editar parametros de Requisiciones'
       ORDER BY id ASC`
    );

    const [roles] = await pool.execute(
      'SELECT DISTINCT Rol FROM Config_Rol ORDER BY Rol ASC'
    );

    res.json({
      ok: true,
      parametros: rows,
      roles: roles.map(r => r.Rol).filter(Boolean)
    });
  } catch (err) {
    console.error('[talenthub] GET /api/parametros/requisiciones:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. POST /api/parametros/requisiciones
// Guarda los parámetros modificados validando que el rol tenga permiso en "Editar parametros de Requisiciones"
router.post('/api/parametros/requisiciones', async (req, res) => {
  try {
    const { usuario, parametros } = req.body;
    const acceso = await computarAccesoTalenthub(usuario, 'Requisiciones');
    if (!acceso) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const paramsConfig = await obtenerParametrosTalenthub();
    const puedeEditarParams = rolPermitidoEnParametro(acceso.rol, paramsConfig['Editar parametros de Requisiciones']);
    if (!puedeEditarParams) {
      return res.status(403).json({ error: 'Solo los roles autorizados pueden modificar los parámetros de Requisiciones.' });
    }

    if (!Array.isArray(parametros)) {
      return res.status(400).json({ error: 'El listado de parámetros es inválido.' });
    }

    for (const p of parametros) {
      if (p.id && p.Parametro !== undefined) {
        await pool.execute(
          `UPDATE Config_Parametros 
           SET Parametro = ? 
           WHERE id = ? AND Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto != 'Editar parametros de Requisiciones'`,
          [String(p.Parametro).trim(), p.id]
        );
      }
    }

    console.log(`[talenthub-parametros] Parámetros de Requisiciones actualizados por ${acceso.usuarioId}`);
    res.json({ ok: true, mensaje: 'Parámetros actualizados exitosamente.' });
  } catch (err) {
    console.error('[talenthub] POST /api/parametros/requisiciones:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


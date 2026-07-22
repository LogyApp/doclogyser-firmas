const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { storage } = require('../services/storage');

const router = express.Router();

const HTML_PATH = path.join(__dirname, '../views/integridad/index.html');

const ALLOWED_ROLES = ['Sistema', 'Contratación'];

const BUCKET_FIRMAS = process.env.BUCKET_FIRMAS || 'firmas-images';
const BUCKET_PDFS = process.env.BUCKET_PDFS || 'talenthub_central';
const BUCKET_HOJAS_VIDA = 'hojas_vida_logyser';

const BUCKETS = [BUCKET_FIRMAS, BUCKET_HOJAS_VIDA, BUCKET_PDFS];

const TABLES = [
  { table: 'Dynamic_Asistencia', column: 'Cédula' },
  { table: 'Dynamic_Encuesta_Satisfaccion', column: 'identificacion' },
  { table: 'Dynamic_Entrega_Dotacion', column: 'IdDotación' },
  { table: 'Dynamic_Solicitud_Vacaciones', column: 'Identificación' },
  { table: 'Dynamic_registro_marcaciones', column: 'identificacion' },
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
  { table: 'Maestro_Segmentación', column: 'Identificación' }
];

async function computarAccesoIntegridad(usuarioId) {
  if (!usuarioId) return null;
  const [uRows] = await pool.execute(
    'SELECT ID, Nombre, Rol FROM Maestro_Usuarios WHERE ID = ?',
    [usuarioId]
  );
  if (!uRows.length) return null;
  const u = uRows[0];
  if (!ALLOWED_ROLES.includes(u.Rol)) return null;

  return {
    usuarioId: u.ID,
    usuarioNombre: u.Nombre || u.ID,
    rol: u.Rol
  };
}

function paginaNoAcceso() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin acceso</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f172a;color:#cbd5e1}.card{background:#1e293b;padding:2.5rem 2rem;border-radius:10px;text-align:center;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);max-width:400px;width:90%;border:1px solid #334155}h2{color:#f1f5f9;margin-bottom:10px;font-size:1.2rem}p{color:#94a3b8;font-size:.9rem;margin:0}.icon{font-size:2.5rem;margin-bottom:12px}</style></head><body><div class="card"><div class="icon">🔒</div><h2>Sin acceso</h2><p>No tienes permiso para ver este módulo administrativo.</p></div></body></html>`;
}

// Servir la vista principal
router.get('/', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) {
      return res.status(400).send('<h2>Error: Parámetro ?usuario requerido</h2>');
    }

    const acceso = await computarAccesoIntegridad(usuario);
    if (!acceso) {
      return res.status(403).send(paginaNoAcceso());
    }

    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const config = JSON.stringify(acceso).replace(/<\/script>/gi, '<\\/script>');
    res.send(html.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[integridad-id] Error serving page:', err);
    res.status(500).send('<h2>Error interno del servidor</h2>');
  }
});

// API: Buscar trabajador
router.get('/api/buscar/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;
    const { usuario } = req.query;

    const acceso = await computarAccesoIntegridad(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    const [rows] = await pool.execute(
      'SELECT Trabajador, `Operación` AS Operacion FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
      [identificacion]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Trabajador no encontrado' });
    }

    res.json({
      ok: true,
      trabajador: {
        identificacion,
        nombre: rows[0].Trabajador,
        operacion: rows[0].Operacion
      }
    });
  } catch (err) {
    console.error('[integridad-id] GET /api/buscar:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Eliminar trabajador
router.post('/api/eliminar', async (req, res) => {
  const { identificacion, usuario } = req.body;
  if (!identificacion || !usuario) {
    return res.status(400).json({ error: 'identificacion y usuario requeridos' });
  }

  try {
    const acceso = await computarAccesoIntegridad(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    console.log(`[integridad-id] Iniciando eliminación del trabajador ${identificacion} por usuario ${usuario}`);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Desactivar temporalmente revisión de claves foráneas para esta sesión/conexión
      await conn.execute('SET foreign_key_checks = 0');

      // Deletes en orden para evitar problemas de clave foránea si existieran.
      // Primero todas las tablas hijas
      for (const item of TABLES) {
        if (item.table !== 'Maestro_Segmentación') {
          console.log(`Deleting from ${item.table} where ${item.column} = ${identificacion}`);
          await conn.execute(`DELETE FROM \`${item.table}\` WHERE \`${item.column}\` = ?`, [identificacion]);
        }
      }

      // Al final Maestro_Segmentación
      console.log(`Deleting from Maestro_Segmentación where Identificación = ${identificacion}`);
      await conn.execute('DELETE FROM `Maestro_Segmentación` WHERE `Identificación` = ?', [identificacion]);

      // Activar nuevamente revisión de claves foráneas
      await conn.execute('SET foreign_key_checks = 1');

      await conn.commit();
      console.log(`[integridad-id] Transacción de base de datos exitosa para eliminación de ${identificacion}`);
    } catch (dbErr) {
      await conn.rollback();
      throw dbErr;
    } finally {
      conn.release();
    }

    // Eliminación de carpetas GCS en segundo plano/paralelo una vez confirmada la DB
    for (const bucketName of BUCKETS) {
      try {
        const bucket = storage.bucket(bucketName);
        const [files] = await bucket.getFiles({ prefix: `${identificacion}/` });
        if (files.length > 0) {
          console.log(`[GCS] Eliminando ${files.length} archivos de ${bucketName} bajo el prefijo ${identificacion}/`);
          await Promise.all(files.map(f => f.delete()));
        }
      } catch (gcsErr) {
        console.error(`[GCS] Error eliminando carpeta en bucket ${bucketName} para ${identificacion}:`, gcsErr.message);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[integridad-id] Error en POST /api/eliminar:', err);
    res.status(500).json({ error: err.message });
  }
});

// API: Modificar trabajador
router.post('/api/modificar', async (req, res) => {
  const { oldIdentificacion, newIdentificacion, usuario } = req.body;
  if (!oldIdentificacion || !newIdentificacion || !usuario) {
    return res.status(400).json({ error: 'oldIdentificacion, newIdentificacion y usuario requeridos' });
  }

  if (oldIdentificacion === newIdentificacion) {
    return res.status(400).json({ error: 'La nueva identificación es idéntica a la anterior.' });
  }

  // Validación básica de número
  if (!/^\d+$/.test(newIdentificacion)) {
    return res.status(400).json({ error: 'La nueva identificación debe contener solo números.' });
  }

  try {
    const acceso = await computarAccesoIntegridad(usuario);
    if (!acceso) {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // Verificar si la nueva identificación ya existe en Maestro_Segmentación
    const [existRows] = await pool.execute(
      'SELECT Identificación FROM Maestro_Segmentación WHERE Identificación = ? LIMIT 1',
      [newIdentificacion]
    );
    if (existRows.length) {
      return res.status(400).json({ error: `La identificación de destino (${newIdentificacion}) ya existe en el sistema.` });
    }

    console.log(`[integridad-id] Modificando identificación ${oldIdentificacion} -> ${newIdentificacion} por usuario ${usuario}`);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Desactivar temporalmente revisión de claves foráneas para esta sesión/conexión
      await conn.execute('SET foreign_key_checks = 0');

      // 1. Modificar en todas las tablas hijas primero (para evitar la recursión del trigger AFTER UPDATE de Maestro_Segmentación)
      for (const item of TABLES) {
        if (item.table !== 'Maestro_Segmentación') {
          console.log(`Updating ${item.table} set ${item.column} = ${newIdentificacion} where ${item.column} = ${oldIdentificacion}`);
          await conn.execute(`UPDATE \`${item.table}\` SET \`${item.column}\` = ? WHERE \`${item.column}\` = ?`, [newIdentificacion, oldIdentificacion]);
        }
      }

      // 2. Modificar en la tabla maestra (Maestro_Segmentación) al final
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

      // Activar nuevamente revisión de claves foráneas
      await conn.execute('SET foreign_key_checks = 1');

      await conn.commit();
      console.log(`[integridad-id] Transacción de base de datos exitosa para modificación de ${oldIdentificacion} -> ${newIdentificacion}`);
    } catch (dbErr) {
      await conn.rollback();
      throw dbErr;
    } finally {
      conn.release();
    }

    // 4. Renombrar carpetas y archivos en GCS en segundo plano/paralelo
    for (const bucketName of BUCKETS) {
      try {
        const bucket = storage.bucket(bucketName);
        const [files] = await bucket.getFiles({ prefix: `${oldIdentificacion}/` });
        if (files.length > 0) {
          console.log(`[GCS] Renombrando ${files.length} archivos en bucket ${bucketName} de ${oldIdentificacion}/ a ${newIdentificacion}/`);
          for (const file of files) {
            const relativePath = file.name.substring(oldIdentificacion.length + 1);
            // Reemplazar la identificación anterior por la nueva en el nombre del archivo
            const newRelativePath = relativePath.replace(oldIdentificacion, newIdentificacion);
            const newName = `${newIdentificacion}/${newRelativePath}`;

            console.log(`[GCS] Moviendo en ${bucketName}: ${file.name} -> ${newName}`);
            await file.move(newName);
          }
        }
      } catch (gcsErr) {
        console.error(`[GCS] Error renombrando carpeta en bucket ${bucketName} para ${oldIdentificacion}:`, gcsErr.message);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[integridad-id] Error en POST /api/modificar:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

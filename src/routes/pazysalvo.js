const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { obtenerFirmaBase64Reciente, subirFirma } = require('../services/storage');
const { validarTokenPZ, generarTokenPZ } = require('../services/token');
const { notificarPazYSalvoCompletado } = require('../services/email');
const { resolverRutaFirmaTrabajador } = require('../services/firmaPathResolver');
const { notificarAreasPendientesPazYSalvo, estaCompleto, normalizarAreasRequeridas } = require('../services/pazYSalvoService');
const { generarPazYSalvoFinalPDF } = require('./pazysalvoarea');

const router = express.Router();
const FIRMA_HTML = path.join(__dirname, '../views/pazysalvo/firma.html');

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  return String(val).slice(0, 10);
}

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth() + 1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}div{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:400px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div><h2>Enlace no válido</h2><p>${mensaje}</p></div></body></html>`;
}

function limpiarNombre(n) {
  if (!n) return '';
  const p = String(n).split(' ** ');
  return (p.length > 1 ? p[1] : n).trim();
}

// ── GET /:idPz?token=... ────────────────────────────────────────────────────
router.get('/:idPz', async (req, res) => {
  try {
    const { idPz } = req.params;
    const { token } = req.query;

    if (!token) return res.status(401).send(paginaError('Token no proporcionado.'));

    const resultado = await validarTokenPZ(token, idPz, 'token_trabajador', 'token_trabajador_expira');
    if (!resultado.valido) {
      const msg = resultado.motivo === 'expirado'
        ? 'El enlace ha expirado. Comuníquese con el área de Recursos Humanos.'
        : 'El enlace no es válido o ya fue utilizado.';
      return res.status(401).send(paginaError(msg));
    }

    const [rows] = await pool.execute(
      `SELECT pz.*, v.Trabajador, v.Cargo, v.Operación, v.\`Fecha de Retiro\`, v.\`Fecha de Ingreso\`,
              v.Regional, v.Usuario
       FROM Maestro_pazysalvo pz
       JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
       WHERE pz.id = ?`,
      [idPz]
    );
    if (!rows.length) return res.status(404).send(paginaError('Registro no encontrado.'));
    const pz = rows[0];

    // Si ya firmó el trabajador, no permitir re-firma
    if (pz.firma_trabajador_url) {
      return res.status(410).send(paginaError('Este documento ya fue firmado previamente.'));
    }

    let firmaPrevia = null;
    try {
      firmaPrevia = await obtenerFirmaBase64Reciente(pz.identificacion);
    } catch {}

    const nombreTrabajador = limpiarNombre(pz.Trabajador);
    const articulos = typeof pz.articulos === 'string' ? JSON.parse(pz.articulos) : (pz.articulos || []);

    const template = fs.readFileSync(FIRMA_HTML, 'utf8');
    const config = JSON.stringify({
      token,
      idPz,
      nombreTrabajador,
      identificacion: pz.identificacion,
      cargo: pz.Cargo || '',
      operacion: pz['Operación'] || '',
      nivelCompromiso: pz.nivel_compromiso,
      articulos,
      observaciones: pz.observaciones || '',
      firmaPrevia,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[pazysalvo GET]', err);
    res.status(500).send(paginaError('Error interno. Intente más tarde.'));
  }
});

// ── POST /:idPz ─────────────────────────────────────────────────────────────
router.post('/:idPz', async (req, res) => {
  try {
    const { idPz } = req.params;
    const { token, firma_base64, es_nueva_firma } = req.body;

    if (!token) return res.status(401).json({ ok: false, error: 'Token no proporcionado' });

    const resultado = await validarTokenPZ(token, idPz, 'token_trabajador', 'token_trabajador_expira');
    if (!resultado.valido) return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });

    const [rows] = await pool.execute(
      `SELECT pz.*, v.Trabajador, v.Cargo, v.Operación, v.\`Fecha de Retiro\`,
              v.\`Fecha de Ingreso\`, v.Regional, v.Usuario
       FROM Maestro_pazysalvo pz
       JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
       WHERE pz.id = ?`,
      [idPz]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    const pz = rows[0];

    if (pz.firma_trabajador_url) {
      return res.status(410).json({ ok: false, error: 'Documento ya firmado' });
    }

    // Guardar firma del trabajador usando su Identificación
    let urlFirma;
    if (es_nueva_firma && firma_base64) {
      const base64Data = firma_base64.replace(/^data:image\/png;base64,/, '');
      const bufferPng = Buffer.from(base64Data, 'base64');
      // Usar la Identificación del trabajador para guardar la firma
      const rutaTrabajador = await resolverRutaFirmaTrabajador(pz.identificacion);
      const carpetaFirma = rutaTrabajador?.identificacion || pz.identificacion;
      urlFirma = await subirFirma(carpetaFirma, bufferPng);
    } else {
      const { obtenerUrlFirmaReciente } = require('../services/storage');
      urlFirma = await obtenerUrlFirmaReciente(pz.identificacion);
    }

    const ahora = new Date();

    // Actualizar: guardar firma trabajador, limpiar token de trabajador
    await pool.execute(
      `UPDATE Maestro_pazysalvo
       SET firma_trabajador_url = ?, fecha_firma_trabajador = ?,
           token_trabajador = NULL, token_trabajador_expira = NULL
       WHERE id = ?`,
      [urlFirma, ahora, idPz]
    );

    // Recargar registro para verificar si todas las áreas ya firmaron
    const [rowsActual] = await pool.execute(
      `SELECT pz.*, v.Trabajador, v.Cargo, v.Operación, v.\`Fecha de Retiro\`,
              v.\`Fecha de Ingreso\`, v.Regional, v.Usuario
       FROM Maestro_pazysalvo pz
       JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
       WHERE pz.id = ?`,
      [idPz]
    );
    const pzActual = rowsActual[0];
    const areasRequeridas = normalizarAreasRequeridas(pzActual.areas_requeridas);
    const completadoTotal = estaCompleto(pzActual, areasRequeridas);
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    if (completadoTotal || pzActual.estado === 'completado') {
      const urlPdf = await generarPazYSalvoFinalPDF(pzActual, areasRequeridas);
      const ahoraFin = new Date();
      await pool.execute(
        `UPDATE Maestro_pazysalvo SET estado = 'completado', url_pdf_final = ?, fecha_completado = ? WHERE id = ?`,
        [urlPdf, ahoraFin, idPz]
      );

      // Actualizar o registrar en Maestro_docTrabajador
      const [docExist] = await pool.execute(
        `SELECT id FROM Maestro_docTrabajador
         WHERE Identificación = ? AND TipoDocumento = '59' AND DATE(Fecha_Ingreso) = DATE(?)
         ORDER BY FechaRegistro DESC LIMIT 1`,
        [String(pzActual.identificacion), toDateStr(pzActual['Fecha de Ingreso'])]
      );
      if (docExist.length) {
        await pool.execute(
          `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = ? WHERE id = ?`,
          [urlPdf, fechaHoraBogota(), docExist[0].id]
        );
      } else {
        const idDoc = uuidv4();
        await pool.execute(
          `INSERT INTO Maestro_docTrabajador
           (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
            TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
            Justificacion_Solicitud, FechaRegistro, Usuario)
           VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, '59', 'PZ', ?, NULL, NULL, NULL, NULL, ?, ?)`,
          [idDoc, pzActual.Regional || null, pzActual['Operación'] || null, String(pzActual.identificacion),
           toDateStr(pzActual['Fecha de Ingreso']), urlPdf, fechaHoraBogota(), pzActual.Usuario || null]
        ).catch(e => console.error('[PZ docTrabajador]', e.message));
      }

      notificarPazYSalvoCompletado({
        trabajador:     limpiarNombre(pzActual.Trabajador),
        identificacion: String(pzActual.identificacion),
        cargo:          pzActual.Cargo || '',
        operacion:      pzActual['Operación'] || '',
        urlDoc:         urlPdf,
      }).catch(e => console.error('[pazysalvo email completado]', e.message));
    } else {
      await pool.execute(`UPDATE Maestro_pazysalvo SET estado = 'esperando_areas' WHERE id = ?`, [idPz]);
      // Asegurar que las áreas pendientes reciban su enlace de firma si aún no fueron notificadas
      setImmediate(() => {
        notificarAreasPendientesPazYSalvo(idPz, { baseUrl }).catch(e => {
          console.error('[pazysalvo POST notificarAreas]', e.message);
        });
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[pazysalvo POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

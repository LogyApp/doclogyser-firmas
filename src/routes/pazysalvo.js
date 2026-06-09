const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../services/db');
const { obtenerFirmaBase64Reciente, subirFirma } = require('../services/storage');
const { validarTokenPZ, generarTokenPZ } = require('../services/token');
const { notificarAreaPazYSalvo } = require('../services/email');
const { resolverRutaFirmaTrabajador } = require('../services/firmaPathResolver');
const { EMAILS_AREA } = require('../services/pazYSalvoService');

const router = express.Router();
const FIRMA_HTML = path.join(__dirname, '../views/pazysalvo/firma.html');

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

    // Actualizar: guardar firma trabajador, cambiar estado, limpiar token
    await pool.execute(
      `UPDATE Maestro_pazysalvo
       SET firma_trabajador_url = ?, fecha_firma_trabajador = ?,
           estado = 'esperando_areas',
           token_trabajador = NULL, token_trabajador_expira = NULL
       WHERE id = ?`,
      [urlFirma, ahora, idPz]
    );

    // Generar tokens por área y enviar emails
    const areasRequeridas = typeof pz.areas_requeridas === 'string'
      ? JSON.parse(pz.areas_requeridas)
      : (pz.areas_requeridas || []);

    console.log(`[pazysalvo POST] areas_requeridas para ${idPz}:`, areasRequeridas);

    const nombreTrabajador = limpiarNombre(pz.Trabajador);
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    for (const area of areasRequeridas) {
      try {
        console.log(`[pazysalvo POST] Generando token para área: ${area}`);
        const tokenArea = await generarTokenPZ(idPz, `token_${area}`, `token_${area}_expira`);
        const urlFirmaArea = `${baseUrl}/pazysalvo-area/${area}/${idPz}?token=${encodeURIComponent(tokenArea)}`;
        // CC 1117517812 permanece en modo prueba; el resto usa correos reales por área
        const esPrueba = String(pz.identificacion) === '1117517812';
        const destinatarios = esPrueba ? ['admin@logyser.com'] : (EMAILS_AREA[area] || []);
        console.log(`[pazysalvo POST] Enviando email ${area} a:`, destinatarios);
        if (destinatarios.length) {
          await notificarAreaPazYSalvo({
            area,
            destinatarios,
            trabajador: nombreTrabajador,
            identificacion: pz.identificacion,
            cargo: pz.Cargo || '',
            operacion: pz['Operación'] || '',
            urlFirma: urlFirmaArea,
          });
          console.log(`[pazysalvo POST] Email ${area} enviado OK`);
        }
      } catch (eArea) {
        console.error(`[pazysalvo POST] Error notificando área ${area}:`, eArea.message);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[pazysalvo POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

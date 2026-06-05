const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { obtenerPlantilla, reemplazarVariables } = require('../services/plantilla');
const { generarPDF } = require('../services/renderer');
const { subirFirma, subirPDFPazYSalvo, obtenerUrlFirmaReciente } = require('../services/storage');
const { validarTokenPZ } = require('../services/token');
const { notificarPazYSalvoCompletado } = require('../services/email');
const { resolverRutaFirmaArea } = require('../services/firmaPathResolver');
const { generarFilasArticulosHTML, generarFirmasAreasHtml, estaCompleto, NOMBRES_AREA, EMAILS_AREA } = require('../services/pazYSalvoService');

const router = express.Router();
const FIRMA_HTML = path.join(__dirname, '../views/pazysalvoarea/firma.html');

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}div{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:400px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div><h2>Enlace no válido</h2><p>${mensaje}</p></div></body></html>`;
}

function limpiarNombre(n) {
  if (!n) return '';
  const p = String(n).split(' ** ');
  return (p.length > 1 ? p[1] : n).trim();
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth() + 1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const d = new Date(typeof fecha === 'string' ? fecha + 'T12:00:00' : fecha);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
}

function buildFirmaHtml(url) {
  return url
    ? `<img src="${url}" style="height:80px;display:block;margin-bottom:4px">`
    : `<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>`;
}

async function registrarDocTrabajador({ regional, operacion, identificacion, fechaIngreso, tipoDocumento, prefijo, doc, usuario }) {
  const id    = uuidv4();
  const ahora = fechaHoraBogota();
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
     (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
      TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
      Justificacion_Solicitud, FechaRegistro, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    [id, regional || null, operacion || null, identificacion,
     toDateStr(fechaIngreso), tipoDocumento, prefijo, doc, ahora, usuario]
  );
  return id;
}

// ── GET /:area/:idPz?token=... ──────────────────────────────────────────────
router.get('/:area/:idPz', async (req, res) => {
  try {
    const { area, idPz } = req.params;
    const { token } = req.query;

    if (!token) return res.status(401).send(paginaError('Token no proporcionado.'));

    const colToken  = `token_${area}`;
    const colExpira = `token_${area}_expira`;

    const resultado = await validarTokenPZ(token, idPz, colToken, colExpira);
    if (!resultado.valido) {
      const msg = resultado.motivo === 'expirado'
        ? 'El enlace ha expirado. Solicite al área de Recursos Humanos que reenvíe el enlace.'
        : 'El enlace no es válido o ya fue utilizado.';
      return res.status(401).send(paginaError(msg));
    }

    const [rows] = await pool.execute(
      `SELECT pz.*, v.Trabajador, v.Cargo, v.Operación, v.\`Fecha de Retiro\`
       FROM Maestro_pazysalvo pz
       JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
       WHERE pz.id = ?`,
      [idPz]
    );
    if (!rows.length) return res.status(404).send(paginaError('Registro no encontrado.'));
    const pz = rows[0];

    // Verificar que el área es requerida
    const areasRequeridas = typeof pz.areas_requeridas === 'string'
      ? JSON.parse(pz.areas_requeridas) : (pz.areas_requeridas || []);
    if (!areasRequeridas.includes(area)) return res.status(404).send(paginaError('Área no requerida para este documento.'));

    // Si el área ya firmó, no permitir re-firma
    if (pz[`firma_${area}_url`]) return res.status(410).send(paginaError('Esta área ya validó el documento.'));

    const articulos = typeof pz.articulos === 'string' ? JSON.parse(pz.articulos) : (pz.articulos || []);
    const nombreArea = NOMBRES_AREA[area] || area;

    // Buscar responsables del área en Maestro_Usuarios por email
    let responsablesSugeridos = [];
    try {
      const emailsArea = EMAILS_AREA[area] || [];
      if (emailsArea.length) {
        const placeholders = emailsArea.map(() => '?').join(', ');
        const [uRows] = await pool.execute(
          `SELECT Nombre, Cargo, Colaborador FROM Maestro_Usuarios WHERE Email IN (${placeholders}) LIMIT 5`,
          emailsArea
        );
        responsablesSugeridos = await Promise.all(uRows.map(async u => {
          const partes = String(u.Colaborador || '').split(' ** ');
          const cedula = partes[0].trim();
          let firmaUrl = null;
          if (cedula) {
            try { firmaUrl = await obtenerUrlFirmaReciente(cedula); } catch (_) {}
          }
          return {
            nombre:   u.Nombre || (partes.length > 1 ? partes[1].trim() : ''),
            cargo:    u.Cargo  || '',
            cedula,
            firmaUrl,
          };
        }));
      }
    } catch (e) {
      console.error('[pazysalvoarea] Error buscando responsable:', e.message);
    }

    const template = fs.readFileSync(FIRMA_HTML, 'utf8');
    const config = JSON.stringify({
      token,
      idPz,
      area,
      nombreArea,
      trabajador: limpiarNombre(pz.Trabajador),
      identificacion: pz.identificacion,
      cargo: pz.Cargo || '',
      operacion: pz['Operación'] || '',
      nivelCompromiso: pz.nivel_compromiso,
      articulos,
      observaciones: pz.observaciones || '',
      firmaTrabajadorUrl: pz.firma_trabajador_url || null,
      firmaResponsableUrl: pz.firma_responsable_url || null,
      firmaResponsableNombre: pz.firma_responsable_nombre || '',
      firmaResponsableCargo: pz.firma_responsable_cargo || '',
      responsablesSugeridos,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[pazysalvoarea GET]', err);
    res.status(500).send(paginaError('Error interno. Intente más tarde.'));
  }
});

// ── POST /:area/:idPz ───────────────────────────────────────────────────────
router.post('/:area/:idPz', async (req, res) => {
  try {
    const { area, idPz } = req.params;
    const { token, firma_base64, firma_url_existente, nombre_firmante, cargo_firmante, cedula_firmante } = req.body;

    if (!token) return res.status(401).json({ ok: false, error: 'Token no proporcionado' });
    if (!firma_base64 && !firma_url_existente) return res.status(400).json({ ok: false, error: 'Firma requerida' });
    if (!nombre_firmante || !cargo_firmante) return res.status(400).json({ ok: false, error: 'Nombre y cargo requeridos' });

    const colToken  = `token_${area}`;
    const colExpira = `token_${area}_expira`;

    const resultado = await validarTokenPZ(token, idPz, colToken, colExpira);
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

    if (pz[`firma_${area}_url`]) return res.status(410).json({ ok: false, error: 'Área ya validó' });

    // Subir firma del área usando la identificación correcta del responsable del área
    let urlFirmaArea;
    let cedulaParaGuardar = cedula_firmante;

    if (!cedulaParaGuardar && nombre_firmante) {
      // Si no viene cedula_firmante, buscar usando el nombre del responsable (Colaborador)
      const rutaArea = await resolverRutaFirmaArea(nombre_firmante);
      if (rutaArea) {
        cedulaParaGuardar = rutaArea.identificacion;
      }
    }

    if (firma_url_existente) {
      urlFirmaArea = firma_url_existente;
    } else {
      const base64Data = firma_base64.replace(/^data:image\/png;base64,/, '');
      const bufferPng  = Buffer.from(base64Data, 'base64');
      const carpetaFirma = cedulaParaGuardar || `${pz.identificacion}_${area}`;
      urlFirmaArea = await subirFirma(carpetaFirma, bufferPng);
    }

    const ahora = new Date();
    await pool.execute(
      `UPDATE Maestro_pazysalvo
       SET \`firma_${area}_url\` = ?, \`firma_${area}_nombre\` = ?, \`firma_${area}_cargo\` = ?,
           \`fecha_firma_${area}\` = ?,
           \`${colToken}\` = NULL, \`${colExpira}\` = NULL
       WHERE id = ?`,
      [urlFirmaArea, nombre_firmante.trim().toUpperCase(), cargo_firmante.trim().toUpperCase(), ahora, idPz]
    );

    // Recargar el registro actualizado
    const [rowsActual] = await pool.execute(
      `SELECT pz.*, v.Trabajador, v.Cargo, v.Operación, v.\`Fecha de Retiro\`,
              v.\`Fecha de Ingreso\`, v.Regional, v.Usuario
       FROM Maestro_pazysalvo pz
       JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
       WHERE pz.id = ?`,
      [idPz]
    );
    const pzActual = rowsActual[0];

    const areasRequeridas = typeof pzActual.areas_requeridas === 'string'
      ? JSON.parse(pzActual.areas_requeridas) : (pzActual.areas_requeridas || []);

    // Verificar si todas las áreas han firmado
    if (estaCompleto(pzActual, areasRequeridas)) {
      // Generar PDF final
      const nombrePlantilla = pzActual.nivel_compromiso === 'alto' ? 'paz_y_salvo_alto' : 'paz_y_salvo_bajo';
      const plantilla = await obtenerPlantilla(nombrePlantilla);
      const articulos = typeof pzActual.articulos === 'string' ? JSON.parse(pzActual.articulos) : (pzActual.articulos || []);

      const nombreTrabajador = limpiarNombre(pzActual.Trabajador);
      const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });

      const datosPlantilla = {
        fecha_expedicion:        hoy,
        nombre_trabajador:       nombreTrabajador.toUpperCase(),
        identificacion:          String(pzActual.identificacion),
        cargo:                   pzActual.Cargo || '',
        operacion:               pzActual['Operación'] || '',
        fecha_retiro:            formatFechaCO(pzActual['Fecha de Retiro']),
        filas_articulos:         generarFilasArticulosHTML(articulos),
        firma_trabajador_html:   buildFirmaHtml(pzActual.firma_trabajador_url),
        firma_responsable_html:  buildFirmaHtml(pzActual.firma_responsable_url),
        nombre_firmante:         pzActual.firma_responsable_nombre || '',
        cargo_firmante:          pzActual.firma_responsable_cargo || '',
        observaciones:           pzActual.observaciones || '',
        // Nómina siempre presente
        firma_nomina_html:       buildFirmaHtml(pzActual.firma_nomina_url),
        firma_nomina_nombre:     pzActual.firma_nomina_nombre || '',
        firma_nomina_cargo:      pzActual.firma_nomina_cargo || '',
      };

      // Firmas de áreas adicionales (nivel alto)
      if (pzActual.nivel_compromiso === 'alto') {
        datosPlantilla.firmas_areas_html = `<table style="width:100%;border-collapse:collapse">${generarFirmasAreasHtml(pzActual, areasRequeridas)}</table>`;
      }

      const htmlFinal = reemplazarVariables(plantilla.contenido_html, datosPlantilla);
      const pdfBuffer = await generarPDF(htmlFinal);
      const urlPdf = await subirPDFPazYSalvo(pzActual.identificacion, pzActual.id_vinculacion, pdfBuffer);

      const ahoraFin = new Date();
      await pool.execute(
        `UPDATE Maestro_pazysalvo SET estado = 'completado', url_pdf_final = ?, fecha_completado = ? WHERE id = ?`,
        [urlPdf, ahoraFin, idPz]
      );

      // Registrar en Maestro_docTrabajador
      registrarDocTrabajador({
        regional:      pzActual.Regional || null,
        operacion:     pzActual['Operación'] || null,
        identificacion: String(pzActual.identificacion),
        fechaIngreso:  pzActual['Fecha de Ingreso'],
        tipoDocumento: '59',
        prefijo:       'PZ',
        doc:           urlPdf,
        usuario:       pzActual.Usuario || null,
      }).catch(e => console.error('[PZ docTrabajador]', e.message));

      // Notificar completado (deshabilitado temporalmente)
      // notificarPazYSalvoCompletado({
      //   trabajador:     nombreTrabajador,
      //   identificacion: pzActual.identificacion,
      //   cargo:          pzActual.Cargo || '',
      //   operacion:      pzActual['Operación'] || '',
      //   urlDoc:         urlPdf,
      // }).catch(e => console.error('[PZ notif completado]', e.message));

      return res.json({ ok: true, completado: true, urlPdf });
    }

    res.json({ ok: true, completado: false });
  } catch (err) {
    console.error('[pazysalvoarea POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

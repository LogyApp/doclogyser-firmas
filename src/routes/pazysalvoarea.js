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
const { generarFilasArticulosHTML, generarFirmasAreasHtml, estaCompleto, NOMBRES_AREA, EMAILS_AREA, fechaFirmaTexto, escapeHtml, normalizarAreasRequeridas } = require('../services/pazYSalvoService');

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
  if (val instanceof Date) return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  return String(val).slice(0, 10);
}

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth() + 1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date 
    ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
    : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
}

function buildFirmaHtml(url, fecha, tipo) {
  if (url) {
    return `<img src="${url}" style="height:80px;display:block;margin-bottom:4px">
       <div style="font-size:7px;color:#888;text-align:center">${fechaFirmaTexto(fecha)}</div>`;
  }
  if (tipo === 'trabajador') {
    return `<div style="border:1.5px solid #ccc;border-radius:4px;padding:8px 10px;color:#888;font-size:7.5px;display:inline-block;width:220px;text-align:center;line-height:1.4;margin-bottom:4px">Documento soportado por correo electrónico – No firmó</div>`;
  }
  return `<div style="border:1px dashed #999;border-radius:3px;padding:6px;color:#555;font-size:8px;text-align:center;line-height:1.3;background:#f9f9f9;min-height:48px;display:flex;align-items:center;justify-content:center">
     Se informó al área por correo electrónico
   </div>`;
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

// Arma y sube el PDF final del Paz y Salvo a partir de un registro `pz`
// (join de Maestro_pazysalvo + Maestro_Vinculación) ya cargado. Reutilizada
// tanto por la firma que completa el proceso como por la regeneración
// (ver regenerarPazYSalvoFinal) cuando cambia la Fecha de Retiro.
async function generarPazYSalvoFinalPDF(pz, areasRequeridas) {
  const nombrePlantilla = pz.nivel_compromiso === 'alto' ? 'paz_y_salvo_alto' : 'paz_y_salvo_bajo';
  const plantilla = await obtenerPlantilla(nombrePlantilla);
  const articulos = typeof pz.articulos === 'string' ? JSON.parse(pz.articulos) : (pz.articulos || []);

  const nombreTrabajador = limpiarNombre(pz.Trabajador);
  const hoy = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });

  const datosPlantilla = {
    fecha_expedicion:        hoy,
    nombre_trabajador:       nombreTrabajador.toUpperCase(),
    identificacion:          String(pz.identificacion),
    cargo:                   pz.Cargo || '',
    operacion:               pz['Operación'] || '',
    fecha_retiro:            formatFechaCO(pz['Fecha de Retiro']),
    filas_articulos:         generarFilasArticulosHTML(articulos),
    firma_trabajador_html:   buildFirmaHtml(pz.firma_trabajador_url, pz.fecha_firma_trabajador, 'trabajador'),
    firma_responsable_html:  buildFirmaHtml(pz.firma_responsable_url, pz.fecha_firma_responsable, 'responsable'),
    nombre_firmante:         pz.firma_responsable_nombre || '',
    cargo_firmante:          pz.firma_responsable_cargo || '',
    observaciones:           (() => {
      let obs = (pz.observaciones || '').trim();
      const areasReqArr = normalizarAreasRequeridas(areasRequeridas);
      const obsAreas = areasReqArr
        .filter(a => pz[`observacion_${a}`])
        .map(a => `• ${NOMBRES_AREA[a] || a}: ${pz['observacion_' + a].trim()}`);
      if (obsAreas.length) {
        const bloque = 'Comentarios de las áreas:\n' + obsAreas.join('\n');
        obs = obs ? `${obs}\n\n${bloque}` : bloque;
      }
      return obs;
    })(),
    // Nómina siempre presente
    firma_nomina_html:       buildFirmaHtml(pz.firma_nomina_url, pz.fecha_firma_nomina, 'Nómina'),
    firma_nomina_nombre:     pz.firma_nomina_nombre || '—',
    firma_nomina_cargo:      pz.firma_nomina_cargo ? pz.firma_nomina_cargo + (pz.observacion_nomina ? `<div style="margin-top:3px;padding:2px 4px;background:#f4faf8;border-left:2px solid #16a085;font-size:7.5px;color:#222"><strong>Comentario:</strong> ${escapeHtml(pz.observacion_nomina)}</div>` : '') : '—',
  };

  // Firmas de áreas adicionales (nivel alto)
  if (pz.nivel_compromiso === 'alto') {
    datosPlantilla.firmas_areas_html = `<table style="width:100%;border-collapse:collapse">${generarFirmasAreasHtml(pz, areasRequeridas)}</table>`;
  }

  const htmlFinal = reemplazarVariables(plantilla.contenido_html, datosPlantilla);
  const pdfBuffer = await generarPDF(htmlFinal);
  return subirPDFPazYSalvo(pz.identificacion, pz.id_vinculacion, pdfBuffer);
}

// ── Regeneración (cambio de Fecha de Retiro) ────────────────────────────────
// Reconstruye el PDF final del Paz y Salvo ya completado con la Fecha de
// Retiro corregida, reutilizando las firmas ya capturadas de cada área.
// Sobrescribe el mismo archivo y actualiza los registros existentes (no crea
// filas nuevas). No hace nada si el Paz y Salvo de esta vinculación aún no
// se ha completado (no hay PDF final que corregir).
async function regenerarPazYSalvoFinal(idVinculacion) {
  const [rows] = await pool.execute(
    `SELECT pz.*, v.Trabajador, v.Cargo, v.\`Operación\`, v.\`Fecha de Retiro\`,
            v.\`Fecha de Ingreso\`, v.Regional, v.Usuario
     FROM Maestro_pazysalvo pz
     JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
     WHERE pz.id_vinculacion = ? ORDER BY pz.fecha_creacion DESC LIMIT 1`,
    [idVinculacion]
  );
  if (!rows.length || rows[0].estado !== 'completado') return null;
  const pz = rows[0];

  const areasRequeridas = normalizarAreasRequeridas(pz.areas_requeridas);

  const urlPdf = await generarPazYSalvoFinalPDF(pz, areasRequeridas);

  await pool.execute('UPDATE Maestro_pazysalvo SET url_pdf_final = ? WHERE id = ?', [urlPdf, pz.id]);
  await pool.execute(
    `UPDATE Maestro_docTrabajador SET Doc = ?
     WHERE Identificación = ? AND TipoDocumento = '59' AND DATE(Fecha_Ingreso) = DATE(?)
     ORDER BY FechaRegistro DESC LIMIT 1`,
    [urlPdf, String(pz.identificacion), toDateStr(pz['Fecha de Ingreso'])]
  );
  return urlPdf;
}

// Compatibilidad con enlaces generados como /pazysalvo-area/:idPz?area=:area&token=:token
router.get('/:idPz', (req, res, next) => {
  const { idPz } = req.params;
  const { area, token } = req.query;
  if (area) {
    return res.redirect(`/pazysalvo-area/${encodeURIComponent(area)}/${encodeURIComponent(idPz)}${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  }
  next();
});

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
    const areasRequeridas = normalizarAreasRequeridas(pz.areas_requeridas);
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
      novedad: pz['novedad_' + area] || '',
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
    const { token, firma_base64, firma_url_existente, nombre_firmante, cargo_firmante, cedula_firmante, observacion } = req.body;

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
    const obsTexto = observacion ? String(observacion).trim() : null;
    try {
      await pool.execute(
        `UPDATE Maestro_pazysalvo
         SET \`firma_${area}_url\` = ?, \`firma_${area}_nombre\` = ?, \`firma_${area}_cargo\` = ?,
             \`fecha_firma_${area}\` = ?,
             \`observacion_${area}\` = ?,
             \`novedad_${area}\` = NULL,
             \`${colToken}\` = NULL, \`${colExpira}\` = NULL
         WHERE id = ?`,
        [urlFirmaArea, nombre_firmante.trim().toUpperCase(), cargo_firmante.trim().toUpperCase(), ahora, obsTexto, idPz]
      );
    } catch (colErr) {
      if (colErr.message.includes('Unknown column')) {
        await pool.execute(
          `UPDATE Maestro_pazysalvo
           SET \`firma_${area}_url\` = ?, \`firma_${area}_nombre\` = ?, \`firma_${area}_cargo\` = ?,
               \`fecha_firma_${area}\` = ?,
               \`novedad_${area}\` = NULL,
               \`${colToken}\` = NULL, \`${colExpira}\` = NULL
           WHERE id = ?`,
          [urlFirmaArea, nombre_firmante.trim().toUpperCase(), cargo_firmante.trim().toUpperCase(), ahora, idPz]
        );
      } else {
        throw colErr;
      }
    }

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

    const areasRequeridas = normalizarAreasRequeridas(pzActual.areas_requeridas);

    // Verificar si todas las áreas han firmado O si ya estaba completado (para regenerar con la nueva firma)
    const completadoTotal = estaCompleto(pzActual, areasRequeridas);
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
      }

      return res.json({ ok: true, completado: true, urlPdf });
    }

    res.json({ ok: true, completado: false });
  } catch (err) {
    console.error('[pazysalvoarea POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /:area/:idPz/novedad ────────────────────────────────────────────────
router.post('/:area/:idPz/novedad', async (req, res) => {
  try {
    const { area, idPz } = req.params;
    const { token, novedad } = req.body;

    if (!token) return res.status(401).json({ ok: false, error: 'Token no proporcionado' });
    if (novedad === undefined || novedad === null) {
      return res.status(400).json({ ok: false, error: 'La novedad es requerida' });
    }

    const colToken  = `token_${area}`;
    const colExpira = `token_${area}_expira`;

    const resultado = await validarTokenPZ(token, idPz, colToken, colExpira);
    if (!resultado.valido) return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });

    const [rows] = await pool.execute(
      `SELECT pz.* FROM Maestro_pazysalvo pz WHERE pz.id = ?`,
      [idPz]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    const pz = rows[0];

    if (pz[`firma_${area}_url`]) {
      return res.status(400).json({ ok: false, error: 'Esta área ya firmó y no puede registrar novedades' });
    }

    // Guardar la novedad
    const novedadTexto = String(novedad).trim();
    await pool.execute(
      `UPDATE Maestro_pazysalvo
       SET \`novedad_${area}\` = ?
       WHERE id = ?`,
      [novedadTexto || null, idPz]
    );

    res.json({ ok: true, novedad: novedadTexto || null });
  } catch (err) {
    console.error('[pazysalvoarea novedad POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
module.exports.generarPazYSalvoFinalPDF = generarPazYSalvoFinalPDF;
module.exports.regenerarPazYSalvoFinal = regenerarPazYSalvoFinal;
module.exports.buildFirmaHtml = buildFirmaHtml;

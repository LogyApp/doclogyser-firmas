const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('../services/plantilla');
const { generarPDF } = require('../services/renderer');
const {
  obtenerFirmaBase64Reciente,
  obtenerUrlFirmaReciente,
  subirFirma,
  subirPDF,
} = require('../services/storage');
const { validarToken } = require('../services/token');
const { notificarDocumentoGenerado } = require('../services/email');

const router = express.Router();

const DOCUMENTO_HTML = path.join(__dirname, '../views/firma/documento.html');
const URL_FIRMA_REPRESENTANTE =
  'https://storage.googleapis.com/logyser-recursos-corporativos/firmas-corporativas/Firma%20Representante.png';

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}div{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:400px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div><h2>Error</h2><p>${mensaje}</p></div></body></html>`;
}

function buildConfig(token, proceso, id, firmaPrevia, documentoHtml) {
  return JSON.stringify({ token, proceso, id, firmaPrevia, documentoHtml }).replace(
    /<\/script>/gi,
    '<\\/script>'
  );
}

router.get('/:proceso/:id', async (req, res) => {
  try {
    const { proceso, id } = req.params;
    const { token } = req.query;

    if (!token) return res.status(401).send(paginaError('Token no proporcionado'));

    const plantilla = await obtenerPlantilla(proceso);
    const resultado = await validarToken(token, plantilla.tabla_datos, plantilla.id_campo_fk, id);

    if (!resultado.valido) return res.status(401).send(paginaError('Token inválido o expirado'));

    const [rows] = await pool.execute(
      `SELECT * FROM \`${plantilla.tabla_datos}\` WHERE \`${plantilla.id_campo_fk}\` = ?`,
      [id]
    );

    if (!rows.length) return res.status(404).send(paginaError('Registro no encontrado'));

    const datos = rows[0];

    let htmlDoc = plantilla.contenido_html || '';
    htmlDoc = htmlDoc
      .replace('{{firma_trabajador}}', '')
      .replace('{{firma_representante}}',
        `<img src="${URL_FIRMA_REPRESENTANTE}" style="max-width:240px;max-height:96px;display:block;margin-top:4px" alt="Firma representante"/>`);
    const documentoHtml = reemplazarVariables(htmlDoc, preprocesarDatos(datos));

    let firmaPrevia = null;
    try {
      firmaPrevia = await obtenerFirmaBase64Reciente(datos['Identificación']);
    } catch {}

    const template = fs.readFileSync(DOCUMENTO_HTML, 'utf8');
    const config = buildConfig(token, proceso, id, firmaPrevia, documentoHtml);
    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error(err);
    res.status(500).send(paginaError('Error interno del servidor'));
  }
});

router.post('/:proceso/:id', async (req, res) => {
  try {
    const { proceso, id } = req.params;
    const { token, firma_base64, es_nueva_firma } = req.body;

    const plantilla = await obtenerPlantilla(proceso);
    const resultado = await validarToken(token, plantilla.tabla_datos, plantilla.id_campo_fk, id);

    if (!resultado.valido) return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });

    const [rows] = await pool.execute(
      `SELECT * FROM \`${plantilla.tabla_datos}\` WHERE \`${plantilla.id_campo_fk}\` = ?`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });

    const t = rows[0];

    if (t.estado_doc !== 'validado') {
      return res.status(409).json({ ok: false, error: 'El documento no está disponible para firma' });
    }

    let urlFirma;
    if (es_nueva_firma) {
      const base64Data = firma_base64.replace(/^data:image\/png;base64,/, '');
      const bufferPng = Buffer.from(base64Data, 'base64');
      urlFirma = await subirFirma(t['Identificación'], bufferPng);
    } else {
      urlFirma = await obtenerUrlFirmaReciente(t['Identificación']);
    }

    await pool.execute(
      `UPDATE \`${plantilla.tabla_datos}\`
       SET firma_trabajador = ?, url_firma = ?,
           token_firma = NULL, token_expira = NULL
       WHERE \`${plantilla.id_campo_fk}\` = ?`,
      [firma_base64, urlFirma, id]
    );

    let htmlPdf = plantilla.contenido_html || '';
    htmlPdf = htmlPdf
      .replace(
        '{{firma_trabajador}}',
        `<img src="${firma_base64}" style="max-width:220px;max-height:90px;display:block;" alt="Firma trabajador"/>`
      )
      .replace(
        '{{firma_representante}}',
        `<img src="${URL_FIRMA_REPRESENTANTE}" style="max-width:220px;max-height:90px;display:block;" alt="Firma representante"/>`
      );
    const htmlFinal = reemplazarVariables(htmlPdf, preprocesarDatos(t));

    const pdfBuffer = await generarPDF(htmlFinal);

    const idTraslado = t['IdTraslado'] || id;
    const urlDoc = await subirPDF(t['Identificación'], idTraslado, pdfBuffer);

    await pool.execute(
      `UPDATE \`${plantilla.tabla_datos}\`
       SET url_doc = ?, estado_doc = 'generado'
       WHERE \`${plantilla.id_campo_fk}\` = ?`,
      [urlDoc, id]
    );

    const [opRows] = await pool.execute(
      'SELECT REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ?',
      [t.operacion_destino]
    );
    const regional = opRows.length ? opRows[0].REGIONAL : null;

    const [vinRows] = await pool.execute(
      'SELECT Estado, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
      [t['Identificación']]
    );
    const estado = vinRows.length ? vinRows[0].Estado : null;
    const fechaIngreso = vinRows.length ? vinRows[0]['Fecha de Ingreso'] : null;

    const newId = uuidv4();
    await pool.execute(
      `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
        Justificacion_Solicitud, FechaRegistro, Usuario)
       VALUES (?, 'PEND', ?, ?, ?, ?, ?, '50', 'TRAS', ?, NULL, 'Ver', NULL, NULL, ?, ?)`,
      [
        newId,
        regional,
        t.operacion_destino,
        t['Identificación'],
        estado,
        fechaIngreso,
        urlDoc,
        t.Fecha_Registro,
        t.Usuario,
      ]
    );

    if (vinRows.length) {
      await pool.execute(
        `UPDATE \`Maestro_Vinculación\`
         SET Operación = ?, Usuario = ?, \`Fecha Actualización\` = ?
         WHERE Identificación = ?
         ORDER BY \`Fecha de Ingreso\` DESC
         LIMIT 1`,
        [t.operacion_destino, t.Usuario, t.Fecha_Registro, t['Identificación']]
      );
    }

    const fechaTrasladoStr = t.fecha_traslado
      ? (typeof t.fecha_traslado === 'string' ? t.fecha_traslado : t.fecha_traslado.toISOString()).slice(0, 10)
      : null;

    if (fechaTrasladoStr) {
      const diaTraslado = parseInt(fechaTrasladoStr.slice(8, 10), 10);

      if (diaTraslado !== 1 && diaTraslado !== 16) {
        const [areaRows] = await pool.execute(
          'SELECT Area FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
          [t['Identificación']]
        );
        const area = areaRows.length ? areaRows[0].Area : null;

        let fechaFinal = null;
        const [mfRows] = await pool.execute(
          'SELECT Quincena, Año FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1',
          [fechaTrasladoStr]
        );
        if (mfRows.length) {
          const [cqRows] = await pool.execute(
            'SELECT `Fecha Final` FROM Config_Quincenas WHERE Quincena = ? AND Año = ? LIMIT 1',
            [mfRows[0].Quincena, mfRows[0].Año]
          );
          if (cqRows.length) fechaFinal = cqRows[0]['Fecha Final'];
        }

        await pool.execute(
          `INSERT INTO Dynamic_Registro_Asistencia
           (IdRegistro, Operación, Area, Evento, Novedad, \`Apoyo de Otra Operación\`,
            Trabajador, Trabajador2, Día, \`Fecha Final\`,
            \`Hora Entrada\`, \`Hora Salida\`, \`Operación a la que apoya\`,
            Incapacidad, \`Cod Diagnostico\`, Diagnostico,
            \`PDF Incapacidad\`, \`PDF Historia Clinica\`, \`PDF Soporte\`,
            Origen, \`Fecha Registro\`, Usuario, Contador, Contador2, Disponible)
           VALUES (?, ?, ?, 'Novedad', 'Traslado', 'NO',
                   NULL, ?, ?, ?,
                   NULL, NULL, NULL,
                   NULL, NULL, NULL,
                   NULL, NULL, ?,
                   ?, ?, 'Sistema', NULL, NULL, 0)`,
          [
            uuidv4(),
            t.operacion_origen,
            area,
            t.Trabajador,
            fechaTrasladoStr,
            fechaFinal,
            urlDoc,
            t.operacion_origen,
            t.Fecha_Registro,
          ]
        );
      }
    }

    const [uRows] = await pool.execute(
      'SELECT Email FROM Maestro_Usuarios WHERE ID = ?', [t.Usuario]
    );
    const emailUsuario = (uRows[0] && uRows[0].Email) || '';

    const partesTrab = (t.Trabajador || '').split(' ** ');
    const nombreTrabajador = partesTrab.length > 1 ? partesTrab[1].trim() : t.Trabajador;

    notificarDocumentoGenerado({
      nombreTrabajador,
      operacionDestino:  t.operacion_destino,
      direccionDestino:  t.direccion_destino || '',
      fechaTraslado:     t.fecha_traslado,
      horaTraslado:      t.hora_traslado || '',
      urlDoc,
      emailUsuario,
    }).catch(e => console.error('Error correo generado:', e.message));

    res.json({ ok: true, url_doc: urlDoc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

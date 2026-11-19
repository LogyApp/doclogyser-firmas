const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../services/db');
const { generarPDF } = require('../services/renderer');
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('../services/plantilla');
const { subirPDFEvaluacionRetiro } = require('../services/storage');
const { validarTokenEVR }          = require('../services/token');
const { notificarNuevaEntrevista } = require('../services/entrevistasRetiro');

const router   = express.Router();
const FORM_HTML = path.join(__dirname, '../views/evaluacionretiro/form.html');

function paginaError(msg) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}.card{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:420px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div class="card"><h2>Enlace no válido</h2><p>${msg}</p></div></body></html>`;
}

function limpiarNombre(n) {
  if (!n) return '';
  const p = String(n).split(' ** ');
  return (p.length > 1 ? p[1] : n).trim();
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}` : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  return String(val).slice(0, 10);
}

function fechaHoraBogota() {
  const b = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${b.getFullYear()}-${p(b.getMonth()+1)}-${p(b.getDate())} ${p(b.getHours())}:${p(b.getMinutes())}:${p(b.getSeconds())}`;
}

// ── PDF de la Entrevista de Retiro ─────────────────────────────────────────
// Plantilla 'entrevista_retiro' de Maestro_Plantillas (migraciones/plantillas/entrevista_retiro.html).
// Aquí solo se arman las piezas: las opciones de cada pregunta (la escogida resaltada) y las
// respuestas abiertas. Lo usan el envío del formulario y la regeneración (regenerarEvaluacionRetiro).
const OPCIONES_EVR = {
  motivo_principal: ['Mejor oportunidad laboral', 'Estudio o proyectos personales', 'Cambio de residencia', 'Condiciones salariales',
    'Ambiente laboral', 'Relación con jefe inmediato', 'Tipo de contrato / estabilidad'],
  relacion_companeros:     ['Excelente', 'Buena', 'Regular', 'Deficiente'],
  relacion_jefe:           ['Excelente', 'Buena', 'Regular', 'Deficiente'],
  claridad_funciones:      ['Muy claras', 'Claras', 'Poco claras', 'Nada claras'],
  condiciones_trabajo:     ['Muy adecuadas', 'Adecuadas', 'Poco adecuadas', 'Inadecuadas'],
  satisfaccion_sueldo:     ['Muy satisfactorio', 'Satisfactorio', 'Poco satisfactorio', 'Insatisfactorio'],
  satisfaccion_beneficios: ['Muy satisfactorios', 'Satisfactorios', 'Poco satisfactorios', 'Insatisfactorios'],
  oportunidad_formacion:   ['Excelentes', 'Buenas', 'Regulares', 'Escasas'],
  oportunidad_crecimiento: ['Excelentes', 'Buenas', 'Regulares', 'Escasas'],
};

function escHtml(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function chipsOpciones(opciones, valor) {
  return opciones.map(o => `<span class="opt${valor === o ? ' opt-sel' : ''}">${valor === o ? '✓ ' : ''}${escHtml(o)}</span>`).join('');
}

function respuestaAbierta(texto) {
  const t = String(texto || '').trim();
  return t ? escHtml(t) : '<span class="answer-empty">Sin respuesta</span>';
}

function datosPlantillaEntrevista(vin, r, evr) {
  const motivo = r.motivo_principal || '';
  const otro = motivo.startsWith('Otro:') ? motivo.replace('Otro:', '').trim() : '';
  const datos = {
    radicado:          String(evr.id_evaluacion || '').replace(/-/g, '').slice(0, 8).toUpperCase(),
    fecha_entrevista:  formatFechaCO(evr.fecha_entrevista || new Date()),
    nombre_trabajador: escHtml(limpiarNombre(vin.Trabajador)),
    identificacion:    escHtml(vin['Identificación']),
    cargo:             escHtml(vin.Cargo || '—'),
    operacion:         escHtml(vin['Operación'] || '—'),
    fecha_ingreso:     formatFechaCO(vin['Fecha de Ingreso']) || '—',
    fecha_retiro:      formatFechaCO(vin['Fecha de Retiro']) || '—',
    motivo_retiro:     escHtml(vin['Motivo del Retiro'] || '—'),
    q_motivo_principal: chipsOpciones(OPCIONES_EVR.motivo_principal, motivo)
      + `<span class="opt opt-otro${otro ? ' opt-sel' : ''}">${otro ? '✓ Otro: ' + escHtml(otro) : 'Otro'}</span>`,
    q_recomienda_empresa: chipsOpciones(['Sí', 'No'], r.recomienda_empresa ? 'Sí' : 'No'),
    valoracion_principal:    respuestaAbierta(r.valoracion_principal),
    aspectos_mejorar:        respuestaAbierta(r.aspectos_mejorar),
    comentarios_adicionales: respuestaAbierta(r.comentarios_adicionales),
  };
  Object.keys(OPCIONES_EVR).filter(k => k !== 'motivo_principal')
    .forEach(k => { datos[`q_${k}`] = chipsOpciones(OPCIONES_EVR[k], r[k]); });
  return datos;
}

async function generarPdfEntrevista(vin, r, evr) {
  const plantilla = await obtenerPlantilla('entrevista_retiro');
  return generarPDF(reemplazarVariables(plantilla.contenido_html, preprocesarDatos(datosPlantillaEntrevista(vin, r, evr))));
}

// ── GET /:idEvaluacion?token=... ──────────────────────────────────────────
router.get('/:idEvaluacion', async (req, res) => {
  try {
    const idEvaluacion = decodeURIComponent(req.params.idEvaluacion);
    const { token }    = req.query;
    if (!token) return res.status(401).send(paginaError('Token no proporcionado.'));

    const resultado = await validarTokenEVR(token, idEvaluacion);
    if (!resultado.valido) {
      const msgs = {
        expirado:       'El enlace ha expirado. Comuníquese con Recursos Humanos.',
        ya_completada:  'La evaluación ya fue diligenciada.',
        jwt_invalido:   'El enlace no es válido.',
        token_no_coincide: 'El enlace no es válido o ya fue utilizado.',
      };
      return res.status(401).send(paginaError(msgs[resultado.motivo] || 'Enlace inválido.'));
    }

    const [evrRows] = await pool.execute(
      'SELECT * FROM Maestro_evaluacionretiro WHERE id_evaluacion = ? LIMIT 1', [idEvaluacion]
    );
    if (!evrRows.length) return res.status(404).send(paginaError('Evaluación no encontrada.'));
    const evr = evrRows[0];

    const [vinRows] = await pool.execute(
      `SELECT Trabajador, \`Identificación\`, Cargo, \`Operación\`, Regional,
              \`Fecha de Ingreso\`, \`Fecha de Retiro\`, \`Motivo del Retiro\`, Usuario
       FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [evr.id_vinculacion]
    );
    if (!vinRows.length) return res.status(404).send(paginaError('Vinculación no encontrada.'));
    const vin = vinRows[0];

    const template = fs.readFileSync(FORM_HTML, 'utf8');
    const config = JSON.stringify({
      idEvaluacion,
      token,
      nombre:       limpiarNombre(vin.Trabajador),
      cedula:       String(vin['Identificación']),
      cargo:        vin.Cargo || '',
      operacion:    vin['Operación'] || '',
      fechaIngreso: formatFechaCO(vin['Fecha de Ingreso']),
      fechaRetiro:  formatFechaCO(vin['Fecha de Retiro']),
      motivoRetiro: vin['Motivo del Retiro'] || '',
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[evaluacionretiro GET]', err);
    res.status(500).send(paginaError('Error interno. Intente más tarde.'));
  }
});

// ── POST /:idEvaluacion ────────────────────────────────────────────────────
router.post('/:idEvaluacion', async (req, res) => {
  try {
    const idEvaluacion = decodeURIComponent(req.params.idEvaluacion);
    const { token }    = req.body;
    if (!token) return res.status(401).json({ ok: false, error: 'Token no proporcionado' });

    const resultado = await validarTokenEVR(token, idEvaluacion);
    if (!resultado.valido) return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });

    const {
      motivo_principal, relacion_companeros, relacion_jefe,
      claridad_funciones, condiciones_trabajo, satisfaccion_sueldo,
      satisfaccion_beneficios, oportunidad_formacion, oportunidad_crecimiento,
      valoracion_principal, aspectos_mejorar, recomienda_empresa, comentarios_adicionales,
    } = req.body;

    const [evrRows] = await pool.execute(
      'SELECT * FROM Maestro_evaluacionretiro WHERE id_evaluacion = ? LIMIT 1', [idEvaluacion]
    );
    if (!evrRows.length) return res.status(404).json({ ok: false, error: 'Evaluación no encontrada' });
    const evr = evrRows[0];

    const [vinRows] = await pool.execute(
      `SELECT Trabajador, \`Identificación\`, Cargo, \`Operación\`, Regional,
              \`Fecha de Ingreso\`, \`Fecha de Retiro\`, \`Motivo del Retiro\`, Usuario
       FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [evr.id_vinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const vin = vinRows[0];
    const identificacion = vin['Identificación'];
    const recomienda     = recomienda_empresa === 'true' || recomienda_empresa === true || recomienda_empresa === '1';

    // Guardar respuestas en DB
    const ahora = fechaHoraBogota();
    await pool.execute(
      `UPDATE Maestro_evaluacionretiro SET
         fecha_entrevista = CURDATE(),
         motivo_principal = ?, relacion_companeros = ?, relacion_jefe = ?,
         claridad_funciones = ?, condiciones_trabajo = ?, satisfaccion_sueldo = ?,
         satisfaccion_beneficios = ?, oportunidad_formacion = ?, oportunidad_crecimiento = ?,
         valoracion_principal = ?, aspectos_mejorar = ?, recomienda_empresa = ?,
         comentarios_adicionales = ?, completada = 1, token_acceso = NULL, token_acceso_expira = NULL
       WHERE id_evaluacion = ?`,
      [
        motivo_principal || null, relacion_companeros || null, relacion_jefe || null,
        claridad_funciones || null, condiciones_trabajo || null, satisfaccion_sueldo || null,
        satisfaccion_beneficios || null, oportunidad_formacion || null, oportunidad_crecimiento || null,
        valoracion_principal || null, aspectos_mejorar || null, recomienda ? 1 : 0,
        comentarios_adicionales || null, idEvaluacion,
      ]
    );

    // Generar PDF
    const pdfBuffer = await generarPdfEntrevista(vin, {
      motivo_principal, relacion_companeros, relacion_jefe,
      claridad_funciones, condiciones_trabajo, satisfaccion_sueldo,
      satisfaccion_beneficios, oportunidad_formacion, oportunidad_crecimiento,
      valoracion_principal, aspectos_mejorar, comentarios_adicionales,
      recomienda_empresa: recomienda,
    }, { ...evr, fecha_entrevista: new Date() });
    const urlPdf    = await subirPDFEvaluacionRetiro(String(identificacion), evr.id_vinculacion, pdfBuffer);

    // Actualizar url_pdf en EVR
    await pool.execute(
      'UPDATE Maestro_evaluacionretiro SET url_pdf = ? WHERE id_evaluacion = ?',
      [urlPdf, idEvaluacion]
    );

    // Registrar en Maestro_docTrabajador
    await pool.execute(
      `INSERT INTO Maestro_docTrabajador
       (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
        TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
        Justificacion_Solicitud, FechaRegistro, Usuario)
       VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, '61', 'EVR', ?, NULL, NULL, NULL, NULL, ?, ?)`,
      [
        uuidv4(),
        vin.Regional || null,
        vin['Operación'] || null,
        String(identificacion),
        toDateStr(vin['Fecha de Ingreso']),
        urlPdf,
        ahora,
        vin.Usuario || 'trabajador',
      ]
    );

    res.json({ ok: true, urlPdf });

    // Campana de Talent Hub › Entrevistas de Retiro
    notificarNuevaEntrevista({ idEvaluacion, vin, urlPdf, motivoPrincipal: motivo_principal });
  } catch (err) {
    console.error('[evaluacionretiro POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Regeneración (cambio de Fecha de Retiro / botón "Regenerar documentos") ──
// Rehace el PDF de una evaluación ya diligenciada con los datos actuales de la vinculación
// (incluida la Fecha de Retiro corregida) y las respuestas guardadas. Sobrescribe el mismo
// archivo y actualiza el registro existente. Devuelve null si no hay evaluación diligenciada.
async function regenerarEvaluacionRetiro(idVinculacion) {
  const [evrRows] = await pool.execute(
    'SELECT * FROM Maestro_evaluacionretiro WHERE id_vinculacion = ? AND completada = 1 LIMIT 1', [idVinculacion]
  );
  if (!evrRows.length) return null;
  const evr = evrRows[0];

  const [vinRows] = await pool.execute(
    `SELECT Trabajador, \`Identificación\`, Cargo, \`Operación\`, Regional,
            \`Fecha de Ingreso\`, \`Fecha de Retiro\`, \`Motivo del Retiro\`, Usuario
     FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1`,
    [idVinculacion]
  );
  if (!vinRows.length) throw new Error('Vinculación no encontrada');
  const vin = vinRows[0];
  const identificacion = String(vin['Identificación']);

  const pdfBuffer = await generarPdfEntrevista(vin, { ...evr, recomienda_empresa: Number(evr.recomienda_empresa) === 1 }, evr);
  const urlPdf    = await subirPDFEvaluacionRetiro(identificacion, idVinculacion, pdfBuffer);

  await pool.execute('UPDATE Maestro_evaluacionretiro SET url_pdf = ? WHERE id_evaluacion = ?', [urlPdf, evr.id_evaluacion]);
  await pool.execute(
    `UPDATE Maestro_docTrabajador SET Doc = ?
     WHERE Identificación = ? AND Prefijo = 'EVR' AND DATE(Fecha_Ingreso) = DATE(?)`,
    [urlPdf, identificacion, toDateStr(vin['Fecha de Ingreso'])]
  );
  return urlPdf;
}

module.exports = router;
module.exports.regenerarEvaluacionRetiro = regenerarEvaluacionRetiro;

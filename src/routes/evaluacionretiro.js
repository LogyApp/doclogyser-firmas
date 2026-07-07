const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../services/db');
const { generarPDFDesdeHTML } = require('../services/renderer');
const { subirPDFEvaluacionRetiro } = require('../services/storage');
const { validarTokenEVR }          = require('../services/token');

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
    function marca(val, opcion) {
      const checked = val === opcion;
      return `<span class="box">${checked ? 'X' : '&nbsp;'}</span>`;
    }
    function motivoCheck(val, clave) {
      const checked = val === clave || (clave === 'Otro' && val && val.startsWith('Otro:'));
      return `<span class="box">${checked ? 'X' : '&nbsp;'}</span>`;
    }
    const htmlPDF = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <style>
      @page { margin: 14mm 18mm 16mm 20mm; }
      body { font-family: Arial, sans-serif; font-size: 12pt; margin: 0; color: #222; }
      .header { display: flex; align-items: center; margin-bottom: 14px; border-bottom: 2px solid #000; padding-bottom: 10px; }
      .header img { height: 52px; margin-right: 16px; }
      .header-title { flex: 1; }
      .header-title h1 { font-size: 16pt; margin: 0; letter-spacing: 1px; }
      .header-codigo { text-align: right; font-size: 8pt; border: 1px solid #000; padding: 4px 8px; white-space: nowrap; }
      .datos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 16px; margin-bottom: 14px; font-size: 9.5pt; }
      .dato-fila { display: flex; gap: 4px; border-bottom: 1px solid #ddd; padding: 2px 0; }
      .dato-label { font-weight: bold; white-space: nowrap; }
      h2 { font-size: 10.5pt; border-bottom: 1px solid #000; padding-bottom: 3px; margin: 12px 0 6px; }
      h3 { font-size: 10pt; margin: 8px 0 4px; }
      .opciones { display: flex; gap: 18px; flex-wrap: wrap; margin: 3px 0 6px 12px; font-size: 9.5pt; }
      .opcion { display: flex; align-items: center; gap: 4px; }
      .box {
        display: inline-block;
        width: 11px;
        height: 11px;
        border: 1px solid #000;
        text-align: center;
        line-height: 10px;
        font-size: 8pt;
        font-family: Arial, sans-serif;
        font-weight: bold;
        margin-right: 4px;
        flex-shrink: 0;
      }
      .otros-row { display: flex; gap: 6px; align-items: center; font-size: 9.5pt; margin: 3px 0 6px 12px; }
      .linea { border-bottom: 1px solid #888; min-width: 160px; display: inline-block; }
      .pregunta-abierta { margin: 6px 0 3px; font-weight: bold; font-size: 9.5pt; }
      .respuesta-abierta { border-bottom: 1px solid #888; min-height: 18px; margin-bottom: 8px; font-size: 9.5pt; padding: 1px 0; }
    </style></head><body>
    <div class="header">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER">
      <div class="header-title"><h1>ENTREVISTA DE RETIRO</h1></div>
      <div class="header-codigo">TH-R-022<br>VERSIÓN 2<br>03/01/2024</div>
    </div>

    <div class="datos-grid">
      <div class="dato-fila"><span class="dato-label">Nombre del colaborador:</span> <span>${limpiarNombre(vin.Trabajador)}</span></div>
      <div class="dato-fila"><span class="dato-label">Cedula:</span> <span>${identificacion}</span></div>
      <div class="dato-fila"><span class="dato-label">Cargo:</span> <span>${vin.Cargo || ''}</span></div>
      <div class="dato-fila"><span class="dato-label">Operación:</span> <span>${vin['Operación'] || ''}</span></div>
      <div class="dato-fila"><span class="dato-label">Fecha de ingreso:</span> <span>${formatFechaCO(vin['Fecha de Ingreso'])}</span></div>
      <div class="dato-fila"><span class="dato-label">Fecha de retiro:</span> <span>${formatFechaCO(vin['Fecha de Retiro'])}</span></div>
    </div>
    <div class="dato-fila" style="margin-bottom:10px;font-size:9.5pt"><span class="dato-label">Motivo del retiro:</span> <span>${vin['Motivo del Retiro'] || ''}</span></div>

    <h2>1. Motivo principal de retiro</h2>
    <div class="opciones">
      <div class="opcion">${motivoCheck(motivo_principal,'Mejor oportunidad laboral')} Mejor oportunidad laboral</div>
      <div class="opcion">${motivoCheck(motivo_principal,'Estudio o proyectos personales')} Estudio o proyectos personales</div>
      <div class="opcion">${motivoCheck(motivo_principal,'Cambio de residencia')} Cambio de residencia</div>
      <div class="opcion">${motivoCheck(motivo_principal,'Condiciones salariales')} Condiciones salariales</div>
      <div class="opcion">${motivoCheck(motivo_principal,'Ambiente laboral')} Ambiente laboral</div>
      <div class="opcion">${motivoCheck(motivo_principal,'Relación con jefe inmediato')} Relación con jefe inmediato</div>
      <div class="opcion">${motivoCheck(motivo_principal,'Tipo de contrato / estabilidad')} Tipo de contrato / estabilidad</div>
      <div class="otros-row">${motivoCheck(motivo_principal,'Otro')} Otro: <span class="linea">${motivo_principal && motivo_principal.startsWith('Otro:') ? motivo_principal.replace('Otro:','').trim() : ''}</span></div>
    </div>

    <h2>2. Experiencia en la empresa</h2>
    <h3>2.1. Relación con compañeros de trabajo</h3>
    <div class="opciones">
      <div class="opcion">${marca(relacion_companeros,'Excelente')} Excelente</div>
      <div class="opcion">${marca(relacion_companeros,'Buena')} Buena</div>
      <div class="opcion">${marca(relacion_companeros,'Regular')} Regular</div>
      <div class="opcion">${marca(relacion_companeros,'Deficiente')} Deficiente</div>
    </div>
    <h3>2.2. Relación con jefe inmediato</h3>
    <div class="opciones">
      <div class="opcion">${marca(relacion_jefe,'Excelente')} Excelente</div>
      <div class="opcion">${marca(relacion_jefe,'Buena')} Buena</div>
      <div class="opcion">${marca(relacion_jefe,'Regular')} Regular</div>
      <div class="opcion">${marca(relacion_jefe,'Deficiente')} Deficiente</div>
    </div>
    <h3>2.3. Claridad en funciones y responsabilidades</h3>
    <div class="opciones">
      <div class="opcion">${marca(claridad_funciones,'Muy claras')} Muy claras</div>
      <div class="opcion">${marca(claridad_funciones,'Claras')} Claras</div>
      <div class="opcion">${marca(claridad_funciones,'Poco claras')} Poco claras</div>
      <div class="opcion">${marca(claridad_funciones,'Nada claras')} Nada claras</div>
    </div>
    <h3>2.4. Condiciones de trabajo (herramientas, equipos, instalaciones)</h3>
    <div class="opciones">
      <div class="opcion">${marca(condiciones_trabajo,'Muy adecuadas')} Muy adecuadas</div>
      <div class="opcion">${marca(condiciones_trabajo,'Adecuadas')} Adecuadas</div>
      <div class="opcion">${marca(condiciones_trabajo,'Poco adecuadas')} Poco adecuadas</div>
      <div class="opcion">${marca(condiciones_trabajo,'Inadecuadas')} Inadecuadas</div>
    </div>

    <h2>3. Remuneración y beneficios</h2>
    <h3>3.1. Sueldo percibido</h3>
    <div class="opciones">
      <div class="opcion">${marca(satisfaccion_sueldo,'Muy satisfactorio')} Muy satisfactorio</div>
      <div class="opcion">${marca(satisfaccion_sueldo,'Satisfactorio')} Satisfactorio</div>
      <div class="opcion">${marca(satisfaccion_sueldo,'Poco satisfactorio')} Poco satisfactorio</div>
      <div class="opcion">${marca(satisfaccion_sueldo,'Insatisfactorio')} Insatisfactorio</div>
    </div>
    <h3>3.2. Beneficios adicionales (bonos, auxilios, reconocimientos)</h3>
    <div class="opciones">
      <div class="opcion">${marca(satisfaccion_beneficios,'Muy satisfactorios')} Muy satisfactorios</div>
      <div class="opcion">${marca(satisfaccion_beneficios,'Satisfactorios')} Satisfactorios</div>
      <div class="opcion">${marca(satisfaccion_beneficios,'Poco satisfactorios')} Poco satisfactorios</div>
      <div class="opcion">${marca(satisfaccion_beneficios,'Insatisfactorios')} Insatisfactorios</div>
    </div>

    <h2>4. Desarrollo y capacitación</h2>
    <h3>4.1. Oportunidades de formación y capacitación</h3>
    <div class="opciones">
      <div class="opcion">${marca(oportunidad_formacion,'Excelentes')} Excelentes</div>
      <div class="opcion">${marca(oportunidad_formacion,'Buenas')} Buenas</div>
      <div class="opcion">${marca(oportunidad_formacion,'Regulares')} Regulares</div>
      <div class="opcion">${marca(oportunidad_formacion,'Escasas')} Escasas</div>
    </div>
    <h3>4.2. Oportunidades de crecimiento y ascenso</h3>
    <div class="opciones">
      <div class="opcion">${marca(oportunidad_crecimiento,'Excelentes')} Excelentes</div>
      <div class="opcion">${marca(oportunidad_crecimiento,'Buenas')} Buenas</div>
      <div class="opcion">${marca(oportunidad_crecimiento,'Regulares')} Regulares</div>
      <div class="opcion">${marca(oportunidad_crecimiento,'Escasas')} Escasas</div>
    </div>

    <h2>5. Recomendaciones y percepción final</h2>
    <div class="pregunta-abierta">5.1. ¿Qué fue lo que más valoró de trabajar en la empresa?</div>
    <div class="respuesta-abierta">${valoracion_principal || ''}</div>
    <div class="pregunta-abierta">5.2. ¿Qué aspectos considera que se deben mejorar?</div>
    <div class="respuesta-abierta">${aspectos_mejorar || ''}</div>
    <div class="pregunta-abierta">5.3. ¿Recomendaría la empresa a otras personas para trabajar?</div>
    <div class="opciones">
      <div class="opcion"><span class="box">${recomienda ? 'X' : '&nbsp;'}</span> Sí</div>
      <div class="opcion"><span class="box">${!recomienda ? 'X' : '&nbsp;'}</span> No</div>
    </div>
    <div class="pregunta-abierta">5.4. Comentarios adicionales:</div>
    <div class="respuesta-abierta">${comentarios_adicionales || ''}</div>
    <div style="margin-top:40px;text-align:center;width:100%">
      <div style="width:100%;height:2px;background:#F55400;margin-bottom:12px"></div>
      <div style="color:#000b59;font-family:Arial,sans-serif;font-size:8pt;line-height:1.4;letter-spacing:0.3px">
        DIAGONAL 74B No. 33° 51-55 — ANTIGUA TRANSVERSAL 39° No 70° 51-55 — LAURELES - MEDELLÍN
      </div>
    </div>
    </body></html>`;

    const pdfBuffer = await generarPDFDesdeHTML(htmlPDF);
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
  } catch (err) {
    console.error('[evaluacionretiro POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

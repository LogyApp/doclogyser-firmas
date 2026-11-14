/**
 * firmaUnica.js
 * Firma única de los "Documentos para firmas" del Portal del aspirante:
 *   1. El aspirante confirma su firma (la más reciente del bucket de firmas, o dibuja una nueva).
 *   2. Pasa documento por documento: los de lectura se aceptan; los que tienen formulario no
 *      dejan avanzar hasta responder lo obligatorio.
 *   3. Al final se generan todos los PDF con esa firma y su fecha de firma debajo
 *      (POST /seleccion/firmar/:uuid/:idConfigDoc, un documento a la vez).
 *
 * Cada documento es un paso; un documento con varias plantillas (ej. Formatos Italcol, documento 33)
 * tiene un paso por plantilla (ver obtenerPartesDocumento en seleccionFirmas.js).
 */
const pool = require('./db');
const formularios = require('./formulariosSeleccion');
const formatosCliente = require('./formatosItalcol');
const { reemplazarVariables } = require('./plantilla');
const { obtenerFirmaBase64Reciente } = require('./storage');
const { obtenerDocsFirmaParaOperacion } = require('./docsSeleccion');
const { obtenerManualPublicado } = require('./manualFunciones');
const {
  obtenerDatosAspiranteParaFirma, obtenerPartesDocumento, htmlParte, motivoBloqueoFirma
} = require('./seleccionFirmas');

const PLACEHOLDER_FIRMA = '<div style="color:#64748b;font-style:italic;font-size:11px;text-align:center;padding:12px 0;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px;">[Tu firma aparecerá aquí al final]</div>';

function estadoDoc(fila) {
  return (fila && fila.estado || '').toString().trim().toLowerCase();
}

/**
 * Pasos de la firma única del aspirante.
 * @param {string} idAspirante
 * @param {object} opciones  { soloDoc: Id de un documento para volver a firmarlo, todos: incluir los ya firmados }
 * @returns {object} { aspirante, firmaPrevia, motivoBloqueo, pasos, documentos }
 *   documentos: lista del portal con su estado (pendiente | firmado | aprobado | no_disponible)
 */
async function obtenerPasos(idAspirante, { soloDoc = null, todos = false } = {}) {
  const [aspRows] = await pool.execute(
    `SELECT id_aspirante, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, identificacion,
            estado_proceso, IdRequisicion, firma_url
       FROM Dynamic_hv_aspirante WHERE id_aspirante = ?`,
    [idAspirante]
  );
  if (!aspRows.length) return null;
  const a = aspRows[0];

  let operacion = '';
  let cargo = '';
  if (a.IdRequisicion) {
    const [req] = await pool.execute(
      'SELECT `Operación`, `Cargo Requerido` FROM Dynamic_Requisiciones WHERE IdRequisicion = ? LIMIT 1',
      [a.IdRequisicion]
    );
    if (req.length) {
      operacion = (req[0]['Operación'] || '').toString().trim();
      cargo = (req[0]['Cargo Requerido'] || '').toString().trim();
    }
  }

  const motivoBloqueo = !a.IdRequisicion
    ? 'Aún no tienes una requisición vinculada. Selección te avisará cuando puedas firmar.'
    : motivoBloqueoFirma(a, null);

  const [cargados] = await pool.execute(
    'SELECT id_config_doc, estado, gcs_path FROM Dynamic_hv_documentos WHERE id_aspirante = ?',
    [idAspirante]
  );
  const mapa = {};
  cargados.forEach(c => { mapa[Number(c.id_config_doc)] = c; });

  const docs = await obtenerDocsFirmaParaOperacion(operacion);
  const pasos = [];
  const documentos = [];
  for (const doc of docs) {
    const fila = mapa[doc.id];
    const est = estadoDoc(fila);
    const item = { id: doc.id, nombre: doc.etiqueta || doc.nombre, gcsPath: fila && fila.gcs_path || null, estado: 'pendiente', motivo: null };
    documentos.push(item);
    if (est === 'aprobado') { item.estado = 'aprobado'; continue; }
    if (est === 'firmado') item.estado = 'firmado';

    // Manual de funciones sin publicar: no se puede firmar todavía
    if (doc.prefijo === 'MF') {
      let manual = null;
      try { manual = cargo ? await obtenerManualPublicado(cargo) : null; } catch (e) { manual = null; }
      if (!manual) {
        item.motivo = `El manual de funciones del cargo${cargo ? ` "${cargo}"` : ''} aún no está publicado. Lo podrás firmar cuando Selección lo publique.`;
        if (item.estado === 'pendiente') item.estado = 'no_disponible';
        continue;
      }
    }

    const incluir = soloDoc ? Number(soloDoc) === doc.id : (todos || item.estado === 'pendiente');
    if (!incluir) continue;

    const partes = await obtenerPartesDocumento(doc.id);
    if (partes.length) {
      partes.forEach((p, i) => pasos.push({
        clave: `${doc.id}-${p.id_plantilla}`,
        idConfigDoc: doc.id,
        idPlantilla: p.id_plantilla,
        proceso: p.nombre_proceso,
        grupo: item.nombre,
        parte: `${i + 1} de ${partes.length}`,
        titulo: p.observaciones || p.nombre_proceso,
        tipo: formatosCliente.CAMPOS_DILIGENCIAR[p.nombre_proceso] ? 'formulario' : 'lectura'
      }));
    } else {
      const preguntas = await formularios.obtenerPreguntas(doc.id);
      pasos.push({
        clave: String(doc.id),
        idConfigDoc: doc.id,
        idPlantilla: null,
        proceso: doc.prefijo,
        grupo: null,
        parte: null,
        titulo: item.nombre,
        tipo: preguntas.length ? 'formulario' : 'lectura'
      });
    }
  }

  // Firma más reciente del bucket de firmas (o la registrada en el aspirante)
  let firmaPrevia = null;
  try { firmaPrevia = await obtenerFirmaBase64Reciente(a.identificacion); } catch (err) {
    console.warn('[Firma única] Error al consultar firma en bucket:', err.message);
  }
  if (!firmaPrevia && a.firma_url) firmaPrevia = a.firma_url;

  const nombreCompleto = [a.primer_nombre, a.segundo_nombre, a.primer_apellido, a.segundo_apellido]
    .filter(n => n && String(n).trim()).join(' ').trim();
  return {
    aspirante: { id: a.id_aspirante, nombre: a.primer_nombre || '', nombreCompleto, identificacion: a.identificacion, operacion, cargo },
    firmaPrevia,
    motivoBloqueo,
    pasos,
    documentos
  };
}

/**
 * Vista de un paso: documento con los datos del aspirante (sin firma) y el formulario si aplica.
 * @param {string} clave  "<idConfigDoc>" o "<idConfigDoc>-<idPlantilla>"
 */
async function vistaPaso(idAspirante, clave) {
  const [idDocTxt, idPlantillaTxt] = String(clave || '').split('-');
  const idConfigDoc = Number(idDocTxt);
  if (!idConfigDoc) throw Object.assign(new Error('Paso no válido.'), { validacion: true });

  const datos = await obtenerDatosAspiranteParaFirma(idAspirante, idConfigDoc);
  if (!datos) throw Object.assign(new Error('Aspirante no encontrado.'), { validacion: true });

  if (idPlantillaTxt) {
    const partes = await obtenerPartesDocumento(idConfigDoc);
    const parte = partes.find(p => String(p.id_plantilla) === idPlantillaTxt);
    if (!parte) throw Object.assign(new Error('El formato ya no está disponible. Recarga la página.'), { validacion: true });
    return {
      html: await htmlParte(datos, parte, {}),
      formulario: formatosCliente.htmlCamposPantalla(parte.nombre_proceso, {})
    };
  }

  if (!datos.contenidoHtml) throw Object.assign(new Error('El documento no tiene plantilla configurada. Avisa a Selección.'), { validacion: true });
  const html = reemplazarVariables(datos.contenidoHtml, { ...datos.variables, firma_colaborador: PLACEHOLDER_FIRMA })
    .replace(/\{\{\s*resp_[^}]+\}\}/g, '<em style="color:#94a3b8">(según tu respuesta en el formulario)</em>');
  const f = datos.formulario || {};
  return {
    html,
    formulario: f.preguntas && f.preguntas.length ? formularios.htmlFormularioPantalla(f.preguntas, f.respuestas || {}) : ''
  };
}

module.exports = { obtenerPasos, vistaPaso };

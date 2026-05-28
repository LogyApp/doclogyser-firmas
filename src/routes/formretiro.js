const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const pool     = require('../services/db');
const { obtenerPlantilla, preprocesarDatos, reemplazarVariables } = require('../services/plantilla');
const { generarPDF } = require('../services/renderer');
const {
  obtenerUrlFirmaReciente,
  subirFirma,
  subirPDFRetiro,
  subirPDFExamenEgreso,
  subirPDFCartaRenuncia,
  subirPDFAceptacionRenuncia,
  subirPDFEvaluacionDesempeno,
  subirPDFCesantias,
} = require('../services/storage');
const { notificarRetiro, notificarDocumentoRetiroTrabajador } = require('../services/email');
const { marcarNotificado } = require('../services/retiroNotifier');
const { generarTokenPZ } = require('../services/token');
const { determinarNivelYAreas } = require('../services/pazYSalvoService');

const router   = express.Router();
const FORM_HTML = path.join(__dirname, '../views/formretiro/form.html');

const MOTIVOS = [
  'Abandono de Puesto de Trabajo',
  'Mutuo Acuerdo',
  'No tomó cargo',
  'Renuncia',
  'Terminación por Muerte',
  'Terminación con Justa Causa',
  'Terminación de la practica',
  'Terminación del contrato',
  'Terminación en Periodo de Prueba',
  'Terminación por Pensión',
  'Terminación Sin Justa Causa',
];

// ── Helpers ────────────────────────────────────────────────────────────────
function parsearIdentificacion(param) {
  const partes = decodeURIComponent(param).split('&');
  const raw = partes[partes.length - 1];
  return parseInt(raw, 10) || raw;
}

function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const d = new Date(typeof fecha === 'string' ? fecha + 'T12:00:00' : fecha);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fechaHoraBogota() {
  const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const p = n => String(n).padStart(2, '0');
  return `${bogota.getFullYear()}-${p(bogota.getMonth() + 1)}-${p(bogota.getDate())} ${p(bogota.getHours())}:${p(bogota.getMinutes())}:${p(bogota.getSeconds())}`;
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

async function resolverFirmaUsuario(colaborador) {
  if (!colaborador) return { identificacionFirmante: null, firmaUrl: null };
  const [rows] = await pool.execute(
    `SELECT \`Identificación\` FROM \`Maestro_Vinculación\`
     WHERE Trabajador = ? ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
    [colaborador]
  );
  if (!rows.length) return { identificacionFirmante: null, firmaUrl: null };
  const identificacionFirmante = rows[0]['Identificación'];
  const firmaUrl = await obtenerUrlFirmaReciente(identificacionFirmante).catch(() => null);
  return { identificacionFirmante, firmaUrl };
}

async function registrarDocTrabajador({ regional, operacion, identificacion, fechaIngreso,
  tipoDocumento, prefijo, doc, observaciones, usuario }) {
  const id    = uuidv4();
  const ahora = fechaHoraBogota();
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
     (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
      TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
      Justificacion_Solicitud, FechaRegistro, Usuario)
     VALUES (?, 'PEND', ?, ?, ?, 'Retirado', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    [id, regional || null, operacion || null, identificacion,
     toDateStr(fechaIngreso), tipoDocumento, prefijo, doc, observaciones || null, ahora, usuario]
  );
  return id;
}

// ── GET /api/firma ─────────────────────────────────────────────────────────
router.get('/api/firma', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.json({ url: null });
    const [usuRows] = await pool.execute(
      'SELECT Colaborador FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length || !usuRows[0].Colaborador) return res.json({ url: null });
    const { firmaUrl } = await resolverFirmaUsuario(usuRows[0].Colaborador);
    res.json({ url: firmaUrl || null });
  } catch (err) {
    console.error('[formretiro api/firma]', err);
    res.json({ url: null });
  }
});

// ── POST /api/subir-tcr-terminacion ───────────────────────────────────────
router.post('/api/subir-tcr-terminacion', async (req, res) => {
  try {
    const { idVinculacion, tcrBase64, usuario: usuarioBody } = req.body;
    const usuarioTCRT = usuarioBody || req.query.usuario || 'sistema';
    if (!idVinculacion || !tcrBase64) {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }
    // Verificar que no esté validado
    const [docRows] = await pool.execute(
      `SELECT Validación FROM Maestro_docTrabajador
       WHERE Identificación = (
         SELECT Identificación FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1
       ) AND Prefijo = 'TCR' ORDER BY FechaRegistro DESC LIMIT 1`,
      [idVinculacion]
    );
    if (docRows.length && docRows[0]['Validación'] === 'OK') {
      return res.status(403).json({ ok: false, error: 'El documento ya fue validado y no puede ser reemplazado' });
    }
    const [vinRows] = await pool.execute(
      `SELECT \`Identificación\`, Regional, Operación, \`Fecha de Ingreso\`
       FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const vinRow = vinRows[0];
    const identificacion = vinRow['Identificación'];
    const buffer = Buffer.from(tcrBase64.replace(/^data:.*;base64,/, ''), 'base64');
    const url = await subirPDFCartaRenuncia(identificacion, idVinculacion, buffer);

    // Si ya existe registro TCR, actualizar URL; si no, crear nuevo
    if (docRows.length) {
      await pool.execute(
        `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = ? WHERE Prefijo = 'TCR'
         AND Identificación = ? ORDER BY FechaRegistro DESC LIMIT 1`,
        [url, fechaHoraBogota(), String(identificacion)]
      );
    } else {
      await registrarDocTrabajador({
        regional:    vinRow.Regional || null,
        operacion:   vinRow['Operación'] || null,
        identificacion,
        fechaIngreso: vinRow['Fecha de Ingreso'],
        tipoDocumento: '55',
        prefijo: 'TCR',
        doc: url,
        observaciones: 'Terminación de contrato',
        usuario: usuarioTCRT,
      });
    }
    res.json({ ok: true, url });
  } catch (err) {
    console.error('[subir-tcr-terminacion]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/actualizar-articulos-pz ────────────────────────────────────
router.post('/api/actualizar-articulos-pz', async (req, res) => {
  try {
    const { idPz, articulos, observaciones } = req.body;
    if (!idPz) return res.status(400).json({ ok: false, error: 'idPz requerido' });
    await pool.execute(
      'UPDATE Maestro_pazysalvo SET articulos = ?, observaciones = ? WHERE id = ?',
      [JSON.stringify(Array.isArray(articulos) ? articulos : []), (observaciones || '').slice(0, 512), idPz]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[actualizar-articulos-pz]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/enviar-trabajador ────────────────────────────────────────────
// Envía correo unificado al trabajador con todos los docs y enlace PZ
router.post('/api/enviar-trabajador', async (req, res) => {
  try {
    const { emailTrabajador, nombreTrabajador, responsableNombre, responsableCargo,
            urlPZ, urlAR, urlCert, urlEMOE, urlCRS, motivoRetiro } = req.body;
    if (!emailTrabajador) return res.status(400).json({ ok: false, error: 'Email requerido' });
    await notificarDocumentoRetiroTrabajador({
      emailTrabajador, nombreTrabajador, responsableNombre, responsableCargo,
      urlPZ, urlAR, urlCert, urlEMOE, urlCRS, motivoRetiro,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[enviar-trabajador]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/reemplazar-ed ────────────────────────────────────────────────
router.post('/api/reemplazar-ed', async (req, res) => {
  try {
    const { idVinculacion, edBase64 } = req.body;
    if (!idVinculacion || !edBase64) {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }
    const [docRows] = await pool.execute(
      `SELECT Validación FROM Maestro_docTrabajador
       WHERE Identificación = (
         SELECT Identificación FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1
       ) AND Prefijo = 'ED' ORDER BY FechaRegistro DESC LIMIT 1`,
      [idVinculacion]
    );
    if (docRows.length && docRows[0]['Validación'] === 'OK') {
      return res.status(403).json({ ok: false, error: 'El documento ya fue validado y no puede ser reemplazado' });
    }
    const [vinRows] = await pool.execute(
      'SELECT `Identificación` FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const identificacion = vinRows[0]['Identificación'];
    const buffer = Buffer.from(edBase64.replace(/^data:.*;base64,/, ''), 'base64');
    const url = await subirPDFEvaluacionDesempeno(identificacion, idVinculacion, buffer);
    res.json({ ok: true, url });
  } catch (err) {
    console.error('[reemplazar-ed]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/reemplazar-tcr ───────────────────────────────────────────────
router.post('/api/reemplazar-tcr', async (req, res) => {
  try {
    const { idVinculacion, tcrBase64 } = req.body;
    if (!idVinculacion || !tcrBase64) {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }
    // Verificar que no esté validado
    const [docRows] = await pool.execute(
      `SELECT Validación FROM Maestro_docTrabajador
       WHERE Identificación = (
         SELECT Identificación FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1
       ) AND Prefijo = 'TCR' ORDER BY FechaRegistro DESC LIMIT 1`,
      [idVinculacion]
    );
    if (docRows.length && docRows[0]['Validación'] === 'OK') {
      return res.status(403).json({ ok: false, error: 'El documento ya fue validado y no puede ser reemplazado' });
    }
    const [vinRows] = await pool.execute(
      'SELECT `Identificación` FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ? LIMIT 1',
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const identificacion = vinRows[0]['Identificación'];
    const buffer = Buffer.from(tcrBase64.replace(/^data:.*;base64,/, ''), 'base64');
    const url = await subirPDFCartaRenuncia(identificacion, idVinculacion, buffer);
    res.json({ ok: true, url });
  } catch (err) {
    console.error('[reemplazar-tcr]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /:identificacion ───────────────────────────────────────────────────
router.get('/:identificacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(htmlError('Parámetro ?usuario requerido'));

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length) return res.status(403).send(htmlError('Usuario no autorizado'));

    const identificacion = parsearIdentificacion(req.params.identificacion);

    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, Trabajador, Cargo, \`Fecha de Ingreso\`, Estado, Regional,
              \`Fecha de Retiro\`, \`Motivo del Retiro\`
       FROM \`Maestro_Vinculación\`
       WHERE \`Identificación\` = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );
    if (!vinRows.length) return res.status(404).send(htmlError('Trabajador no encontrado para esa identificación'));
    const vin = vinRows[0];

    let ciudadRegional = '';
    if (vin.Regional) {
      const [crRows] = await pool.execute(
        'SELECT Ciudad FROM Config_Regionales WHERE Regional = ? LIMIT 1',
        [vin.Regional]
      );
      if (crRows.length) ciudadRegional = crRows[0].Ciudad || '';
    }

    const template = fs.readFileSync(FORM_HTML, 'utf8');

    // Trabajador ya retirado → mostrar estado resumen sin error
    if (vin.Estado === 'Retirado') {
      // Obtener documentos generados al momento del retiro
      const [docRows] = await pool.execute(
        `SELECT Prefijo, Doc, \`Validación\`, TipoDocumento, FechaRegistro
         FROM Maestro_docTrabajador
         WHERE Identificación = ? AND Estado = 'Retirado'
         ORDER BY FechaRegistro DESC`,
        [identificacion]
      );
      // Deduplicar por Prefijo: conservar el más reciente de cada tipo
      const docsMap = {};
      docRows.forEach(r => {
        if (!docsMap[r.Prefijo]) docsMap[r.Prefijo] = r;
      });
      const documentos = Object.values(docsMap).map(r => ({
        prefijo:       r.Prefijo,
        url:           r.Doc,
        validacion:    r['Validación'],
        tipoDocumento: r.TipoDocumento,
      }));

      // Obtener Paz y Salvo activo
      let pazYSalvoRI = null;
      const [pzRows] = await pool.execute(
        `SELECT id, estado, token_trabajador, token_trabajador_expira FROM Maestro_pazysalvo
         WHERE id_vinculacion = ? ORDER BY fecha_creacion DESC LIMIT 1`,
        [vin['Id Vinculación']]
      );
      if (pzRows.length) {
        const pzRow = pzRows[0];
        const baseUrl2 = `${req.protocol}://${req.get('host')}`;
        const urlFirmaPZ2 = pzRow.token_trabajador
          ? `${baseUrl2}/firmar-pazysalvo/${pzRow.id}?token=${encodeURIComponent(pzRow.token_trabajador)}`
          : null;
        // Obtener contacto
        const [segCont2] = await pool.execute(
          'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
          [identificacion]
        );
        const ct2 = segCont2[0] || {};
        pazYSalvoRI = {
          idPz:     pzRow.id,
          estado:   pzRow.estado,
          urlFirma: urlFirmaPZ2,
          email:    ct2.Email || null,
          celular:  String(ct2.Celular || '').replace(/\D/g, '') || null,
        };
      }

      // firmaRenuncia para envío al trabajador
      let firmaRenunciaRI = null;
      if ((vin['Motivo del Retiro'] || '') === 'Renuncia') {
        const arDoc = docsMap['AR'];
        const [segCont3] = await pool.execute(
          'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
          [identificacion]
        );
        const ct3 = segCont3[0] || {};
        firmaRenunciaRI = {
          nombre:        limpiarNombre(vin.Trabajador),
          email:         ct3.Email || null,
          celular:       String(ct3.Celular || '').replace(/\D/g, '') || null,
          urlDoc:        arDoc ? arDoc.url : null,
          tipoRenuncia:  vin['Archivo Vinculación'] || null,
          idVinculacion: vin['Id Vinculación'],
        };
      }

      const config = JSON.stringify({
        identificacion:   String(identificacion),
        usuario,
        usuarioNombre:    usuRows[0].Nombre || usuario,
        trabajador:       limpiarNombre(vin.Trabajador),
        cargo:            vin.Cargo || '',
        fechaIngreso:     formatFechaCO(vin['Fecha de Ingreso']),
        rawFechaIngreso:  toDateStr(vin['Fecha de Ingreso']),
        motivos:          MOTIVOS,
        ciudadRegional,
        yaRetirado:       true,
        retiroInfo: {
          trabajador:   limpiarNombre(vin.Trabajador),
          identificacion: String(identificacion),
          idVinculacion:  vin['Id Vinculación'],
          fechaRetiro:  formatFechaCO(vin['Fecha de Retiro']),
          motivoRetiro: vin['Motivo del Retiro'] || '—',
          tipoRenuncia: vin['Archivo Vinculación'] || null,
          documentos,
          pazYSalvo:    pazYSalvoRI,
          firmaRenuncia: firmaRenunciaRI,
        },
      }).replace(/<\/script>/gi, '<\\/script>');
      return res.send(template.replace('__CONFIG__', config));
    }

    const config = JSON.stringify({
      identificacion:   String(identificacion),
      usuario,
      usuarioNombre:    usuRows[0].Nombre || usuario,
      trabajador:       limpiarNombre(vin.Trabajador),
      cargo:            vin.Cargo || '',
      fechaIngreso:     formatFechaCO(vin['Fecha de Ingreso']),
      rawFechaIngreso:  toDateStr(vin['Fecha de Ingreso']),
      motivos:          MOTIVOS,
      ciudadRegional,
      yaRetirado:       false,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[formretiro GET]', err);
    res.status(500).send(htmlError('Error interno del servidor'));
  }
});

// ── POST /:identificacion ──────────────────────────────────────────────────
router.post('/:identificacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ ok: false, error: 'Parámetro ?usuario requerido' });

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre, Colaborador, Cargo FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length) return res.status(403).json({ ok: false, error: 'Usuario no autorizado' });
    const usuData = usuRows[0];

    const identificacion = parsearIdentificacion(req.params.identificacion);
    const { fechaRetiro, motivoRetiro, firmaBase64, tipoRenuncia, ciudadRegional, tcrBase64, edBase64 } = req.body;

    if (!fechaRetiro) return res.status(400).json({ ok: false, error: 'La fecha de retiro es obligatoria' });
    if (!motivoRetiro || !MOTIVOS.includes(motivoRetiro)) {
      return res.status(400).json({ ok: false, error: 'Motivo de retiro inválido' });
    }
    if (motivoRetiro === 'Renuncia') {
      if (!tipoRenuncia || !['Verbal', 'Escrita'].includes(tipoRenuncia)) {
        return res.status(400).json({ ok: false, error: 'Seleccione el tipo de renuncia (Verbal o Escrita)' });
      }
      if (!ciudadRegional || !ciudadRegional.trim()) {
        return res.status(400).json({ ok: false, error: 'Ingrese la ciudad para los documentos de retiro' });
      }
      // TCR y ED se piden después de guardar
    }

    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, Trabajador, Cargo, \`Fecha de Ingreso\`, Estado, Operación, Regional
       FROM \`Maestro_Vinculación\`
       WHERE \`Identificación\` = ?
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    const vin = vinRows[0];
    if (vin.Estado === 'Retirado') return res.status(409).json({ ok: false, error: 'El trabajador ya figura como retirado' });

    const ahora = fechaHoraBogota();

    await pool.execute(
      `UPDATE \`Maestro_Vinculación\`
       SET Estado = 'Retirado',
           \`Fecha de Retiro\` = ?,
           \`Motivo del Retiro\` = ?,
           \`Fecha Actualización\` = ?,
           Usuario = ?
       WHERE \`Id Vinculación\` = ? AND Estado != 'Retirado'`,
      [fechaRetiro, motivoRetiro, ahora, usuario, vin['Id Vinculación']]
    );

    notificarRetiro({
      trabajador:       vin.Trabajador,
      identificacion:   String(identificacion),
      cargo:            vin.Cargo,
      operacion:        vin['Operación'],
      fechaRetiro,
      motivoRetiro,
      registradoPor:    usuData.Nombre || usuario,
      emailRegistrador: usuData.Email  || null,
    }).then(() => marcarNotificado(vin['Id Vinculación']))
      .catch(e => console.error('[retiro email]', e.message));

    // Motivos que no generan documentos
    const MOTIVOS_SIN_DOCS = ['No tomó cargo', 'Terminación por Muerte'];
    if (MOTIVOS_SIN_DOCS.includes(motivoRetiro)) {
      return res.json({
        ok: true,
        trabajador:    limpiarNombre(vin.Trabajador),
        fechaRetiro,
        motivoRetiro,
        documentos:    [],
        ed:            null,
        tcr:           null,
        firmaRenuncia: null,
      });
    }

    // ── Firma del responsable ──────────────────────────────────────────────
    const { identificacionFirmante, firmaUrl: firmaExistente } = await resolverFirmaUsuario(usuData.Colaborador);
    let firmaUrl = firmaExistente;
    if (firmaBase64 && identificacionFirmante) {
      const buffer = Buffer.from(firmaBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      firmaUrl = await subirFirma(identificacionFirmante, buffer);
    }
    const nombreFirmante = limpiarNombre(usuData.Colaborador || usuData.Nombre).toUpperCase();
    const firmaHtml = firmaUrl
      ? `<img src="${firmaUrl}" style="height:80px;display:block;margin-bottom:4px">`
      : `<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>`;

    // ── Ciudad para documentos ─────────────────────────────────────────────
    let ciudadDoc = (motivoRetiro === 'Renuncia' && ciudadRegional)
      ? ciudadRegional.trim()
      : '';
    if (!ciudadDoc && vin.Regional) {
      const [crRows] = await pool.execute(
        'SELECT Ciudad FROM Config_Regionales WHERE Regional = ? LIMIT 1',
        [vin.Regional]
      );
      if (crRows.length) ciudadDoc = crRows[0].Ciudad || '';
    }

    const docBaseParams = {
      regional:    vin.Regional || null,
      operacion:   vin['Operación'] || null,
      identificacion,
      fechaIngreso: vin['Fecha de Ingreso'],
      usuario,
    };

    const documentos = [];

    // ── Certificado laboral ────────────────────────────────────────────────
    const [segRows] = await pool.execute(
      'SELECT ARL, EPS, `Pensión`, `Cesantías` FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
      [identificacion]
    );
    const seg = segRows[0] || {};
    const plantillaCert = await obtenerPlantilla('certificado_retiro');
    const datosCert = {
      nombre_trabajador: limpiarNombre(vin.Trabajador).toUpperCase(),
      identificacion:    String(identificacion),
      cargo:             (vin.Cargo || '').toUpperCase(),
      fecha_ingreso:     formatFechaCO(vin['Fecha de Ingreso']),
      fecha_retiro:      formatFechaCO(fechaRetiro),
      arl:               seg.ARL   || '—',
      eps:               seg.EPS   || '—',
      pension:           seg['Pensión'] || '—',
      fecha_expedicion:  formatFechaCO(new Date()),
      firma_html:        firmaHtml,
      nombre_firmante:   nombreFirmante,
      cargo_firmante:    usuData.Cargo || '',
    };
    const htmlCert  = reemplazarVariables(plantillaCert.contenido_html, preprocesarDatos(datosCert));
    const pdfCert   = await generarPDF(htmlCert);
    const urlCert   = await subirPDFRetiro(identificacion, 'cert_laboral', pdfCert);

    await registrarDocTrabajador({ ...docBaseParams, tipoDocumento: '57', prefijo: 'CT', doc: urlCert });
    documentos.push({ titulo: 'Certificado Laboral de Retiro', url: urlCert });

    // ── Examen médico de egreso ────────────────────────────────────────────
    const plantillaEMOE = await obtenerPlantilla('examen_egreso').catch(() => null);
    let emoeData = null;
    if (plantillaEMOE) {
      const datosEMOE = {
        ciudad_regional:       ciudadDoc,
        fecha_expedicion:      formatFechaCO(new Date()),
        nombre_trabajador:     limpiarNombre(vin.Trabajador).toUpperCase(),
        identificacion:        String(identificacion),
        firma_responsable_html: firmaHtml,
        nombre_firmante:       nombreFirmante,
        cargo_firmante:        usuData.Cargo || '',
      };
      const htmlEMOE = reemplazarVariables(plantillaEMOE.contenido_html, preprocesarDatos(datosEMOE));
      const pdfEMOE  = await generarPDF(htmlEMOE);
      const urlEMOE  = await subirPDFExamenEgreso(identificacion, vin['Id Vinculación'], pdfEMOE);

      await registrarDocTrabajador({ ...docBaseParams, tipoDocumento: '58', prefijo: 'EMOE', doc: urlEMOE });
      documentos.push({ titulo: 'Autorización Examen Médico de Egreso', url: urlEMOE });
      emoeData = { url: urlEMOE };
    }

    // ── Carta Retiro Cesantías (CRS) ──────────────────────────────────────
    // Solo si el año de Fecha de Ingreso es anterior al año actual
    const anioIngreso  = vin['Fecha de Ingreso']
      ? new Date(vin['Fecha de Ingreso']).getFullYear()
      : null;
    const anioActual   = new Date().getFullYear();
    const plantillaCRS = anioIngreso && anioIngreso < anioActual
      ? await obtenerPlantilla('cesantias_retiro').catch(() => null)
      : null;
    if (plantillaCRS) {
      const datosCRS = {
        ciudad_regional:        ciudadDoc,
        fecha_expedicion:       formatFechaCO(new Date()),
        nombre_trabajador:      limpiarNombre(vin.Trabajador).toUpperCase(),
        identificacion:         String(identificacion),
        fondo_cesantias:        seg['Cesantías'] || '—',
        firma_responsable_html: firmaHtml,
        nombre_firmante:        nombreFirmante,
        cargo_firmante:         usuData.Cargo || '',
      };
      const htmlCRS = reemplazarVariables(plantillaCRS.contenido_html, preprocesarDatos(datosCRS));
      const pdfCRS  = await generarPDF(htmlCRS);
      const urlCRS  = await subirPDFCesantias(identificacion, vin['Id Vinculación'], pdfCRS);
      await registrarDocTrabajador({ ...docBaseParams, tipoDocumento: '60', prefijo: 'CRS', doc: urlCRS });
      documentos.push({ titulo: 'Carta Retiro Cesantías', url: urlCRS });
    }

    // ── Evaluación de desempeño (ED) ─────────────────────────────────────
    let edData = null;
    if (motivoRetiro === 'Terminación en Periodo de Prueba' && edBase64) {
      const bufferED = Buffer.from(edBase64.replace(/^data:.*;base64,/, ''), 'base64');
      const urlED    = await subirPDFEvaluacionDesempeno(identificacion, vin['Id Vinculación'], bufferED);
      const idDocED  = await registrarDocTrabajador({
        ...docBaseParams, tipoDocumento: '56', prefijo: 'ED',
        doc: urlED, observaciones: null,
      });
      edData = { url: urlED, idDoc: idDocED, validacion: 'PEND', idVinculacion: vin['Id Vinculación'] };
    }

    // ── Carta renuncia del trabajador (TCR) ───────────────────────────────
    let tcrData = null;
    if (motivoRetiro === 'Renuncia' && tipoRenuncia === 'Escrita' && tcrBase64) {
      const bufferTCR = Buffer.from(tcrBase64.replace(/^data:.*;base64,/, ''), 'base64');
      const urlTCR    = await subirPDFCartaRenuncia(identificacion, vin['Id Vinculación'], bufferTCR);
      const idDocTCR  = await registrarDocTrabajador({
        ...docBaseParams, tipoDocumento: '55', prefijo: 'TCR',
        doc: urlTCR, observaciones: 'Carta de renuncia',
      });
      tcrData = { url: urlTCR, idDoc: idDocTCR, validacion: 'PEND' };
    }

    // ── Aceptación de Renuncia (generada automáticamente, sin firma del trabajador) ──
    let firmaRenuncia = null;
    if (motivoRetiro === 'Renuncia') {
      await pool.execute(
        `UPDATE \`Maestro_Vinculación\`
         SET \`Archivo Vinculación\` = ?, ar_ciudad_regional = ?
         WHERE \`Id Vinculación\` = ?`,
        [tipoRenuncia, ciudadDoc, vin['Id Vinculación']]
      );

      // Generar PDF de Aceptación de Renuncia automáticamente (sin firma trabajador)
      try {
        const plantillaAR = await obtenerPlantilla('aceptacion_renuncia');
        const datosAR = {
          nombre_trabajador:      limpiarNombre(vin.Trabajador).toUpperCase(),
          identificacion:         String(identificacion),
          ciudad_regional:        ciudadDoc,
          verbal_marca:           tipoRenuncia === 'Verbal' ? 'X' : '___',
          escrita_marca:          tipoRenuncia === 'Escrita' ? 'X' : '___',
          fecha_retiro_texto:     formatFechaCO(fechaRetiro),
          firma_responsable_html: firmaHtml,
          nombre_firmante:        nombreFirmante,
          cargo_firmante:         usuData.Cargo || '',
          firma_trabajador_html:  '<div style="height:72px;border-bottom:1px solid #000;width:220px;margin-bottom:4px"></div>',
        };
        const htmlAR  = reemplazarVariables(plantillaAR.contenido_html, preprocesarDatos(datosAR));
        const pdfAR   = await generarPDF(htmlAR);
        const urlAR   = await subirPDFAceptacionRenuncia(identificacion, vin['Id Vinculación'], pdfAR);
        await registrarDocTrabajador({ ...docBaseParams, tipoDocumento: '54', prefijo: 'AR', doc: urlAR });
        documentos.push({ titulo: 'Aceptación de Renuncia', url: urlAR });

        const [segContactRows] = await pool.execute(
          'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
          [identificacion]
        );
        const contacto = segContactRows[0] || {};
        firmaRenuncia = {
          nombre:        limpiarNombre(vin.Trabajador),
          email:         contacto.Email || null,
          celular:       String(contacto.Celular || '').replace(/\D/g, '') || null,
          urlDoc:        urlAR,
          tipoRenuncia,
          idVinculacion: vin['Id Vinculación'],
        };
      } catch (eAR) {
        console.error('[AR generacion]', eAR.message);
      }
    }

    // ── Paz y Salvo ───────────────────────────────────────────────────────
    let pazYSalvoData = null;
    try {
      const { nivel, areasRequeridas } = determinarNivelYAreas(vin.Cargo);
      // Los artículos se guardan después por endpoint separado

      // Obtener contacto del trabajador
      let emailTrab = null, celularTrab = null;
      const [segContactPZ] = await pool.execute(
        'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
        [identificacion]
      );
      if (segContactPZ.length) {
        emailTrab  = segContactPZ[0].Email || null;
        celularTrab = String(segContactPZ[0].Celular || '').replace(/\D/g, '') || null;
      }

      const idPz = uuidv4();
      const idVin = vin['Id Vinculación'];
      const ahoraPZ = new Date();

      await pool.execute(
        `INSERT INTO Maestro_pazysalvo
         (id, id_vinculacion, identificacion, nivel_compromiso, areas_requeridas, articulos,
          observaciones, firma_responsable_url, firma_responsable_nombre, firma_responsable_cargo,
          fecha_firma_responsable, estado, usuario_registro, fecha_creacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'esperando_trabajador', ?, ?)`,
        [
          idPz, idVin, String(identificacion), nivel,
          JSON.stringify(areasRequeridas), JSON.stringify([]),
          null,
          firmaUrl || null, nombreFirmante || null, usuData.Cargo || null,
          ahoraPZ, usuario, ahoraPZ,
        ]
      );

      const tokenPZ = await generarTokenPZ(idPz, 'token_trabajador', 'token_trabajador_expira');
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const urlFirmaPZ = `${baseUrl}/firmar-pazysalvo/${idPz}?token=${encodeURIComponent(tokenPZ)}`;

      // Notificación al trabajador deshabilitada temporalmente
      // if (emailTrab) {
      //   notificarPazYSalvoTrabajador({
      //     emailTrabajador:  emailTrab,
      //     celularTrabajador: celularTrab,
      //     trabajador:       limpiarNombre(vin.Trabajador),
      //     identificacion:   String(identificacion),
      //     cargo:            vin.Cargo || '',
      //     operacion:        vin['Operación'] || '',
      //     urlFirma:         urlFirmaPZ,
      //   }).catch(e => console.error('[PZ email trabajador]', e.message));
      // }

      pazYSalvoData = {
        idPz,
        urlFirma:   urlFirmaPZ,
        nombre:     limpiarNombre(vin.Trabajador),
        email:      emailTrab,
        celular:    celularTrab,
        nivel,
        areasRequeridas,
      };
    } catch (ePz) {
      console.error('[PZ creacion]', ePz.message);
    }

    // Datos del responsable para mensaje al trabajador
    const responsableNombre = limpiarNombre(usuData.Colaborador || usuData.Nombre);
    const responsableCargo  = usuData.Cargo || '';

    res.json({
      ok: true,
      trabajador:        limpiarNombre(vin.Trabajador),
      identificacion:    String(identificacion),
      idVinculacion:     vin['Id Vinculación'],
      cargo:             vin.Cargo || '',
      operacion:         vin['Operación'] || '',
      fechaRetiro,
      motivoRetiro,
      tipoRenuncia:      (motivoRetiro === 'Renuncia' ? (req.body.tipoRenuncia || null) : null),
      documentos,
      ed:                edData,
      tcr:               tcrData,
      tcrTerminacion:    null, // se sube post-guardado
      firmaRenuncia,
      pazYSalvo:         pazYSalvoData,
      responsable:       { nombre: responsableNombre, cargo: responsableCargo },
      tieneCesantias:    documentos.some(d => d.titulo && d.titulo.includes('Cesant')),
    });
  } catch (err) {
    console.error('[formretiro POST]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

function htmlError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}div{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:400px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div><h2>Error</h2><p>${mensaje}</p></div></body></html>`;
}

module.exports = router;

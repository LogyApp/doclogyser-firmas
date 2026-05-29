const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const pool     = require('../services/db');
const { obtenerPlantilla } = require('../services/plantilla');
const {
  obtenerUrlFirmaReciente,
  subirFirma,
  subirPDFCartaRenuncia,
  subirPDFEvaluacionDesempeno,
} = require('../services/storage');
const { notificarRetiro, notificarDocumentoRetiroTrabajador } = require('../services/email');
const { marcarNotificado } = require('../services/retiroNotifier');
const { generarTokenPZ, generarTokenCT, generarTokenAR, generarTokenEMOE, generarTokenCRS, reconstruirToken } = require('../services/token');
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
    const { idPz, articulos, observaciones, usuario: usuarioBody } = req.body;
    const usuarioParam = req.query.usuario || usuarioBody;
    if (!idPz) return res.status(400).json({ ok: false, error: 'idPz requerido' });

    const articulosArr = Array.isArray(articulos) ? articulos : [];

    // Debe haber al menos un artículo con devolución marcada
    const tieneDevolucion = articulosArr.some(a => a.devuelve === true || a.devuelve === 'true');
    if (!tieneDevolucion) {
      return res.status(400).json({ ok: false, error: 'Marque al menos un artículo a devolver antes de guardar' });
    }

    // Cargar estado actual del PZ
    const [pzRows] = await pool.execute(
      'SELECT estado, token_trabajador FROM Maestro_pazysalvo WHERE id = ? LIMIT 1',
      [idPz]
    );
    if (!pzRows.length) return res.status(404).json({ ok: false, error: 'Paz y Salvo no encontrado' });
    const pzActual = pzRows[0];

    // PZ completado → nadie puede modificar
    if (pzActual.estado === 'completado') {
      return res.status(403).json({ ok: false, error: 'El Paz y Salvo ya está completado y no puede modificarse' });
    }

    // Token ya existe (artículos guardados antes) → solo Nómina/Sistema
    if (pzActual.token_trabajador && usuarioParam) {
      const [uRows] = await pool.execute(
        'SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuarioParam]
      );
      if (!uRows.length || !['Nomina', 'Sistema'].includes(uRows[0].Rol)) {
        return res.status(403).json({ ok: false, error: 'Solo Nómina o Sistema pueden modificar artículos ya guardados' });
      }
    }

    await pool.execute(
      'UPDATE Maestro_pazysalvo SET articulos = ?, observaciones = ? WHERE id = ?',
      [JSON.stringify(articulosArr), (observaciones || '').slice(0, 512), idPz]
    );

    // Generar token si aún no existe; si ya existe, devolver URL con el token actual
    let urlFirma = null;
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    if (!pzActual.token_trabajador) {
      const tokenPZ = await generarTokenPZ(idPz, 'token_trabajador', 'token_trabajador_expira');
      urlFirma = `${baseUrl}/firmar-pazysalvo/${idPz}?token=${encodeURIComponent(tokenPZ)}`;
    } else {
      urlFirma = `${baseUrl}/firmar-pazysalvo/${idPz}?token=${encodeURIComponent(pzActual.token_trabajador)}`;
    }

    res.json({ ok: true, urlFirma });
  } catch (err) {
    console.error('[actualizar-articulos-pz]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/pz-status/:idPz ──────────────────────────────────────────────
// Devuelve el estado de firmas por área del Paz y Salvo (solo para Nómina/Sistema)
router.get('/api/pz-status/:idPz', async (req, res) => {
  try {
    const { idPz } = req.params;
    const { usuario } = req.query;

    // Verificar rol del usuario (solo Nomina y Sistema)
    if (usuario) {
      const [uRows] = await pool.execute(
        'SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]
      );
      if (!uRows.length || !['Nomina', 'Sistema'].includes(uRows[0].Rol)) {
        return res.status(403).json({ ok: false, error: 'Sin permiso' });
      }
    }

    const [rows] = await pool.execute(
      `SELECT estado, nivel_compromiso, areas_requeridas, url_pdf_final,
              firma_trabajador_url,
              firma_nomina_url, firma_tecnologia_url, firma_sst_url,
              firma_facturacion_url, firma_contabilidad_url, firma_cuentas_url,
              firma_gerencia_url
       FROM Maestro_pazysalvo WHERE id = ? LIMIT 1`,
      [idPz]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'No encontrado' });
    const pz = rows[0];

    const areasRequeridas = typeof pz.areas_requeridas === 'string'
      ? JSON.parse(pz.areas_requeridas)
      : (pz.areas_requeridas || []);

    const firmas = { trabajador: !!pz.firma_trabajador_url };
    for (const area of areasRequeridas) {
      firmas[area] = !!pz[`firma_${area}_url`];
    }

    res.json({
      ok: true,
      estado: pz.estado,
      nivel: pz.nivel_compromiso,
      areasRequeridas,
      firmas,
      urlPdfFinal: pz.url_pdf_final || null,
    });
  } catch (err) {
    console.error('[pz-status]', err);
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

// ── POST /api/confirmar-responsable ───────────────────────────────────────
// Paso 2: guarda firma del responsable, tipo renuncia, ciudad y genera tokens
router.post('/api/confirmar-responsable', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ ok: false, error: 'Parámetro ?usuario requerido' });

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre, Colaborador, Cargo FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length) return res.status(403).json({ ok: false, error: 'Usuario no autorizado' });
    const usuData = usuRows[0];

    const { idVinculacion, firmaBase64, tipoRenuncia, ciudadRegional } = req.body;
    if (!idVinculacion) return res.status(400).json({ ok: false, error: 'idVinculacion requerido' });

    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, \`Identificación\`, Trabajador, Cargo,
              \`Fecha de Ingreso\`, \`Fecha de Retiro\`, Estado,
              \`Operación\`, Regional, \`Motivo del Retiro\`
       FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const vin = vinRows[0];
    const identificacion = vin['Identificación'];
    const motivoRetiro   = vin['Motivo del Retiro'];

    if (motivoRetiro === 'Renuncia') {
      if (!tipoRenuncia || !['Verbal', 'Escrita'].includes(tipoRenuncia)) {
        return res.status(400).json({ ok: false, error: 'Seleccione el tipo de renuncia (Verbal o Escrita)' });
      }
      if (!ciudadRegional || !ciudadRegional.trim()) {
        return res.status(400).json({ ok: false, error: 'Ingrese la ciudad para los documentos de retiro' });
      }
    }

    // Firma del responsable
    const { identificacionFirmante, firmaUrl: firmaExistente } = await resolverFirmaUsuario(usuData.Colaborador);
    let firmaUrl = firmaExistente;
    if (firmaBase64 && identificacionFirmante) {
      const buffer = Buffer.from(firmaBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      firmaUrl = await subirFirma(identificacionFirmante, buffer);
    }
    if (!firmaUrl) {
      return res.status(400).json({ ok: false, error: 'Debe proporcionar una firma para continuar' });
    }
    const nombreFirmante = limpiarNombre(usuData.Colaborador || usuData.Nombre).toUpperCase();

    // Guardar tipo de renuncia y ciudad si aplica
    const ciudadDoc = (motivoRetiro === 'Renuncia' && ciudadRegional) ? ciudadRegional.trim() : '';
    if (motivoRetiro === 'Renuncia') {
      await pool.execute(
        `UPDATE \`Maestro_Vinculación\` SET \`Archivo Vinculación\` = ?, ar_ciudad_regional = ? WHERE \`Id Vinculación\` = ?`,
        [tipoRenuncia, ciudadDoc, idVinculacion]
      );
    }

    // Actualizar Maestro_pazysalvo con firma del responsable
    await pool.execute(
      `UPDATE Maestro_pazysalvo
       SET firma_responsable_url = ?, firma_responsable_nombre = ?,
           firma_responsable_cargo = ?, fecha_firma_responsable = ?
       WHERE id_vinculacion = ?`,
      [firmaUrl, nombreFirmante, usuData.Cargo || '', new Date(), idVinculacion]
    );

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const idVin   = vin['Id Vinculación'];

    // Token CT (siempre)
    const tokenCT    = await generarTokenCT(idVin);
    const urlFirmaCT = `${baseUrl}/firmar-certificado-retiro/${encodeURIComponent(idVin)}?token=${encodeURIComponent(tokenCT)}`;

    // Token AR (solo Renuncia)
    let firmaRenunciaData = null;
    if (motivoRetiro === 'Renuncia') {
      const tokenAR    = await generarTokenAR(idVin);
      const urlFirmaAR = `${baseUrl}/firmar-renuncia/${encodeURIComponent(idVin)}?token=${encodeURIComponent(tokenAR)}`;
      const [segC] = await pool.execute(
        'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
        [identificacion]
      );
      const ct = segC[0] || {};
      firmaRenunciaData = {
        nombre:        limpiarNombre(vin.Trabajador),
        email:         ct.Email || null,
        celular:       String(ct.Celular || '').replace(/\D/g, '') || null,
        urlDoc:        null,
        urlFirma:      urlFirmaAR,
        tipoRenuncia,
        idVinculacion: idVin,
      };
    }

    // Token EMOE (si existe plantilla)
    let emoeData = null;
    try {
      const plantillaEMOE = await obtenerPlantilla('examen_egreso');
      if (plantillaEMOE) {
        const tokenEMOE = await generarTokenEMOE(idVin);
        emoeData = { urlFirma: `${baseUrl}/firmar-examen-egreso/${encodeURIComponent(idVin)}?token=${encodeURIComponent(tokenEMOE)}` };
      }
    } catch {}

    // Token CRS (si año ingreso < año actual)
    let crsData = null;
    const anioIngreso = vin['Fecha de Ingreso'] ? new Date(vin['Fecha de Ingreso']).getFullYear() : null;
    if (anioIngreso && anioIngreso < new Date().getFullYear()) {
      try {
        const plantillaCRS = await obtenerPlantilla('cesantias_retiro');
        if (plantillaCRS) {
          const tokenCRS = await generarTokenCRS(idVin);
          crsData = { urlFirma: `${baseUrl}/firmar-cesantias/${encodeURIComponent(idVin)}?token=${encodeURIComponent(tokenCRS)}` };
        }
      } catch {}
    }

    // PZ y contacto final
    const [pzRows2] = await pool.execute(
      'SELECT id FROM Maestro_pazysalvo WHERE id_vinculacion = ? ORDER BY fecha_creacion DESC LIMIT 1',
      [idVin]
    );
    const idPz = pzRows2.length ? pzRows2[0].id : null;

    const [segFinal] = await pool.execute(
      'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
      [identificacion]
    );
    const ctFinal = segFinal[0] || {};

    res.json({
      ok:           true,
      urlFirmaCT,
      firmaRenuncia: firmaRenunciaData,
      emoe:         emoeData,
      cesantias:    crsData,
      idPz,
      email:        ctFinal.Email || null,
      celular:      String(ctFinal.Celular || '').replace(/\D/g, '') || null,
      responsable:  { nombre: limpiarNombre(usuData.Colaborador || usuData.Nombre), cargo: usuData.Cargo || '' },
      tipoRenuncia: motivoRetiro === 'Renuncia' ? tipoRenuncia : null,
    });
  } catch (err) {
    console.error('[confirmar-responsable]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /:identificacion ───────────────────────────────────────────────────
router.get('/:identificacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(htmlError('Parámetro ?usuario requerido'));

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre, Rol FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length) return res.status(403).send(htmlError('Usuario no autorizado'));
    const rolUsuario = usuRows[0].Rol || '';

    const identificacion = parsearIdentificacion(req.params.identificacion);

    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, Trabajador, Cargo, \`Fecha de Ingreso\`, Estado, Regional,
              \`Fecha de Retiro\`, \`Motivo del Retiro\`, \`Archivo Vinculación\`,
              token_firma_ct, token_firma_ct_expira,
              token_firma_ar, token_firma_ar_expira,
              token_firma_emoe, token_firma_emoe_expira,
              token_firma_crs, token_firma_crs_expira
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
        `SELECT id, estado, token_trabajador, token_trabajador_expira, articulos, observaciones,
                firma_responsable_url
         FROM Maestro_pazysalvo
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
          articulosGuardados: !!pzRow.token_trabajador,
          articulos: (() => { try { return JSON.parse(pzRow.articulos || '[]'); } catch { return []; } })(),
          observaciones: pzRow.observaciones || '',
        };
      }

      // Reconstruir URLs de firma pendientes desde tokens almacenados
      const baseUrlRI = `${req.protocol}://${req.get('host')}`;
      const idVin = vin['Id Vinculación'];
      const urlFirmaCTRI = vin.token_firma_ct
        ? (() => { const t = reconstruirToken(vin.token_firma_ct, idVin, vin.token_firma_ct_expira); return t ? `${baseUrlRI}/firmar-certificado-retiro/${encodeURIComponent(idVin)}?token=${encodeURIComponent(t)}` : null; })()
        : null;
      const urlFirmaARRI = vin.token_firma_ar
        ? (() => { const t = reconstruirToken(vin.token_firma_ar, idVin, vin.token_firma_ar_expira); return t ? `${baseUrlRI}/firmar-renuncia/${encodeURIComponent(idVin)}?token=${encodeURIComponent(t)}` : null; })()
        : null;
      const urlFirmaEMOERI = vin.token_firma_emoe
        ? (() => { const t = reconstruirToken(vin.token_firma_emoe, idVin, vin.token_firma_emoe_expira); return t ? `${baseUrlRI}/firmar-examen-egreso/${encodeURIComponent(idVin)}?token=${encodeURIComponent(t)}` : null; })()
        : null;
      const urlFirmaCRSRI = vin.token_firma_crs
        ? (() => { const t = reconstruirToken(vin.token_firma_crs, idVin, vin.token_firma_crs_expira); return t ? `${baseUrlRI}/firmar-cesantias/${encodeURIComponent(idVin)}?token=${encodeURIComponent(t)}` : null; })()
        : null;

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
          urlFirma:      urlFirmaARRI,
          tipoRenuncia:  vin['Archivo Vinculación'] || null,
          idVinculacion: idVin,
        };
      }

      const MOTIVOS_SIN_DOCS_RI = ['No tomó cargo', 'Terminación por Muerte'];
      let firmaConfirmada = MOTIVOS_SIN_DOCS_RI.includes(vin['Motivo del Retiro']);
      if (!firmaConfirmada) {
        if (pzRows.length && pzRows[0].firma_responsable_url) {
          firmaConfirmada = true;
        } else if (!pzRows.length) {
          firmaConfirmada = true; // retiro sin PZ (legado), omitir paso 2
        }
      }

      const config = JSON.stringify({
        identificacion:   String(identificacion),
        usuario,
        usuarioNombre:    usuRows[0].Nombre || usuario,
        rolUsuario,
        trabajador:       limpiarNombre(vin.Trabajador),
        cargo:            vin.Cargo || '',
        fechaIngreso:     formatFechaCO(vin['Fecha de Ingreso']),
        rawFechaIngreso:  toDateStr(vin['Fecha de Ingreso']),
        motivos:          MOTIVOS,
        ciudadRegional,
        yaRetirado:       true,
        firmaConfirmada,
        retiroInfo: {
          trabajador:   limpiarNombre(vin.Trabajador),
          identificacion: String(identificacion),
          idVinculacion:  idVin,
          fechaRetiro:  formatFechaCO(vin['Fecha de Retiro']),
          motivoRetiro: vin['Motivo del Retiro'] || '—',
          tipoRenuncia: vin['Archivo Vinculación'] || null,
          documentos,
          pazYSalvo:    pazYSalvoRI,
          firmaRenuncia: firmaRenunciaRI,
          urlFirmaCT:   urlFirmaCTRI,
          urlFirmaAR:   urlFirmaARRI,
          urlFirmaEMOE: urlFirmaEMOERI,
          urlFirmaCRS:  urlFirmaCRSRI,
        },
      }).replace(/<\/script>/gi, '<\\/script>');
      return res.send(template.replace('__CONFIG__', config));
    }

    const config = JSON.stringify({
      identificacion:   String(identificacion),
      usuario,
      usuarioNombre:    usuRows[0].Nombre || usuario,      rolUsuario,      trabajador:       limpiarNombre(vin.Trabajador),
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
// Paso 1: registra el retiro. Firma, tipo de renuncia y documentos van en confirmar-responsable.
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
    const { fechaRetiro, motivoRetiro } = req.body;

    if (!fechaRetiro) return res.status(400).json({ ok: false, error: 'La fecha de retiro es obligatoria' });
    if (!motivoRetiro || !MOTIVOS.includes(motivoRetiro)) {
      return res.status(400).json({ ok: false, error: 'Motivo de retiro inválido' });
    }

    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, Trabajador, Cargo, \`Fecha de Ingreso\`, Estado, \`Operación\`, Regional
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

    // Motivos que no generan documentos ni Paz y Salvo
    const MOTIVOS_SIN_DOCS = ['No tomó cargo', 'Terminación por Muerte'];
    if (MOTIVOS_SIN_DOCS.includes(motivoRetiro)) {
      return res.json({
        ok:              true,
        trabajador:      limpiarNombre(vin.Trabajador),
        identificacion:  String(identificacion),
        idVinculacion:   vin['Id Vinculación'],
        cargo:           vin.Cargo || '',
        fechaRetiro,
        motivoRetiro,
        firmaConfirmada: true,
        pazYSalvo:       null,
      });
    }

    // Crear registro de Paz y Salvo (firma y artículos se completan en pasos posteriores)
    let pazYSalvoData = null;
    try {
      const { nivel, areasRequeridas } = determinarNivelYAreas(vin.Cargo);
      const idPz  = uuidv4();
      const idVin = vin['Id Vinculación'];
      const ahoraPZ = new Date();

      const [segContactPZ] = await pool.execute(
        'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
        [identificacion]
      );
      const emailTrab   = segContactPZ[0]?.Email || null;
      const celularTrab = String(segContactPZ[0]?.Celular || '').replace(/\D/g, '') || null;

      await pool.execute(
        `INSERT INTO Maestro_pazysalvo
         (id, id_vinculacion, identificacion, nivel_compromiso, areas_requeridas, articulos,
          observaciones, firma_responsable_url, firma_responsable_nombre, firma_responsable_cargo,
          fecha_firma_responsable, estado, usuario_registro, fecha_creacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'esperando_trabajador', ?, ?)`,
        [idPz, idVin, String(identificacion), nivel,
         JSON.stringify(areasRequeridas), JSON.stringify([]),
         null, null, null, null, null, usuario, ahoraPZ]
      );

      pazYSalvoData = {
        idPz, urlFirma: null,
        nombre: limpiarNombre(vin.Trabajador),
        email: emailTrab, celular: celularTrab,
        nivel, areasRequeridas,
      };
    } catch (ePz) {
      console.error('[PZ creacion]', ePz.message);
    }

    res.json({
      ok:              true,
      trabajador:      limpiarNombre(vin.Trabajador),
      identificacion:  String(identificacion),
      idVinculacion:   vin['Id Vinculación'],
      cargo:           vin.Cargo || '',
      operacion:       vin['Operación'] || '',
      fechaRetiro,
      motivoRetiro,
      firmaConfirmada: false,
      pazYSalvo:       pazYSalvoData,
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

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const pool     = require('../services/db');
const { obtenerPlantilla } = require('../services/plantilla');
const {
  obtenerUrlFirmaReciente,
  subirFirma,
  subirDocumentoRetiro,
} = require('../services/storage');
const { notificarRetiro, notificarDocumentoRetiroTrabajador } = require('../services/email');
const { marcarNotificado } = require('../services/retiroNotifier');
const { resolverRutaFirmaResponsable } = require('../services/firmaPathResolver');
const { generarTokenPZ, generarTokenCT, generarTokenAR, generarTokenEMOE, generarTokenCRS, generarTokenEVR, reconstruirToken } = require('../services/token');
const { determinarNivelYAreas } = require('../services/pazYSalvoService');
const { obtenerCondicionesRetiro, obtenerCondicionRetiro, obtenerPrefijoDoc, puedeGenerarDocumentosRetiro } = require('../services/configRetiro');

const router   = express.Router();
const FORM_HTML = path.join(__dirname, '../views/formretiro/form.html');

// TipoDocumento fijos para los documentos que se cargan manualmente desde este formulario.
// Terminación de Contrato (76) y Terminación de Contrato Periodo de Prueba (77) ya NO se
// cargan aquí: se gestionan y firman desde el módulo Logysign (ver configRetiro.js).
const ID_DOC_CARTA_RENUNCIA = '55';
const ID_DOC_EVALUACION_DESEMPENO = '56';

// Los motivos válidos y sus reglas (TieneTCR, TieneED, TieneAR, TienePZ, etc.) viven
// en Config_condicion_retiros — así un motivo nuevo o un cambio de regla no requiere tocar código.

// ── Helpers ────────────────────────────────────────────────────────────────

function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}` : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
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
  if (val instanceof Date) return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
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

// ── POST /api/subir-carta-renuncia ────────────────────────────────────────
// Carta de Renuncia (doc 55) — único documento que sigue cargándose manualmente
// desde este formulario, exclusivo del motivo "Renuncia" (tipo Escrita).
router.post('/api/subir-carta-renuncia', async (req, res) => {
  try {
    const { idVinculacion, crBase64, usuario: usuarioBody } = req.body;
    const usuarioCR = usuarioBody || req.query.usuario || 'sistema';
    if (!idVinculacion || !crBase64) {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }
    const [docRows] = await pool.execute(
      `SELECT Validación FROM Maestro_docTrabajador
       WHERE Identificación = (
         SELECT Identificación FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1
       ) AND TipoDocumento = ? ORDER BY FechaRegistro DESC LIMIT 1`,
      [idVinculacion, ID_DOC_CARTA_RENUNCIA]
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
    const prefijo = await obtenerPrefijoDoc(ID_DOC_CARTA_RENUNCIA);
    const buffer = Buffer.from(crBase64.replace(/^data:.*;base64,/, ''), 'base64');
    const url = await subirDocumentoRetiro(identificacion, prefijo, buffer);

    if (docRows.length) {
      await pool.execute(
        `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = ? WHERE TipoDocumento = ?
         AND Identificación = ? ORDER BY FechaRegistro DESC LIMIT 1`,
        [url, fechaHoraBogota(), ID_DOC_CARTA_RENUNCIA, String(identificacion)]
      );
    } else {
      await registrarDocTrabajador({
        regional:    vinRow.Regional || null,
        operacion:   vinRow['Operación'] || null,
        identificacion,
        fechaIngreso: vinRow['Fecha de Ingreso'],
        tipoDocumento: ID_DOC_CARTA_RENUNCIA,
        prefijo,
        doc: url,
        observaciones: null,
        usuario: usuarioCR,
      });
    }
    res.json({ ok: true, url });
  } catch (err) {
    console.error('[subir-carta-renuncia]', err);
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
    const tieneDevolucion = articulosArr.some(a => a.devuelve === true || a.devuelve === 'true');
    if (!tieneDevolucion) {
      return res.status(400).json({ ok: false, error: 'Marque al menos un artículo a devolver antes de guardar' });
    }

    const [pzRows] = await pool.execute(
      'SELECT estado, token_trabajador FROM Maestro_pazysalvo WHERE id = ? LIMIT 1',
      [idPz]
    );
    if (!pzRows.length) return res.status(404).json({ ok: false, error: 'Paz y Salvo no encontrado' });
    const pzActual = pzRows[0];

    if (pzActual.estado === 'completado') {
      return res.status(403).json({ ok: false, error: 'El Paz y Salvo ya está completado y no puede modificarse' });
    }

    // Si ya hay token (artículos previamente guardados) → solo Nómina/Sistema pueden modificar
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

    // Siempre generar/regenerar JWT válido (el campo token_trabajador en DB es solo el JTI, no el JWT)
    const tokenPZ = await generarTokenPZ(idPz, 'token_trabajador', 'token_trabajador_expira');
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const urlFirma = `${baseUrl}/firmar-pazysalvo/${idPz}?token=${encodeURIComponent(tokenPZ)}`;

    res.json({ ok: true, urlFirma });
  } catch (err) {
    console.error('[actualizar-articulos-pz]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/pz-status/:idPz ──────────────────────────────────────────────
router.get('/api/pz-status/:idPz', async (req, res) => {
  try {
    const { idPz } = req.params;
    const { usuario } = req.query;

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
router.post('/api/enviar-trabajador', async (req, res) => {
  try {
    const { emailTrabajador, nombreTrabajador, responsableNombre, responsableCargo,
            urlPZ, urlAR, urlCert, urlEMOE, urlCRS, urlEVR, urlTCR, urlED,
            motivoRetiro, tipoRenuncia, usuario } = req.body;
    if (!emailTrabajador) return res.status(400).json({ ok: false, error: 'Email requerido' });

    let emailUsuario = null;
    if (usuario) {
      const [uRows] = await pool.execute(
        'SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]
      );
      emailUsuario = uRows[0]?.Email || null;
    }

    await notificarDocumentoRetiroTrabajador({
      emailTrabajador, nombreTrabajador, responsableNombre, responsableCargo,
      urlPZ, urlAR, urlCert, urlEMOE, urlCRS, urlEVR, urlTCR, urlED,
      motivoRetiro, tipoRenuncia, emailUsuario,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[enviar-trabajador]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/actualizar-contacto ─────────────────────────────────────────
router.post('/api/actualizar-contacto', async (req, res) => {
  try {
    const { identificacion, email, celular } = req.body;
    if (!identificacion) return res.status(400).json({ ok: false, error: 'Identificación requerida' });
    if (!email && !celular) return res.status(400).json({ ok: false, error: 'Debe enviar email o celular' });

    const campos = [];
    const valores = [];
    if (email !== undefined) { campos.push('`Email` = ?'); valores.push(email); }
    if (celular !== undefined) { campos.push('`Celular` = ?'); valores.push(celular); }
    valores.push(identificacion);

    await pool.execute(
      `UPDATE \`Maestro_Segmentación\` SET ${campos.join(', ')} WHERE \`Identificación\` = ?`,
      valores
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[actualizar-contacto]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/reemplazar-ed ────────────────────────────────────────────────
router.post('/api/reemplazar-ed', async (req, res) => {
  try {
    const { idVinculacion, edBase64, usuario: usuarioBody } = req.body;
    if (!idVinculacion || !edBase64) {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }
    const [vinRows] = await pool.execute(
      `SELECT \`Identificación\`, Regional, Operación, \`Fecha de Ingreso\`
       FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const vinRow = vinRows[0];
    const identificacion = vinRow['Identificación'];

    const [docRows] = await pool.execute(
      `SELECT id, \`Validación\` FROM Maestro_docTrabajador
       WHERE Identificación = ? AND TipoDocumento = ? ORDER BY FechaRegistro DESC LIMIT 1`,
      [String(identificacion), ID_DOC_EVALUACION_DESEMPENO]
    );
    if (docRows.length && docRows[0]['Validación'] === 'OK') {
      return res.status(403).json({ ok: false, error: 'El documento ya fue validado y no puede ser reemplazado' });
    }

    const prefijo = await obtenerPrefijoDoc(ID_DOC_EVALUACION_DESEMPENO);
    const buffer = Buffer.from(edBase64.replace(/^data:.*;base64,/, ''), 'base64');
    const url    = await subirDocumentoRetiro(identificacion, prefijo, buffer);
    const ahora  = fechaHoraBogota();

    if (docRows.length) {
      await pool.execute(
        `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = ? WHERE id = ?`,
        [url, ahora, docRows[0].id]
      );
    } else {
      await registrarDocTrabajador({
        regional:      vinRow.Regional || null,
        operacion:     vinRow['Operación'] || null,
        identificacion: String(identificacion),
        fechaIngreso:  vinRow['Fecha de Ingreso'],
        tipoDocumento: ID_DOC_EVALUACION_DESEMPENO,
        prefijo,
        doc:           url,
        observaciones: 'Evaluación de desempeño — Periodo de Prueba',
        usuario:       usuarioBody || 'sistema',
      });
    }
    res.json({ ok: true, url });
  } catch (err) {
    console.error('[reemplazar-ed]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/reemplazar-carta-renuncia ────────────────────────────────────
router.post('/api/reemplazar-carta-renuncia', async (req, res) => {
  try {
    const { idVinculacion, crBase64, usuario: usuarioBody } = req.body;
    if (!idVinculacion || !crBase64) {
      return res.status(400).json({ ok: false, error: 'Datos incompletos' });
    }
    const [vinRows] = await pool.execute(
      `SELECT \`Identificación\`, Regional, Operación, \`Fecha de Ingreso\`
       FROM \`Maestro_Vinculación\` WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const vinRow = vinRows[0];
    const identificacion = vinRow['Identificación'];

    const [docRows] = await pool.execute(
      `SELECT id, \`Validación\` FROM Maestro_docTrabajador
       WHERE Identificación = ? AND TipoDocumento = ? ORDER BY FechaRegistro DESC LIMIT 1`,
      [String(identificacion), ID_DOC_CARTA_RENUNCIA]
    );
    if (docRows.length && docRows[0]['Validación'] === 'OK') {
      return res.status(403).json({ ok: false, error: 'El documento ya fue validado y no puede ser reemplazado' });
    }

    const prefijo = await obtenerPrefijoDoc(ID_DOC_CARTA_RENUNCIA);
    const buffer = Buffer.from(crBase64.replace(/^data:.*;base64,/, ''), 'base64');
    const url    = await subirDocumentoRetiro(identificacion, prefijo, buffer);
    const ahora  = fechaHoraBogota();

    if (docRows.length) {
      await pool.execute(
        `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = ? WHERE id = ?`,
        [url, ahora, docRows[0].id]
      );
    } else {
      await registrarDocTrabajador({
        regional:      vinRow.Regional || null,
        operacion:     vinRow['Operación'] || null,
        identificacion: String(identificacion),
        fechaIngreso:  vinRow['Fecha de Ingreso'],
        tipoDocumento: ID_DOC_CARTA_RENUNCIA,
        prefijo,
        doc:           url,
        observaciones: null,
        usuario:       usuarioBody || 'sistema',
      });
    }
    res.json({ ok: true, url });
  } catch (err) {
    console.error('[reemplazar-carta-renuncia]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/confirmar-responsable ───────────────────────────────────────
// Paso 2: guarda firma del responsable, ciudad, genera tokens y crea/actualiza Paz y Salvo
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
    if (!ciudadRegional || !ciudadRegional.trim()) return res.status(400).json({ ok: false, error: 'Ingrese la ciudad para los documentos de retiro' });

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
    const condicion = await obtenerCondicionRetiro(motivoRetiro);

    if (condicion?.RequiereTipoRenuncia) {
      if (!tipoRenuncia || !['Verbal', 'Escrita'].includes(tipoRenuncia)) {
        return res.status(400).json({ ok: false, error: 'Seleccione el tipo de renuncia (Verbal o Escrita)' });
      }
    }

    // Firma del responsable - usar identificación correcta
    let identificacionFirmante = null;
    let firmaUrl = null;

    // Intentar resolver usando la nueva función que busca en las tablas
    const rutaResponsable = await resolverRutaFirmaResponsable(usuario);
    if (rutaResponsable) {
      identificacionFirmante = rutaResponsable.identificacion;
      firmaUrl = rutaResponsable.urlFirma;
    } else {
      // Fallback: usar la función original si no se puede resolver
      const resultado = await resolverFirmaUsuario(usuData.Colaborador);
      identificacionFirmante = resultado.identificacionFirmante;
      firmaUrl = resultado.firmaUrl;
    }

    if (firmaBase64 && identificacionFirmante) {
      const buffer = Buffer.from(firmaBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      firmaUrl = await subirFirma(identificacionFirmante, buffer);
    }
    if (!firmaUrl) {
      return res.status(400).json({ ok: false, error: 'Debe proporcionar una firma para continuar' });
    }
    const nombreFirmante = limpiarNombre(usuData.Colaborador || usuData.Nombre).toUpperCase();

    const ciudadDoc = ciudadRegional.trim();
    await pool.execute(
      `UPDATE \`Maestro_Vinculación\`
       SET ar_ciudad_regional = ?, \`Fecha Legalización Retiro\` = ?, \`Quien Legaliza el Retiro\` = ?
       WHERE \`Id Vinculación\` = ?`,
      [ciudadDoc, fechaHoraBogota().slice(0, 10), usuario, idVinculacion]
    );

    if (condicion?.RequiereTipoRenuncia && tipoRenuncia) {
      await pool.execute(
        `UPDATE \`Maestro_Vinculación\` SET \`Archivo Vinculación\` = ? WHERE \`Id Vinculación\` = ?`,
        [tipoRenuncia, idVinculacion]
      );
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const idVin   = vin['Id Vinculación'];

    // Token CT (siempre)
    const tokenCT    = await generarTokenCT(idVin);
    const urlFirmaCT = `${baseUrl}/firmar-certificado-retiro/${encodeURIComponent(idVin)}?token=${encodeURIComponent(tokenCT)}`;

    // Token AR (motivos con TieneAR = 1, hoy solo Renuncia)
    let firmaRenunciaData = null;
    if (condicion?.TieneAR) {
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
        urlFirma:      urlFirmaAR,
        tipoRenuncia,
        idVinculacion: idVin,
      };
    }

    // Token EMOE (siempre que exista plantilla)
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

    // Crear o actualizar Paz y Salvo
    let idPz = null;
    const [pzRows2] = await pool.execute(
      'SELECT id FROM Maestro_pazysalvo WHERE id_vinculacion = ? ORDER BY fecha_creacion DESC LIMIT 1',
      [idVin]
    );
    if (pzRows2.length) {
      idPz = pzRows2[0].id;
      await pool.execute(
        `UPDATE Maestro_pazysalvo
         SET firma_responsable_url = ?, firma_responsable_nombre = ?,
             firma_responsable_cargo = ?, fecha_firma_responsable = ?
         WHERE id = ?`,
        [firmaUrl, nombreFirmante, usuData.Cargo || '', new Date(), idPz]
      );
    } else if (condicion?.TienePZ) {
      const { nivel, areasRequeridas } = determinarNivelYAreas(vin.Cargo);
      idPz = uuidv4();
      await pool.execute(
        `INSERT INTO Maestro_pazysalvo
         (id, id_vinculacion, identificacion, nivel_compromiso, areas_requeridas, articulos,
          observaciones, firma_responsable_url, firma_responsable_nombre, firma_responsable_cargo,
          fecha_firma_responsable, estado, usuario_registro, fecha_creacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'esperando_trabajador', ?, ?)`,
        [idPz, idVin, String(identificacion), nivel, JSON.stringify(areasRequeridas), JSON.stringify([]),
         null, firmaUrl, nombreFirmante, usuData.Cargo || '', new Date(), usuario, new Date()]
      );
    }

    const [segFinal] = await pool.execute(
      'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
      [identificacion]
    );
    const ctFinal = segFinal[0] || {};

    // Crear registro EVR y generar token de acceso para el trabajador
    let urlEVR = null;
    try {
      const idEvr   = uuidv4();
      const idVin   = vin['Id Vinculación'];
      await pool.execute(
        `INSERT INTO Maestro_evaluacionretiro
         (id_evaluacion, id_vinculacion, completada)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE id_evaluacion = id_evaluacion`,
        [idEvr, idVin]
      );
      // Obtener el id_evaluacion real (puede ser el recién creado o el existente)
      const [evrRows] = await pool.execute(
        'SELECT id_evaluacion FROM Maestro_evaluacionretiro WHERE id_vinculacion = ? LIMIT 1',
        [idVin]
      );
      if (evrRows.length) {
        const tokenEVR = await generarTokenEVR(evrRows[0].id_evaluacion);
        urlEVR = `${baseUrl}/evaluacion-retiro/${encodeURIComponent(evrRows[0].id_evaluacion)}?token=${encodeURIComponent(tokenEVR)}`;
      }
    } catch (e) { console.error('[EVR create]', e.message); }

    res.json({
      ok:           true,
      urlFirmaCT,
      firmaRenuncia: firmaRenunciaData,
      emoe:         emoeData,
      cesantias:    crsData,
      idPz,
      urlEVR,
      email:        ctFinal.Email || null,
      celular:      String(ctFinal.Celular || '').replace(/\D/g, '') || null,
      responsable:  { nombre: limpiarNombre(usuData.Colaborador || usuData.Nombre), cargo: usuData.Cargo || '' },
      tipoRenuncia: condicion?.RequiereTipoRenuncia ? tipoRenuncia : null,
    });
  } catch (err) {
    console.error('[confirmar-responsable]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /:idVinculacion ────────────────────────────────────────────────────
// Formulario de registro de retiro (Paso 1)
router.get('/:idVinculacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).send(htmlError('Parámetro ?usuario requerido'));

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre, Rol, Regional FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length) return res.status(403).send(htmlError('Usuario no autorizado'));
    const rolUsuario      = usuRows[0].Rol || '';
    const esNominaOSistema = ['Nomina', 'Sistema'].includes(rolUsuario);
    const puedeGenerarDocs = puedeGenerarDocumentosRetiro(rolUsuario, usuRows[0].Regional);

    const idVinculacion = decodeURIComponent(req.params.idVinculacion);

    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, \`Identificación\`, Trabajador, Cargo, \`Fecha de Ingreso\`, Estado,
              \`Fecha de Retiro\`, \`Motivo del Retiro\`, \`Archivo Vinculación\`
       FROM \`Maestro_Vinculación\`
       WHERE \`Id Vinculación\` = ?`,
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).send(htmlError('Vinculación no encontrada'));
    const vin = vinRows[0];
    const identificacion = vin['Identificación'];

    const yaRetirado = (vin.Estado === 'Retirado') || (vin['Motivo del Retiro'] && vin['Motivo del Retiro'] !== 'SI' && vin['Motivo del Retiro'].trim() !== '');
    // Todos los roles pueden ver el formulario de registro si el trabajador no está retirado aún

    const puedeRegistrar = !yaRetirado;

    const condicionesMotivo = await obtenerCondicionesRetiro();

    // Docs subidos en Paso 1 (Carta de Renuncia y ED) para mostrar estado en el resumen
    let docCR = null;
    let docED = null;
    if (yaRetirado) {
      const [docRows] = await pool.execute(
        `SELECT TipoDocumento, Doc, \`Validación\` FROM Maestro_docTrabajador
         WHERE Identificación = ? AND TipoDocumento IN (?, ?)
         ORDER BY FechaRegistro DESC`,
        [String(identificacion), ID_DOC_CARTA_RENUNCIA, ID_DOC_EVALUACION_DESEMPENO]
      );
      const docsMap = {};
      docRows.forEach(r => { if (!docsMap[r.TipoDocumento]) docsMap[r.TipoDocumento] = r; });
      if (docsMap[ID_DOC_CARTA_RENUNCIA])       docCR = { url: docsMap[ID_DOC_CARTA_RENUNCIA].Doc, validacion: docsMap[ID_DOC_CARTA_RENUNCIA]['Validación'] };
      if (docsMap[ID_DOC_EVALUACION_DESEMPENO]) docED = { url: docsMap[ID_DOC_EVALUACION_DESEMPENO].Doc, validacion: docsMap[ID_DOC_EVALUACION_DESEMPENO]['Validación'] };
    }

    const idVin      = vin['Id Vinculación'];
    const baseUrl    = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const urlGenerarDocs = (yaRetirado && puedeGenerarDocs)
      ? `${baseUrl}/gestionar-retiro/${encodeURIComponent(idVin)}?usuario=${encodeURIComponent(usuario)}`
      : null;

    const template = fs.readFileSync(FORM_HTML, 'utf8');
    const config = JSON.stringify({
      identificacion:  String(identificacion),
      usuario,
      usuarioNombre:   usuRows[0].Nombre || usuario,
      rolUsuario,
      puedeRegistrar,
      esNominaOSistema,
      trabajador:      limpiarNombre(vin.Trabajador),
      cargo:           vin.Cargo || '',
      fechaIngreso:    formatFechaCO(vin['Fecha de Ingreso']),
      rawFechaIngreso: toDateStr(vin['Fecha de Ingreso']),
      motivos:          Object.keys(condicionesMotivo),
      condicionesMotivo,
      yaRetirado,
      retiroInfo: yaRetirado ? {
        trabajador:    limpiarNombre(vin.Trabajador),
        identificacion: String(identificacion),
        idVinculacion: idVin,
        fechaRetiro:   formatFechaCO(vin['Fecha de Retiro']),
        motivoRetiro:  vin['Motivo del Retiro'] || '—',
        tipoRenuncia:  vin['Archivo Vinculación'] || null,
        docCR,
        docED,
      } : null,
      urlGenerarDocs,
      puedeGenerarDocs,
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[formretiro GET]', err);
    res.status(500).send(htmlError('Error interno del servidor'));
  }
});

// ── POST /:idVinculacion ───────────────────────────────────────────────────
// Paso 1: registra el retiro con documentos opcionales (TCR, ED)
router.post('/:idVinculacion', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ ok: false, error: 'Parámetro ?usuario requerido' });

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre, Email, Colaborador, Cargo, Rol, Regional FROM Maestro_Usuarios WHERE ID = ?', [usuario]
    );
    if (!usuRows.length) return res.status(403).json({ ok: false, error: 'Usuario no autorizado' });
    const usuData = usuRows[0];
    const rolUsuario = usuData.Rol || '';
    const esNominaOSistema = ['Nomina', 'Sistema'].includes(rolUsuario);
    const puedeGenerarDocs = puedeGenerarDocumentosRetiro(rolUsuario, usuData.Regional);

    const idVinculacion = decodeURIComponent(req.params.idVinculacion);
    const { fechaRetiro, motivoRetiro, tipoRenuncia, crBase64, edBase64, estado } = req.body;

    const condicionesMotivo = await obtenerCondicionesRetiro();
    const condicion = condicionesMotivo[motivoRetiro];

    if (!fechaRetiro) return res.status(400).json({ ok: false, error: 'La fecha de retiro es obligatoria' });
    if (!motivoRetiro || !condicion) {
      return res.status(400).json({ ok: false, error: 'Motivo de retiro inválido' });
    }
    // Roles distintos de Nómina/Sistema deben confirmar el estado 'Retirado' en el formulario
    if (!esNominaOSistema && estado !== 'Retirado') {
      return res.status(400).json({ ok: false, error: 'Debe seleccionar el estado "Retirado" para continuar' });
    }

    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, \`Identificación\`, Trabajador, Cargo, \`Fecha de Ingreso\`, Estado, \`Operación\`, Regional
       FROM \`Maestro_Vinculación\`
       WHERE \`Id Vinculación\` = ?`,
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).json({ ok: false, error: 'Vinculación no encontrada' });
    const vin = vinRows[0];
    const identificacion = vin['Identificación'];

    // Prevenir re-registro si ya está retirado (solo para roles no-Nómina)
    const esRetirado = (vin.Estado === 'Retirado') || (vin['Motivo del Retiro'] && vin['Motivo del Retiro'] !== 'SI' && vin['Motivo del Retiro'].trim() !== '');
    if (esRetirado && !esNominaOSistema) {
      return res.status(409).json({ ok: false, error: 'El trabajador ya figura como retirado' });
    }

    const ahora = fechaHoraBogota();
    const idVin = vin['Id Vinculación'];

    // Actualizar vinculación y limpiar estado de generación anterior para empezar limpio
    // El campo Estado solo se marca en BD si el usuario efectivamente confirmó "Retirado"
    // (para roles distintos de Nómina/Sistema esto ya es obligatorio y viene validado arriba)
    let query = `
      UPDATE \`Maestro_Vinculación\`
      SET \`Fecha de Retiro\` = ?,
          \`Motivo del Retiro\` = ?,
          \`Archivo Vinculación\` = ?,
          \`Fecha Actualización\` = ?,
          Usuario = ?,
          ar_ciudad_regional      = NULL,
          token_firma_ct          = NULL, token_firma_ct_expira   = NULL,
          token_firma_ar          = NULL, token_firma_ar_expira   = NULL,
          token_firma_emoe        = NULL, token_firma_emoe_expira = NULL,
          token_firma_crs         = NULL, token_firma_crs_expira  = NULL
    `;
    const params = [fechaRetiro, motivoRetiro, tipoRenuncia || null, ahora, usuario];

    if (estado === 'Retirado') {
      query += `, Estado = 'Retirado'`;
    }

    query += ` WHERE \`Id Vinculación\` = ?`;
    params.push(idVin);

    await pool.execute(query, params);


    notificarRetiro({
      trabajador:     vin.Trabajador,
      identificacion: String(identificacion),
      cargo:          vin.Cargo,
      operacion:      vin['Operación'],
      fechaRetiro,
      motivoRetiro,
      registradoPor:    usuData.Nombre || usuario,
      emailRegistrador: usuData.Email || null,
    }).then(() => marcarNotificado(idVin))
      .catch(e => console.error('[retiro email]', e.message));

    // Carta de Renuncia (doc 55): opcional, exclusiva de motivos con RequiereTipoRenuncia + tipo Escrita.
    // La Terminación de Contrato ya NO se carga aquí — se gestiona por el módulo Logysign (ver Módulo 3).
    if (crBase64 && condicion.RequiereTipoRenuncia && tipoRenuncia === 'Escrita') {
      try {
        const prefijoCR = await obtenerPrefijoDoc(ID_DOC_CARTA_RENUNCIA);
        const buffer = Buffer.from(crBase64.replace(/^data:.*;base64,/, ''), 'base64');
        const urlCR = await subirDocumentoRetiro(identificacion, prefijoCR, buffer);
        // Actualizar si ya existe, insertar si no
        const [existeCR] = await pool.execute(
          `SELECT id FROM Maestro_docTrabajador
           WHERE Identificación = ? AND TipoDocumento = ?
           ORDER BY FechaRegistro DESC LIMIT 1`,
          [String(identificacion), ID_DOC_CARTA_RENUNCIA]
        );
        if (existeCR.length) {
          await pool.execute(
            `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = ?
             WHERE id = ?`,
            [urlCR, ahora, existeCR[0].id]
          );
        } else {
          await registrarDocTrabajador({
            regional: vin.Regional || null,
            operacion: vin['Operación'] || null,
            identificacion: String(identificacion),
            fechaIngreso: vin['Fecha de Ingreso'],
            tipoDocumento: ID_DOC_CARTA_RENUNCIA,
            prefijo: prefijoCR,
            doc: urlCR,
            observaciones: null,
            usuario,
          });
        }
      } catch (e) { console.error('[Carta Renuncia Paso1 error]', e.message); }
    }

    // ED: Evaluación de Desempeño (doc 56) — motivos con TieneED = 1 (hoy solo Periodo de Prueba)
    if (edBase64 && condicion.TieneED) {
      try {
        const prefijoED = await obtenerPrefijoDoc(ID_DOC_EVALUACION_DESEMPENO);
        const buffer = Buffer.from(edBase64.replace(/^data:.*;base64,/, ''), 'base64');
        const urlED = await subirDocumentoRetiro(identificacion, prefijoED, buffer);
        const [existeED] = await pool.execute(
          `SELECT id FROM Maestro_docTrabajador
           WHERE Identificación = ? AND TipoDocumento = ?
           ORDER BY FechaRegistro DESC LIMIT 1`,
          [String(identificacion), ID_DOC_EVALUACION_DESEMPENO]
        );
        if (existeED.length) {
          await pool.execute(
            `UPDATE Maestro_docTrabajador SET Doc = ?, FechaRegistro = ? WHERE id = ?`,
            [urlED, ahora, existeED[0].id]
          );
        } else {
          await registrarDocTrabajador({
            regional: vin.Regional || null,
            operacion: vin['Operación'] || null,
            identificacion: String(identificacion),
            fechaIngreso: vin['Fecha de Ingreso'],
            tipoDocumento: ID_DOC_EVALUACION_DESEMPENO,
            prefijo: prefijoED,
            doc: urlED,
            observaciones: 'Evaluación de desempeño — Periodo de Prueba',
            usuario,
          });
        }
      } catch (e) { console.error('[ED Paso1 error]', e.message); }
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const urlGenerarDocs = puedeGenerarDocs
      ? `${baseUrl}/gestionar-retiro/${encodeURIComponent(idVin)}?usuario=${encodeURIComponent(usuario)}`
      : null;

    res.json({
      ok:             true,
      trabajador:     limpiarNombre(vin.Trabajador),
      identificacion: String(identificacion),
      idVinculacion:  idVin,
      cargo:          vin.Cargo || '',
      fechaRetiro,
      motivoRetiro,
      tipoRenuncia:   tipoRenuncia || null,
      urlGenerarDocs,
      puedeGenerarDocs,
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

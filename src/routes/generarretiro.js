const express = require('express');
const fs      = require('fs');
const path    = require('path');
const pool    = require('../services/db');
const { reconstruirToken, generarTokenCT, generarTokenAR, generarTokenEMOE, generarTokenCRS, generarTokenPZ } = require('../services/token');

const router   = express.Router();
const DASHBOARD_HTML = path.join(__dirname, '../views/generarretiro/index.html');

const MOTIVOS_SIN_DOCS  = ['No tomó cargo', 'Terminación por Muerte'];
const RETIRO_PREFIJOS   = ['CT', 'AR', 'EMOE', 'CRS', 'TCR', 'ED', 'PZ'];

const NOMBRES_DOC = {
  CT:   'Certificado Laboral de Retiro',
  AR:   'Aceptación de Renuncia',
  EMOE: 'Autorización Examen Médico de Egreso',
  CRS:  'Carta Retiro Cesantías',
  TCR:  'Carta de Renuncia / Terminación de Contrato',
  ED:   'Evaluación de Desempeño',
  PZ:   'Paz y Salvo',
};

function limpiarNombre(trabajador) {
  if (!trabajador) return '';
  const partes = String(trabajador).split(' ** ');
  return (partes.length > 1 ? partes[1] : trabajador).trim();
}

function formatFechaCO(fecha) {
  if (!fecha) return '';
  const str = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha).slice(0, 10);
  const d = new Date(str + 'T12:00:00');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function paginaError(mensaje) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f0f0f0}.card{background:#fff;padding:2rem;border-radius:8px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.15);max-width:420px;width:90%}h2{color:#e74c3c;margin-top:0}p{color:#666;margin:0}</style></head><body><div class="card"><h2>Error</h2><p>${mensaje}</p></div></body></html>`;
}

// ── GET /:idVinculacion ────────────────────────────────────────────────────
router.get('/:idVinculacion', async (req, res) => {
  try {
    const idVinculacion = decodeURIComponent(req.params.idVinculacion);
    const { usuario }   = req.query;

    if (!usuario) return res.status(400).send(paginaError('Parámetro ?usuario requerido'));

    const [usuRows] = await pool.execute(
      'SELECT ID, Nombre, Colaborador, Cargo, Rol, `Operación` FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]
    );
    if (!usuRows.length) return res.status(403).send(paginaError('Usuario no autorizado'));
    const usu             = usuRows[0];
    const rolUsuario      = usu.Rol || '';
    const esNominaOSistema = ['Nomina', 'Sistema'].includes(rolUsuario);

    // Vinculación completa
    const [vinRows] = await pool.execute(
      `SELECT \`Id Vinculación\`, \`Identificación\`, Trabajador, Cargo,
              \`Fecha de Ingreso\`, \`Fecha de Retiro\`, Estado,
              \`Operación\`, Regional, \`Motivo del Retiro\`, \`Archivo Vinculación\`,
              ar_ciudad_regional,
              token_firma_ct,   token_firma_ct_expira,
              token_firma_ar,   token_firma_ar_expira,
              token_firma_emoe, token_firma_emoe_expira,
              token_firma_crs,  token_firma_crs_expira
       FROM \`Maestro_Vinculación\`
       WHERE \`Id Vinculación\` = ? LIMIT 1`,
      [idVinculacion]
    );
    if (!vinRows.length) return res.status(404).send(paginaError('Vinculación no encontrada'));
    const vin           = vinRows[0];
    const identificacion = vin['Identificación'];
    const motivoRetiro  = vin['Motivo del Retiro'] || '';
    const esMotivoFinal = MOTIVOS_SIN_DOCS.includes(motivoRetiro);

    const esRetirado = (vin.Estado === 'Retirado') || (vin['Motivo del Retiro'] && vin['Motivo del Retiro'] !== 'SI' && vin['Motivo del Retiro'].trim() !== '');
    if (!esRetirado) {
      return res.status(400).send(paginaError('El trabajador aún no ha sido registrado como retirado.'));
    }

    // Documentos del trabajador (retiro)
    const [docRows] = await pool.execute(
      `SELECT Prefijo, Doc, \`Validación\`, TipoDocumento, FechaRegistro
       FROM Maestro_docTrabajador
       WHERE Identificación = ?
       ORDER BY FechaRegistro DESC`,
      [String(identificacion)]
    );
    const docsMap = {};
    docRows.forEach(r => { if (!docsMap[r.Prefijo]) docsMap[r.Prefijo] = r; });

    const docs = Object.values(docsMap)
      .filter(r => RETIRO_PREFIJOS.includes(r.Prefijo))
      .map(r => ({
        prefijo:    r.Prefijo,
        label:      NOMBRES_DOC[r.Prefijo] || r.Prefijo,
        url:        r.Doc,
        validacion: r['Validación'],
      }));

    // Paz y Salvo
    let pzInfo = null;
    const [pzRows] = await pool.execute(
      `SELECT id, estado, token_trabajador, token_trabajador_expira,
              articulos, observaciones, firma_responsable_url, url_pdf_final
       FROM Maestro_pazysalvo
       WHERE id_vinculacion = ? ORDER BY fecha_creacion DESC LIMIT 1`,
      [idVinculacion]
    );
    if (pzRows.length) {
      const p = pzRows[0];
      const articulosParsed = Array.isArray(p.articulos) ? p.articulos
        : typeof p.articulos === 'string' ? (() => { try { return JSON.parse(p.articulos); } catch { return []; } })()
        : [];
      const baseUrl2 = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      // p.token_trabajador es solo el JTI; hay que reconstruir el JWT completo para que sea válido
      let urlFirmaPZ = null;
      if (p.token_trabajador) {
        let jwt_pz = reconstruirToken(p.token_trabajador, p.id, p.token_trabajador_expira);
        if (!jwt_pz) {
          // Token expirado → regenerar
          jwt_pz = await generarTokenPZ(p.id, 'token_trabajador', 'token_trabajador_expira').catch(() => null);
        }
        if (jwt_pz) urlFirmaPZ = `${baseUrl2}/firmar-pazysalvo/${p.id}?token=${encodeURIComponent(jwt_pz)}`;
      }
      pzInfo = {
        idPz:               p.id,
        estado:             p.estado,
        urlFirma:           urlFirmaPZ,
        urlPdfFinal:        p.url_pdf_final || null,
        articulos:          articulosParsed,
        observaciones:      p.observaciones || '',
        articulosGuardados: !!p.token_trabajador || p.estado !== 'esperando_trabajador' || articulosParsed.length > 0,
        workerSigned:       p.token_trabajador === null && p.estado !== 'esperando_trabajador',
      };
    }

    // Segmentación (contacto)
    const [segRows] = await pool.execute(
      'SELECT Email, Celular FROM `Maestro_Segmentación` WHERE `Identificación` = ? LIMIT 1',
      [String(identificacion)]
    );
    const seg           = segRows[0] || {};
    const emailTrabajador  = seg.Email  || null;
    const celularTrabajador = String(seg.Celular || '').replace(/\D/g, '') || null;

    // ── Derivar estado del proceso ───────────────────────────────────────────
    const firmaConfirmada = esMotivoFinal
      ? true
      : !!(vin.ar_ciudad_regional ||
           vin.token_firma_ct !== null ||
           (pzRows.length && pzRows[0].firma_responsable_url));

    const procesoCompleto = esMotivoFinal
      ? true
      : (firmaConfirmada &&
         vin.token_firma_ct   === null &&
         vin.token_firma_ar   === null &&
         vin.token_firma_emoe === null &&
         vin.token_firma_crs  === null &&
         (!pzInfo || pzInfo.estado === 'completado'));

    const estadoPagina = !firmaConfirmada ? 'formulario'
                       : procesoCompleto  ? 'completado'
                       : 'dashboard';

    // ── URLs de firma (reconstruir tokens activos) ───────────────────────────
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    async function getUrlFirma(jti, expira, genFn, prefijo, ruta) {
      // Si el doc ya está firmado (existe en docTrabajador), no hay URL de firma
      if (docsMap[prefijo]) return null;
      if (!jti) return null;
      const t = reconstruirToken(jti, idVinculacion, expira);
      const tokenFinal = t || await genFn(idVinculacion);
      return `${baseUrl}${ruta}${encodeURIComponent(idVinculacion)}?token=${encodeURIComponent(tokenFinal)}`;
    }

    const urlFirmaCT   = await getUrlFirma(vin.token_firma_ct,   vin.token_firma_ct_expira,   generarTokenCT,   'CT',   '/firmar-certificado-retiro/');
    const urlFirmaAR   = await getUrlFirma(vin.token_firma_ar,   vin.token_firma_ar_expira,   generarTokenAR,   'AR',   '/firmar-renuncia/');
    const urlFirmaEMOE = await getUrlFirma(vin.token_firma_emoe, vin.token_firma_emoe_expira, generarTokenEMOE, 'EMOE', '/firmar-examen-egreso/');
    const urlFirmaCRS  = await getUrlFirma(vin.token_firma_crs,  vin.token_firma_crs_expira,  generarTokenCRS,  'CRS',  '/firmar-cesantias/');

    // ── Evaluación de Retiro (EVR) ────────────────────────────────────────────
    let evrInfo = null;
    try {
      const [evrRows] = await pool.execute(
        `SELECT id_evaluacion, completada, url_pdf, token_acceso, token_acceso_expira, fecha_registro
         FROM Maestro_evaluacionretiro WHERE id_vinculacion = ? LIMIT 1`,
        [idVinculacion]
      );
      if (evrRows.length) {
        const evr      = evrRows[0];
        const baseUrl0 = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
        let urlEVR = null;
        if (!evr.completada && evr.token_acceso) {
          const { reconstruirToken, generarTokenEVR } = require('../services/token');
          const t   = reconstruirToken(evr.token_acceso, evr.id_evaluacion, evr.token_acceso_expira);
          const tok = t || await generarTokenEVR(evr.id_evaluacion).catch(() => null);
          if (tok) urlEVR = `${baseUrl0}/evaluacion-retiro/${encodeURIComponent(evr.id_evaluacion)}?token=${encodeURIComponent(tok)}`;
        }
        const freg = evr.fecha_registro
          ? new Date(evr.fecha_registro).toLocaleDateString('es-CO', {
              timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })
          : null;
        evrInfo = {
          idEvaluacion:   evr.id_evaluacion,
          completada:     !!evr.completada,
          urlAcceso:      urlEVR,
          urlPdf:         evr.url_pdf || null,
          fechaRegistro:  freg,
        };
      }
    } catch (evrErr) {
      // Columnas EVR aún no migradas — continúa sin bloque EVR
      console.warn('[generarretiro] EVR no disponible (¿ALTER TABLE pendiente?):', evrErr.message);
    }

    // ── Ciudad sugerida: usuario → Maestro_Usuarios.Operación → Maestro_Operaciones.C.C. ──
    let ciudadSugerida = '';
    if (estadoPagina === 'formulario' && usu['Operación']) {
      try {
        const [ccRows] = await pool.execute(
          'SELECT `C.C.` FROM Maestro_Operaciones WHERE `Operación` = ? LIMIT 1',
          [usu['Operación']]
        );
        if (ccRows.length) ciudadSugerida = ccRows[0]['C.C.'] || '';
      } catch {}
    }

    // ── Firma del responsable (para mostrar en formulario) ───────────────────
    let firmaResponsableUrl = null;
    if (estadoPagina === 'formulario' && usu.Colaborador) {
      const { obtenerUrlFirmaReciente } = require('../services/storage');
      const [vinUsu] = await pool.execute(
        'SELECT `Identificación` FROM `Maestro_Vinculación` WHERE Trabajador = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
        [usu.Colaborador]
      );
      if (vinUsu.length) {
        firmaResponsableUrl = await obtenerUrlFirmaReciente(vinUsu[0]['Identificación']).catch(() => null);
      }
    }

    const template = fs.readFileSync(DASHBOARD_HTML, 'utf8');
    const config   = JSON.stringify({
      // Estado
      estadoPagina,
      // Identidad
      idVinculacion,
      usuario,
      usuarioNombre:    usu.Nombre || usuario,
      rolUsuario,
      esNominaOSistema,
      // Trabajador
      trabajador:       limpiarNombre(vin.Trabajador),
      cargo:            vin.Cargo || '',
      identificacion:   String(identificacion),
      // Retiro
      motivoRetiro,
      tipoRenuncia:     vin['Archivo Vinculación'] || null,
      fechaRetiro:      formatFechaCO(vin['Fecha de Retiro']),
      ciudadRegional:   vin.ar_ciudad_regional || '',
      // Formulario (estado A)
      firmaResponsableUrl,
      ciudadSugerida,
      // Dashboard (estado B)
      docs,
      docsOpcionales: {
        tcr: docsMap['TCR'] ? { url: docsMap['TCR'].Doc, validacion: docsMap['TCR']['Validación'] } : null,
        ed:  docsMap['ED']  ? { url: docsMap['ED'].Doc,  validacion: docsMap['ED']['Validación']  } : null,
      },
      urlFirmaCT,
      urlFirmaAR,
      urlFirmaEMOE,
      urlFirmaCRS,
      pazYSalvo:        pzInfo,
      evr:              evrInfo,
      contacto:         { email: emailTrabajador, celular: celularTrabajador },
    }).replace(/<\/script>/gi, '<\\/script>');

    res.send(template.replace('__CONFIG__', config));
  } catch (err) {
    console.error('[generarretiro GET]', err);
    res.status(500).send(paginaError('Error interno del servidor'));
  }
});

// ── POST /api/reenviar-pz-areas ───────────────────────────────────────────
// Nómina/Sistema reenvía recordatorio de firma a áreas pendientes del PZ
router.post('/api/reenviar-pz-areas', async (req, res) => {
  try {
    const { idPz, usuario } = req.body;
    if (!idPz) return res.status(400).json({ ok: false, error: 'idPz requerido' });

    const [uRows] = await pool.execute(
      'SELECT Rol FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [usuario]
    );
    if (!uRows.length || !['Nomina', 'Sistema'].includes(uRows[0].Rol)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso' });
    }

    const [pzRows] = await pool.execute(
      `SELECT pz.*, v.Trabajador, v.Cargo, v.\`Operación\`, v.\`Identificación\`,
              v.\`Id Vinculación\` AS idVin,
              pz.areas_requeridas, pz.estado
       FROM Maestro_pazysalvo pz
       JOIN \`Maestro_Vinculación\` v ON v.\`Id Vinculación\` = pz.id_vinculacion
       WHERE pz.id = ? LIMIT 1`, [idPz]
    );
    if (!pzRows.length) return res.status(404).json({ ok: false, error: 'PZ no encontrado' });
    const pz = pzRows[0];
    if (pz.estado === 'completado') return res.status(400).json({ ok: false, error: 'El PZ ya está completado' });

    const { EMAILS_AREA } = require('../services/pazYSalvoService');
    const { notificarAreaPazYSalvo } = require('../services/email');
    const areasReq = JSON.parse(pz.areas_requeridas || '[]');
    const baseUrl  = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    const areasPendientes = areasReq.filter(a => !pz[`firma_${a}_url`]);
    if (!areasPendientes.length) return res.json({ ok: true, reenviados: 0 });

    let reenviados = 0;
    for (const area of areasPendientes) {
      const destinatarios = EMAILS_AREA[area] || [];
      if (!destinatarios.length) continue;
      // Reconstruir token del área
      const campoToken  = `token_${area}`;
      const campoExpira = `token_${area}_expira`;
      if (!pz[campoToken]) continue;
      const { generarTokenPZ } = require('../services/token');
      const { validarTokenPZ } = require('../services/token');
      const tok = await validarTokenPZ(pz[campoToken], idPz, campoToken, campoExpira)
        .then(r => r.valido ? pz[campoToken] : null).catch(() => null);
      const tokenFinal = tok || await generarTokenPZ(idPz, campoToken, campoExpira);
      const urlFirma   = `${baseUrl}/pazysalvo-area/${encodeURIComponent(idPz)}?area=${area}&token=${encodeURIComponent(tokenFinal)}`;
      try {
        await notificarAreaPazYSalvo({
          area, destinatarios,
          trabajador:    limpiarNombre(pz.Trabajador),
          identificacion: String(pz['Identificación']),
          cargo:         pz.Cargo || '',
          operacion:     pz['Operación'] || '',
          urlFirma,
        });
        reenviados++;
      } catch (e) { console.error(`[reenviar-pz ${area}]`, e.message); }
    }

    res.json({ ok: true, reenviados, areasPendientes });
  } catch (err) {
    console.error('[reenviar-pz-areas]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;

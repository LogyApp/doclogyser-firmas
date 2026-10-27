const pool = require('./db');
const {
  enviarEmailFirmaAtsTrabajador,
  enviarEmailFirmaAtsCoordinador,
  enviarEmailFirmaAtsSst,
} = require('./email');

// ── Correos de solicitud de firma del ATS ───────────────────────────────────
// Interruptor: Config_Parametros sst / ATS 'Habilitar notificaciones de correo en ATS'
// (si la fila no existe, se envían). Cada envío queda registrado con su fecha, que el
// PDF usa para la anotación "Soportado por correo electrónico (fecha)".
const CONCEPTO_HABILITAR = 'Habilitar notificaciones de correo en ATS';

function normalizar(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function notificacionesAtsHabilitadas() {
  try {
    const [rows] = await pool.execute(
      "SELECT `Seccion`, `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = 'sst'"
    );
    const fila = rows.find((r) => normalizar(r.Seccion) === 'ats' && normalizar(r.Concepto) === normalizar(CONCEPTO_HABILITAR));
    if (!fila) return true;
    return ['1', 'true', 'si', 'yes'].includes(normalizar(fila.Parametro));
  } catch (_) {
    return true;
  }
}

const esCorreo = (e) => /\S+@\S+\.\S+/.test(String(e || '').trim());

async function correoUsuario(id, nombre) {
  const [rows] = await pool.execute(
    'SELECT Email FROM Maestro_Usuarios WHERE (ID = ? OR Nombre = ?) AND Email IS NOT NULL AND Email <> \'\' LIMIT 1',
    [id || '', nombre || '']
  );
  return rows.length ? rows[0].Email : null;
}

// items: 'pendientes' (todos los que no han firmado), 'ninguno', o una lista de id_item.
async function enviarSolicitudesFirmaAts(idAts, base, { items = 'pendientes', coordinador = true, sst = true } = {}) {
  const resultado = { deshabilitado: false, trabajadores: { enviados: 0, sinCorreo: 0 }, coordinador: null, sst: null };
  if (!(await notificacionesAtsHabilitadas())) return { ...resultado, deshabilitado: true };

  const [[ats]] = await pool.execute(
    `SELECT a.*, DATE_FORMAT(a.vigencia_desde, '%d/%m/%Y') AS f_desde, DATE_FORMAT(a.vigencia_hasta, '%d/%m/%Y') AS f_hasta
     FROM Dynamic_ats a WHERE a.id_ats = ?`,
    [idAts]
  );
  if (!ats) return resultado;
  const vigencia = `${ats.f_desde} a ${ats.f_hasta}`;

  if (items !== 'ninguno') {
    const [trabs] = await pool.execute(
      `SELECT t.id_item, t.nombre_trabajador, t.token_firma, t.estado_firma, COALESCE(NULLIF(t.email, ''), s.Email) AS email_final
       FROM Dynamic_ats_trabajadores t
       LEFT JOIN \`Maestro_Segmentación\` s ON s.Identificación = t.identificacion
       WHERE t.id_ats = ?`,
      [idAts]
    );
    const lista = Array.isArray(items)
      ? trabs.filter((t) => items.map(Number).includes(Number(t.id_item)))
      : trabs.filter((t) => t.estado_firma !== 'ACEPTADA');
    for (const t of lista) {
      if (t.estado_firma === 'ACEPTADA') continue;
      if (!esCorreo(t.email_final)) { resultado.trabajadores.sinCorreo++; continue; }
      try {
        await enviarEmailFirmaAtsTrabajador({
          email: t.email_final,
          nombreTrabajador: String(t.nombre_trabajador || '').split(' ** ').pop(),
          operacion: ats.operacion,
          muelle: ats.muelle_ubicacion,
          vigencia,
          urlFirma: `${base}/ats/firmar?token=${encodeURIComponent(t.token_firma)}`,
        });
        await pool.execute('UPDATE Dynamic_ats_trabajadores SET fecha_envio_correo = NOW() WHERE id_item = ?', [t.id_item]);
        resultado.trabajadores.enviados++;
      } catch (err) {
        console.error(`[atsNotificaciones] Error enviando correo al trabajador ${t.id_item}:`, err.message);
      }
    }
  }

  if (coordinador && !ats.fecha_firma_coordinador && ats.token_coordinador) {
    const email = ats.coordinador_operacion_email || await correoUsuario(ats.coordinador_operacion_id, ats.coordinador_operacion_nombre);
    resultado.coordinador = false;
    if (esCorreo(email)) {
      try {
        await enviarEmailFirmaAtsCoordinador({
          email,
          nombreCoordinador: ats.coordinador_operacion_nombre,
          operacion: ats.operacion,
          muelle: ats.muelle_ubicacion,
          vigencia,
          urlFirma: `${base}/ats/firmar?tipo=coordinador&token=${encodeURIComponent(ats.token_coordinador)}`,
        });
        await pool.execute('UPDATE Dynamic_ats SET fecha_envio_correo_coordinador = NOW() WHERE id_ats = ?', [idAts]);
        resultado.coordinador = true;
      } catch (err) {
        console.error(`[atsNotificaciones] Error enviando correo al coordinador del ATS ${idAts}:`, err.message);
      }
    }
  }

  if (sst && !ats.fecha_firma_sst && ats.token_sst) {
    const email = ats.responsable_sst_email || await correoUsuario(ats.responsable_sst_id, ats.responsable_sst_nombre);
    resultado.sst = false;
    if (esCorreo(email)) {
      try {
        await enviarEmailFirmaAtsSst({
          email,
          nombreSst: ats.responsable_sst_nombre,
          operacion: ats.operacion,
          muelle: ats.muelle_ubicacion,
          vigencia,
          urlFirma: `${base}/ats/firmar?tipo=sst&token=${encodeURIComponent(ats.token_sst)}`,
        });
        await pool.execute('UPDATE Dynamic_ats SET fecha_envio_correo_sst = NOW() WHERE id_ats = ?', [idAts]);
        resultado.sst = true;
      } catch (err) {
        console.error(`[atsNotificaciones] Error enviando correo al responsable SST del ATS ${idAts}:`, err.message);
      }
    }
  }

  return resultado;
}

module.exports = { enviarSolicitudesFirmaAts, notificacionesAtsHabilitadas };

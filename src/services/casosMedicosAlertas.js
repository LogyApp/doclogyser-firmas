const pool = require('./db');
const { transporter, EMAIL_FROM, FOOTER, encabezadoLogo, LOGO_HEADER_ATTACHMENT, COLOR_ENCABEZADO_AZUL } = require('./email');
const { normalizar } = require('./maestroMenu');

// ── Alertas de Casos Médicos ─────────────────────────────────────────────────────
// alerta_vencimiento (recomendaciones), dias_sin_seguimiento y alerta_seguimiento se
// guardaban solo al crear/editar el caso y quedaban desactualizadas. Aquí se recalculan
// con la fecha de hoy y se envía un resumen diario por correo (Config_Parametros sst / Casos Medicos).

const MODULO = 'sst';
const SECCION = 'Casos Medicos';
const P_HABILITAR = 'Habilitar notificaciones de correo en Casos Médicos';
const P_ROLES = 'Roles que reciben el resumen diario de alertas de casos médicos';
const ROLES_DEFECTO = 'LiderSst, AdmSst';

let _ultimoRecalculo = 0;

// Recalcula las alertas de todos los casos (solo cambia las filas que difieren).
// Sin forzar, como mucho cada 10 minutos.
async function recalcularAlertasCasos(forzar = false) {
  if (!forzar && Date.now() - _ultimoRecalculo < 10 * 60 * 1000) return;
  _ultimoRecalculo = Date.now();
  try {
    await pool.execute(`
      UPDATE Maestro_casosmedicos c
      JOIN (
        SELECT id,
          CASE WHEN fecha_fin IS NULL THEN 'SIN FECHA'
               WHEN fecha_fin < CURDATE() THEN 'VENCIDO'
               WHEN DATEDIFF(fecha_fin, CURDATE()) <= 7 THEN 'POR VENCER'
               ELSE 'VIGENTE' END AS av,
          IF(ultimo_seguimiento IS NULL, NULL, GREATEST(0, DATEDIFF(CURDATE(), ultimo_seguimiento))) AS ds
        FROM Maestro_casosmedicos WHERE deleted_at IS NULL
      ) x ON x.id = c.id
      SET c.alerta_vencimiento = x.av,
          c.dias_sin_seguimiento = x.ds,
          c.alerta_seguimiento = CASE WHEN x.ds IS NULL THEN 'SIN SEGUIMIENTO'
                                      WHEN x.ds <= 15 THEN 'AL DÍA'
                                      WHEN x.ds <= 30 THEN 'PENDIENTE'
                                      ELSE 'CRÍTICO' END
      WHERE NOT (c.alerta_vencimiento <=> x.av) OR NOT (c.dias_sin_seguimiento <=> x.ds)
    `);
  } catch (err) {
    console.error('[casosMedicosAlertas] No se pudieron recalcular las alertas:', err.message);
  }
}

async function leerParametros() {
  const [rows] = await pool.execute(
    'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
    [MODULO, SECCION]
  ).catch(() => [[]]);
  const valor = (concepto) => {
    const fila = rows.find((r) => normalizar(r.Concepto) === normalizar(concepto));
    return fila ? String(fila.Parametro == null ? '' : fila.Parametro) : null;
  };
  // Si la fila no existe: sin correos (comportamiento anterior)
  const habilitar = valor(P_HABILITAR);
  return {
    habilitado: ['1', 'si', 'sí', 'true'].includes(String(habilitar || '').trim().toLowerCase()),
    roles: (valor(P_ROLES) ?? ROLES_DEFECTO).split(',').map((s) => s.trim()).filter(Boolean),
  };
}

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fechaCorta(v) {
  if (!v) return '—';
  const m = (v instanceof Date ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(v) : String(v)).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}

// Envía (una vez al día) el resumen de casos abiertos con recomendaciones por vencer o
// vencidas, o con más de 15 días sin seguimiento, a los usuarios de los roles configurados.
async function enviarResumenAlertasCasos() {
  try {
    const cfg = await leerParametros();
    if (!cfg.habilitado) return;

    // Un solo envío por día aunque corran varias instancias de la app
    const [marca] = await pool.execute(
      "INSERT IGNORE INTO Log_tareas_diarias (tarea, fecha) VALUES ('casos_medicos_alertas', CURDATE())"
    );
    if (!marca.affectedRows) return;

    await recalcularAlertasCasos(true);
    const [casos] = await pool.execute(`
      SELECT cm.codigo_caso, cm.id, cm.identificacion, cm.operacion, cm.fecha_fin, cm.ultimo_seguimiento,
             cm.alerta_vencimiento, cm.alerta_seguimiento, cm.dias_sin_seguimiento, cm.responsable_sst,
             (SELECT v.Trabajador FROM \`Maestro_Vinculación\` v WHERE v.Identificación = cm.identificacion ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1) AS trabajador,
             (SELECT v.Cargo FROM \`Maestro_Vinculación\` v WHERE v.Identificación = cm.identificacion ORDER BY v.\`Fecha de Ingreso\` DESC LIMIT 1) AS cargo
      FROM Maestro_casosmedicos cm
      WHERE cm.deleted_at IS NULL AND cm.estado_general_id = 1
        AND (cm.alerta_vencimiento IN ('POR VENCER', 'VENCIDO') OR cm.alerta_seguimiento IN ('PENDIENTE', 'CRÍTICO'))
      ORDER BY FIELD(cm.alerta_vencimiento, 'VENCIDO', 'POR VENCER') DESC, cm.dias_sin_seguimiento DESC
    `);
    if (!casos.length) return;

    if (!cfg.roles.length) return;
    const [usuarios] = await pool.execute(
      `SELECT DISTINCT Email FROM Maestro_Usuarios
       WHERE Rol IN (${cfg.roles.map(() => '?').join(',')}) AND Email IS NOT NULL AND Email <> ''`,
      cfg.roles
    );
    const destinatarios = [...new Set(usuarios.map((u) => String(u.Email).trim()).filter((e) => e.includes('@')))];
    if (!destinatarios.length) {
      console.warn('[casosMedicosAlertas] Sin destinatarios para el resumen de alertas.');
      return;
    }

    const color = { 'VENCIDO': '#DC2626', 'POR VENCER': '#D97706', 'CRÍTICO': '#DC2626', 'PENDIENTE': '#D97706' };
    const filas = casos.map((c) => {
      const nombre = String(c.trabajador || c.identificacion).split(' ** ').pop();
      const venc = ['POR VENCER', 'VENCIDO'].includes(c.alerta_vencimiento)
        ? `<span style="color:${color[c.alerta_vencimiento]};font-weight:700">${c.alerta_vencimiento}</span><br><span style="color:#777">${fechaCorta(c.fecha_fin)}</span>`
        : '—';
      const seg = ['PENDIENTE', 'CRÍTICO'].includes(c.alerta_seguimiento)
        ? `<span style="color:${color[c.alerta_seguimiento]};font-weight:700">${c.dias_sin_seguimiento} días</span><br><span style="color:#777">Último: ${fechaCorta(c.ultimo_seguimiento)}</span>`
        : '—';
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee"><strong>${esc(c.codigo_caso || `#${c.id}`)}</strong></td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(nombre)}<br><span style="color:#777">C.C. ${esc(c.identificacion)} · ${esc(c.cargo || '—')}</span></td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(c.operacion || '—')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${venc}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${seg}</td>
      </tr>`;
    }).join('');

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
${encabezadoLogo(COLOR_ENCABEZADO_AZUL)}
      <div style="padding:24px;color:#222;line-height:1.5">
        <h2 style="color:#1B2A5E;margin-top:0;font-size:1.1rem">Casos médicos que requieren atención</h2>
        <p>Hay <strong>${casos.length}</strong> caso(s) médico(s) abierto(s) con recomendaciones por vencer o vencidas, o con más de 15 días sin seguimiento en la bitácora.</p>
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead><tr style="background:#f1f5f9;text-align:left">
            <th style="padding:6px 8px">Caso</th><th style="padding:6px 8px">Trabajador</th><th style="padding:6px 8px">Operación</th>
            <th style="padding:6px 8px">Recomendaciones</th><th style="padding:6px 8px">Sin seguimiento</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <p style="font-size:0.8rem;color:#777;margin-top:16px">Revísalos en SST &gt; Casos Médicos. Este resumen se envía una vez al día mientras haya casos en alerta.</p>
      </div>
      ${FOOTER}
    </div>`;

    await transporter.sendMail({
      from: EMAIL_FROM,
      to: destinatarios.join(','),
      subject: `Casos médicos en alerta (${casos.length})`,
      html,
      attachments: [LOGO_HEADER_ATTACHMENT],
    });
    console.log(`[casosMedicosAlertas] Resumen enviado a ${destinatarios.join(', ')} (${casos.length} caso(s)).`);
  } catch (err) {
    console.error('[casosMedicosAlertas] Error enviando el resumen de alertas:', err.message);
  }
}

// Revisa cada 30 segundos y envía el resumen a las 7:00 AM hora de Colombia
// (mismo patrón que tomoCargoNotifier.js).
function iniciarProgramadorAlertasCasos() {
  let ultimoDia = null;
  setInterval(() => {
    const ahora = new Date(Date.now() - 5 * 3600000);
    const hoy = ahora.toISOString().slice(0, 10);
    if (ahora.getUTCHours() === 7 && ahora.getUTCMinutes() === 0 && ultimoDia !== hoy) {
      ultimoDia = hoy;
      enviarResumenAlertasCasos();
    }
  }, 30000);
}

module.exports = { recalcularAlertasCasos, enviarResumenAlertasCasos, iniciarProgramadorAlertasCasos };

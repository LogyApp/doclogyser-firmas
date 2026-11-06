const pool = require('./db');
const { resolverResponsablesRetiro } = require('./configRetiro');
const { obtenerAvisoFotoTransferencia, normalizarTexto } = require('./configFacturacion');
const {
  transporter, EMAIL_FROM, FOOTER, encabezadoLogo, LOGO_HEADER_ATTACHMENT, COLOR_ENCABEZADO_AZUL,
} = require('./email');

// ── Aviso de Foto de Transferencia pendiente (Facturación > Servicios) ──────────
// Cuando un rol de 'Roles que generan aviso de Foto de Transferencia pendiente' (Facturación)
// cambia la Forma de Pago de un servicio a Transferencia y guarda sin la foto, se avisa a los
// roles de 'Roles que reciben aviso...' según la Operación del recibo, como en Retiros:
// Coordinador/Auxiliar de la operación y CoordinadorR/AuxiliarR de su regional.
// Quien hizo el cambio va en copia. Config_Parametros facturacion / Recibos.

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatoFecha(v) {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
}

function formatoPesos(n) {
  return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
}

// Correos de los roles que reciben el aviso: los responsables se resuelven por la Operación;
// otros roles que se agreguen a la lista reciben el aviso sin importar la operación.
async function correosDestino(rolesDestino, operacion) {
  const responsables = ['Auxiliar', 'Coordinador', 'AuxiliarR', 'CoordinadorR'];
  const esResponsable = (r) => responsables.some((x) => normalizarTexto(x) === normalizarTexto(r));
  const rolesResp = rolesDestino.filter(esResponsable);
  const rolesOtros = rolesDestino.filter((r) => !esResponsable(r));
  const correos = [];
  if (rolesResp.length && operacion) {
    (await resolverResponsablesRetiro(operacion, rolesResp)).forEach((r) => correos.push(r.Email));
  }
  if (rolesOtros.length) {
    const [rows] = await pool.execute(
      `SELECT Email FROM Maestro_Usuarios
       WHERE Rol IN (${rolesOtros.map(() => '?').join(',')}) AND Email IS NOT NULL AND Email <> ''`,
      rolesOtros
    );
    rows.forEach((r) => correos.push(r.Email));
  }
  const vistos = new Set();
  return correos.map((c) => String(c || '').trim()).filter((c) => {
    const k = c.toLowerCase();
    if (!c || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// idServicio: servicio ya guardado. acceso: quien hizo el cambio (computarAccesoFacturacion).
async function avisarFotoTransferenciaPendiente({ idServicio, acceso }) {
  const cfg = await obtenerAvisoFotoTransferencia(acceso.rol);
  if (!cfg.aplica || !cfg.rolesDestino.length) return;

  const [rows] = await pool.execute(
    `SELECT s.IdServicio, s.\`Hora Inicio\` AS horaInicio, s.Cantidad, s.\`Valor Unitario\` AS valorUnitario,
            s.Usuario AS usuarioServicio, r.\`Consecutivo Recibo\` AS consecutivo, r.\`Operación\` AS operacion,
            r.\`Cliente a Facturar\` AS clienteAFacturar, mc.\`Razón social\` AS razonSocial,
            ca.Actividad AS actividad
       FROM Dynamic_Servicios s
       LEFT JOIN Dynamic_Recibos r ON s.IdRecibo = r.IdRecibo
       LEFT JOIN Maestro_Clientes mc ON r.Nit = mc.\`Código\`
       LEFT JOIN Config_Actividad ca ON s.Actividad = ca.ID
      WHERE s.IdServicio = ? LIMIT 1`,
    [idServicio]
  );
  if (!rows.length) return;
  const s = rows[0];

  const para = await correosDestino(cfg.rolesDestino, s.operacion);
  if (!para.length) {
    console.warn(`[avisoFotoTransferencia] Sin destinatarios para la operación ${s.operacion} (servicio ${idServicio}).`);
    return;
  }
  const [uRows] = await pool.execute('SELECT Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [acceso.usuarioId]);
  const cc = uRows.length && uRows[0].Email ? String(uRows[0].Email).trim() : '';

  const fila = (k, v) => `
            <tr>
              <td style="padding:7px 10px;border:1px solid #e3e6ee;background:#f8f9fb;font-weight:bold;width:40%">${k}</td>
              <td style="padding:7px 10px;border:1px solid #e3e6ee">${v}</td>
            </tr>`;
  const cliente = s.clienteAFacturar || s.razonSocial || '—';
  const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;background:#f4f4f4;padding:24px">
${encabezadoLogo(COLOR_ENCABEZADO_AZUL)}
        <div style="background:#fff;padding:28px;border-radius:0 0 8px 8px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
          <h2 style="color:#1a1a2e;margin-top:0">Foto de Transferencia pendiente</h2>
          <p style="color:#555">
            El área de <strong>Facturación</strong> cambió la modalidad de pago del siguiente servicio a
            <strong>Transferencia</strong>. Por favor adjunte la <strong>Foto de Transferencia</strong> lo más pronto posible.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:.88rem;margin:16px 0">
            ${fila('Operación', esc(s.operacion || '—'))}
            ${fila('Consecutivo Recibo', esc(s.consecutivo || '—'))}
            ${fila('Id Servicio', esc(s.IdServicio))}
            ${fila('Cliente', esc(cliente))}
            ${fila('Actividad', esc(s.actividad || '—'))}
            ${fila('Fecha del servicio', esc(formatoFecha(s.horaInicio)))}
            ${fila('Valor Base', esc(formatoPesos((Number(s.Cantidad) || 0) * (Number(s.valorUnitario) || 0))))}
            ${fila('Registró el servicio', esc(s.usuarioServicio || '—'))}
            ${fila('Cambió la forma de pago', esc(acceso.usuarioNombre || acceso.usuarioId))}
          </table>
          <p style="color:#555;font-size:.88rem">
            Para adjuntarla, busque el servicio en <strong>Facturación &gt; Servicios</strong> por su consecutivo o Id y
            use <strong>✏️ Editar</strong>.
          </p>
        </div>
        ${FOOTER}
      </div>`;

  await transporter.sendMail({
    from: `"LOG&SER Facturación" <${EMAIL_FROM}>`,
    to: para.join(', '),
    cc: cc && !para.some((c) => c.toLowerCase() === cc.toLowerCase()) ? cc : undefined,
    subject: `Foto de Transferencia pendiente — ${s.operacion || ''} — Recibo ${s.consecutivo || s.IdServicio}`,
    html,
    attachments: [LOGO_HEADER_ATTACHMENT],
  });
}

module.exports = { avisarFotoTransferenciaPendiente };

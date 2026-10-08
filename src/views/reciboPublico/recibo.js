const { esc, formatPrice, formatNumber } = require('./helpers');

// Vista pública (sin autenticación) del "recibo provisional" que recibe el cliente
// por WhatsApp/correo. Portado de recibo.ejs del servicio recibo-recaudo a HTML
// plano para no sumar la dependencia `ejs` y mantener la convención del proyecto
// (plantillas por template literal, igual que paginaError() en facturacion.js).
function renderRecibo(data) {
  const { r, serviciosRows, ultimoServicio, fechaMinimaServicio, hora, consecutivoFinal, subtotal } = data;

  const filasServicios = serviciosRows.map(s => {
    const valorBase = (s.Cantidad || 0) * (s['Valor Unitario'] || 0);
    return `
        <tr>
          <td>${esc(s.ActividadNombre)}</td>
          <td>${esc(s.Vehiculo)}</td>
          <td>${esc(s.PlacaReal)}</td>
          <td>${esc(s.FormaPagoNombre)}</td>
          <td>${formatNumber(s.Cantidad)}</td>
          <td>${esc(s.Unidad)}</td>
          <td class="text-right">${formatPrice(s['Valor Unitario'] || 0)}</td>
          <td class="text-right">${formatPrice(valorBase)}</td>
        </tr>`;
  }).join('');

  const filaIva          = r.IvaVista   ? `<tr><td class="text-right label">Valor IVA:</td><td class="text-right">${formatPrice(r.IvaVista)}</td></tr>` : '';
  const filaRetefuente   = r.retefuente ? `<tr><td class="text-right label">Rte. Fuente:</td><td class="text-right">- ${formatPrice(r.retefuente)}</td></tr>` : '';
  const filaReteIva      = r.reteiva    ? `<tr><td class="text-right label">Rte. IVA:</td><td class="text-right">- ${formatPrice(r.reteiva)}</td></tr>` : '';
  const filaReteIca      = r.reteica    ? `<tr><td class="text-right label">Rte. ICA:</td><td class="text-right">- ${formatPrice(r.reteica)}</td></tr>` : '';

  const waData = {
    telefono: r.Telefono || '',
    nombres: r.Nombres || '',
    nit: String(r.Nit || ''),
    operacion: r['Operación'] || '',
    totalVista: r.TotalVista || 0,
    fecha: fechaMinimaServicio,
    consecutivo: String(consecutivoFinal),
    idRecibo: String(r.IdRecibo)
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=760, initial-scale=1">
  <title>Recibo Provisional - Logyser</title>
  <style>
    :root {
      --azul: #000b59;
      --naranja: #F55400;
      --gris-claro: #f4f7f9;
      --gris-texto: #555;
      --whatsapp: #25D366;
    }

    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; color: #333; background: #fff; }
    #contenido { max-width: 800px; margin: 0 auto; padding: 20px; border: 1px solid #eee; }

    .header-top {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      align-items: center;
      border-bottom: 2px solid var(--azul);
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .logo-side img { width: 180px; height: auto; }

    .consecutivo-center {
      text-align: center;
      border-left: 1px solid #eee;
      border-right: 1px solid #eee;
      padding: 0 10px;
    }
    .consecutivo-center .label-recibo { font-size: 10px; color: var(--gris-texto); font-weight: bold; text-transform: uppercase; display: block; }
    .consecutivo-center .nro { font-size: 24px; color: var(--naranja); font-weight: 900; display: block; line-height: 1; margin: 2px 0; }
    .consecutivo-center .fecha-top { font-size: 11px; color: #333; font-weight: 600; display: block; }
    .consecutivo-center .id-recibo { font-size: 10px; color: #aaa; display: block; margin-top: 3px; }

    .info-empresa-right {
      text-align: right;
      font-size: 9.5px;
      line-height: 1.2;
      color: var(--azul);
    }
    .info-empresa-right h2 { font-size: 14px; margin: 0 0 3px 0; font-weight: 800; }
    .info-empresa-right p { margin: 1px 0; }

    .info-bar {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid var(--azul);
      border-radius: 4px;
      margin-bottom: 15px;
      overflow: hidden;
    }
    .info-group { padding: 8px 12px; font-size: 11px; background: #fff; }
    .info-group:first-child { border-right: 1px solid var(--azul); background: #fdfdfd; }
    .info-group p { margin: 3px 0; display: flex; gap: 8px; }
    .info-group strong { color: var(--azul); width: 110px; flex-shrink: 0; font-size: 10px; }

    .provisional-message { border-left: 4px solid var(--naranja); background: #fff5f0; padding: 12px; margin-bottom: 20px; font-size: 12px; border-radius: 0 4px 4px 0; }

    .section-header-centered { text-align: center; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; color: var(--azul); font-size: 15px; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th { background: var(--azul); color: #fff; padding: 10px 6px; text-align: center; }
    td { padding: 9px 6px; border-bottom: 1px solid #eee; text-align: center; }
    .text-right { text-align: right; }
    .label { font-weight: bold; color: var(--gris-texto); }

    .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; align-items: start; }
    .factura-promo { background: var(--gris-claro); padding: 15px; border-radius: 8px; font-size: 12px; text-align: center; }
    .wa-color { color: var(--whatsapp); font-weight: bold; text-decoration: none; }
    .mail-color { color: #007bff; text-decoration: none; }

    .totals-table { width: 100%; }
    .totals-table td { padding: 7px 6px; border: none; font-size: 13px; }
    .total-row td { background: var(--naranja); color: #fff; font-weight: bold; font-size: 16px; padding: 11px 8px; }
    .total-row td:first-child { border-radius: 4px 0 0 4px; }
    .total-row td:last-child { border-radius: 0 4px 4px 0; }

    .notas-container { margin-top: 15px; border: 1px solid #eee; border-radius: 4px; padding: 10px; font-size: 12px; min-height: 40px; }
    .notas-title { font-weight: bold; color: var(--azul); border-bottom: 1px solid #eee; margin-bottom: 5px; font-size: 11px; text-transform: uppercase; padding-bottom: 4px; }

    .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center; }

    .actions { display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; }
    .btn { padding: 10px 20px; border-radius: 5px; color: #fff; text-decoration: none; border: none; cursor: pointer; font-weight: bold; font-size: 14px; }
    .btn-print { background: var(--naranja); }
    .btn-wa { background: var(--whatsapp); }

    @media print {
      .no-print { display: none !important; }
      #contenido { border: none; width: 100%; }
    }
  </style>
</head>
<body>

<div class="actions no-print">
  <button class="btn btn-print" onclick="window.print()">Imprimir</button>
  <a id="whatsapp-link" class="btn btn-wa" href="#">WhatsApp</a>
</div>

<div id="contenido">
  <div class="header-top">
    <div class="logo-side">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="Logyser"
           onerror="this.src='https://via.placeholder.com/180x50?text=Logyser';">
    </div>

    <div class="consecutivo-center">
      <span class="label-recibo">RECIBO PROVISIONAL</span>
      <span class="nro">${esc(consecutivoFinal)}</span>
      <span class="fecha-top">${esc(fechaMinimaServicio)}</span>
      <span class="id-recibo">ID: ${esc(r.IdRecibo)}</span>
    </div>

    <div class="info-empresa-right">
      <h2>APOYO LOGISTICO Y OPERATIVO S.A.S</h2>
      <p>RESPONSABLES DE IVA</p>
      <p>NO SOMOS GRANDES CONTRIBUYENTES</p>
      <p>ACTIVIDAD ECONÓMICA: 5224</p>
      <p>TV 39 A # 70A-51</p>
      <p>MEDELLÍN - ANTIOQUIA</p>
    </div>
  </div>

  <div class="info-bar">
    <div class="info-group">
      <p><strong>CLIENTE:</strong> <span>${esc(r.Nombres)}</span></p>
      <p><strong>NIT/CC:</strong> <span>${esc(r.Nit)}</span></p>
      <p><strong>EMAIL:</strong> <span>${esc(r.Email)}</span></p>
      <p><strong>TELÉFONO:</strong> <span>${esc(r.Telefono)}</span></p>
    </div>
    <div class="info-group">
      <p><strong>OPERACIÓN:</strong> <span>${esc(r['Operación'])}</span></p>
      <p><strong>ÁREA:</strong> <span>${esc(ultimoServicio ? ultimoServicio.AreaNombre : '')}</span></p>
      <p><strong>PROVEEDOR:</strong> <span>${esc(ultimoServicio ? ultimoServicio.ProveedorNombre : '')}</span></p>
      <p><strong>TRANSPORTADORA:</strong> <span>${esc(ultimoServicio ? ultimoServicio.TransportadoraNombre : '')}</span></p>
    </div>
  </div>

  <div class="provisional-message">
    <strong>Recuerda que:</strong> Este documento es un recibo provisional. La factura electrónica será enviada a tu correo. Confirma que tus datos estén correctos. Para realizar modificaciones, informa de inmediato al personal del punto de servicio; de lo contrario, no se aceptará ningún reclamo.
  </div>

  <div class="section-header-centered">Detalle del servicio</div>
  <table>
    <thead>
      <tr>
        <th>Actividad</th>
        <th>Vehículo</th>
        <th>Placa</th>
        <th>Pago</th>
        <th>Cant.</th>
        <th>Unidad</th>
        <th>V. Unit</th>
        <th>Valor</th>
      </tr>
    </thead>
    <tbody>${filasServicios}
    </tbody>
  </table>

  <div class="bottom-grid">
    <div class="factura-promo">
      <p style="font-weight:bold;color:var(--naranja);font-size:14px;margin-bottom:8px;">¿Necesitas tu factura? ¡No te preocupes!</p>
      <p>Verifica tus datos y solicita al WhatsApp<br>
        <a href="https://wa.me/573173645618" class="wa-color">3173645618</a><br>
        o al correo <a href="mailto:facturacion.electronica@logyser.com" class="mail-color">facturacion.electronica@logyser.com</a>
      </p>
    </div>
    <div>
      <table class="totals-table">
        <tr><td class="text-right label">Subtotal:</td><td class="text-right">${formatPrice(subtotal)}</td></tr>
        ${filaIva}
        ${filaRetefuente}
        ${filaReteIva}
        ${filaReteIca}
        <tr class="total-row"><td class="text-right">TOTAL:</td><td class="text-right">${formatPrice(r.TotalVista || 0)}</td></tr>
      </table>
    </div>
  </div>

  <div class="notas-container">
    <div class="notas-title">Observaciones:</div>
    <div>${esc(r.Observaciones)}</div>
  </div>

  <div class="footer">
    ID: ${esc(r.IdRecibo)} | ${esc(hora)} | Elaborado por: ${esc(r.Usuario)} | LogyApp
  </div>
</div>

<script>
  const _DATA = ${JSON.stringify(waData)};

  function buildWA() {
    const clean = _DATA.telefono.replace(/\\D/g, '');
    const telefono = clean.length === 10 ? '57' + clean : clean;

    const fmt = v => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(v) || 0);

    let placa = '';
    for (const fila of document.querySelectorAll('tbody tr')) {
      const celda = fila.cells[2];
      if (celda && celda.textContent.trim()) { placa = celda.textContent.trim(); break; }
    }

    const urlLimpia = \`\${window.location.origin}/recibo/\${_DATA.idRecibo}\`;

    const text = [
      "🟦🟧 *LOGYSER S.A.S*",
      "",
      "Hola, este es el detalle de tu servicio:",
      "",
      \`*\${_DATA.operacion || "Servicio Logyser"}*\`,
      \`👤 *Cliente:* _\${_DATA.nombres || "N/A"}_\`,
      \`🆔 *Nit/CC:* \${_DATA.nit || "N/A"}\`,
      placa ? \`🚚 *Placa:* \${placa}\` : "",
      \`💰 *Total Pago:* *\${fmt(_DATA.totalVista)}*\`,
      \`📅 *Fecha:* \${_DATA.fecha}\`,
      \`🧾 *Recibo:* \${_DATA.consecutivo}\`,
      "",
      "🔗 *Ver recibo detallado en línea:*",
      urlLimpia,
      "",
      "💬 _Recuerda que puedes solicitar tu factura electrónica al WhatsApp: wa.me/573173645618_"
    ].filter(Boolean).join("\\n");

    const to = telefono || "573173645618";
    return \`https://wa.me/\${to}/?text=\${encodeURIComponent(text)}\`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const waBtn = document.getElementById('whatsapp-link');
    if (waBtn) waBtn.href = buildWA();
  });
</script>

</body>
</html>`;
}

module.exports = { renderRecibo };

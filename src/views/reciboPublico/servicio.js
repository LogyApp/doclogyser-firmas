const { esc, formatPrice } = require('./helpers');

// Vista pública (sin autenticación) de un servicio puntual, con captura de firma
// digital del cliente/conductor. Portado de servicio.ejs del servicio recibo-recaudo.
function renderServicio(data) {
  const { d, subtotal, iva, totalPago, clienteMostrar, fechaPie, fechaCabecera, firmaGuardada } = data;

  const firmaYaRegistrada = firmaGuardada && String(firmaGuardada).includes('http');

  const bloqueFirma = firmaYaRegistrada
    ? `<img src="${esc(firmaGuardada)}" style="width:100%;height:auto;max-height:150px;" alt="Firma Registrada">`
    : `<canvas id="signature-pad" style="width:100%;height:150px;"></canvas>
        <div class="btns-firma">
          <button class="btn btn-clear" id="clear">Limpiar</button>
          <button class="btn btn-save" id="save">Enviar Firma</button>
        </div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Recibo Provisional - LogyApp</title>
  ${firmaYaRegistrada ? '' : '<script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>'}
  <style>
    body{font-family:Arial,sans-serif;margin:20px;color:#333;font-size:14px;}
    .header-section{text-align:center;padding:2px 5px;background-color:#F55400;border-radius:10px;color:#fff;margin-bottom:10px;}
    .header-section h1{font-size:20px;margin:2px 0;}
    .header-section p{font-size:14px;margin:2px 0;font-weight:bold;}
    .logo{text-align:center;margin-bottom:10px;}
    .logo img{max-width:280px;}
    table{width:100%;border-collapse:collapse;margin:15px 0;}
    th,td{padding:8px;border:1px solid #ddd;}
    th{background-color:#F55400;color:#fff;}
    .highlight{text-align:center;font-weight:bold;margin:5px 0;}
    .totals-section{display:flex;justify-content:space-between;gap:20px;margin-top:20px;}
    .signature-container{width:48%;border:1px solid #ddd;padding:10px;border-radius:8px;background:#f9f9f9;text-align:center;}
    canvas{border:1px solid #ccc;background:#fff;width:100%;height:150px;touch-action:none;}
    .btns-firma{margin-top:8px;display:flex;justify-content:center;gap:10px;}
    .btn{padding:5px 10px;cursor:pointer;border-radius:4px;border:none;font-size:12px;}
    .btn-clear{background:#666;color:#fff;}
    .btn-save{background:#F55400;color:#fff;}
    .btn-save:disabled{background:#ccc;cursor:not-allowed;}
    .total-final{color:#000b59;font-weight:bold;font-size:18px;}
    .notes-box{border:1px solid #ddd;padding:10px;border-radius:5px;margin-top:15px;background:#fff;}
    .footer-logy{margin-top:30px;border-top:2px solid #000b59;padding-top:10px;display:flex;justify-content:space-between;font-size:11px;color:#555;}
    .ws-green{color:#25D366;font-weight:bold;text-decoration:none;}
    @media print { .btns-firma { display: none; } }
  </style>
</head>
<body>
  <div class="logo"><img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="Logyser"></div>

  <div class="header-section">
    <h1>RECIBO PROVISIONAL</h1>
    <p>${esc(fechaCabecera)}</p>
  </div>

  <div class="highlight" style="color:#000b59;font-size:18px;">ID: ${esc(d.IdServicio)}</div>
  <div class="highlight" style="color:#F55400;">Recibo: ${esc(d.ConsecutivoRecibo)}</div>
  <div class="highlight" style="color:#F55400;">Cliente: ${esc(clienteMostrar)}</div>

  <table>
    <tr>
      <td><strong>Operación:</strong></td><td style="color:#F55400;font-weight:bold;">${esc(d['Operación'])}</td>
      <td><strong>Manifiesto:</strong></td><td>${esc(d.Manifiesto)}</td>
    </tr>
    <tr>
      <td><strong>Área:</strong></td><td>${esc(d.NombreArea)}</td>
      <td><strong>Actividad:</strong></td><td>${esc(d.NombreActividad)}</td>
    </tr>
    <tr>
      <td><strong>Transportadora:</strong></td><td>${esc(d.NombreTransportadora)}</td>
      <td><strong>Placa:</strong></td><td style="color:#F55400;font-weight:bold;">${esc(d.NombrePlaca)}</td>
    </tr>
  </table>

  <table>
    <thead><tr><th>Cant.</th><th>Unidad</th><th>V. Unitario</th><th>Subtotal</th></tr></thead>
    <tbody>
      <tr>
        <td align="center">${esc(d.Cantidad)}</td>
        <td align="center">${esc(d.Unidad)}</td>
        <td align="right">${formatPrice(d['Valor Unitario'])}</td>
        <td align="right">${formatPrice(subtotal)}</td>
      </tr>
    </tbody>
  </table>

  <div style="display:flex;gap:20px;margin-top:20px;align-items:stretch;">
    <div class="notes-box" style="flex:1;margin-top:0;">
      <strong>Notas / Observaciones:</strong>
      <p>${esc(d.Observaciones || d.Notas || 'Sin observaciones.')}</p>
    </div>
    <table style="width:40%;margin:0;">
      <tr><td>Valor IVA</td><td align="right">${formatPrice(iva)}</td></tr>
      <tr><td class="total-final">TOTAL</td><td align="right" class="total-final">${formatPrice(totalPago)}</td></tr>
    </table>
  </div>

  <div style="display:flex;justify-content:center;margin-top:30px;">
    <div class="signature-container" style="width:400px;">
      ${bloqueFirma}
      <div style="margin-top:5px;font-weight:bold;border-top:1px solid #000;text-align:center;">Firma recibido</div>
    </div>
  </div>

  <div style="text-align:center;margin-top:15px;font-size:12px;">
    Verifica tus datos, cualquier novedad informa al
    <a href="https://wa.me/573174352705" class="ws-green">3174352705</a>
    o <a href="mailto:analista.facturacion@logyser.com" style="color:#000b59;">analista.facturacion@logyser.com</a>
  </div>

  <div class="footer-logy">
    <span><strong>Elaborado por:</strong> ${esc(d.Usuario)}</span>
    <span><strong>Fecha:</strong> ${esc(fechaPie)}</span>
    <span style="color:#000b59;font-weight:bold;">LogyApp</span>
  </div>

  ${firmaYaRegistrada ? '' : `<script>
    const canvas = document.getElementById('signature-pad');
    if (canvas) {
      const signaturePad = new SignaturePad(canvas);

      function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width  = canvas.offsetWidth  * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext('2d').scale(ratio, ratio);
        signaturePad.clear();
      }
      window.onresize = resizeCanvas;
      resizeCanvas();

      document.getElementById('clear').addEventListener('click', () => signaturePad.clear());

      document.getElementById('save').addEventListener('click', async () => {
        if (signaturePad.isEmpty()) return alert('Por favor, firme primero.');
        const dataURL = signaturePad.toDataURL();
        const saveBtn = document.getElementById('save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enviando...';
        try {
          const response = await fetch('/guardar-firma', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idServicio: '${esc(d.IdServicio).replace(/'/g, "\\'")}', firmaB64: dataURL })
          });
          const resultado = await response.json().catch(() => ({}));
          if (response.ok) {
            alert('Firma enviada correctamente. El recibo se actualizará.');
            location.reload();
          } else {
            alert(resultado.error || 'Error al guardar la firma.');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Enviar Firma';
          }
        } catch (e) {
          console.error(e);
          alert('Error de conexión.');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Enviar Firma';
        }
      });
    }
  </script>`}
</body>
</html>`;
}

module.exports = { renderServicio };

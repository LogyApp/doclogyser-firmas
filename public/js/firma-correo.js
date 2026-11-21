// Firma de correo corporativa en HTML: solo tablas, estilos en línea e imágenes del bucket para que Gmail y Outlook la muestren igual.
// La usan el perfil del navegador (window.htmlFirmaCorreoLogyser) y el servidor, que la convierte en la imagen PNG de la firma.
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    raiz.htmlFirmaCorreoLogyser = api.htmlFirmaCorreo;
    raiz.copiarFirmaCorreoLogyser = api.copiarFirma;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function htmlFirmaCorreo(datos = {}) {
    const nombre = esc(datos.nombre || 'Nombre y Apellido'), cargo = esc(datos.cargo || 'Cargo Corporativo');
    const email = esc(datos.email || 'colaborador@logyser.com'), sede = esc(datos.operacion || 'Sede Operación');
    const digitos = String(datos.celular || '3000000000').replace(/\D/g, '');
    const celular = esc(digitos.length === 10 ? `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}` : datos.celular);
    const direccion = esc(datos.direccion || '');
    const img = 'https://storage.googleapis.com/logyser-recursos-corporativos/Imagenes/';
    const logo = 'https://storage.googleapis.com/logyser-recibo-public/Logyser%20sin%20Nit.png';
    const azul = '#1B2A5E', naranja = '#E8762B', fuente = 'font-family:Arial,Helvetica,sans-serif;';
    const fila = (icono, contenido) => `<tr><td width="34" style="width:34px;padding:0 10px 8px 0;vertical-align:middle;border:none"><img src="${img}firma-correo/icono-${icono}.png" alt="" width="24" height="24" style="display:block;width:24px;height:24px;border:0"></td><td style="padding:0 0 8px;vertical-align:middle;border:none;${fuente}font-size:13px;color:${azul}">${contenido}</td></tr>`;
    return `<table cellpadding="0" cellspacing="0" border="0" width="560" style="${fuente}width:560px;background:#fff;border-collapse:collapse;border:1px solid #DDE1E8">`
      + `<tr><td style="padding:18px 20px 14px;border:none"><table cellpadding="0" cellspacing="0" border="0" width="518" style="width:518px;border-collapse:collapse"><tr>`
      + `<td style="vertical-align:top;padding:0 16px 0 0;border:none">`
      + `<p style="margin:0 0 4px;${fuente}font-size:21px;font-weight:700;color:${azul}">${nombre}</p>`
      + `<p style="margin:0 0 12px;${fuente}font-size:14px;font-weight:700;color:${naranja}">${cargo}</p>`
      + `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">`
      + fila('correo', `<a href="mailto:${email}" style="color:${azul};text-decoration:none;font-weight:700">${email}</a>`)
      + fila('celular', `Celular: +57 ${celular}`)
      + fila('sede', `Sede: ${sede}`)
      + (direccion ? fila('direccion', direccion) : '')
      + `</table></td>`
      + `<td width="3" bgcolor="${naranja}" style="width:3px;background:${naranja};border:none;font-size:0;line-height:0">&nbsp;</td>`
      + `<td width="200" align="center" style="width:200px;vertical-align:middle;padding:0 0 0 18px;border:none">`
      + `<img src="${logo}" alt="Logyser S.A.S." width="200" height="58" style="display:block;width:200px;height:58px;border:0;margin:0 auto 14px">`
      + `<img src="${img}certificado-iso-9001-bureau-veritas.png" alt="Certificado ISO 9001:2015 - Bureau Veritas" width="150" height="58" style="display:block;width:150px;height:58px;border:0;margin:0 auto">`
      + `</td></tr></table></td></tr>`
      + `<tr><td style="padding:0;border:none"><table cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;border-collapse:collapse"><tr>`
      + `<td height="26" bgcolor="${azul}" align="center" style="height:26px;background:${azul};text-align:center;border:none;padding:0"><a href="https://www.logyser.com" style="${fuente}font-size:14px;font-weight:700;color:#fff;text-decoration:none;line-height:26px">www.logyser.com</a></td>`
      + `<td width="120" bgcolor="${azul}" style="width:120px;background:${azul};border:none;padding:0;font-size:0;line-height:0"><img src="${img}firma-correo/franja-remate-v3.png" alt="" width="120" height="26" style="display:block;width:120px;height:26px;border:0"></td>`
      + `</tr></table></td></tr>`
      + `<tr><td style="background:#F8FAFC;padding:12px 20px;border:none"><p style="margin:0;${fuente}color:#475569;font-size:10px;line-height:1.45;text-align:justify"><strong>AVISO DE CONFIDENCIALIDAD:</strong> La información de este correo es confidencial y para uso exclusivo del destinatario. Si lo recibió por error, notifique al remitente y elimínelo.</p><p style="margin:6px 0 0;${fuente}color:#15803D;font-size:10px">Por favor, cuida el medio ambiente antes de imprimir este mensaje.</p></td></tr>`
      + `</table>`;
  }

  // Copia la firma con formato (y en texto como respaldo) y lo confirma en el mismo botón durante 2 segundos.
  async function copiarFirma(contenedor, boton) {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([contenedor.innerHTML], { type: 'text/html' }),
        'text/plain': new Blob([contenedor.innerText], { type: 'text/plain' }),
      })]);
    } else {
      const rango = document.createRange();
      rango.selectNode(contenedor);
      const seleccion = window.getSelection();
      seleccion.removeAllRanges();
      seleccion.addRange(rango);
      const copiado = document.execCommand('copy');
      seleccion.removeAllRanges();
      if (!copiado) throw new Error('No se pudo copiar');
    }
    if (!boton) return;
    if (!boton.dataset.textoOriginal) boton.dataset.textoOriginal = boton.textContent;
    boton.textContent = '✓ ¡Copiado!';
    boton.style.background = boton.style.borderColor = '#15803D';
    boton.style.color = '#fff';
    clearTimeout(boton._temporizadorCopiado);
    boton._temporizadorCopiado = setTimeout(() => {
      boton.textContent = boton.dataset.textoOriginal;
      boton.style.background = boton.style.borderColor = boton.style.color = '';
    }, 2000);
  }

  return { htmlFirmaCorreo, copiarFirma };
});

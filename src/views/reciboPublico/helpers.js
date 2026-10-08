function esc(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(val) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
  }).format(val || 0);
}

function formatNumber(val) {
  return parseFloat((val || 0).toFixed(2));
}

function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  const hour  = String(d.getHours()).padStart(2, '0');
  const sec   = String(d.getSeconds()).padStart(2, '0');
  return `${day}-${month}-${year} ${hour}:${sec}`;
}

function paginaPublicaError(mensaje, status) {
  return {
    status: status || 404,
    html: `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title>
<style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f4f7f9;}
div{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:420px;text-align:center;}
h2{color:#F55400;margin-top:0;}</style></head><body><div><h2>Aviso</h2><p>${esc(mensaje)}</p></div></body></html>`
  };
}

module.exports = { esc, formatPrice, formatNumber, formatDateTime, paginaPublicaError };

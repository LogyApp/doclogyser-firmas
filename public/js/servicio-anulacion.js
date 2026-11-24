(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.servicioYaAnulado = api.servicioYaAnulado;
})(typeof self !== 'undefined' ? self : this, function () {
  function servicioYaAnulado(estado, formaDePago) {
    const pagoAnulado = formaDePago !== null && formaDePago !== undefined && formaDePago !== '' && Number(formaDePago) === 0;
    return pagoAnulado && String(estado || '').toLowerCase() !== 'yellow';
  }

  return { servicioYaAnulado };
});

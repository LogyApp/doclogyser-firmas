// Catálogo de columnas de la tabla de Facturación → Servicios. Cada usuario escoge de aquí las que ve, su orden,
// etiqueta y ancho (vistaTablaUsuario.js). El orden del catálogo con defecto: true es la vista predeterminada.
//   sql:   expresión que se agrega al SELECT de /api/servicios solo si el usuario tiene la columna visible
//          (las que no tienen sql ya vienen siempre en la consulta o se calculan con calcularTotalesServicio).
//   orden: expresión para ordenar al hacer clic en el encabezado (las calculadas se arman con ordenCalculado).
//   join:  unión extra que necesita la columna.
//   tipo:  cómo se pinta la celda en la pantalla.
const VISTA = 'facturacion.servicios';

const JOINS = {
  area: 'LEFT JOIN Config_Area ar ON s.Area = ar.ID'
};

const CATALOGO = [
  { clave: 'fechaServicio', etiqueta: 'Fecha Servicio', ancho: 140, tipo: 'fecha', orden: 's.`Hora Inicio`', defecto: true },
  { clave: 'consecutivoRecibo', etiqueta: 'Consecutivo Recibo', ancho: 130, tipo: 'consecutivo', orden: 'r.`Consecutivo Recibo`', defecto: true },
  { clave: 'totalPago', etiqueta: 'Total Pago', ancho: 120, tipo: 'totalPago', alinear: 'right', calculada: true, defecto: true },
  { clave: 'cantidad', etiqueta: 'Cantidad', ancho: 85, tipo: 'numero', alinear: 'right', orden: 's.Cantidad', defecto: true },
  { clave: 'valorUnitario', etiqueta: 'Valor Unitario', ancho: 110, tipo: 'moneda', alinear: 'right', orden: 's.`Valor Unitario`', defecto: true },
  { clave: 'valorBase', etiqueta: 'V. Base', ancho: 110, tipo: 'monedaFuerte', alinear: 'right', calculada: true, defecto: true },
  { clave: 'iva', etiqueta: 'IVA', ancho: 100, tipo: 'moneda', alinear: 'right', calculada: true, defecto: true },
  { clave: 'valorReteFuente', etiqueta: 'V. ReteFuente', ancho: 110, tipo: 'retencion', alinear: 'right', calculada: true, defecto: true },
  { clave: 'valorReteIVA', etiqueta: 'V. ReteIVA', ancho: 100, tipo: 'retencion', alinear: 'right', calculada: true, defecto: true },
  { clave: 'valorReteICA', etiqueta: 'V. ReteICA', ancho: 100, tipo: 'retencion', alinear: 'right', calculada: true, defecto: true },
  { clave: 'clienteAFacturar', etiqueta: 'Cliente a Facturar', ancho: 160, tipo: 'texto', orden: 'r.`Cliente a Facturar`', defecto: true },
  { clave: 'transportadora', etiqueta: 'Transportadora', ancho: 150, tipo: 'texto', orden: 'mt.Transportadora', defecto: true },
  { clave: 'proveedor', etiqueta: 'Proveedor', ancho: 140, tipo: 'texto', orden: 'COALESCE(mpr.Proveedor, s.Proveedor)', defecto: true },
  { clave: 'actividad', etiqueta: 'Actividad', ancho: 130, tipo: 'texto', orden: 'ca.Actividad', defecto: true },
  { clave: 'unidad', etiqueta: 'Unidad', ancho: 90, tipo: 'texto', orden: 's.Unidad', defecto: true },
  { clave: 'placa', etiqueta: 'Placa', ancho: 90, tipo: 'texto', orden: 'mp.Placa', defecto: true },
  { clave: 'vehiculo', etiqueta: 'Vehículo', ancho: 100, tipo: 'texto', orden: 's.Vehiculo', defecto: true },
  { clave: 'idServicio', etiqueta: 'Id Servicio', ancho: 130, tipo: 'texto', orden: 's.IdServicio', defecto: true },
  { clave: 'usuario', etiqueta: 'Usuario', ancho: 150, tipo: 'texto', orden: 's.Usuario', defecto: true },
  { clave: 'fechaRegistro', etiqueta: 'Fecha Registro', ancho: 140, tipo: 'fecha', orden: 's.Fecha', defecto: true },
  { clave: 'quincena', etiqueta: 'Quincena', ancho: 140, tipo: 'texto', orden: 'mf.Quincena', defecto: true },

  // Adicionales (ocultas en la vista predeterminada)
  { clave: 'idRecibo', etiqueta: 'Id Recibo', ancho: 130, tipo: 'texto', orden: 's.IdRecibo' },
  { clave: 'operacion', etiqueta: 'Operación', ancho: 150, tipo: 'texto', orden: 'r.`Operación`' },
  { clave: 'regional', etiqueta: 'Regional', ancho: 120, tipo: 'texto', sql: 'mo.REGIONAL', orden: 'mo.REGIONAL' },
  { clave: 'area', etiqueta: 'Área', ancho: 130, tipo: 'texto', sql: 'ar.AREA', orden: 'ar.AREA', join: 'area' },
  { clave: 'nit', etiqueta: 'NIT Cliente', ancho: 120, tipo: 'texto', sql: 'r.Nit', orden: 'r.Nit' },
  { clave: 'razonSocial', etiqueta: 'Razón Social', ancho: 180, tipo: 'texto', sql: 'mc.`Razón social`', orden: 'mc.`Razón social`' },
  { clave: 'formaDePago', etiqueta: 'Forma de Pago', ancho: 120, tipo: 'formaPago', orden: 's.`Forma De Pago`' },
  { clave: 'horaFinal', etiqueta: 'Hora Final', ancho: 140, tipo: 'fecha', sql: 's.`Hora Final`', orden: 's.`Hora Final`' },
  { clave: 'duracion', etiqueta: 'Duración', ancho: 100, tipo: 'texto', sql: 's.`Duración`', orden: 's.`Duración`' },
  { clave: 'totalHora', etiqueta: 'Total Hora', ancho: 100, tipo: 'texto', sql: 's.`Total Hora`', orden: 's.`Total Hora`' },
  { clave: 'grupoDtjo', etiqueta: 'Grupo Dtjo', ancho: 110, tipo: 'texto', sql: 's.`Grupo Dtjo`', orden: 's.`Grupo Dtjo`' },
  { clave: 'muelle', etiqueta: 'Muelle', ancho: 90, tipo: 'texto', sql: 's.Muelle', orden: 's.Muelle' },
  { clave: 'etapa', etiqueta: 'Etapa / Bodega', ancho: 120, tipo: 'texto', sql: 's.Etapa', orden: 's.Etapa' },
  { clave: 'origen', etiqueta: 'Origen', ancho: 150, tipo: 'texto', sql: 's.Origen', orden: 's.Origen' },
  { clave: 'destino', etiqueta: 'Destino', ancho: 150, tipo: 'texto', sql: 's.Destino', orden: 's.Destino' },
  { clave: 'manifiesto', etiqueta: 'Manifiesto', ancho: 120, tipo: 'texto', sql: 's.Manifiesto', orden: 's.Manifiesto' },
  { clave: 'remolque', etiqueta: 'Remolque', ancho: 100, tipo: 'texto', sql: 's.Remolque', orden: 's.Remolque' },
  { clave: 'auxiliares', etiqueta: 'Auxiliares', ancho: 200, tipo: 'textoLargo', sql: 's.Auxiliares', orden: 's.Auxiliares' },
  { clave: 'fechaTransferencia', etiqueta: 'Fecha Transferencia', ancho: 130, tipo: 'texto', sql: 's.`Fecha Transferencia`', orden: 's.`Fecha Transferencia`' },
  { clave: 'fotoTransferencia', etiqueta: 'Foto Transferencia', ancho: 90, tipo: 'foto', alinear: 'center', sql: 's.`Foto Transferencia`', orden: 's.`Foto Transferencia`' },
  { clave: 'fotoDocumento', etiqueta: 'Foto Documento', ancho: 90, tipo: 'foto', alinear: 'center', sql: 's.`Foto Documento`', orden: 's.`Foto Documento`' },
  { clave: 'notas', etiqueta: 'Notas', ancho: 200, tipo: 'textoLargo', sql: 's.Notas', orden: 's.Notas' },
  { clave: 'observaciones', etiqueta: 'Observaciones', ancho: 200, tipo: 'textoLargo', sql: 's.Observaciones', orden: 's.Observaciones' },
  { clave: 'telefono', etiqueta: 'Teléfono', ancho: 110, tipo: 'texto', sql: 's.Telefono', orden: 's.Telefono' },
  { clave: 'proveedorTexto', etiqueta: 'Proveedor Texto', ancho: 160, tipo: 'texto', sql: 's.`Proveedor Texto`', orden: 's.`Proveedor Texto`' }
];

const POR_CLAVE = new Map(CATALOGO.map(c => [c.clave, c]));

// Lo que la pantalla necesita para pintar (sin SQL).
function catalogoPublico() {
  return CATALOGO.map(({ clave, etiqueta, ancho, tipo, alinear, defecto, calculada }) =>
    ({ clave, etiqueta, ancho, tipo, alinear: alinear || 'left', defecto: !!defecto, calculada: !!calculada }));
}

// Las calculadas se ordenan con la misma fórmula de calcularTotalesServicio (facturacion.js), escrita en SQL.
// escape: pool.escape, para los nombres de operación del ReteICA.
function ordenCalculado(clave, impuestos, escape) {
  const num = v => Number(v) || 0;
  const base = 'ROUND(IFNULL(s.Cantidad, 0) * IFNULL(s.`Valor Unitario`, 0))';
  const iva = `ROUND(${base} * ${num(impuestos.iva || 0.19)})`;
  const aplica = col => `UPPER(TRIM(IFNULL(${col}, ''))) = 'V'`;
  const rf = `IF(${aplica('r.Retefuente')}, ROUND(${base} * ${num(impuestos.reteFuente || 0.04)}), 0)`;
  const ri = `IF(${aplica('r.ReteIVA')}, ROUND(${iva} * ${num(impuestos.reteIva || 0.15)}), 0)`;
  const casosIca = Object.entries(impuestos.reteIcaMap || {})
    .map(([op, pct]) => `WHEN ${escape(op)} THEN ${num(pct)}`).join(' ');
  const pctIca = casosIca ? `CASE LOWER(TRIM(r.\`Operación\`)) ${casosIca} ELSE 0 END` : '0';
  const rica = `IF(${aplica('r.ReteICA')}, ROUND(${base} * ${pctIca}), 0)`;
  const formulas = {
    valorBase: base,
    iva,
    valorReteFuente: rf,
    valorReteIVA: ri,
    valorReteICA: rica,
    totalPago: `(${base} + ${iva} - ${rf} - ${ri} - ${rica})`
  };
  return formulas[clave] || null;
}

function ordenSql(clave, impuestos, escape) {
  const col = POR_CLAVE.get(clave);
  if (!col) return null;
  return col.calculada ? ordenCalculado(clave, impuestos, escape) : col.orden;
}

// Columnas adicionales del SELECT y uniones extra según las columnas pedidas y la de ordenamiento.
function extrasConsulta(clavesPedidas, claveOrden) {
  const pedidas = new Set(clavesPedidas || []);
  const select = [];
  const joins = new Set();
  for (const c of CATALOGO) {
    if (c.sql && pedidas.has(c.clave)) select.push(`${c.sql} AS ${c.clave}`);
    if (c.join && (pedidas.has(c.clave) || c.clave === claveOrden)) joins.add(JOINS[c.join]);
  }
  return { select, joins: [...joins] };
}

module.exports = { VISTA, CATALOGO, catalogoPublico, ordenSql, extrasConsulta };

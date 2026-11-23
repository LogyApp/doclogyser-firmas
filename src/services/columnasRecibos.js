// Catálogo de columnas de la tabla de Facturación → Recibos. Cada usuario escoge de aquí las que ve, su orden,
// etiqueta y ancho (vistaTablaUsuario.js). El orden del catálogo con defecto: true es la vista predeterminada.
// Las claves son los campos que devuelve /api/recibos.
//   orden: expresión para ordenar al hacer clic en el encabezado. Las que salen de los servicios del recibo
//          (totales, N° servicios y los datos del último servicio) se ordenan con una subconsulta por IdRecibo
//          (índice idx_recibo_hora_covering); las calculadas se arman con ordenCalculado.
//   tipo:  cómo se pinta la celda en la pantalla.
const VISTA = 'facturacion.recibos';

// Dato del último servicio del recibo (el mismo que muestra la tabla)
const ultimoServicio = (expr, join = '') =>
  `(SELECT ${expr} FROM Dynamic_Servicios ds ${join} WHERE ds.IdRecibo = dr.IdRecibo ORDER BY ds.\`Hora Inicio\` DESC, ds.IdServicio DESC LIMIT 1)`;

const CATALOGO = [
  { clave: 'fecha_registro', etiqueta: 'Fecha Registro', ancho: 140, tipo: 'fecha', orden: 'dr.Fecha', defecto: true },
  { clave: 'consecutivo_recibo', etiqueta: 'Consecutivo Recibo', ancho: 140, tipo: 'consecutivo', orden: 'dr.`Consecutivo Recibo`', defecto: true },
  { clave: 'n_servicios', etiqueta: 'N° Servicios', ancho: 100, tipo: 'numero', alinear: 'right', orden: '(SELECT COUNT(*) FROM Dynamic_Servicios ds WHERE ds.IdRecibo = dr.IdRecibo)', defecto: true },
  { clave: 'total', etiqueta: 'Total', ancho: 130, tipo: 'total', calculada: true, defecto: true },
  { clave: 'operacion', etiqueta: 'Operación', ancho: 140, tipo: 'texto', orden: 'dr.`Operación`', defecto: true },
  { clave: 'area', etiqueta: 'Área', ancho: 120, tipo: 'texto', orden: ultimoServicio('ar.AREA', 'LEFT JOIN Config_Area ar ON ar.ID = ds.Area'), defecto: true },
  { clave: 'modalidad', etiqueta: 'Modalidad', ancho: 120, tipo: 'modalidad', orden: 'dr.Modalidad', defecto: true },
  { clave: 'cliente_credito', etiqueta: 'Cliente Crédito', ancho: 160, tipo: 'texto', orden: 'dr.`Cliente a Facturar`', defecto: true },
  { clave: 'categoria', etiqueta: 'Categoría', ancho: 120, tipo: 'texto', orden: 'ccs.Categoria', defecto: true },
  { clave: 'transportadora', etiqueta: 'Transportadora', ancho: 160, tipo: 'texto', orden: ultimoServicio('mt.Transportadora', 'LEFT JOIN Maestro_Transportadora mt ON mt.ID = ds.Transportadora'), defecto: true },
  { clave: 'proveedor', etiqueta: 'Proveedor', ancho: 160, tipo: 'texto', orden: ultimoServicio('COALESCE(mpr.Proveedor, ds.Proveedor)', 'LEFT JOIN Maestro_Proveedor mpr ON mpr.ID = ds.Proveedor'), defecto: true },
  { clave: 'placa', etiqueta: 'Placa', ancho: 100, tipo: 'placa', orden: `COALESCE(${ultimoServicio('mp.Placa', 'LEFT JOIN Maestro_Placas mp ON mp.ID = ds.PL1')}, dr.Placa)`, defecto: true },
  { clave: 'subtotal', etiqueta: 'Subtotal', ancho: 120, tipo: 'monedaFuerte', calculada: true, defecto: true },
  { clave: 'iva', etiqueta: 'IVA', ancho: 110, tipo: 'moneda', calculada: true, defecto: true },
  { clave: 'retefuente', etiqueta: 'Retefuente', ancho: 110, tipo: 'retencion', calculada: true, defecto: true },
  { clave: 'reteiva', etiqueta: 'ReteIVA', ancho: 110, tipo: 'retencion', calculada: true, defecto: true },
  { clave: 'reteica', etiqueta: 'ReteICA', ancho: 110, tipo: 'retencion', calculada: true, defecto: true },
  { clave: 'nit', etiqueta: 'NIT', ancho: 120, tipo: 'texto', orden: 'dr.Nit', defecto: true },
  { clave: 'nombres', etiqueta: 'Nombres / Razón Social', ancho: 180, tipo: 'texto', orden: 'mc.`Razón social`', defecto: true },
  { clave: 'telefono', etiqueta: 'Teléfono', ancho: 120, tipo: 'texto', orden: 'dr.Telefono', defecto: true },
  { clave: 'email', etiqueta: 'Email', ancho: 160, tipo: 'texto', orden: 'dr.Email', defecto: true },
  { clave: 'usuario', etiqueta: 'Usuario', ancho: 150, tipo: 'texto', orden: 'dr.Usuario', defecto: true },
  { clave: 'idrecibo', etiqueta: 'Id Recibo', ancho: 140, tipo: 'id', orden: 'dr.IdRecibo', defecto: true },
  { clave: 'quincena', etiqueta: 'Quincena', ancho: 130, tipo: 'texto', orden: 'mf.Quincena', defecto: true }
];

const POR_CLAVE = new Map(CATALOGO.map(c => [c.clave, c]));

// Lo que la pantalla necesita para pintar (sin SQL).
function catalogoPublico() {
  return CATALOGO.map(({ clave, etiqueta, ancho, tipo, alinear, defecto, calculada }) =>
    ({ clave, etiqueta, ancho, tipo, alinear: alinear || 'left', defecto: !!defecto, calculada: !!calculada }));
}

// Las calculadas se ordenan con la misma fórmula de /api/recibos (subtotal redondeado y de ahí los impuestos),
// escrita en SQL. escape: pool.escape, para los nombres de operación del ReteICA.
function ordenCalculado(clave, impuestos, escape) {
  const num = v => Number(v) || 0;
  const subtotal = 'ROUND(IFNULL((SELECT SUM(COALESCE(ds.Cantidad, 0) * COALESCE(ds.`Valor Unitario`, 0)) FROM Dynamic_Servicios ds WHERE ds.IdRecibo = dr.IdRecibo), 0))';
  const iva = `ROUND(${subtotal} * ${num(impuestos.iva || 0.19)})`;
  const rf = `IF(dr.Retefuente = 'V', ROUND(${subtotal} * ${num(impuestos.reteFuente || 0.04)}), 0)`;
  const ri = `IF(dr.ReteIVA = 'V', ROUND(${iva} * ${num(impuestos.reteIva || 0.15)}), 0)`;
  const casosIca = Object.entries(impuestos.reteIcaMap || {})
    .map(([op, pct]) => `WHEN ${escape(op)} THEN ${num(pct)}`).join(' ');
  const pctIca = casosIca ? `CASE LOWER(TRIM(dr.\`Operación\`)) ${casosIca} ELSE 0 END` : '0';
  const rica = `IF(dr.ReteICA = 'V', ROUND(${subtotal} * ${pctIca}), 0)`;
  const formulas = {
    subtotal,
    iva,
    retefuente: rf,
    reteiva: ri,
    reteica: rica,
    total: `(${subtotal} + ${iva} - ${rf} - ${ri} - ${rica})`
  };
  return formulas[clave] || null;
}

function ordenSql(clave, impuestos, escape) {
  const col = POR_CLAVE.get(clave);
  if (!col) return null;
  return col.calculada ? ordenCalculado(clave, impuestos, escape) : col.orden;
}

module.exports = { VISTA, CATALOGO, catalogoPublico, ordenSql };

const { v4: uuidv4 } = require('uuid');
const pool = require('./db');

const DIACRITICOS = new RegExp('[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g');

function normalizarCategoria(categoria) {
  return String(categoria || '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .trim()
    .toUpperCase();
}

function formatFechaLarga(val) {
  if (!val) return '—';
  const f = new Date(val);
  if (isNaN(f)) return '—';
  return f.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
}

// Resuelve TipoDocumento/Prefijo de Config_Doc_Trabajador según la Categoria del Acta:
// DOTACIÓN -> 22, EPP -> 25, cualquier otra -> 1.
async function resolverTipoDocumentoActa(categoria) {
  const cat = normalizarCategoria(categoria);
  let tipoDocumento = 1;
  if (cat === 'DOTACION') tipoDocumento = 22;
  else if (cat === 'EPP') tipoDocumento = 25;

  const [[cfg]] = await pool.execute(
    'SELECT Prefijo FROM Config_Doc_Trabajador WHERE Id = ? LIMIT 1',
    [tipoDocumento]
  );
  return { tipoDocumento, prefijo: (cfg && cfg.Prefijo) || '' };
}

// Arma el objeto de variables {{...}} que espera la plantilla acta_entrega (Maestro_Plantillas.id_plantilla = 12).
async function construirDatosPlantilla(idActa, { firmaHtml = '' } = {}) {
  const [[acta]] = await pool.execute('SELECT * FROM Dynamic_Actas WHERE IdActa = ?', [idActa]);
  if (!acta) throw new Error('Acta no encontrada');

  const [[vinc]] = await pool.execute(
    'SELECT Trabajador, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [acta.identificacion]
  );
  const trabajadorRaw = (vinc && vinc.Trabajador) || '';
  const partes = String(trabajadorRaw).split(' ** ');
  const nombreTrabajador = partes.length > 1 ? partes[1].trim() : (trabajadorRaw || String(acta.identificacion));
  const fechaIngreso = vinc ? formatFechaLarga(vinc['Fecha de Ingreso']) : '—';

  const [[catCfg]] = await pool.execute(
    'SELECT Tipo_Clausula, Detalle_Clausula, Version_Acta FROM Config_Categoria_Inventario WHERE Categoria = ? LIMIT 1',
    [acta.Categoria]
  );

  const [[userRow]] = await pool.execute('SELECT Nombre FROM Maestro_Usuarios WHERE ID = ?', [acta.Usuario]);
  const elaboradoPor = (userRow && userRow.Nombre) || acta.Usuario;

  const [items] = await pool.execute(
    `SELECT i.Cantidad, i.Nota, a.Articulo
     FROM Dynamic_Actas_Items i
     LEFT JOIN Dynamic_Articulos a ON a.Id = i.IdArticulo
     WHERE i.IdActa = ?
     ORDER BY i.IdElemento`,
    [idActa]
  );

  const filasArticulos = items.length
    ? items.map(it => `<tr><td>${it.Articulo || '—'}</td><td>${it.Cantidad}</td><td>${it.Nota || '—'}</td></tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:#999">Sin artículos registrados</td></tr>';

  const bloqueEvidencia = acta.Url_Evidencia
    ? `<div class="evidencia-card"><div class="evidencia-label">Evidencia</div><img src="${acta.Url_Evidencia}"></div>`
    : '';

  const datos = {
    version_documento: (catCfg && catCfg.Version_Acta) || '',
    categoria:          acta.Categoria,
    id_acta:            acta.IdActa,
    nombre_trabajador:  nombreTrabajador,
    identificacion:     acta.identificacion,
    operacion:          acta.operacion,
    fecha_ingreso:      fechaIngreso,
    fecha_entrega:      formatFechaLarga(acta.Fecha_Entrega),
    bloque_evidencia:   bloqueEvidencia,
    titulo_clausula:    (catCfg && catCfg.Tipo_Clausula) || '',
    detalle_clausula:   (catCfg && catCfg.Detalle_Clausula) || '',
    filas_articulos:    filasArticulos,
    firma_trabajador:   firmaHtml,
    observaciones:      acta.Observaciones || '—',
    elaborado_por:      elaboradoPor,
    fecha_registro:     formatFechaLarga(acta.Fecha_Registro),
  };

  return { acta, items, datos };
}

// Al firmarse el Acta: inserta el registro correspondiente en Maestro_docTrabajador
// según las reglas de la Categoria (DOTACIÓN / EPP / otra).
async function registrarDocumentoTrabajadorActa({ acta, tipoDocumento, prefijo, urlActa }) {
  const [[opRow]] = await pool.execute(
    'SELECT REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? LIMIT 1',
    [acta.operacion]
  );
  const regional = opRow ? opRow.REGIONAL : null;

  const [[vinc]] = await pool.execute(
    'SELECT Estado, `Fecha de Ingreso` FROM `Maestro_Vinculación` WHERE Identificación = ? ORDER BY `Fecha de Ingreso` DESC LIMIT 1',
    [acta.identificacion]
  );
  const estadoVinc = vinc ? vinc.Estado : null;
  const fechaIngreso = vinc ? vinc['Fecha de Ingreso'] : null;

  const cat = normalizarCategoria(acta.Categoria);
  const observaciones = (cat === 'DOTACION' || cat === 'EPP')
    ? 'Generado desde el módulo de Actas de entrega'
    : `${acta.Categoria} - Generado desde el módulo de Actas`;

  // Nota: la columna Url de Maestro_docTrabajador es VIRTUAL GENERATED a partir de Doc
  // (si Doc empieza por "http" queda igual a Doc), por eso no se incluye en el INSERT.
  await pool.execute(
    `INSERT INTO Maestro_docTrabajador
     (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
      TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud,
      Justificacion_Solicitud, FechaRegistro, Usuario, Usuario_Solicitud, Estado_Solicitud)
     VALUES (?, 'PEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NOW(), ?, NULL, NULL)`,
    [
      uuidv4(),
      regional,
      acta.operacion,
      acta.identificacion,
      estadoVinc,
      fechaIngreso,
      String(tipoDocumento),
      prefijo,
      urlActa,
      observaciones,
      acta.Usuario,
    ]
  );
}

// Resuelve la Operación_Principal de la Regional a la que pertenece una Operación,
// vía Maestro_Operaciones -> Config_Regionales. Devuelve null si no aplica.
async function resolverOperacionPrincipal(operacion, executor = pool) {
  const [[opRow]] = await executor.execute(
    'SELECT REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? LIMIT 1',
    [operacion]
  );
  if (!opRow || !opRow.REGIONAL) return null;

  const [[regRow]] = await executor.execute(
    'SELECT Operacion_Principal FROM Config_Regionales WHERE Regional = ? LIMIT 1',
    [opRow.REGIONAL]
  );
  return (regRow && regRow.Operacion_Principal) || null;
}

// Stock actual (SUM(Cantidad) en Dynamic_Kardex) de un artículo en una Operación puntual.
// Acepta un `executor` opcional (una conn de transacción) para leer cambios aún no confirmados.
async function stockEnOperacion(operacion, idArticulo, executor = pool) {
  const [[row]] = await executor.execute(
    'SELECT IFNULL(SUM(Cantidad), 0) AS stock FROM Dynamic_Kardex WHERE `Operación` = ? AND IdArticulo = ?',
    [operacion, idArticulo]
  );
  return Number(row.stock) || 0;
}

// Calcula el stock disponible de un artículo para una Operación de Acta, con reglas de:
// 1) Si hay stock en la Operación, ese es el disponible principal.
// 2) Si no, se busca la Operación_Principal de la Regional (Config_Regionales) como respaldo.
// 3) "Disponible" mostrado en UI = suma de ambos, salvo que sean la misma Operación (evita duplicar).
async function calcularStockActa(operacion, idArticulo, executor = pool) {
  const operacionPrincipal = await resolverOperacionPrincipal(operacion, executor);
  const stockOperacion = await stockEnOperacion(operacion, idArticulo, executor);

  const esMismaOperacion = operacionPrincipal && operacionPrincipal === operacion;
  const stockOperacionPrincipal = (operacionPrincipal && !esMismaOperacion)
    ? await stockEnOperacion(operacionPrincipal, idArticulo, executor)
    : 0;

  const disponible = esMismaOperacion
    ? stockOperacion
    : stockOperacion + stockOperacionPrincipal;

  return {
    operacionPrincipal,
    stockOperacion,
    stockOperacionPrincipal,
    disponible,
  };
}

// Misma lógica que calcularStockActa pero en bloque para todos los artículos de una Categoria,
// pensado para pintar "Disponible: N" en el modal de selección sin hacer N consultas.
async function calcularStockCategoria(operacion, categoria) {
  const operacionPrincipal = await resolverOperacionPrincipal(operacion);
  const esMismaOperacion = operacionPrincipal && operacionPrincipal === operacion;

  const [rowsOperacion] = await pool.execute(
    `SELECT k.IdArticulo, IFNULL(SUM(k.Cantidad), 0) AS stock
     FROM Dynamic_Kardex k
     JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
     WHERE k.\`Operación\` = ? AND a.Categoria = ?
     GROUP BY k.IdArticulo`,
    [operacion, categoria]
  );
  const stockOperacionMap = {};
  rowsOperacion.forEach(r => { stockOperacionMap[r.IdArticulo] = Number(r.stock) || 0; });

  let stockPrincipalMap = {};
  if (operacionPrincipal && !esMismaOperacion) {
    const [rowsPrincipal] = await pool.execute(
      `SELECT k.IdArticulo, IFNULL(SUM(k.Cantidad), 0) AS stock
       FROM Dynamic_Kardex k
       JOIN Dynamic_Articulos a ON a.Id = k.IdArticulo
       WHERE k.\`Operación\` = ? AND a.Categoria = ?
       GROUP BY k.IdArticulo`,
      [operacionPrincipal, categoria]
    );
    rowsPrincipal.forEach(r => { stockPrincipalMap[r.IdArticulo] = Number(r.stock) || 0; });
  }

  const idsArticulo = new Set([...Object.keys(stockOperacionMap), ...Object.keys(stockPrincipalMap)].map(Number));
  const resultado = {};
  idsArticulo.forEach(id => {
    const stockOperacion = stockOperacionMap[id] || 0;
    const stockOperacionPrincipal = stockPrincipalMap[id] || 0;
    resultado[id] = {
      stockOperacion,
      stockOperacionPrincipal,
      disponible: esMismaOperacion ? stockOperacion : stockOperacion + stockOperacionPrincipal,
    };
  });

  return { operacionPrincipal, stock: resultado };
}

// Condicion (Definitivo / Recuperable / otra) de una Categoria, según Config_Categoria_Inventario.
async function resolverCondicionCategoria(categoria) {
  const [[row]] = await pool.execute(
    'SELECT Condicion FROM Config_Categoria_Inventario WHERE Categoria = ? LIMIT 1',
    [categoria]
  );
  return (row && row.Condicion) || null;
}

// Inserta un único movimiento de Kardex para un ítem del Acta.
async function insertarMovimientoKardexActa(conn, acta, item, regional, operacion, cantidad, valorUnitario) {
  await conn.execute(
    `INSERT INTO Dynamic_Kardex
     (IdKardex, FechaMovimiento, TipoMovimiento, Regional, \`Operación\`, \`OperaciónDestino\`,
      Categoria, IdArticulo, Cantidad, UsuarioAsignado, Acta, ValorUnitario,
      UsuarioRegistro, Observaciones, FechaRegistro)
     VALUES (?, ?, 'ASIGNACION', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      uuidv4().replace(/-/g, ''),
      acta.Fecha_Registro,
      regional,
      operacion,
      acta.Categoria,
      item.IdArticulo,
      cantidad,
      String(acta.identificacion),
      String(acta.IdActa),
      valorUnitario,
      acta.Usuario,
      acta.Observaciones || null,
    ]
  );
}

// Inserta en Dynamic_Kardex el/los movimiento(s) ASIGNACION por cada ítem del Acta, dentro de
// la misma transacción de creación/edición. Solo aplica si la Condicion de la Categoria es
// Definitivo (resta); cualquier otro caso (Recuperable, "No aplica", etc.) no toca el Kardex.
//
// El descuento se reparte entre las dos operaciones que respaldan el "Disponible" mostrado en
// el formulario: primero se descuenta lo que haya en la Operación propia del trabajador, y si
// la cantidad pedida supera ese stock, el faltante se descuenta de la Operación Principal de
// respaldo de la Regional — generando un segundo movimiento de Kardex cuando corresponda. Así
// el stock real por Operación nunca queda negativo aunque el "Disponible" combinado sí alcance.
async function registrarKardexActa({ conn, acta, items }) {
  const condicion = await resolverCondicionCategoria(acta.Categoria);
  if (condicion !== 'Definitivo') return;

  const [[opRow]] = await conn.execute(
    'SELECT REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? LIMIT 1',
    [acta.operacion]
  );
  const regional = opRow ? opRow.REGIONAL : null;

  const operacionPrincipal = await resolverOperacionPrincipal(acta.operacion, conn);
  const hayRespaldo = !!(operacionPrincipal && operacionPrincipal !== acta.operacion);

  let regionalPrincipal = regional;
  if (hayRespaldo) {
    const [[opPrincipalRow]] = await conn.execute(
      'SELECT REGIONAL FROM Maestro_Operaciones WHERE OPERACIÓN = ? LIMIT 1',
      [operacionPrincipal]
    );
    regionalPrincipal = opPrincipalRow ? opPrincipalRow.REGIONAL : regional;
  }

  for (const item of items) {
    const [[artRow]] = await conn.execute('SELECT Costo FROM Dynamic_Articulos WHERE Id = ? LIMIT 1', [item.IdArticulo]);
    const valorUnitario = (artRow && artRow.Costo) || 0;

    const cantidadTotal = Math.abs(item.Cantidad);
    const stockPropio = Math.max(await stockEnOperacion(acta.operacion, item.IdArticulo, conn), 0);

    const cantidadPropia = Math.min(cantidadTotal, stockPropio);
    const cantidadRespaldo = cantidadTotal - cantidadPropia;

    if (cantidadPropia > 0) {
      await insertarMovimientoKardexActa(conn, acta, item, regional, acta.operacion, -cantidadPropia, valorUnitario);
    }

    if (cantidadRespaldo > 0) {
      if (hayRespaldo) {
        await insertarMovimientoKardexActa(conn, acta, item, regionalPrincipal, operacionPrincipal, -cantidadRespaldo, valorUnitario);
      } else {
        // No hay Operación Principal de respaldo distinta: se registra igual contra la
        // Operación propia (puede quedar en negativo si de verdad no había stock suficiente).
        await insertarMovimientoKardexActa(conn, acta, item, regional, acta.operacion, -cantidadRespaldo, valorUnitario);
      }
    }
  }
}

module.exports = {
  normalizarCategoria,
  resolverTipoDocumentoActa,
  construirDatosPlantilla,
  registrarDocumentoTrabajadorActa,
  calcularStockActa,
  calcularStockCategoria,
  resolverCondicionCategoria,
  registrarKardexActa,
};

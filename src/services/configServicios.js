const pool = require('./db');

// ── Ajustes de los formularios de Recibo y Servicio por Operación (Config_Servicios) ──
// migraciones/2026-10-27_config_servicios.sql. Si una operación no tiene filas, los formularios
// funcionan como siempre. Para cada campo gana la fila más específica:
// Operación + Modalidad → Operación → Modalidad → fila por defecto (operación vacía).

// Campos que se pueden ajustar. tipo 'lista' = se escoge de un catálogo (datos_habilitados);
// 'busqueda' = se busca en un maestro grande (sin datos_habilitados ni valor por defecto);
// 'archivo' = adjunto; 'texto' = valor libre. bodyKey = nombre del campo en el formulario/API.
const CAMPOS = {
  Recibo: [
    // Modalidad: modalidades permitidas en la operación y la que llega escogida (fila sin modalidad)
    { columna: 'Modalidad', etiqueta: 'Modalidad', tipo: 'lista', catalogo: 'modalidad', bodyKey: 'modalidad' },
    { columna: 'Cliente a Facturar', etiqueta: 'Cliente a Facturar', tipo: 'lista', catalogo: 'clienteCredito', bodyKey: 'clienteAFacturar' },
    { columna: 'Categoria', etiqueta: 'Categoría', tipo: 'texto', bodyKey: 'categoria' },
    { columna: 'Telefono', etiqueta: 'Teléfono', tipo: 'texto', bodyKey: 'telefono' },
    { columna: 'Email', etiqueta: 'Email', tipo: 'texto', bodyKey: 'email' },
    { columna: 'Observaciones', etiqueta: 'Observaciones', tipo: 'texto', bodyKey: 'observaciones' },
  ],
  Servicio: [
    { columna: 'Area', etiqueta: 'Área', tipo: 'lista', catalogo: 'area', bodyKey: 'area' },
    { columna: 'Actividad', etiqueta: 'Actividad', tipo: 'lista', catalogo: 'actividad', bodyKey: 'actividad' },
    { columna: 'Transportadora', etiqueta: 'Transportadora', tipo: 'busqueda', bodyKey: 'transportadora' },
    { columna: 'Vehiculo', etiqueta: 'Vehículo', tipo: 'lista', catalogo: 'vehiculo', bodyKey: 'vehiculo' },
    { columna: 'Proveedor', etiqueta: 'Proveedor', tipo: 'busqueda', bodyKey: 'proveedor' },
    { columna: 'PL1', etiqueta: 'Placa', tipo: 'busqueda', bodyKey: 'pl1' },
    { columna: 'Remolque', etiqueta: 'Remolque', tipo: 'texto', bodyKey: 'remolque' },
    { columna: 'Unidad', etiqueta: 'Unidad', tipo: 'lista', catalogo: 'unidad', bodyKey: 'unidad' },
    { columna: 'Cantidad', etiqueta: 'Cantidad', tipo: 'texto', bodyKey: 'cantidad' },
    { columna: 'Valor Unitario', etiqueta: 'Valor Unitario', tipo: 'texto', bodyKey: 'valorUnitario' },
    { columna: 'Origen', etiqueta: 'Origen', tipo: 'texto', bodyKey: 'origen' },
    { columna: 'Destino', etiqueta: 'Destino', tipo: 'texto', bodyKey: 'destino' },
    { columna: 'Manifiesto', etiqueta: 'Manifiesto', tipo: 'texto', bodyKey: 'manifiesto' },
    { columna: 'Etapa', etiqueta: 'Etapa', tipo: 'texto', bodyKey: 'etapa' },
    { columna: 'Muelle', etiqueta: 'Muelle', tipo: 'texto', bodyKey: 'muelle' },
    { columna: 'Hora Inicio', etiqueta: 'Hora Inicio', tipo: 'texto', bodyKey: 'horaInicio' },
    { columna: 'Duración', etiqueta: 'Duración', tipo: 'lista', catalogo: 'duracion', bodyKey: 'duracion' },
    { columna: 'Grupo Dtjo', etiqueta: 'Grupo Dtjo', tipo: 'lista', catalogo: 'grupoDtjo', bodyKey: 'grupoDtjo' },
    { columna: 'Auxiliares', etiqueta: 'Auxiliares', tipo: 'busqueda', bodyKey: 'auxiliares' },
    { columna: 'Notas', etiqueta: 'Notas', tipo: 'texto', bodyKey: 'notas' },
    { columna: 'Foto Documento', etiqueta: 'Foto Documento', tipo: 'archivo', bodyKey: 'fotoDocumento' },
    { columna: 'Foto Evidencia', etiqueta: 'Foto Evidencia', tipo: 'archivo', bodyKey: 'fotoEvidencia' },
    { columna: 'Telefono', etiqueta: 'Teléfono', tipo: 'texto', bodyKey: 'telefono' },
    { columna: 'Observaciones', etiqueta: 'Observaciones', tipo: 'texto', bodyKey: 'observaciones' },
  ],
};

const SECCIONES = Object.keys(CAMPOS);
const MODALIDADES = ['RECAUDO', 'CREDITO'];

function normalizar(valor) {
  return String(valor == null ? '' : valor).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function lista(texto) {
  return String(texto || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function campoDe(seccion, columna) {
  return (CAMPOS[seccion] || []).find((c) => normalizar(c.columna) === normalizar(columna)) || null;
}

function vacio(valor) {
  return valor === undefined || valor === null || String(valor).trim() === '';
}

// Datos del recibo por los que se puede condicionar un campo ("mostrar solo si"), como el Show_If
// de AppSheet ([IdRecibo].[Cliente a Facturar]="COLTANQUES"). clave = dato en el contexto.
const CONDICIONES = {
  'Cliente a Facturar': { clave: 'clienteAFacturar', catalogo: 'clienteCredito' },
};

// ¿La fila aplica para este recibo? Sin condición siempre aplica.
function cumpleCondicion(fila, contexto) {
  const condicion = CONDICIONES[String(fila.condicion_campo || '').trim()];
  if (!condicion) return true;
  const valores = lista(fila.condicion_valores);
  if (!valores.length) return true;
  const actual = normalizar((contexto || {})[condicion.clave]);
  return !!actual && valores.some((v) => normalizar(v) === actual);
}

// Reglas de cada campo para una Operación y Modalidad, según el rol de quien llena el formulario:
// { [columna]: { etiqueta, visible, obligatorio, habilitados: [], defecto, paraRol } }
// visible ya considera el rol (si el campo es para otros roles, no aparece) y la condición
// ("mostrar solo si"): si el recibo no la cumple, el campo no aparece, no es obligatorio y no toma
// valor por defecto. contexto: datos del recibo, ej. { clienteAFacturar }.
async function resolverConfig({ seccion, operacion, modalidad, rol, contexto = {} }) {
  let filas = [];
  try {
    [filas] = await pool.execute(
      'SELECT * FROM Config_Servicios WHERE seccion = ? AND operacion IN (?, \'\')',
      [seccion, operacion || '']
    );
  } catch (err) {
    console.error('[configServicios] No se pudo leer Config_Servicios; formularios sin ajustes:', err.message);
    return {};
  }
  const mod = String(modalidad || '').toUpperCase();
  const prioridad = (f) => (f.operacion ? 2 : 0) + (f.modalidad ? 1 : 0);
  const elegidas = {};
  filas
    .filter((f) => !f.modalidad || String(f.modalidad).toUpperCase() === mod)
    .forEach((f) => {
      const campo = campoDe(seccion, f.columna_origen);
      if (!campo) return;
      const actual = elegidas[campo.columna];
      if (!actual || prioridad(f) > prioridad(actual)) elegidas[campo.columna] = f;
    });

  const rolNorm = normalizar(rol);
  const config = {};
  Object.entries(elegidas).forEach(([columna, f]) => {
    const campo = campoDe(seccion, columna);
    const roles = lista(f.rol);
    const paraRol = !roles.length || roles.some((r) => normalizar(r) === rolNorm);
    const aplica = cumpleCondicion(f, contexto);
    config[columna] = {
      etiqueta: String(f.etiqueta_columna || '').trim() || campo.etiqueta,
      visible: Number(f.visible) === 1 && paraRol && aplica,
      obligatorio: Number(f.obligatorio) === 1 && aplica,
      habilitados: campo.tipo === 'lista' ? lista(f.datos_habilitados) : [],
      defecto: aplica && (campo.tipo === 'lista' || campo.tipo === 'texto') ? String(f.valor_defecto || '').trim() : '',
      paraRol,
      tipo: campo.tipo,
      bodyKey: campo.bodyKey,
    };
  });
  return config;
}

// Aplica las reglas a los datos que llegan a la API (body con los bodyKey del formulario).
// - crear: los campos vacíos con valor por defecto lo toman (también los que el rol no ve).
// - obligatorio: el campo visible no puede quedar vacío (en edición cuenta el valor guardado).
// - datos_habilitados: el valor debe estar en la lista; en edición se acepta el valor que ya
//   tenía guardado aunque hoy no esté habilitado (temporadas).
// anteriores: valores guardados por bodyKey (edición). archivos: { bodyKey: true } si hay adjunto.
// config: reglas ya resueltas (para no consultarlas de nuevo en cada fila de la carga masiva).
// soloPresentes: solo se revisan los campos que trae body (la carga masiva no tiene todos).
// Devuelve null si todo está bien o el mensaje de error.
async function aplicarConfig({ seccion, operacion, modalidad, rol, body, anteriores = null, archivos = {}, crear = true, prefijo = '', config = null, soloPresentes = false, contexto = {} }) {
  if (!config) config = await resolverConfig({ seccion, operacion, modalidad, rol, contexto });
  for (const [columna, c] of Object.entries(config)) {
    const key = c.bodyKey;
    if (soloPresentes && !Object.prototype.hasOwnProperty.call(body, key)) continue;
    const anterior = anteriores ? anteriores[key] : undefined;
    if (crear && c.defecto && vacio(body[key])) body[key] = c.defecto;

    if (c.tipo === 'archivo') {
      if (c.visible && c.obligatorio && !archivos[key] && vacio(anterior)) {
        return `${prefijo}"${c.etiqueta}" es obligatorio en la operación ${operacion}.`;
      }
      continue;
    }

    const valor = (body[key] !== undefined) ? body[key] : anterior;
    if (c.visible && c.obligatorio && vacio(valor)) {
      return `${prefijo}"${c.etiqueta}" es obligatorio en la operación ${operacion}.`;
    }
    if (c.habilitados.length && !vacio(valor)) {
      const permitido = c.habilitados.some((h) => normalizar(h) === normalizar(valor));
      const igualAnterior = !vacio(anterior) && normalizar(anterior) === normalizar(valor);
      if (!permitido && !igualAnterior) {
        return `${prefijo}El valor "${valor}" no está habilitado en "${c.etiqueta}" para la operación ${operacion}.`;
      }
    }
  }
  return null;
}

// ¿El campo se muestra aunque la modalidad normalmente no lo use? (Manifiesto y Teléfono del
// servicio son de CREDITO, pero una operación puede habilitarlos en RECAUDO).
function visibleEnConfig(config, columna) {
  return !!(config[columna] && config[columna].visible);
}

// Opciones de un catálogo para la pestaña Ajustes Servicios: [{ valor, texto }]
async function opcionesCatalogo(catalogo, operacion) {
  const op = String(operacion || '').trim();
  switch (catalogo) {
    case 'area': {
      const [r] = await pool.execute(
        `SELECT ID AS valor, AREA AS texto FROM Config_Area ${op ? 'WHERE `OPERACIÓN` = ?' : ''} ORDER BY AREA`,
        op ? [op] : []
      );
      return r.map((x) => ({ valor: String(x.valor), texto: `${x.valor} · ${x.texto}` }));
    }
    case 'actividad': {
      const [r] = await pool.execute(
        `SELECT ID AS valor, Actividad AS texto FROM Config_Actividad ${op ? 'WHERE `Operación` = ?' : ''} ORDER BY Actividad`,
        op ? [op] : []
      );
      return r.map((x) => ({ valor: String(x.valor), texto: `${x.valor} · ${x.texto}` }));
    }
    case 'vehiculo': {
      const [r] = await pool.execute('SELECT Vehiculo AS valor FROM Config_Vehiculo ORDER BY Vehiculo');
      return r.map((x) => ({ valor: x.valor, texto: x.valor }));
    }
    case 'unidad': {
      const [r] = await pool.execute('SELECT Unidad AS valor FROM Config_Unidad ORDER BY Unidad');
      return r.map((x) => ({ valor: x.valor, texto: x.valor }));
    }
    case 'duracion': {
      const [r] = await pool.execute('SELECT `Duración` AS valor FROM `Config_Duración` ORDER BY Tiempo');
      return r.map((x) => ({ valor: x.valor, texto: x.valor }));
    }
    case 'clienteCredito': {
      const [r] = await pool.execute('SELECT DISTINCT `Cliente a Facturar` AS valor FROM Maestro_Clientes_Credito WHERE `Cliente a Facturar` IS NOT NULL ORDER BY `Cliente a Facturar`');
      return r.map((x) => ({ valor: x.valor, texto: x.valor }));
    }
    case 'modalidad':
      return MODALIDADES.map((m) => ({ valor: m, texto: m }));
    case 'grupoDtjo':
      return [{ valor: 'GRUPAL', texto: 'GRUPAL' }, { valor: 'INDIVIDUAL', texto: 'INDIVIDUAL' }];
    default:
      return [];
  }
}

// Permisos de la pestaña Ajustes Servicios (Config_Parametros facturacion / Ajustes_Servicios).
// Quién ve la pestaña lo decide Maestro_Menu (Sección Ajustes_Servicios).
const P_EDITAR = 'Roles que pueden crear y editar ajustes de servicios';
const P_ELIMINAR = 'Roles que pueden eliminar ajustes de servicios';
const DEFAULTS_PERMISOS = { [P_EDITAR]: 'Facturación, Sistema', [P_ELIMINAR]: 'Sistema' };

async function permisosAjustesServicios(rol) {
  const mapa = { ...DEFAULTS_PERMISOS };
  try {
    const [rows] = await pool.execute(
      "SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'facturacion' AND Seccion = 'Ajustes_Servicios'"
    );
    rows.forEach((r) => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
  } catch (err) {
    console.error('[configServicios] No se pudieron leer los permisos de Ajustes Servicios:', err.message);
  }
  const rolNorm = normalizar(rol);
  const enLista = (texto) => !!rolNorm && lista(texto).some((r) => normalizar(r) === rolNorm);
  return { editar: enLista(mapa[P_EDITAR]), eliminar: enLista(mapa[P_ELIMINAR]) };
}

module.exports = {
  CAMPOS, SECCIONES, MODALIDADES,
  CONDICIONES, campoDe, resolverConfig, aplicarConfig, visibleEnConfig, opcionesCatalogo, normalizar, lista,
  permisosAjustesServicios,
};

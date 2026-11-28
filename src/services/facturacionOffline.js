const pool = require('./db');

// ── Facturación › registro sin conexión (Recibos y Servicios) ────────────────
// Los líderes en zonas con mala señal guardan Recibos y Servicios en el celular; cuando
// vuelve la conexión la pantalla los sube con:
//   idOffline     código único creado en el celular (evita duplicados si se reintenta)
//   fechaCaptura  fecha y hora (Bogotá) en que se guardó en el celular
//
// Parámetros: Config_Parametros  Modulo = 'facturacion', Seccion = 'Offline'.
// Sin las filas el modo queda apagado (comportamiento anterior).
const MODULO = 'facturacion';
const SECCION = 'Offline';

const P = {
  HABILITAR:          'Habilitar registro sin conexión',
  ACEPTAR_BLOQUEADA:  'Aceptar servicios sin conexión en quincena bloqueada',
  DIAS_MAXIMOS:       'Días máximos para subir un registro sin conexión',
  DIAS_CATALOGO:      'Días de historial para los catálogos sin conexión',
};

const DEFAULTS = {
  [P.HABILITAR]:         '0',
  [P.ACEPTAR_BLOQUEADA]: '1',
  [P.DIAS_MAXIMOS]:      '7',
  [P.DIAS_CATALOGO]:     '90',
};

const TTL_MS = 60 * 1000;
let cache = { t: 0, data: null };

function normalizar(txt) {
  return (txt || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

async function obtenerParametros() {
  if (cache.data && Date.now() - cache.t < TTL_MS) return cache.data;
  try {
    const [rows] = await pool.execute(
      'SELECT `Concepto`, `Parametro` FROM `Config_Parametros` WHERE `Modulo` = ? AND `Seccion` = ?',
      [MODULO, SECCION]
    );
    const mapa = {};
    rows.forEach(r => { mapa[r.Concepto] = r.Parametro == null ? '' : String(r.Parametro); });
    cache = { t: Date.now(), data: mapa };
    return mapa;
  } catch (err) {
    console.error('[facturacionOffline] No se pudieron leer los parámetros:', err.message);
    return {};
  }
}

function valor(params, concepto) {
  return Object.prototype.hasOwnProperty.call(params || {}, concepto) ? params[concepto] : DEFAULTS[concepto];
}
function activo(params, concepto) {
  return ['1', 'true', 'si', 'yes'].includes(normalizar(valor(params, concepto)));
}
function numero(params, concepto, porDefecto, max) {
  const n = parseInt(valor(params, concepto), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : porDefecto;
}

async function configPantalla() {
  const params = await obtenerParametros();
  return {
    habilitado: activo(params, P.HABILITAR),
    diasMaximos: numero(params, P.DIAS_MAXIMOS, 7, 60),
  };
}

// ── Fechas (hora Bogotá, sin zona) ──
function ahoraBogota() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}:${get('second')}`;
}
function msDe(mysql) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(mysql || '').trim());
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
}

/**
 * Lee idOffline, fechaCaptura y sinConexion del cuerpo de la petición.
 * Con el modo activo la pantalla manda idOffline en todo Recibo/Servicio nuevo (también con
 * internet) para que un reintento no duplique; sinConexion = '1' solo llega cuando el registro
 * se guardó en el celular sin señal y se sube después.
 * Devuelve null si no trae idOffline, { error } si no es válido, o
 * { idOffline, fechaCaptura, sinConexion, aceptarBloqueada }.
 */
async function leerRegistroOffline(body) {
  const idOffline = String((body && body.idOffline) || '').trim();
  if (!idOffline) return null;
  if (!/^[A-Za-z0-9-]{8,40}$/.test(idOffline)) return { error: 'Código del registro sin conexión inválido.' };

  const params = await obtenerParametros();
  if (!activo(params, P.HABILITAR)) return { error: 'El registro sin conexión está desactivado. Vuelva a guardar el registro con internet.' };

  const ahora = ahoraBogota();
  let fechaCaptura = String((body && body.fechaCaptura) || '').trim().replace('T', ' ');
  if (fechaCaptura.length === 16) fechaCaptura += ':00';
  const msCaptura = msDe(fechaCaptura);
  const msAhora = msDe(ahora);
  if (!Number.isFinite(msCaptura)) fechaCaptura = ahora;
  else if (msCaptura > msAhora + 10 * 60 * 1000) fechaCaptura = ahora; // reloj del celular adelantado
  else {
    const dias = numero(params, P.DIAS_MAXIMOS, 7, 60);
    if (msAhora - msCaptura > dias * 86400000) {
      return { error: `Este registro se guardó sin conexión hace más de ${dias} días; ya no se puede subir. Regístrelo de nuevo.` };
    }
  }
  const sinConexion = String((body && body.sinConexion) || '') === '1';
  return { idOffline, fechaCaptura, sinConexion, aceptarBloqueada: sinConexion && activo(params, P.ACEPTAR_BLOQUEADA) };
}

// Registro ya subido con ese idOffline (reintento): devuelve su Id o null
async function idExistente(tabla, columnaId, idOffline) {
  try {
    const [rows] = await pool.execute(`SELECT \`${columnaId}\` AS id FROM \`${tabla}\` WHERE IdOffline = ? LIMIT 1`, [idOffline]);
    return rows.length ? rows[0].id : null;
  } catch (err) {
    if (err && err.code === 'ER_BAD_FIELD_ERROR') {
      throw new Error('Falta ejecutar la migración del registro sin conexión (columna IdOffline).');
    }
    throw err;
  }
}

// ── Catálogos para trabajar sin conexión ──
// Lo usado en los últimos N días en las operaciones del usuario: placas, transportadoras,
// proveedores, clientes y auxiliares activos. Con la misma forma que las búsquedas del formulario.
const TOPE = 3000;

async function catalogos(acceso) {
  const params = await obtenerParametros();
  const dias = numero(params, P.DIAS_CATALOGO, 90, 365);
  const ops = acceso.sinFiltro ? null : (acceso.operacionesFiltro || []);
  if (ops && !ops.length) return { generado: ahoraBogota(), dias, transportadoras: [], proveedores: [], placas: [], clientes: [], auxiliares: {} };

  const filtroOps = ops ? `AND r.\`Operación\` IN (${ops.map(() => '?').join(',')})` : '';
  const pOps = ops || [];
  const base = `FROM Dynamic_Servicios s JOIN Dynamic_Recibos r ON r.IdRecibo = s.IdRecibo
                WHERE s.Fecha >= NOW() - INTERVAL ${dias} DAY ${filtroOps}`;

  const [[transportadoras], [placas], [provRaw], [clientes]] = await Promise.all([
    pool.execute(
      `SELECT t.ID AS id, t.Transportadora AS transportadora
       FROM (SELECT s.Transportadora AS idT, COUNT(*) n ${base} AND s.Transportadora IS NOT NULL GROUP BY s.Transportadora ORDER BY n DESC LIMIT ${TOPE}) u
       JOIN Maestro_Transportadora t ON t.ID = u.idT
       ORDER BY t.Transportadora`, pOps),
    pool.execute(
      `SELECT mp.ID AS id, mp.Placa AS placa, mp.\`Tipo Cliente\` AS tipoCliente,
              mp.\`Cliente Credito\` AS clienteCredito, mp.Nit AS nit, mc.\`Razón social\` AS razonSocial
       FROM (SELECT s.PL1 AS idP, COUNT(*) n ${base} AND s.PL1 IS NOT NULL GROUP BY s.PL1 ORDER BY n DESC LIMIT ${TOPE}) u
       JOIN Maestro_Placas mp ON mp.ID = u.idP
       LEFT JOIN Maestro_Clientes mc ON mc.\`Código\` = mp.Nit
       ORDER BY mp.Placa`, pOps),
    pool.execute(
      `SELECT s.Proveedor AS lista, COUNT(*) n ${base} AND s.Proveedor IS NOT NULL AND s.Proveedor <> ''
       GROUP BY s.Proveedor ORDER BY n DESC LIMIT ${TOPE}`, pOps),
    pool.execute(
      `SELECT mc.\`Código\` AS codigo, mc.\`Razón social\` AS razonSocial, mc.Telefono AS telefono,
              mc.\`Correo F.E.\` AS correoFE, mc.\`Desc. condicion de pago\` AS condicionPago,
              mc.RTSERVIC AS rtservic, mc.RTIVA AS rtiva, mc.RTICA AS rtica
       FROM (SELECT r.Nit AS nit, COUNT(*) n ${base} AND r.Nit IS NOT NULL GROUP BY r.Nit ORDER BY n DESC LIMIT ${TOPE}) u
       JOIN Maestro_Clientes mc ON mc.\`Código\` = u.nit
       ORDER BY mc.\`Razón social\``, pOps),
  ]);

  // Proveedor guarda una lista de Ids separada por coma
  const idsProv = [...new Set(provRaw.flatMap(r => String(r.lista).split(',').map(x => x.trim()).filter(Boolean)))].slice(0, TOPE);
  let proveedores = [];
  if (idsProv.length) {
    const [rows] = await pool.query('SELECT ID AS id, Proveedor AS proveedor FROM Maestro_Proveedor WHERE ID IN (?) ORDER BY Proveedor', [idsProv]);
    proveedores = rows;
  }

  // Auxiliares activos por operación (mismo criterio que /api/auxiliares/buscar)
  const auxiliares = {};
  const opsAux = ops || [];
  if (opsAux.length) {
    const [rows] = await pool.query(
      "SELECT DISTINCT `Operación` AS operacion, Trabajador AS trabajador FROM `Maestro_Segmentación` WHERE Estado = 'Activo' AND `Operación` IN (?) ORDER BY Trabajador",
      [opsAux]
    );
    rows.forEach(r => { (auxiliares[r.operacion] = auxiliares[r.operacion] || []).push({ trabajador: r.trabajador }); });
  }

  return { generado: ahoraBogota(), dias, transportadoras, proveedores, placas, clientes, auxiliares };
}

module.exports = { P, DEFAULTS, configPantalla, leerRegistroOffline, idExistente, catalogos };

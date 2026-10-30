const pool = require('./db');

// ── Reglas de periodo de los servicios de Facturación ──────────────────────────
// 1. Una sola quincena por recibo: la "Hora Inicio" de todos los servicios de un recibo (RECAUDO
//    o CREDITO) debe caer en la misma Quincena de Maestro_Fechas (Quincena + Año).
// 2. Bloqueos de Bloqueo_Nomina (Modulo 'Facturacion', Datos 'Servicios'): por Forma de Pago y por
//    Operación, Regional o todas (ambas vacías). Con Hasta, bloquean las fechas hasta ese día
//    inclusive; sin Hasta, la Quincena completa. Desde no se tiene en cuenta. Entre las filas que
//    aplican gana la más reciente: un "Desbloquear" posterior abre una excepción.
//    En Forma de Pago 3 solo aplican a los Clientes Crédito con Bloqueo = 1.
// Solo se revisan al crear un servicio o al cambiarle la Hora Inicio (y la quincena también al
// pasarlo a otro recibo); un servicio que ya existe se puede editar, validar o mover sin cambiar
// su Hora Inicio.

const NOMBRE_FORMA_PAGO = { 1: 'Efectivo', 2: 'Transferencia', 3: 'Crédito' };

// 'YYYY-MM-DD HH:MM:SS' en hora de Bogotá (la base guarda la hora local; el driver usa -05:00)
function textoFechaHora(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return new Date(valor.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  }
  return String(valor).replace('T', ' ');
}

function diaDe(valor) {
  const dia = textoFechaHora(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
}

// Quincena de Maestro_Fechas de una fecha: { quincena, anio } o null si la fecha no está
async function quincenaDeFecha(fecha) {
  const dia = diaDe(fecha);
  if (!dia) return null;
  const [r] = await pool.execute('SELECT Quincena, `Año` AS anio FROM Maestro_Fechas WHERE Fecha = ? LIMIT 1', [dia]);
  if (!r.length || !r[0].Quincena) return null;
  return { quincena: String(r[0].Quincena).trim(), anio: Number(r[0].anio) || Number(dia.slice(0, 4)) };
}

function mismaQuincena(a, b) {
  return !!a && !!b && a.quincena === b.quincena && a.anio === b.anio;
}

function textoQuincena(q) {
  return q ? `${q.quincena} ${q.anio}` : 'sin quincena';
}

// Quincena de los servicios que ya tiene el recibo (sin contar el servicio que se edita)
async function quincenaDeRecibo(idRecibo, excluirIdServicio = null) {
  const [r] = await pool.execute(
    `SELECT mf.Quincena, mf.\`Año\` AS anio
     FROM Dynamic_Servicios s
     JOIN Maestro_Fechas mf ON mf.Fecha = DATE(s.\`Hora Inicio\`)
     WHERE s.IdRecibo = ? AND (? IS NULL OR s.IdServicio <> ?)
     ORDER BY s.\`Hora Inicio\` ASC
     LIMIT 1`,
    [idRecibo, excluirIdServicio, excluirIdServicio]
  );
  if (!r.length || !r[0].Quincena) return null;
  return { quincena: String(r[0].Quincena).trim(), anio: Number(r[0].anio) };
}

// Error si la Hora Inicio no es de la misma quincena que la referencia (otro servicio del recibo)
async function errorQuincena(horaInicio, referencia, prefijo = '') {
  if (!referencia) return null;
  const q = await quincenaDeFecha(horaInicio);
  if (!q || mismaQuincena(q, referencia)) return null;
  return `${prefijo}La Hora Inicio (${diaDe(horaInicio)}) es de la quincena ${textoQuincena(q)}, pero los servicios del recibo son de ${textoQuincena(referencia)}. Todos los servicios de un recibo deben ser de la misma quincena.`;
}

async function errorQuincenaRecibo(idRecibo, horaInicio, excluirIdServicio = null, prefijo = '') {
  return errorQuincena(horaInicio, await quincenaDeRecibo(idRecibo, excluirIdServicio), prefijo);
}

// ¿El Cliente Crédito está sujeto a bloqueos? (Maestro_Clientes_Credito.Bloqueo = 1)
async function clienteCreditoBloqueable(clienteAFacturar) {
  if (!clienteAFacturar) return true;
  const [r] = await pool.execute(
    'SELECT Bloqueo FROM Maestro_Clientes_Credito WHERE `Cliente a Facturar` = ? LIMIT 1',
    [String(clienteAFacturar).trim()]
  );
  return !r.length || Number(r[0].Bloqueo) === 1;
}

// Error si el periodo de la fecha está bloqueado para esa Operación/Regional y Forma de Pago
async function errorBloqueo({ fecha, operacion, regional, formaDePago, clienteAFacturar }, prefijo = '') {
  const fp = Number(formaDePago);
  const dia = diaDe(fecha);
  if (![1, 2, 3].includes(fp) || !dia) return null;
  if (fp === 3 && !(await clienteCreditoBloqueable(clienteAFacturar))) return null;

  const q = await quincenaDeFecha(dia);
  const [filas] = await pool.execute(
    `SELECT \`Condición\` AS condicion, \`Operación\` AS operacion, Regional AS regional, Quincena AS quincena,
            DATE_FORMAT(Hasta, '%Y-%m-%d') AS hasta
     FROM Bloqueo_Nomina
     WHERE Modulo = 'Facturacion' AND Datos = 'Servicios' AND Forma_Pago = ?
       AND (
         (\`Operación\` IS NOT NULL AND \`Operación\` <> '' AND \`Operación\` = ?)
         OR ((\`Operación\` IS NULL OR \`Operación\` = '') AND Regional IS NOT NULL AND Regional <> '' AND Regional = ?)
         OR ((\`Operación\` IS NULL OR \`Operación\` = '') AND (Regional IS NULL OR Regional = ''))
       )
       AND (
         (Hasta IS NOT NULL AND ? <= DATE(Hasta))
         OR (Hasta IS NULL AND Quincena IS NOT NULL AND Quincena = ? AND (\`Año\` IS NULL OR \`Año\` = ?))
       )
     ORDER BY Fecha_Registro DESC, ID DESC
     LIMIT 1`,
    [fp, operacion || '', regional || '', dia, q ? q.quincena : '', q ? q.anio : 0]
  );
  if (!filas.length || String(filas[0].condicion).trim().toLowerCase() !== 'bloquear') return null;
  const b = filas[0];
  const periodo = b.hasta ? `hasta el ${b.hasta}` : `la quincena ${b.quincena}`;
  const ambito = b.operacion ? `la operación ${b.operacion}` : b.regional ? `la regional ${b.regional}` : 'todas las operaciones';
  return `${prefijo}Facturación bloqueó los servicios de ${NOMBRE_FORMA_PAGO[fp]} ${periodo} en ${ambito}: no se pueden registrar servicios con fecha ${dia}.`;
}

module.exports = {
  textoFechaHora, diaDe, quincenaDeFecha, mismaQuincena, textoQuincena, quincenaDeRecibo,
  errorQuincena, errorQuincenaRecibo, errorBloqueo,
};

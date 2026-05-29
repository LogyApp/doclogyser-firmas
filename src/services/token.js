const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('./db');

const SECRET = process.env.JWT_SECRET;
const EXPIRY_HOURS = 48;

async function generarToken(tabla, campoFk, idValor) {
  const jti = crypto.randomBytes(32).toString('hex');
  const expiraEn = new Date(Date.now() + EXPIRY_HOURS * 3600 * 1000);

  const token = jwt.sign({ jti, id: idValor }, SECRET, { expiresIn: `${EXPIRY_HOURS}h` });

  await pool.execute(
    `UPDATE \`${tabla}\` SET token_firma = ?, token_expira = ? WHERE \`${campoFk}\` = ?`,
    [jti, expiraEn, idValor]
  );

  return token;
}

async function validarToken(token, tabla, campoFk, idValor) {
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return { valido: false, motivo: 'jwt_invalido' };
  }

  const [rows] = await pool.execute(
    `SELECT token_firma, token_expira FROM \`${tabla}\` WHERE \`${campoFk}\` = ?`,
    [idValor]
  );

  if (!rows.length) return { valido: false, motivo: 'no_encontrado' };

  const fila = rows[0];

  if (fila.token_firma !== payload.jti) return { valido: false, motivo: 'token_no_coincide' };

  if (new Date(fila.token_expira) < new Date()) return { valido: false, motivo: 'expirado' };

  return { valido: true };
}

async function generarTokenAR(idVinculacion) {
  const jti = crypto.randomBytes(32).toString('hex');
  const expiraEn = new Date(Date.now() + EXPIRY_HOURS * 3600 * 1000);
  const token = jwt.sign({ jti, id: idVinculacion }, SECRET, { expiresIn: `${EXPIRY_HOURS}h` });
  await pool.execute(
    'UPDATE `Maestro_Vinculación` SET token_firma_ar = ?, token_firma_ar_expira = ? WHERE `Id Vinculación` = ?',
    [jti, expiraEn, idVinculacion]
  );
  return token;
}

async function validarTokenAR(token, idVinculacion) {
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return { valido: false, motivo: 'jwt_invalido' };
  }
  const [rows] = await pool.execute(
    'SELECT token_firma_ar, token_firma_ar_expira FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ?',
    [idVinculacion]
  );
  if (!rows.length) return { valido: false, motivo: 'no_encontrado' };
  const fila = rows[0];
  if (fila.token_firma_ar !== payload.jti) return { valido: false, motivo: 'token_no_coincide' };
  if (new Date(fila.token_firma_ar_expira) < new Date()) return { valido: false, motivo: 'expirado' };
  return { valido: true };
}

const PZ_HOURS = 120;

async function generarTokenPZ(idPz, columnaToken, columnaExpira) {
  const jti = crypto.randomBytes(32).toString('hex');
  const expiraEn = new Date(Date.now() + PZ_HOURS * 3600 * 1000);
  const token = jwt.sign({ jti, id: idPz }, SECRET, { expiresIn: `${PZ_HOURS}h` });
  await pool.execute(
    `UPDATE \`Maestro_pazysalvo\` SET \`${columnaToken}\` = ?, \`${columnaExpira}\` = ? WHERE id = ?`,
    [jti, expiraEn, idPz]
  );
  return token;
}

async function validarTokenPZ(token, idPz, columnaToken, columnaExpira) {
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return { valido: false, motivo: 'jwt_invalido' };
  }
  const [rows] = await pool.execute(
    `SELECT \`${columnaToken}\`, \`${columnaExpira}\` FROM \`Maestro_pazysalvo\` WHERE id = ?`,
    [idPz]
  );
  if (!rows.length) return { valido: false, motivo: 'no_encontrado' };
  const fila = rows[0];
  if (fila[columnaToken] !== payload.jti) return { valido: false, motivo: 'token_no_coincide' };
  if (new Date(fila[columnaExpira]) < new Date()) return { valido: false, motivo: 'expirado' };
  return { valido: true };
}

async function generarTokenCT(idVinculacion) {
  const jti = crypto.randomBytes(32).toString('hex');
  const expiraEn = new Date(Date.now() + EXPIRY_HOURS * 3600 * 1000);
  const token = jwt.sign({ jti, id: idVinculacion }, SECRET, { expiresIn: `${EXPIRY_HOURS}h` });
  await pool.execute(
    'UPDATE `Maestro_Vinculación` SET token_firma_ct = ?, token_firma_ct_expira = ? WHERE `Id Vinculación` = ?',
    [jti, expiraEn, idVinculacion]
  );
  return token;
}

async function validarTokenCT(token, idVinculacion) {
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return { valido: false, motivo: 'jwt_invalido' };
  }
  const [rows] = await pool.execute(
    'SELECT token_firma_ct, token_firma_ct_expira FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ?',
    [idVinculacion]
  );
  if (!rows.length) return { valido: false, motivo: 'no_encontrado' };
  const fila = rows[0];
  if (fila.token_firma_ct !== payload.jti) return { valido: false, motivo: 'token_no_coincide' };
  if (new Date(fila.token_firma_ct_expira) < new Date()) return { valido: false, motivo: 'expirado' };
  return { valido: true };
}

async function generarTokenEMOE(idVinculacion) {
  const jti = crypto.randomBytes(32).toString('hex');
  const expiraEn = new Date(Date.now() + EXPIRY_HOURS * 3600 * 1000);
  const token = jwt.sign({ jti, id: idVinculacion }, SECRET, { expiresIn: `${EXPIRY_HOURS}h` });
  await pool.execute(
    'UPDATE `Maestro_Vinculación` SET token_firma_emoe = ?, token_firma_emoe_expira = ? WHERE `Id Vinculación` = ?',
    [jti, expiraEn, idVinculacion]
  );
  return token;
}

async function validarTokenEMOE(token, idVinculacion) {
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return { valido: false, motivo: 'jwt_invalido' };
  }
  const [rows] = await pool.execute(
    'SELECT token_firma_emoe, token_firma_emoe_expira FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ?',
    [idVinculacion]
  );
  if (!rows.length) return { valido: false, motivo: 'no_encontrado' };
  const fila = rows[0];
  if (fila.token_firma_emoe !== payload.jti) return { valido: false, motivo: 'token_no_coincide' };
  if (new Date(fila.token_firma_emoe_expira) < new Date()) return { valido: false, motivo: 'expirado' };
  return { valido: true };
}

async function generarTokenCRS(idVinculacion) {
  const jti = crypto.randomBytes(32).toString('hex');
  const expiraEn = new Date(Date.now() + EXPIRY_HOURS * 3600 * 1000);
  const token = jwt.sign({ jti, id: idVinculacion }, SECRET, { expiresIn: `${EXPIRY_HOURS}h` });
  await pool.execute(
    'UPDATE `Maestro_Vinculación` SET token_firma_crs = ?, token_firma_crs_expira = ? WHERE `Id Vinculación` = ?',
    [jti, expiraEn, idVinculacion]
  );
  return token;
}

async function validarTokenCRS(token, idVinculacion) {
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return { valido: false, motivo: 'jwt_invalido' };
  }
  const [rows] = await pool.execute(
    'SELECT token_firma_crs, token_firma_crs_expira FROM `Maestro_Vinculación` WHERE `Id Vinculación` = ?',
    [idVinculacion]
  );
  if (!rows.length) return { valido: false, motivo: 'no_encontrado' };
  const fila = rows[0];
  if (fila.token_firma_crs !== payload.jti) return { valido: false, motivo: 'token_no_coincide' };
  if (new Date(fila.token_firma_crs_expira) < new Date()) return { valido: false, motivo: 'expirado' };
  return { valido: true };
}

function reconstruirToken(jti, idVinculacion, expira) {
  if (!jti || !expira) return null;
  const msRestante = new Date(expira).getTime() - Date.now();
  if (msRestante <= 0) return null;
  return jwt.sign({ jti, id: idVinculacion }, SECRET, { expiresIn: Math.floor(msRestante / 1000) });
}

module.exports = { generarToken, validarToken, generarTokenAR, validarTokenAR, generarTokenPZ, validarTokenPZ, generarTokenCT, validarTokenCT, generarTokenEMOE, validarTokenEMOE, generarTokenCRS, validarTokenCRS, reconstruirToken };

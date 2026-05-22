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

module.exports = { generarToken, validarToken };

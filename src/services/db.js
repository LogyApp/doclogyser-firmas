if (!process.env.DB_HOST && !process.env.INSTANCE_UNIX_SOCKET) {
  require('dotenv').config();
}

const mysql = require('mysql2/promise');

// 1. Detección híbrida de conexión (Cloud Run Unix Socket vs TCP local)
const socketPath = process.env.INSTANCE_UNIX_SOCKET ||
  (process.env.INSTANCE_CONNECTION_NAME ? `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}` : null);

// 2. Configuración base del Pool con gestión estricta de recursos
const poolConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // Límite estricto de conexiones por instancia (máx. 5 conexiones por contenedor para Cloud Run)
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_LIMIT, 10) || 5,
  maxIdle: parseInt(process.env.DB_MAX_IDLE, 10) || 5,

  // Liberar conexiones ociosas tras 60s antes de que Cloud SQL o el proxy corten el socket
  idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT, 10) || 60000,

  // Tolerancia de conexión de 30s
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 30000,
  queueLimit: 0,

  // Codificación y zona horaria de Bogotá (-05:00)
  charset: 'utf8mb4',
  timezone: '-05:00',

  // Mantener sockets vivos con sondeo inicial a los 10 segundos
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
};

// 3. Selección dinámica del transporte (Socket vs Host/Port)
if (socketPath) {
  // Conexión Cloud Run directa mediante Unix Socket al Cloud SQL Auth Proxy
  poolConfig.socketPath = socketPath;
  console.log(`[db] Pool MySQL configurado vía Unix Socket: ${socketPath} (Límite: ${poolConfig.connectionLimit})`);
} else {
  // Conexión TCP estándar para desarrollo local o VM intermedia
  poolConfig.host = process.env.DB_HOST || '127.0.0.1';
  poolConfig.port = parseInt(process.env.DB_PORT, 10) || 3306;
  console.log(`[db] Pool MySQL configurado vía TCP: ${poolConfig.host}:${poolConfig.port} (Límite: ${poolConfig.connectionLimit})`);
}

// 4. Instanciación del Pool
const pool = mysql.createPool(poolConfig);

// 5. Gestión del ciclo de vida y captura de errores de conexión
pool.on('connection', (connection) => {
  // Configuración de huso horario en cada conexión física establecida
  connection.query("SET time_zone = '-05:00'");

  // Manejador individual de sockets para evitar que caídas de red o timeouts tumben el proceso
  connection.on('error', (err) => {
    if (['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE'].includes(err.code)) {
      if (process.env.DB_DEBUG === 'true') {
        console.warn(`[db] Socket cerrado o reseteado en segundo plano (${err.code}). El pool renovará la conexión.`);
      }
      return;
    }
    console.error('[db] Error en conexión individual de base de datos:', err.message);
  });
});

// Captura de errores a nivel del pool general
pool.on('error', (err) => {
  console.error('[db] Error no controlado en el pool:', err.message);
});

/**
 * 6. Helper de buenas prácticas para transacciones automáticas.
 * Adquiere una conexión del pool, abre la transacción y garantiza
 * que SIEMPRE se libere (connection.release()) pase lo que pase,
 * ejecutando commit si fue exitosa o rollback si ocurrió un error.
 *
 * @param {Function} callback - async (connection) => { ... }
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rbErr) {
      console.error('[db] Error ejecutando rollback:', rbErr.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

// Adjuntar helper al pool exportado
pool.withTransaction = withTransaction;

module.exports = pool;

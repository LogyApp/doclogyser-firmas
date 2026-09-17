if (!process.env.DB_HOST) {
  require('dotenv').config();
}

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_LIMIT) || 25,
  maxIdle: 10,
  idleTimeout: 60000, // Cerrar conexiones ociosas tras 60s antes de que Cloud SQL las corte
  connectTimeout: 30000, // 30s de tolerancia para el handshake TCP por internet hacia Cloud SQL
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '-05:00',
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000, // 10 segundos
});

// Configurar el huso horario de la sesión en MySQL a Bogotá (-05:00) y proteger contra reseteos de socket
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '-05:00'");
  connection.on('error', (err) => {
    // Si la conexión se pierde en segundo plano mientras está inactiva, evitar ruidos en consola
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      return;
    }
    console.error('[db] Error en conexión individual de base de datos:', err.message);
  });
});

module.exports = pool;

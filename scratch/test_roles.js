require('dotenv').config();
const pool = require('../src/services/db');

async function main() {
  try {
    const [users] = await pool.execute('SELECT DISTINCT Rol FROM Maestro_Usuarios');
    console.log('Roles in Maestro_Usuarios:', users.map(u => u.Rol));

    const [roles] = await pool.execute('SELECT Rol FROM Config_Rol');
    console.log('Roles in Config_Rol:', roles.map(r => r.Rol));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();

const pool = require('../src/services/db');

async function main() {
  console.log('=== Configurando accesos para Sección "Cesantias" en Maestro_Menu_Nomina ===\n');

  const permisos = [
    { seccion: 'Cesantias', rol: 'Nomina', acceso: 1 },
    { seccion: 'Cesantias', rol: 'Sistema', acceso: 1 },
    { seccion: 'Cesantias', rol: 'Juridica', acceso: 1 },
    { seccion: 'Cesantias', rol: 'Contratación', acceso: 1 },
    { seccion: 'Cesantias', rol: 'Asistencial', acceso: 1 },
    { seccion: 'Cesantias', rol: 'Control', acceso: 1 },
    { seccion: 'Cesantias', rol: 'Coordinador', acceso: 3 },
    { seccion: 'Cesantias', rol: 'CoordinadorR', acceso: 2 },
    { seccion: 'Cesantias', rol: 'Auxiliar', acceso: 3 },
    { seccion: 'Cesantias', rol: 'AuxiliarR', acceso: 2 },
  ];

  for (const p of permisos) {
    const [existentes] = await pool.execute(
      'SELECT ID FROM Maestro_Menu_Nomina WHERE `Sección` = ? AND `Rol` = ? LIMIT 1',
      [p.seccion, p.rol]
    );

    if (existentes.length) {
      console.log(`- Permiso ya existente para Rol "${p.rol}" en Sección "${p.seccion}".`);
    } else {
      await pool.execute(
        'INSERT INTO Maestro_Menu_Nomina (`Sección`, `Rol`, `Acceso`) VALUES (?, ?, ?)',
        [p.seccion, p.rol, p.acceso]
      );
      console.log(`+ Permiso agregado: Rol "${p.rol}" -> Sección "${p.seccion}" (Acceso ${p.acceso}).`);
    }
  }

  console.log('\n-> Configuración de menú para Cesantías completada.');
  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});

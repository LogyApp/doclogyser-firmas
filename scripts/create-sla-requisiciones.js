const pool = require('../src/services/db');

async function main() {
  console.log('=== Migración SLA de Requisiciones ===\n');

  // 1. Tabla de periodos de suspensión (detienen el conteo de días SLA)
  console.log('1. Creando tabla Dynamic_Requisiciones_Suspension (si no existe)...');
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS Dynamic_Requisiciones_Suspension (
      Id INT AUTO_INCREMENT PRIMARY KEY,
      IdRequisicion INT NOT NULL,
      fecha_inicio DATETIME NOT NULL,
      fecha_fin DATETIME NULL,
      usuario_inicio VARCHAR(150) NULL,
      usuario_fin VARCHAR(150) NULL,
      KEY idx_requisicion (IdRequisicion)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('   -> Tabla lista.');

  // 2. Requisiciones que ya están SUSPENDIDAS: se abre un periodo desde su última actualización
  //    (no hay historial previo del cambio de estado, es la mejor aproximación disponible)
  console.log('\n2. Abriendo periodos para requisiciones actualmente SUSPENDIDAS...');
  const [result] = await pool.execute(`
    INSERT INTO Dynamic_Requisiciones_Suspension (IdRequisicion, fecha_inicio, usuario_inicio)
    SELECT r.IdRequisicion, COALESCE(r.\`Fecha Actualización\`, r.\`Fecha Requisición\`), 'migracion'
    FROM Dynamic_Requisiciones r
    WHERE UPPER(r.Estado) = 'SUSPENDIDO'
      AND NOT EXISTS (
        SELECT 1 FROM Dynamic_Requisiciones_Suspension s
        WHERE s.IdRequisicion = r.IdRequisicion AND s.fecha_fin IS NULL
      )
  `);
  console.log(`   + Periodos abiertos: ${result.affectedRows}`);

  // 3. Parámetros editables (sección Requisiciones → los edita quien tenga "Editar parametros de Requisiciones")
  console.log('\n3. Verificando parámetros en Config_Parametros...');
  const parametros = [
    { concepto: 'Porcentaje semáforo verde SLA', condicion: 'Porcentaje', valor: '80' },
    { concepto: 'Porcentaje semáforo amarillo SLA', condicion: 'Porcentaje', valor: '50' },
    { concepto: 'Hora de corte inicio conteo SLA', condicion: 'Hora', valor: '12:00' }
  ];
  for (const p of parametros) {
    const [existentes] = await pool.execute(
      "SELECT id FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Requisiciones' AND Concepto = ? LIMIT 1",
      [p.concepto]
    );
    if (!existentes.length) {
      await pool.execute(
        "INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro) VALUES ('talenthub', 'Requisiciones', ?, ?, ?)",
        [p.concepto, p.condicion, p.valor]
      );
      console.log(`   + Insertado: ${p.concepto} = ${p.valor}`);
    } else {
      console.log(`   = Ya existe: ${p.concepto} (id: ${existentes[0].id})`);
    }
  }

  console.log('\n=== Proceso completado exitosamente ===');
  process.exit(0);
}

main().catch(err => {
  console.error('\nERROR en migración SLA de Requisiciones:', err);
  process.exit(1);
});

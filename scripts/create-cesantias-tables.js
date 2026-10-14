const pool = require('../src/services/db');

async function main() {
  console.log('=== Iniciando creación de tablas para Gestión de Cesantías ===\n');

  // 1. Crear tabla Config_MotivoCesantias
  console.log('1. Creando tabla Config_MotivoCesantias (si no existe)...');
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS Config_MotivoCesantias (
      Id INT AUTO_INCREMENT PRIMARY KEY,
      tipo_retiro VARCHAR(50) NOT NULL,
      motivo_retiro VARCHAR(150) NOT NULL,
      fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('   -> Tabla Config_MotivoCesantias lista.');

  // 2. Sembrar datos en Config_MotivoCesantias según el formato de cesantías
  console.log('2. Verificando y poblando motivos en Config_MotivoCesantias...');
  const motivos = [
    { tipo: 'Vivienda', motivo: 'Compra de vivienda' },
    { tipo: 'Vivienda', motivo: 'Mejora o ampliación de vivienda' },
    { tipo: 'Vivienda', motivo: 'Pago de impuestos e hipotecas' },
    { tipo: 'Educación', motivo: 'Educación superior del Trabajador' },
    { tipo: 'Educación', motivo: 'Educación superior del Cónyuge o compañero permanente' },
    { tipo: 'Educación', motivo: 'Educación superior Hijo(a)' }
  ];

  for (const m of motivos) {
    const [existentes] = await pool.execute(
      'SELECT Id FROM Config_MotivoCesantias WHERE tipo_retiro = ? AND motivo_retiro = ? LIMIT 1',
      [m.tipo, m.motivo]
    );
    if (!existentes.length) {
      await pool.execute(
        'INSERT INTO Config_MotivoCesantias (tipo_retiro, motivo_retiro) VALUES (?, ?)',
        [m.tipo, m.motivo]
      );
      console.log(`   + Insertado: [${m.tipo}] ${m.motivo}`);
    } else {
      console.log(`   = Ya existe: [${m.tipo}] ${m.motivo} (Id: ${existentes[0].Id})`);
    }
  }

  // 3. Crear tabla Dynamic_Cesantias
  console.log('\n3. Creando tabla Dynamic_Cesantias (si no existe)...');
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS Dynamic_Cesantias (
      Id VARCHAR(50) NOT NULL,
      identificacion VARCHAR(50) NOT NULL,
      usuario VARCHAR(100) NOT NULL,
      
      -- Encabezado y datos financieros
      ciudad_solicitud VARCHAR(100) NOT NULL DEFAULT 'Medellín',
      fondo_cesantias VARCHAR(100) NOT NULL,
      monto_solicitado DECIMAL(14,2) NOT NULL,
      motivo_retiro INT NOT NULL,
      aplica_conyuge TINYINT(1) NOT NULL DEFAULT 0,
      
      -- Información complementaria de Educación Superior
      institucion_educativa VARCHAR(200) NULL,
      programa_academico VARCHAR(200) NULL,
      semestre VARCHAR(50) NULL,
      nombre_beneficiario VARCHAR(150) NULL,
      identificacion_beneficiario VARCHAR(50) NULL,
      
      -- Declaración juramentada y firma del trabajador
      declaracion_aceptada TINYINT(1) NOT NULL DEFAULT 0,
      token_firma VARCHAR(64) NULL,
      token_expira DATETIME NULL,
      firma_trabajador LONGTEXT NULL,
      fecha_firma DATETIME NULL,
      ip_firma VARCHAR(45) NULL,
      
      -- Flujo de aprobación y estados:
      -- pendiente -> validado -> aprobado/rechazado/cancelado/devuelto -> tramitado
      estado ENUM('pendiente', 'validado', 'aprobado', 'tramitado', 'rechazado', 'cancelado', 'devuelto') NOT NULL DEFAULT 'pendiente',
      validado_por VARCHAR(100) NULL,
      fecha_validacion DATETIME NULL,
      gestionado_por VARCHAR(100) NULL,
      fecha_gestion DATETIME NULL,
      observaciones TEXT NULL,
      tramitado_por VARCHAR(100) NULL,
      fecha_tramite DATETIME NULL,
      
      -- Auditoría
      fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      PRIMARY KEY (Id),
      KEY idx_identificacion (identificacion),
      KEY idx_estado (estado),
      KEY idx_motivo_retiro (motivo_retiro),
      KEY idx_fecha_registro (fecha_registro),
      KEY idx_token_firma (token_firma),
      CONSTRAINT fk_cesantias_motivo FOREIGN KEY (motivo_retiro) REFERENCES Config_MotivoCesantias (Id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('   -> Tabla Dynamic_Cesantias lista.');

  console.log('\n=== Proceso completado exitosamente ===');
  process.exit(0);
}

main().catch(err => {
  console.error('\nERROR en migración de Cesantías:', err);
  process.exit(1);
});

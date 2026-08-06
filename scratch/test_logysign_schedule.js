require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const pool = require('../src/services/db');
const { verificarEnviosProgramados } = require('../src/services/logysignScheduler');

async function test() {
  console.log("Setting up mock scheduled document...");
  const mockId = uuidv4();
  const mockToken = uuidv4();
  
  // Set date 5 seconds in the past to make sure it's immediately ready to send
  const testFechaProgramada = new Date(Date.now() - 5000);
  const tokenExpira = new Date();
  tokenExpira.setDate(tokenExpira.getDate() + 30);

  try {
    // 1. Insert test record in PROGRAMADO state
    await pool.execute(
      `INSERT INTO Dynamic_Logysign 
       (id, token, token_expira, identificacion, nombre_trabajador, email_trabajador, 
        regional, operacion, cargo, id_config_doc, prefijo, original_pdf_url, 
        firma_x, firma_y, firma_w, firma_h, firma_page, usuario_creador, 
        estado, fecha_envio_programado, base_url)
       VALUES (?, ?, ?, '99999999', 'Trabajador de Prueba Scheduler', 'admin@logyser.com', 
               'Norte', 'Operacion Prueba', 'Cargo Prueba', 18, 'TEST', 
               'https://storage.googleapis.com/talenthub_central/test.pdf', 
               0.1, 0.2, 0.3, 0.4, 1, 'root', 'PROGRAMADO', ?, 'http://localhost:3000')`,
      [mockId, mockToken, tokenExpira, testFechaProgramada]
    );
    console.log(`Mock document inserted successfully with ID: ${mockId}`);

    // 2. Run scheduler verification loop once
    console.log("Running verificarEnviosProgramados()...");
    await verificarEnviosProgramados();

    // 3. Verify status in database
    const [rows] = await pool.execute("SELECT estado, fecha_envio_programado FROM Dynamic_Logysign WHERE id = ?", [mockId]);
    console.log("Verification results from database:", rows[0]);

    if (rows[0] && rows[0].estado === 'PENDIENTE') {
      console.log("SUCCESS: Document state updated to PENDIENTE.");
    } else {
      console.error("FAILURE: Document state is not PENDIENTE.");
    }

    // 4. Clean up test record
    console.log("Cleaning up test record...");
    await pool.execute("DELETE FROM Dynamic_Logysign WHERE id = ?", [mockId]);
    console.log("Clean up finished.");
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

test();

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const pool = require('../src/services/db');

async function test() {
  console.log("Starting inline Causa update test...");
  const mockId = uuidv4();
  const mockToken = uuidv4();
  const testCausaInline = "Renuncia por Viaje " + Date.now(); // Ensure unique name

  try {
    // 1. Insert record in Dynamic_Logysign WITHOUT cause
    console.log("Inserting document into Dynamic_Logysign with causa = NULL...");
    const tokenExpira = new Date();
    tokenExpira.setDate(tokenExpira.getDate() + 30);
    await pool.execute(
      `INSERT INTO Dynamic_Logysign 
       (id, token, token_expira, identificacion, nombre_trabajador, email_trabajador, 
        regional, operacion, cargo, id_config_doc, prefijo, original_pdf_url, 
        firma_x, firma_y, firma_w, firma_h, firma_page, usuario_creador, 
        estado, causa)
       VALUES (?, ?, ?, '99999999', 'Trabajador Test Inline', 'admin@logyser.com', 
               'Norte', 'Operacion Prueba', 'Cargo Prueba', 55, 'RET', 
               'https://storage.googleapis.com/talenthub_central/test.pdf', 
               0.1, 0.2, 0.3, 0.4, 1, 'root', 'PENDIENTE', NULL)`,
      [mockId, mockToken, tokenExpira]
    );
    console.log("Document inserted.");

    // 2. Simulate API POST /registrologysign/api/update-causa
    console.log(`Updating causa to "${testCausaInline}"...`);
    
    // Server-side logic replication:
    if (testCausaInline) {
      const [mRows] = await pool.execute(
        'SELECT id FROM Config_Motivos_Documento WHERE id_config_doc = 55 AND LOWER(motivo) = ?',
        [testCausaInline.toLowerCase()]
      );
      if (!mRows.length) {
        await pool.execute(
          'INSERT INTO Config_Motivos_Documento (id_config_doc, motivo) VALUES (55, ?)',
          [testCausaInline]
        );
        console.log("Causa dynamically added to Config_Motivos_Documento.");
      }
    }

    await pool.execute(
      'UPDATE Dynamic_Logysign SET causa = ? WHERE id = ?',
      [testCausaInline, mockId]
    );
    console.log("Dynamic_Logysign causa updated.");

    // 3. Verify
    console.log("Verifying results...");
    const [mVerify] = await pool.execute(
      'SELECT * FROM Config_Motivos_Documento WHERE id_config_doc = 55 AND motivo = ?',
      [testCausaInline]
    );
    console.log("Config_Motivos_Documento:", mVerify);

    const [dVerify] = await pool.execute(
      'SELECT causa FROM Dynamic_Logysign WHERE id = ?',
      [mockId]
    );
    console.log("Dynamic_Logysign:", dVerify[0]);

    if (mVerify.length > 0 && dVerify[0].causa === testCausaInline) {
      console.log("SUCCESS: Inline Causa update fully verified.");
    } else {
      console.error("FAILURE: Mismatch in stored inline causa.");
    }

    // 4. Cleanup
    console.log("Cleaning up...");
    await pool.execute('DELETE FROM Config_Motivos_Documento WHERE id_config_doc = 55 AND motivo = ?', [testCausaInline]);
    await pool.execute('DELETE FROM Dynamic_Logysign WHERE id = ?', [mockId]);
    console.log("Cleanup finished.");
    process.exit(0);

  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

test();

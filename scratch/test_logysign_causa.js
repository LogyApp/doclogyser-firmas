require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const pool = require('../src/services/db');

async function test() {
  console.log("Starting test for custom Causa...");
  const mockId = uuidv4();
  const mockToken = uuidv4();
  const testCausa = "Jubilacion Anticipada " + Date.now(); // Ensure unique name

  try {
    // 1. Simulating backend route logic for inserting new cause
    console.log(`Checking if causa "${testCausa}" exists...`);
    const [mRows] = await pool.execute(
      'SELECT id FROM Config_Motivos_Documento WHERE id_config_doc = 55 AND LOWER(motivo) = ?',
      [testCausa.toLowerCase()]
    );
    
    if (!mRows.length) {
      console.log(`Causa does not exist. Inserting into Config_Motivos_Documento...`);
      await pool.execute(
        'INSERT INTO Config_Motivos_Documento (id_config_doc, motivo) VALUES (55, ?)',
        [testCausa]
      );
      console.log("Causa inserted successfully.");
    }

    // 2. Insert record in Dynamic_Logysign with cause
    console.log("Inserting document into Dynamic_Logysign...");
    const tokenExpira = new Date();
    tokenExpira.setDate(tokenExpira.getDate() + 30);
    await pool.execute(
      `INSERT INTO Dynamic_Logysign 
       (id, token, token_expira, identificacion, nombre_trabajador, email_trabajador, 
        regional, operacion, cargo, id_config_doc, prefijo, original_pdf_url, 
        firma_x, firma_y, firma_w, firma_h, firma_page, usuario_creador, 
        estado, causa)
       VALUES (?, ?, ?, '99999999', 'Trabajador Prueba Causa', 'admin@logyser.com', 
               'Norte', 'Operacion Prueba', 'Cargo Prueba', 55, 'RET', 
               'https://storage.googleapis.com/talenthub_central/test.pdf', 
               0.1, 0.2, 0.3, 0.4, 1, 'root', 'PENDIENTE', ?)`,
      [mockId, mockToken, tokenExpira, testCausa]
    );
    console.log("Document inserted with causa.");

    // 3. Verify they exist
    console.log("Verifying Config_Motivos_Documento entry...");
    const [mVerify] = await pool.execute(
      'SELECT * FROM Config_Motivos_Documento WHERE id_config_doc = 55 AND motivo = ?',
      [testCausa]
    );
    console.log("Config_Motivos_Documento Verification:", mVerify);

    console.log("Verifying Dynamic_Logysign entry...");
    const [dVerify] = await pool.execute(
      'SELECT causa FROM Dynamic_Logysign WHERE id = ?',
      [mockId]
    );
    console.log("Dynamic_Logysign Verification:", dVerify[0]);

    if (mVerify.length > 0 && dVerify[0].causa === testCausa) {
      console.log("SUCCESS: Dynamic Causa successfully stored in configuration and document metadata.");
    } else {
      console.error("FAILURE: Mismatch in stored Causa.");
    }

    // 4. Cleanup
    console.log("Cleaning up test data...");
    await pool.execute('DELETE FROM Config_Motivos_Documento WHERE id_config_doc = 55 AND motivo = ?', [testCausa]);
    await pool.execute('DELETE FROM Dynamic_Logysign WHERE id = ?', [mockId]);
    console.log("Cleanup finished.");
    process.exit(0);

  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

test();

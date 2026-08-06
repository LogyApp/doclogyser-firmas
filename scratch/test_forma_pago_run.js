require('dotenv').config();
const { ejecutarActualizacionFormaPago } = require('../src/services/formaPagoUpdater');

async function test() {
  console.log("Starting test run of ejecutarActualizacionFormaPago()...");
  try {
    await ejecutarActualizacionFormaPago();
    console.log("Test run completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Test run failed:", err);
    process.exit(1);
  }
}

test();

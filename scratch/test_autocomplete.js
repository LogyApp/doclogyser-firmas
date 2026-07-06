module.paths.push('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/node_modules');
require('dotenv').config({ path: 'c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/.env' });
const express = require('express');
const http = require('http');
const participacionRoutes = require('../src/routes/participacion');

const app = express();
app.use('/participacion', participacionRoutes);

const PORT = 4569;
const server = http.createServer(app);

server.listen(PORT, async () => {
  console.log(`Test server running on port ${PORT}`);
  const baseUrl = `http://localhost:${PORT}`;

  try {
    // Test search by name "Luisa"
    console.log('\nTesting autocomplete search by name: "Luisa"');
    const res1 = await fetch(`${baseUrl}/participacion/api/responsables-buscar?q=Luisa`);
    const json1 = await res1.json();
    console.log(`Results found: ${json1.length}`);
    if (json1.length > 0) {
      console.log('Sample result:', json1[0]);
    }

    // Test search by C.C. "1010032606"
    console.log('\nTesting autocomplete search by C.C.: "1010032606"');
    const res2 = await fetch(`${baseUrl}/participacion/api/responsables-buscar?q=1010032606`);
    const json2 = await res2.json();
    console.log(`Results found: ${json2.length}`);
    if (json2.length > 0) {
      console.log('Sample result:', json2[0]);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  } finally {
    console.log('\nClosing server...');
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  }
});

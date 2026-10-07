// Servidor liviano para probar SOLO el módulo de Cloud Docs en local.
//
// Uso:  node scripts/dev-clouddocs.js
// Abre: http://localhost:3000/cloud-docs?usuario=TU_ID

require('dotenv').config();
const express = require('express');

const clouddocsRoutes = require('../src/routes/clouddocs');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/cloud-docs', clouddocsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[dev-clouddocs] Solo el módulo de Cloud Docs está activo.`);
  console.log(`[dev-clouddocs] Abre: http://localhost:${PORT}/cloud-docs?usuario=TU_ID`);
});

// Servidor liviano para probar SOLO el módulo de Cloud Docs en local.
//
// Uso:  node scripts/dev-clouddocs.js
// Abre: http://localhost:3000/cloud-docs?usuario=TU_ID
//
// Incluye también /registrologysign (API de registros que consume la pestaña
// LogySign, integrada nativamente) y /logysign (formulario de "+ Nueva Firma"
// y API de motivos/PDF firmado que usa esa misma pestaña).

require('dotenv').config();
const express = require('express');

const clouddocsRoutes = require('../src/routes/clouddocs');
const registrologysignRoutes = require('../src/routes/registrologysign');
const logysignRoutes = require('../src/routes/logysign');
const formclouddocsRoutes = require('../src/routes/formclouddocs');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/cloud-docs', clouddocsRoutes);
app.use('/registrologysign', registrologysignRoutes);
app.use('/registroslogysign', registrologysignRoutes);
app.use('/logysign', logysignRoutes);
app.use('/formcloud-docs', formclouddocsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[dev-clouddocs] Solo el módulo de Cloud Docs está activo.`);
  console.log(`[dev-clouddocs] Abre: http://localhost:${PORT}/cloud-docs?usuario=TU_ID`);
});

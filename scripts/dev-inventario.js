// Servidor liviano para probar SOLO el módulo de Inventario en local.
// Uso:  node scripts/dev-inventario.js
// Abre: http://localhost:3000/inventario?usuario=TU_ID

require('dotenv').config();
const express = require('express');

const inventarioRoutes = require('../src/routes/inventario');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/inventario', inventarioRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[dev-inventario] Solo el módulo de Inventario está activo.`);
  console.log(`[dev-inventario] Abre: http://localhost:${PORT}/inventario?usuario=TU_ID`);
});

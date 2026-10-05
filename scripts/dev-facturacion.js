// Servidor liviano para probar SOLO el módulo de Facturación en local,
// sin levantar los ~40 routers ni los schedulers (setInterval) de app.js.
//
// Uso:  node scripts/dev-facturacion.js
// Abre: http://localhost:3000/facturacion?usuario=TU_ID
//
// Incluye también /bloqueodatos porque la vista de Facturación llama a
// /bloqueodatos/api/quincenas (poblar selects de quincena).

require('dotenv').config();
const express = require('express');

const facturacionRoutes = require('../src/routes/facturacion');
const bloqueodatosRoutes = require('../src/routes/bloqueodatos');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/facturacion', facturacionRoutes);
app.use('/bloqueodatos', bloqueodatosRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[dev-facturacion] Solo el módulo de Facturación está activo.`);
  console.log(`[dev-facturacion] Abre: http://localhost:${PORT}/facturacion?usuario=TU_ID`);
});

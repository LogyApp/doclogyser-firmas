// Servidor liviano para probar SOLO el módulo de Nómina (incluye la nueva
// pestaña de Traslados) en local, sin levantar los ~40 routers ni los
// schedulers (setInterval) de app.js.
//
// Uso:  node scripts/dev-nomina.js
// Abre: http://localhost:3000/nomina?usuario=TU_ID
//
// Incluye también /admin (rutas de /admin/traslados/*, consumidas desde la
// pestaña Traslados) y /formtraslado (el formulario que se abre en el modal
// de "+ Nuevo Traslado").

require('dotenv').config();
const express = require('express');

const nominaRoutes = require('../src/routes/nomina');
const adminRoutes = require('../src/routes/admin');
const formtrasladoRoutes = require('../src/routes/formtraslado');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/nomina', nominaRoutes);
app.use('/admin', adminRoutes);
app.use('/formtraslado', formtrasladoRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[dev-nomina] Solo el módulo de Nómina (+ admin/traslados + formtraslado) está activo.`);
  console.log(`[dev-nomina] Abre: http://localhost:${PORT}/nomina?usuario=TU_ID`);
});

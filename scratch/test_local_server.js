module.paths.push('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/node_modules');
require('dotenv').config({ path: 'c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/.env' });
const express = require('express');
const http = require('http');

// Import routes
const reportesRoutes                 = require('../src/routes/reportes');
const adminRoutes                    = require('../src/routes/admin');
const firmaRoutes                    = require('../src/routes/firma');
const formtrasladoRoutes             = require('../src/routes/formtraslado');
const formretiroRoutes               = require('../src/routes/formretiro');
const generarretiroRoutes            = require('../src/routes/generarretiro');
const firmarenunciaRoutes            = require('../src/routes/firmarenuncia');
const firmarcertificadoretiroRoutes  = require('../src/routes/firmarcertificadoretiro');
const firmarexamenegresoRoutes       = require('../src/routes/firmarexamenegreso');
const firmarcesantiasRoutes          = require('../src/routes/firmarcesantias');
const pazysalvoRoutes                = require('../src/routes/pazysalvo');
const pazysalvoareaRoutes            = require('../src/routes/pazysalvoarea');
const evaluacionretiroRoutes         = require('../src/routes/evaluacionretiro');
const solicitudesRoutes              = require('../src/routes/solicitudes');
const participacionRoutes            = require('../src/routes/participacion');
const pruebaconsumoRoutes            = require('../src/routes/pruebaconsumo');
const compromisosstRoutes            = require('../src/routes/compromisosst');
const evaluacionsstRoutes            = require('../src/routes/evaluacionsst');
const documentClassifierRoutes       = require('../src/routes/documentClassifier');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/reportes', reportesRoutes);
app.use('/admin', adminRoutes);
app.use('/doclogyser', firmaRoutes);
app.use('/formtraslado', formtrasladoRoutes);
app.use('/formretiro', formretiroRoutes);
app.use('/generar-retiro', generarretiroRoutes);
app.use('/firmar-renuncia', firmarenunciaRoutes);
app.use('/firmar-certificado-retiro', firmarcertificadoretiroRoutes);
app.use('/firmar-examen-egreso', firmarexamenegresoRoutes);
app.use('/firmar-cesantias', firmarcesantiasRoutes);
app.use('/firmar-pazysalvo', pazysalvoRoutes);
app.use('/pazysalvo-area', pazysalvoareaRoutes);
app.use('/evaluacion-retiro', evaluacionretiroRoutes);
app.use('/solicitudes', solicitudesRoutes);
app.use('/formsolicitud', solicitudesRoutes);
app.use('/participacion', participacionRoutes);
app.use('/formparticipacion', participacionRoutes);
app.use('/pruebaconsumo', pruebaconsumoRoutes);
app.use('/formpruebaconsumo', pruebaconsumoRoutes);
app.use('/compromisosst', compromisosstRoutes);
app.use('/formcompromisosst', compromisosstRoutes);
app.use('/evaluacionsst', evaluacionsstRoutes);
app.use('/formevaluacionsst', evaluacionsstRoutes);
app.use('/document-classifier', documentClassifierRoutes);

const PORT = 4567;
const server = http.createServer(app);

server.listen(PORT, async () => {
  console.log(`Test server running on port ${PORT}`);
  
  const testUser = 'Luisa Palacio - 901'; // Luisa Palacio is AdmSst role
  const baseUrl = `http://localhost:${PORT}`;

  const endpoints = [
    `/pruebaconsumo?usuario=${encodeURIComponent(testUser)}`,
    `/formpruebaconsumo?usuario=${encodeURIComponent(testUser)}`,
    `/pruebaconsumo/api/trabajadores-por-operacion?regional=ANTIOQUIA&operacion=Administracion`,
    `/compromisosst?usuario=${encodeURIComponent(testUser)}`,
    `/formcompromisosst?usuario=${encodeURIComponent(testUser)}`,
    `/compromisosst/api/trabajadores-por-operacion?regional=ANTIOQUIA&operacion=Administracion`,
    `/evaluacionsst?usuario=${encodeURIComponent(testUser)}`,
    `/formevaluacionsst?usuario=${encodeURIComponent(testUser)}`,
    `/evaluacionsst/api/trabajadores-por-operacion?regional=ANTIOQUIA&operacion=Administracion`,
    `/participacion?usuario=${encodeURIComponent(testUser)}`,
    `/formparticipacion?usuario=${encodeURIComponent(testUser)}`,
    `/participacion/api/trabajadores-por-operacion?regional=ANTIOQUIA&operacion=Administracion`
  ];

  try {
    for (const ep of endpoints) {
      console.log(`\nTesting: ${ep}`);
      const res = await fetch(`${baseUrl}${ep}`);
      console.log(`Status: ${res.status} ${res.statusText}`);
      const contentType = res.headers.get('content-type') || '';
      console.log(`Content-Type: ${contentType}`);
      
      if (contentType.includes('application/json')) {
        const json = await res.json();
        console.log(`JSON Response length/keys:`, Array.isArray(json) ? `Array of ${json.length}` : Object.keys(json));
      } else {
        const text = await res.text();
        console.log(`HTML Response preview:`, text.slice(0, 150).replace(/\s+/g, ' '));
      }
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

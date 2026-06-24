require('dotenv').config();
const express = require('express');

const reportesRoutes                 = require('./src/routes/reportes');
const adminRoutes                    = require('./src/routes/admin');
const firmaRoutes                    = require('./src/routes/firma');
const formtrasladoRoutes             = require('./src/routes/formtraslado');
const formretiroRoutes               = require('./src/routes/formretiro');
const generarretiroRoutes            = require('./src/routes/generarretiro');
const firmarenunciaRoutes            = require('./src/routes/firmarenuncia');
const firmarcertificadoretiroRoutes  = require('./src/routes/firmarcertificadoretiro');
const firmarexamenegresoRoutes       = require('./src/routes/firmarexamenegreso');
const firmarcesantiasRoutes          = require('./src/routes/firmarcesantias');
const pazysalvoRoutes                = require('./src/routes/pazysalvo');
const pazysalvoareaRoutes            = require('./src/routes/pazysalvoarea');
const evaluacionretiroRoutes         = require('./src/routes/evaluacionretiro');
const solicitudesRoutes              = require('./src/routes/solicitudes');
const participacionRoutes            = require('./src/routes/participacion');
const pruebaconsumoRoutes            = require('./src/routes/pruebaconsumo');
const compromisosstRoutes            = require('./src/routes/compromisosst');

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

if (process.env.NODE_ENV !== 'production') {
  const devRoutes = require('./src/routes/dev');
  app.use('/dev', devRoutes);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`Servidor en http://localhost:${PORT}`);
  }
});

// Notificador de retiros: captura cambios hechos desde AppSheet u otros sistemas
// La interfaz /formretiro ya notifica directamente; este cron es el respaldo
const { verificarRetiros } = require('./src/services/retiroNotifier');
verificarRetiros(); // verificación inicial al arrancar
setInterval(verificarRetiros, 2 * 60 * 1000); // cada 2 minutos

// Notificador de ingresos: detecta nuevos colaboradores con cargos críticos
// y envía correo al equipo administrativo para programar capacitación
const { verificarIngresos } = require('./src/services/ingresoNotifier');
verificarIngresos(); // verificación inicial al arrancar
setInterval(verificarIngresos, 2 * 60 * 1000); // cada 2 minutos

// Generador automático de CT cuando el token expira sin firma del trabajador
const { verificarCTExpirados } = require('./src/services/ctExpiryNotifier');
verificarCTExpirados(); // verificación inicial al arrancar
setInterval(verificarCTExpirados, 5 * 60 * 1000); // cada 5 minutos

// Generador automático de AR cuando el token expira sin firma del trabajador
const { verificarARExpirados } = require('./src/services/arExpiryNotifier');
verificarARExpirados(); // verificación inicial al arrancar
setInterval(verificarARExpirados, 5 * 60 * 1000); // cada 5 minutos

// Generador automático de EMOE cuando el token expira sin firma del trabajador
const { verificarEMOEExpirados } = require('./src/services/emoeExpiryNotifier');
verificarEMOEExpirados(); // verificación inicial al arrancar
setInterval(verificarEMOEExpirados, 5 * 60 * 1000); // cada 5 minutos

// Generador automático de CRS cuando el token expira sin firma del trabajador
const { verificarCRSExpirados } = require('./src/services/crsExpiryNotifier');
verificarCRSExpirados(); // verificación inicial al arrancar
setInterval(verificarCRSExpirados, 5 * 60 * 1000); // cada 5 minutos

// Generador automático de PZ cuando el token expira sin firmas completas
const { verificarPZExpirados } = require('./src/services/pzExpiryNotifier');
verificarPZExpirados(); // verificación inicial al arrancar
setInterval(verificarPZExpirados, 10 * 60 * 1000); // cada 10 minutos

// Generador automático de CPC (Prueba Consumo) cuando el token expira sin firma
const { verificarCPCExpirados } = require('./src/services/cpcExpiryNotifier');
verificarCPCExpirados(); // verificación inicial al arrancar
setInterval(verificarCPCExpirados, 5 * 60 * 1000); // cada 5 minutos

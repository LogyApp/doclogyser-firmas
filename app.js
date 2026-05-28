require('dotenv').config();
const express = require('express');

const adminRoutes          = require('./src/routes/admin');
const firmaRoutes          = require('./src/routes/firma');
const formtrasladoRoutes   = require('./src/routes/formtraslado');
const formretiroRoutes     = require('./src/routes/formretiro');
const firmarenunciaRoutes  = require('./src/routes/firmarenuncia');
const pazysalvoRoutes      = require('./src/routes/pazysalvo');
const pazysalvoareaRoutes  = require('./src/routes/pazysalvoarea');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/admin', adminRoutes);
app.use('/doclogyser', firmaRoutes);
app.use('/formtraslado', formtrasladoRoutes);
app.use('/formretiro', formretiroRoutes);
app.use('/firmar-renuncia', firmarenunciaRoutes);
app.use('/firmar-pazysalvo', pazysalvoRoutes);
app.use('/pazysalvo-area', pazysalvoareaRoutes);

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

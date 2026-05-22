require('dotenv').config();
const express = require('express');

const adminRoutes        = require('./src/routes/admin');
const firmaRoutes        = require('./src/routes/firma');
const formtrasladoRoutes = require('./src/routes/formtraslado');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/admin', adminRoutes);
app.use('/doclogyser', firmaRoutes);
app.use('/formtraslado', formtrasladoRoutes);

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

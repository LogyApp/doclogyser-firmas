module.paths.push('c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/node_modules');
require('dotenv').config({ path: 'c:/Users/Admin/OneDrive/Documentos/GitHub/doclogyser-firmas/.env' });
const express = require('express');
const http = require('http');

// Import routes
const participacionRoutes            = require('../src/routes/participacion');
const pruebaconsumoRoutes            = require('../src/routes/pruebaconsumo');
const compromisosstRoutes            = require('../src/routes/compromisosst');
const evaluacionsstRoutes            = require('../src/routes/evaluacionsst');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/participacion', participacionRoutes);
app.use('/pruebaconsumo', pruebaconsumoRoutes);
app.use('/compromisosst', compromisosstRoutes);
app.use('/evaluacionsst', evaluacionsstRoutes);

const PORT = 4568;
const server = http.createServer(app);

server.listen(PORT, async () => {
  console.log(`Test server running on port ${PORT}`);
  const baseUrl = `http://localhost:${PORT}`;

  const testUser = 'Luisa Palacio - 901'; // Luisa Palacio is AdmSst role
  const testWorkerCC = '1117517812';
  const testWorkerName = 'WILLIAM ORLANDO PAREDES LEAL';
  const testWorkerCargo = 'Lider';

  const posts = [
    {
      name: 'pruebaconsumo',
      url: '/pruebaconsumo/api/crear',
      payload: {
        fecha: '2026-06-26',
        identificacion: testWorkerCC,
        nombre_trabajador: testWorkerName,
        cargo: testWorkerCargo,
        ciudad: 'Medellin',
        cliente: 'CLIENTE TEST',
        observaciones: 'Test observaciones',
        usuario: testUser,
        enviar_correo: false
      }
    },
    {
      name: 'compromisosst',
      url: '/compromisosst/api/crear',
      payload: {
        identificaciontrabajador: testWorkerCC,
        nombre_trabajador: testWorkerName,
        cargo_trabajador: testWorkerCargo,
        observaciones: 'Test observaciones',
        usuario: testUser,
        enviar_correo: false
      }
    },
    {
      name: 'evaluacionsst',
      url: '/evaluacionsst/api/crear',
      payload: {
        fecha: '2026-06-26',
        identificacion: testWorkerCC,
        tipo: 'Inducción',
        usuario: testUser,
        enviar_correo: false
      }
    },
    {
      name: 'participacion',
      url: '/participacion/api/asistencias',
      payload: {
        tema: 'Capacitacion de prueba',
        fecha: '2026-06-26',
        hora_inicial: '08:00',
        hora_final: '09:00',
        lugar: 'Oficina principal',
        objetivo: 'Objetivo de la capacitacion',
        responsable: '9', // We need a valid Id Vinculación from Maestro_Vinculación
        usuario: testUser,
        asistentes: ['9'], // Array of Id Vinculación
        evidencias: []
      }
    }
  ];

  try {
    for (const test of posts) {
      console.log(`\nTesting POST for: ${test.name}`);
      const res = await fetch(`${baseUrl}${test.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.payload)
      });
      console.log(`Status: ${res.status} ${res.statusText}`);
      const json = await res.json();
      console.log(`Response:`, json);
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

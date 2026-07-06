const express = require('express');
const path = require('path');
const pool = require('../services/db');
const { randomUUID } = require('crypto');
const { subirCertificadoBancario } = require('../services/storage');
const { notificarCambiosDotacion, notificarCambiosPersonales, notificarCambiosBancos } = require('../services/email');

const router = express.Router();
const HTML_PATH = path.join(__dirname, '../views/actualizardatos/index.html');

function formatYYMMDDHHSS(date) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}${hh}${ss}`;
}

// ═════ Servir la Vista HTML ═════
router.get('/', (req, res) => {
  res.sendFile(HTML_PATH);
});

// ═════ API: Obtener Datos del Trabajador ═════
router.get('/api/trabajador/:identificacion', async (req, res) => {
  try {
    const { identificacion } = req.params;

    // 1. Consultar en Maestro_Segmentación
    const [[seg]] = await pool.execute(
      `SELECT 
        Trabajador, 
        \`Operación\` AS Operacion, 
        Estado, 
        Celular, 
        Email, 
        \`Nombre Contacto de Emergencia\` AS nombreEmergencia, 
        \`Telefono Contacto de Emergencia\` AS telefonoEmergencia, 
        Camiseta, 
        Numero, 
        Pantalon, 
        Botas, 
        Banco, 
        \`N° Cuenta Bancaria\` AS nCuentaBancaria 
       FROM Maestro_Segmentación 
       WHERE Identificación = ? LIMIT 1`,
      [identificacion]
    );

    if (!seg) {
      return res.status(404).json({ error: 'Trabajador no encontrado en Segmentación.' });
    }

    // 2. Consultar en Maestro_Vinculación el contrato más reciente
    const [[vin]] = await pool.execute(
      `SELECT 
        Cargo, 
        \`Fecha de Ingreso\` AS fechaIngreso,
        Regional,
        \`Operación\` AS Operacion,
        Estado
       FROM Maestro_Vinculación 
       WHERE Identificación = ? 
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    res.json({
      trabajador: seg.Trabajador,
      operacion: seg.Operacion || (vin ? vin.Operacion : ''),
      estado: seg.Estado || (vin ? vin.Estado : ''),
      cargo: vin ? vin.Cargo : '',
      fechaIngreso: vin ? vin.fechaIngreso : null,
      regional: vin ? vin.Regional : '',
      celular: seg.Celular || '',
      email: seg.Email || '',
      nombreEmergencia: seg.nombreEmergencia || '',
      telefonoEmergencia: seg.telefonoEmergencia || '',
      camiseta: seg.Camiseta || '',
      numero: seg.Numero || '',
      pantalon: seg.Pantalon || '',
      botas: seg.Botas || '',
      banco: seg.Banco || '',
      nCuentaBancaria: seg.nCuentaBancaria || '',
    });
  } catch (err) {
    console.error('[actualizardatos] GET /api/trabajador/:identificacion:', err);
    res.status(500).json({ error: 'Error al consultar datos del trabajador' });
  }
});

// ═════ API: Guardar Actualización de Datos ═════
router.post('/api/guardar', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      identificacion,
      celular,
      email,
      nombreEmergencia,
      telefonoEmergencia,
      camiseta,
      numero,
      pantalon,
      botas,
      banco,
      nCuentaBancaria,
      certificadoBancario,
    } = req.body;

    if (!identificacion) {
      return res.status(400).json({ error: 'La identificación del trabajador es requerida' });
    }

    await conn.beginTransaction();

    // 1. Obtener datos actuales de Segmentación para comparación
    const [[segOld]] = await conn.execute(
      `SELECT 
        Trabajador, 
        \`Operación\` AS Operacion,
        Celular, 
        Email, 
        \`Nombre Contacto de Emergencia\` AS nombreEmergencia, 
        \`Telefono Contacto de Emergencia\` AS telefonoEmergencia, 
        Camiseta, 
        Numero, 
        Pantalon, 
        Botas, 
        Banco, 
        \`N° Cuenta Bancaria\` AS nCuentaBancaria 
       FROM Maestro_Segmentación 
       WHERE Identificación = ? LIMIT 1 FOR UPDATE`,
      [identificacion]
    );

    if (!segOld) {
      throw new Error('Trabajador no encontrado en Segmentación para actualizar');
    }

    // 2. Obtener datos más recientes de Vinculación
    const [[vin]] = await conn.execute(
      `SELECT 
        Cargo, 
        \`Fecha de Ingreso\` AS fechaIngreso,
        Regional,
        \`Operación\` AS Operacion,
        Estado
       FROM Maestro_Vinculación 
       WHERE Identificación = ? 
       ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
      [identificacion]
    );

    const cargo = vin ? (vin.Cargo || '').trim().toUpperCase() : '';
    const esAuxLogistico = cargo === 'AUXILIAR LOGISTICO';

    // 3. Determinar qué cambió
    // Dotación
    const camisetaCambio = (camiseta || '') !== (segOld.Camiseta || '');
    const pantalonCambio = (pantalon || '') !== (segOld.Pantalon || '');
    const botasCambio     = (botas || '') !== (segOld.Botas || '');
    const numeroCambio    = esAuxLogistico && (numero || '') !== (segOld.Numero || '');

    const dotacionCambio = camisetaCambio || pantalonCambio || botasCambio || numeroCambio;

    // Personales
    const celularCambio = (celular || '') !== (segOld.Celular || '');
    const emailCambio   = (email || '') !== (segOld.Email || '');
    const nombreEmergenciaCambio = (nombreEmergencia || '') !== (segOld.nombreEmergencia || '');
    const telefonoEmergenciaCambio = (telefonoEmergencia || '') !== (segOld.telefonoEmergencia || '');

    const personalesCambio = celularCambio || emailCambio || nombreEmergenciaCambio || telefonoEmergenciaCambio;

    // Bancarios
    const bancoCambio           = (banco || '') !== (segOld.Banco || '');
    const nCuentaBancariaCambio = (nCuentaBancaria || '') !== (segOld.nCuentaBancaria || '');

    const bancoCambioTotal = bancoCambio || nCuentaBancariaCambio;

    let urlDocCertificado = null;

    if (bancoCambioTotal) {
      if (!certificadoBancario || !certificadoBancario.base64) {
        return res.status(400).json({
          error: 'Para cambiar el banco o número de cuenta, debe subir la certificación bancaria en PDF de forma obligatoria.',
        });
      }

      // Procesar y subir PDF a GCS
      const buffer = Buffer.from(certificadoBancario.base64.replace(/^data:.*;base64,/, ''), 'base64');
      const now = new Date();
      const formattedDate = formatYYMMDDHHSS(now);
      const originalName = certificadoBancario.filename || 'certificacion.pdf';

      urlDocCertificado = await subirCertificadoBancario(identificacion, formattedDate, buffer, originalName);

      // Registrar documento en Maestro_docTrabajador
      const docId = randomUUID();
      await conn.execute(
        `INSERT INTO Maestro_docTrabajador
         (id, Validación, Regional, Operación, Identificación, Estado, Fecha_Ingreso,
          TipoDocumento, Prefijo, Doc, Observaciones, Visualizar, Solicitud, Justificacion_Solicitud, Usuario)
         VALUES (?, 'PEND', ?, ?, ?, ?, ?, 10, 'CB', ?, 'Modificado por el trabajador', NULL, NULL, NULL, 'Sistema')`,
        [
          docId,
          vin ? vin.Regional : null,
          vin ? vin.Operacion : null,
          identificacion,
          vin ? vin.Estado : null,
          vin ? vin.fechaIngreso : null,
          urlDocCertificado,
        ]
      );
      console.log(`[actualizardatos] Registrado certificado bancario en Maestro_docTrabajador para ${identificacion}`);
    }

    // 4. Actualizar en Maestro_Segmentación
    // Si no es auxiliar logístico, no se debe alterar el valor antiguo de "Numero" (lo dejamos igual)
    const numeroFinal = esAuxLogistico ? (numero || null) : segOld.Numero;

    await conn.execute(
      `UPDATE Maestro_Segmentación
       SET 
         Celular = ?,
         Email = ?,
         \`Nombre Contacto de Emergencia\` = ?,
         \`Telefono Contacto de Emergencia\` = ?,
         Camiseta = ?,
         Numero = ?,
         Pantalon = ?,
         Botas = ?,
         Banco = ?,
         \`N° Cuenta Bancaria\` = ?,
         \`Fecha de Actualización\` = NOW()
       WHERE Identificación = ?`,
      [
        celular || null,
        email || null,
        nombreEmergencia || null,
        telefonoEmergencia || null,
        camiseta || null,
        numeroFinal || null,
        pantalon || null,
        botas || null,
        banco || null,
        nCuentaBancaria || null,
        identificacion
      ]
    );

    await conn.commit();

    // 5. Enviar correos asíncronos si hubo cambios
    const antes = {
      Camiseta: segOld.Camiseta,
      Numero: segOld.Numero,
      Pantalon: segOld.Pantalon,
      Botas: segOld.Botas,
      Celular: segOld.Celular,
      Email: segOld.Email,
      nombreEmergencia: segOld.nombreEmergencia,
      telefonoEmergencia: segOld.telefonoEmergencia,
      Banco: segOld.Banco,
      nCuentaBancaria: segOld.nCuentaBancaria,
    };

    const despues = {
      Camiseta: camiseta,
      Numero: esAuxLogistico ? numero : segOld.Numero,
      Pantalon: pantalon,
      Botas: botas,
      Celular: celular,
      Email: email,
      nombreEmergencia: nombreEmergencia,
      telefonoEmergencia: telefonoEmergencia,
      Banco: banco,
      nCuentaBancaria: nCuentaBancaria,
    };

    // Disparar las notificaciones de manera asíncrona sin bloquear la respuesta HTTP
    if (dotacionCambio) {
      notificarCambiosDotacion({ trabajador: segOld.Trabajador, identificacion, antes, despues })
        .catch(err => console.error('[actualizardatos] Error enviando correo dotación:', err));
    }

    if (personalesCambio) {
      notificarCambiosPersonales({ trabajador: segOld.Trabajador, identificacion, antes, despues })
        .catch(err => console.error('[actualizardatos] Error enviando correo datos personales:', err));
    }

    if (bancoCambioTotal) {
      notificarCambiosBancos({ trabajador: segOld.Trabajador, identificacion, antes, despues, urlDoc: urlDocCertificado })
        .catch(err => console.error('[actualizardatos] Error enviando correo datos bancarios:', err));
    }

    res.json({
      ok: true,
      dotacionCambio,
      personalesCambio,
      bancoCambioTotal,
      urlDoc: urlDocCertificado
    });
  } catch (err) {
    await conn.rollback();
    console.error('[actualizardatos] POST /api/guardar:', err);
    res.status(500).json({ error: err.message || 'Error al guardar los cambios' });
  } finally {
    conn.release();
  }
});

module.exports = router;

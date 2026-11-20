// Nómina › Informes Disciplinarios (/informes-disciplinarios). Quién ve la pestaña: Maestro_Menu nomina /
// InformesDisciplinarios. Cada usuario ve sus informes; los roles de 'Roles que ven todos los informes
// disciplinarios' ven todos y 'Roles que pueden cerrar informes disciplinarios' anotan y cierran
// (Config_Parametros nomina / Informes Disciplinarios, ver services/informesDisciplinarios.js).
// Estados: Borrador -> Recibido (firmado: PDF, documento 43 y correo) -> Cerrado. Firmado ya no se edita.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../services/db');
const { computarAccesoNomina } = require('../services/accesoNomina');
const { subirFirma, subirEvidenciaInformeDisciplinario, descargarFirmaBase64PorUrl } = require('../services/storage');
const { notificarInformeDisciplinario } = require('../services/email');
const idis = require('../services/informesDisciplinarios');

const router = express.Router();
const FORM_HTML = path.join(__dirname, '../views/informesdisciplinarios/form.html');
const SECCION_MENU = 'InformesDisciplinarios';
const MAX_EVIDENCIAS = 12;

const CAMPOS_TEXTO = ['descripcion_hechos', 'accion_inmediata', 'consecuencias', 'comentarios_fotos', 'forma_conocimiento'];
const OBLIGATORIOS = {
  identificacion: 'Trabajador',
  fecha_hechos: 'Fecha de los hechos',
  tipo_falta: 'Tipo de falta',
  descripcion_hechos: 'Descripción de los hechos',
  accion_inmediata: 'Acción inmediata tomada',
  consecuencias: 'Consecuencias de los hechos',
  forma_conocimiento: 'Forma de conocimiento de los hechos',
};

// Acceso del usuario a la pestaña con sus permisos y su cargo (Maestro_Usuarios)
async function accesoInformes(usuario) {
  const a = await computarAccesoNomina(usuario, SECCION_MENU);
  if (!a) return null;
  const [[u]] = await pool.execute('SELECT Cargo, Email FROM Maestro_Usuarios WHERE ID = ? LIMIT 1', [a.usuarioId]);
  return { ...a, cargo: (u && u.Cargo) || '', email: (u && u.Email) || '', ...(await idis.configuracionDelRol(a.rol)) };
}

function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function ahoraBogota() {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function nombreSinCedula(trabajador) {
  const partes = String(trabajador || '').split(' ** ');
  return (partes.length > 1 ? partes[1] : partes[0]).trim();
}

function puedeVer(inf, a) {
  return a.verTodos || inf.usuario === a.usuarioId;
}

async function obtenerInforme(id) {
  const [[inf]] = await pool.execute('SELECT * FROM Dynamic_Informe_Disciplinario WHERE id_informe = ? LIMIT 1', [id]);
  return inf || null;
}

// Vinculación activa más reciente del trabajador
async function vinculacionActiva(identificacion) {
  const [[v]] = await pool.execute(
    `SELECT \`Id Vinculación\` AS idVinculacion, Trabajador, \`Identificación\` AS identificacion, Cargo, \`Operación\` AS operacion,
            Regional, \`Fecha de Ingreso\` AS fechaIngreso
       FROM \`Maestro_Vinculación\` WHERE \`Identificación\` = ? AND Estado = 'Activo'
      ORDER BY \`Fecha de Ingreso\` DESC LIMIT 1`,
    [identificacion]
  );
  return v || null;
}

async function antecedentes(identificacion, excluirId) {
  const [rows] = await pool.execute(
    `SELECT id_informe, fecha_hechos, tipo_falta, tipo_falta_otro, estado, resultado_cierre
       FROM Dynamic_Informe_Disciplinario
      WHERE identificacion = ? AND estado <> 'Borrador' AND id_informe <> ?
      ORDER BY fecha_hechos DESC`,
    [identificacion, excluirId || '']
  );
  return rows.map(r => ({
    radicado: idis.radicado(r.id_informe), fechaHechos: idis.fechaIso(r.fecha_hechos),
    tipoFalta: idis.textoFalta(r), estado: r.estado, resultado: r.resultado_cierre || '',
  }));
}

function htmlError(msg) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe disciplinario</title></head>
<body style="font-family:Arial,sans-serif;background:#f0f0f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="background:#fff;padding:32px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);max-width:420px;text-align:center">
<h2 style="color:#1a1a2e;margin-top:0">Informe disciplinario</h2><p style="color:#666">${String(msg).replace(/</g, '&lt;')}</p></div></body></html>`;
}

// ── Formulario (iframe de la pestaña; ?id= continúa un borrador) ─────────────
router.get('/form', async (req, res) => {
  try {
    const { usuario, id } = req.query;
    if (!usuario) return res.status(400).send(htmlError('Parámetro ?usuario requerido'));
    const a = await accesoInformes(usuario);
    if (!a) return res.status(403).send(htmlError('Usuario no autorizado para registrar informes disciplinarios'));

    let borrador = null;
    if (id) {
      const inf = await obtenerInforme(id);
      if (!inf || inf.usuario !== a.usuarioId) return res.status(404).send(htmlError('No se encontró el borrador.'));
      if (inf.estado !== 'Borrador') return res.status(409).send(htmlError('Este informe ya fue firmado y no se puede editar.'));
      const [evidencias] = await pool.execute(
        'SELECT id_evidencia, url FROM Dynamic_Informe_Disciplinario_Evidencias WHERE id_informe = ? ORDER BY id_evidencia', [id]
      );
      borrador = {
        id: inf.id_informe, identificacion: inf.identificacion ? String(inf.identificacion) : '',
        nombreTrabajador: inf.nombre_trabajador || '', fechaHechos: idis.fechaIso(inf.fecha_hechos),
        tipoFalta: inf.tipo_falta || '', tipoFaltaOtro: inf.tipo_falta_otro || '', evidencias,
        ...Object.fromEntries(CAMPOS_TEXTO.map(c => [c, inf[c] || ''])),
      };
    }

    const config = JSON.stringify({
      usuario: a.usuarioId,
      usuarioNombre: a.usuarioNombre,
      cargo: a.cargo,
      hoy: hoyBogota(),
      tiposFalta: a.tiposFalta,
      diasInmediatez: a.diasInmediatez,
      verAntecedentes: a.verTodos,
      maxEvidencias: MAX_EVIDENCIAS,
      borrador,
    }).replace(/<\/script>/gi, '<\\/script>');
    res.send(fs.readFileSync(FORM_HTML, 'utf8').replace('__CONFIG__', config));
  } catch (err) {
    console.error('[informesDisciplinarios] GET /form:', err);
    res.status(500).send(htmlError('Error interno del servidor'));
  }
});

// ── Búsqueda de trabajadores activos (cualquier operación) ───────────────────
router.get('/api/trabajadores', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ trabajadores: [] });
    const [rows] = await pool.execute(
      `SELECT \`Identificación\` AS identificacion, Trabajador, Cargo, \`Operación\` AS operacion
         FROM \`Maestro_Vinculación\`
        WHERE Estado = 'Activo' AND (Trabajador LIKE ? OR CAST(\`Identificación\` AS CHAR) LIKE ?)
        ORDER BY Trabajador LIMIT 25`,
      [`%${q}%`, `${q}%`]
    );
    res.json({ trabajadores: rows.map(r => ({ ...r, nombre: nombreSinCedula(r.Trabajador) })) });
  } catch (err) {
    console.error('[informesDisciplinarios] GET /api/trabajadores:', err);
    res.status(500).json({ error: 'No se pudo buscar el trabajador' });
  }
});

// Datos del trabajador escogido: cargo, operación, ingreso, funciones del cargo y antecedentes
router.get('/api/trabajador', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const v = await vinculacionActiva(req.query.identificacion);
    if (!v) return res.status(404).json({ error: 'El trabajador no está activo.' });
    res.json({
      identificacion: String(v.identificacion), nombre: nombreSinCedula(v.Trabajador), cargo: v.Cargo || '',
      operacion: v.operacion || '', regional: v.Regional || '', fechaIngreso: idis.fechaIso(v.fechaIngreso),
      funciones: await idis.funcionesDelCargo(v.Cargo),
      antecedentes: a.verTodos ? await antecedentes(v.identificacion, req.query.excluir) : null,
    });
  } catch (err) {
    console.error('[informesDisciplinarios] GET /api/trabajador:', err);
    res.status(500).json({ error: 'No se pudo cargar el trabajador' });
  }
});

// Firma registrada de quien reporta (vista previa)
router.get('/api/firma', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const url = await idis.urlFirmaRegistrada(a.usuarioId);
    const base64 = url ? await descargarFirmaBase64PorUrl(url).catch(() => null) : null;
    res.json({ tieneFirma: !!base64, firmaBase64: base64 });
  } catch (err) {
    console.error('[informesDisciplinarios] GET /api/firma:', err);
    res.status(500).json({ error: 'No se pudo leer la firma' });
  }
});

// ── Guardar (crea o actualiza el borrador) ───────────────────────────────────
router.post('/api/informe', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const b = req.body || {};
    let id = b.id ? String(b.id) : null;
    if (id) {
      const inf = await obtenerInforme(id);
      if (!inf || inf.usuario !== a.usuarioId) return res.status(404).json({ error: 'No se encontró el borrador.' });
      if (inf.estado !== 'Borrador') return res.status(409).json({ error: 'Este informe ya fue firmado y no se puede editar.' });
    }

    let trab = { identificacion: null, idVinculacion: null, nombre: null, cargo: null, operacion: null, regional: null, fechaIngreso: null };
    if (b.identificacion) {
      const v = await vinculacionActiva(b.identificacion);
      if (!v) return res.status(400).json({ error: 'El trabajador escogido no está activo.' });
      trab = { identificacion: v.identificacion, idVinculacion: v.idVinculacion, nombre: nombreSinCedula(v.Trabajador), cargo: v.Cargo || null,
        operacion: v.operacion || null, regional: v.Regional || null, fechaIngreso: idis.fechaIso(v.fechaIngreso) || null };
    }
    const fechaHechos = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha_hechos || '')) ? b.fecha_hechos : null;
    if (fechaHechos && fechaHechos > hoyBogota()) return res.status(400).json({ error: 'La fecha de los hechos no puede ser posterior a hoy.' });
    const tipoFalta = String(b.tipo_falta || '').trim().slice(0, 150) || null;
    const tipoFaltaOtro = idis.normalizarTexto(tipoFalta) === 'otro' ? (String(b.tipo_falta_otro || '').trim().slice(0, 255) || null) : null;
    const textos = CAMPOS_TEXTO.map(c => String(b[c] || '').trim().slice(0, 8000) || null);

    const valores = [trab.identificacion, trab.idVinculacion, trab.nombre, trab.cargo, trab.operacion, trab.regional, trab.fechaIngreso,
      fechaHechos, tipoFalta, tipoFaltaOtro, ...textos, a.usuarioNombre, a.cargo || null];
    if (id) {
      await pool.execute(
        `UPDATE Dynamic_Informe_Disciplinario SET identificacion = ?, id_vinculacion = ?, nombre_trabajador = ?, cargo_trabajador = ?,
           operacion = ?, regional = ?, fecha_ingreso = ?, fecha_hechos = ?, tipo_falta = ?, tipo_falta_otro = ?,
           descripcion_hechos = ?, accion_inmediata = ?, consecuencias = ?, comentarios_fotos = ?, forma_conocimiento = ?,
           nombre_reporta = ?, cargo_reporta = ?
         WHERE id_informe = ? AND estado = 'Borrador'`,
        [...valores, id]
      );
    } else {
      id = uuidv4();
      await pool.execute(
        `INSERT INTO Dynamic_Informe_Disciplinario
           (identificacion, id_vinculacion, nombre_trabajador, cargo_trabajador, operacion, regional, fecha_ingreso, fecha_hechos,
            tipo_falta, tipo_falta_otro, descripcion_hechos, accion_inmediata, consecuencias, comentarios_fotos, forma_conocimiento,
            nombre_reporta, cargo_reporta, id_informe, usuario, estado, fecha_informe)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Borrador', ?)`,
        [...valores, id, a.usuarioId, hoyBogota()]
      );
    }
    res.json({ ok: true, id });
  } catch (err) {
    console.error('[informesDisciplinarios] POST /api/informe:', err);
    res.status(500).json({ error: 'No se pudo guardar el informe' });
  }
});

// Fotos de evidencia: una por petición (la foto llega comprimida desde el formulario)
router.post('/api/informe/:id/evidencia', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const inf = await obtenerInforme(req.params.id);
    if (!inf || inf.usuario !== a.usuarioId) return res.status(404).json({ error: 'No se encontró el borrador.' });
    if (inf.estado !== 'Borrador') return res.status(409).json({ error: 'Este informe ya fue firmado y no se puede editar.' });
    const [[{ n }]] = await pool.execute('SELECT COUNT(*) AS n FROM Dynamic_Informe_Disciplinario_Evidencias WHERE id_informe = ?', [inf.id_informe]);
    if (n >= MAX_EVIDENCIAS) return res.status(400).json({ error: `Máximo ${MAX_EVIDENCIAS} fotos por informe.` });
    const { base64, contentType } = req.body || {};
    if (!base64 || !/^image\/(jpeg|png|webp)$/.test(String(contentType || ''))) return res.status(400).json({ error: 'La evidencia debe ser una imagen.' });
    const buffer = Buffer.from(String(base64).replace(/^data:.*;base64,/, ''), 'base64');
    const ext = contentType === 'image/png' ? 'png' : (contentType === 'image/webp' ? 'webp' : 'jpg');
    const url = await subirEvidenciaInformeDisciplinario(inf.id_informe, `evidencia_${Date.now()}.${ext}`, buffer, contentType);
    const [ins] = await pool.execute('INSERT INTO Dynamic_Informe_Disciplinario_Evidencias (id_informe, url) VALUES (?, ?)', [inf.id_informe, url]);
    res.json({ ok: true, idEvidencia: ins.insertId, url });
  } catch (err) {
    console.error('[informesDisciplinarios] POST /api/informe/:id/evidencia:', err);
    res.status(500).json({ error: 'No se pudo subir la foto' });
  }
});

router.delete('/api/informe/:id/evidencia/:idEvidencia', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const inf = await obtenerInforme(req.params.id);
    if (!inf || inf.usuario !== a.usuarioId) return res.status(404).json({ error: 'No se encontró el borrador.' });
    if (inf.estado !== 'Borrador') return res.status(409).json({ error: 'Este informe ya fue firmado y no se puede editar.' });
    await pool.execute('DELETE FROM Dynamic_Informe_Disciplinario_Evidencias WHERE id_evidencia = ? AND id_informe = ?', [req.params.idEvidencia, inf.id_informe]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[informesDisciplinarios] DELETE evidencia:', err);
    res.status(500).json({ error: 'No se pudo quitar la foto' });
  }
});

// ── Firmar y registrar: PDF en la carpeta del trabajador (documento 43) y correo a Jurídica ──
router.post('/api/informe/:id/registrar', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const inf = await obtenerInforme(req.params.id);
    if (!inf || inf.usuario !== a.usuarioId) return res.status(404).json({ error: 'No se encontró el borrador.' });
    if (inf.estado !== 'Borrador') return res.status(409).json({ error: 'Este informe ya fue firmado.' });

    const faltan = Object.entries(OBLIGATORIOS).filter(([c]) => !String(inf[c] == null ? '' : inf[c]).trim()).map(([, l]) => l);
    if (idis.normalizarTexto(inf.tipo_falta) === 'otro' && !String(inf.tipo_falta_otro || '').trim()) faltan.push('Cuál es la falta (OTRO)');
    if (faltan.length) return res.status(400).json({ error: `Falta diligenciar: ${faltan.join(', ')}.` });
    if (!(await vinculacionActiva(inf.identificacion))) return res.status(400).json({ error: 'El trabajador ya no está activo.' });

    const { usarFirmaRegistrada, firmaBase64 } = req.body || {};
    let urlFirma;
    if (usarFirmaRegistrada) {
      urlFirma = await idis.urlFirmaRegistrada(a.usuarioId);
      if (!urlFirma) return res.status(400).json({ error: 'No tiene una firma registrada; dibuje su firma.' });
    } else {
      if (!firmaBase64) return res.status(400).json({ error: 'Debe dibujar su firma.' });
      const buffer = Buffer.from(String(firmaBase64).replace(/^data:.*;base64,/, ''), 'base64');
      urlFirma = await subirFirma(await idis.claveFirmaUsuario(a.usuarioId), buffer);
    }

    const ahora = ahoraBogota();
    const funciones = JSON.stringify(await idis.funcionesDelCargo(inf.cargo_trabajador));
    const [upd] = await pool.execute(
      `UPDATE Dynamic_Informe_Disciplinario SET estado = 'Recibido', url_firma = ?, fecha_firma = ?, fecha_registro = ?, fecha_informe = ?,
         funciones = ?, nombre_reporta = ?, cargo_reporta = ?
       WHERE id_informe = ? AND estado = 'Borrador'`,
      [urlFirma, ahora, ahora, ahora.slice(0, 10), funciones, a.usuarioNombre, a.cargo || null, inf.id_informe]
    );
    if (!upd.affectedRows) return res.status(409).json({ error: 'Este informe ya fue firmado.' });

    const firmado = await obtenerInforme(inf.id_informe);
    let urlDoc = null;
    try {
      urlDoc = await idis.generarPdfInforme(firmado);
      await pool.execute('UPDATE Dynamic_Informe_Disciplinario SET url_doc = ? WHERE id_informe = ?', [urlDoc, inf.id_informe]);
      await idis.registrarDocumentoTrabajador(firmado, urlDoc, null);
    } catch (errPdf) {
      console.error('[informesDisciplinarios] No se pudo generar el PDF del informe', inf.id_informe, errPdf);
    }

    let correoEnviado = false;
    try {
      const dest = await idis.destinatariosNuevoInforme(a.email);
      if (dest.habilitado) {
        correoEnviado = await notificarInformeDisciplinario({
          para: dest.para, copia: dest.copia, radicado: idis.radicado(inf.id_informe),
          trabajador: firmado.nombre_trabajador, identificacion: firmado.identificacion, cargo: firmado.cargo_trabajador,
          operacion: firmado.operacion, tipoFalta: idis.textoFalta(firmado), fechaHechos: idis.fechaLarga(firmado.fecha_hechos),
          reporta: a.usuarioNombre, cargoReporta: a.cargo, descripcion: firmado.descripcion_hechos, urlDoc,
        });
      }
    } catch (errCorreo) {
      console.error('[informesDisciplinarios] No se pudo enviar el correo del informe', inf.id_informe, errCorreo.message);
    }
    res.json({ ok: true, id: inf.id_informe, radicado: idis.radicado(inf.id_informe), urlDoc, correoEnviado });
  } catch (err) {
    console.error('[informesDisciplinarios] POST /api/informe/:id/registrar:', err);
    res.status(500).json({ error: 'No se pudo registrar el informe' });
  }
});

// ── Pestaña: listado, detalle y seguimiento ──────────────────────────────────
router.get('/api/informes', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const where = a.verTodos ? "(i.estado <> 'Borrador' OR i.usuario = ?)" : 'i.usuario = ?';
    const [rows] = await pool.execute(
      `SELECT i.id_informe, i.estado, i.usuario, i.nombre_reporta, i.cargo_reporta, i.fecha_informe, i.fecha_registro, i.identificacion,
              i.nombre_trabajador, i.cargo_trabajador, i.operacion, i.regional, i.fecha_hechos, i.tipo_falta, i.tipo_falta_otro,
              i.url_doc, i.resultado_cierre, i.fecha_cierre, i.fecha_creacion
         FROM Dynamic_Informe_Disciplinario i
        WHERE ${where}
        ORDER BY COALESCE(i.fecha_registro, i.fecha_creacion) DESC`,
      [a.usuarioId]
    );
    res.json({
      informes: rows.map(r => ({
        id: r.id_informe, radicado: idis.radicado(r.id_informe), estado: r.estado, propio: r.usuario === a.usuarioId,
        reporta: r.nombre_reporta || r.usuario, cargoReporta: r.cargo_reporta || '',
        fechaRegistro: r.fecha_registro ? idis.fechaIso(r.fecha_registro) : '', fechaCreacion: idis.fechaIso(r.fecha_creacion),
        identificacion: r.identificacion ? String(r.identificacion) : '', trabajador: r.nombre_trabajador || '',
        cargo: r.cargo_trabajador || '', operacion: r.operacion || '', regional: r.regional || '',
        fechaHechos: idis.fechaIso(r.fecha_hechos), tipoFalta: r.tipo_falta ? idis.textoFalta(r) : '',
        urlDoc: r.url_doc || '', resultado: r.resultado_cierre || '', fechaCierre: r.fecha_cierre ? idis.fechaIso(r.fecha_cierre) : '',
      })),
      permisos: { verTodos: a.verTodos, puedeCerrar: a.puedeCerrar, resultadosCierre: a.resultadosCierre },
    });
  } catch (err) {
    console.error('[informesDisciplinarios] GET /api/informes:', err);
    res.status(500).json({ error: 'No se pudieron cargar los informes' });
  }
});

router.get('/api/informe/:id', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const inf = await obtenerInforme(req.params.id);
    if (!inf || !puedeVer(inf, a) || (inf.estado === 'Borrador' && inf.usuario !== a.usuarioId)) return res.status(404).json({ error: 'No se encontró el informe.' });
    const [evidencias] = await pool.execute('SELECT url FROM Dynamic_Informe_Disciplinario_Evidencias WHERE id_informe = ? ORDER BY id_evidencia', [inf.id_informe]);
    const [seguimiento] = await pool.execute(
      `SELECT s.fecha, s.tipo, s.nota, COALESCE(u.Nombre, s.usuario) AS usuario
         FROM Dynamic_Informe_Disciplinario_Seguimiento s LEFT JOIN Maestro_Usuarios u ON u.ID = s.usuario
        WHERE s.id_informe = ? ORDER BY s.fecha, s.id_seguimiento`,
      [inf.id_informe]
    );
    // Documentos de Proceso Disciplinario (43) que Jurídica cargó al trabajador desde el registro del informe
    let documentos = [];
    if (a.verTodos && inf.identificacion && inf.fecha_registro) {
      const [docs] = await pool.execute(
        `SELECT Doc, Observaciones, FechaRegistro, Usuario FROM Maestro_docTrabajador
          WHERE \`Identificación\` = ? AND TipoDocumento = ? AND FechaRegistro >= ? AND (Doc IS NULL OR Doc <> ?)
          ORDER BY FechaRegistro`,
        [inf.identificacion, idis.ID_DOC_TRABAJADOR, inf.fecha_registro, inf.url_doc || '']
      );
      const { resolverUrlDocumento } = require('../services/storage');
      documentos = docs.map(d => ({ url: resolverUrlDocumento(d.Doc, null, String(inf.identificacion)), observaciones: d.Observaciones || '', fecha: d.FechaRegistro, usuario: d.Usuario || '' }));
    }
    res.json({
      informe: {
        id: inf.id_informe, radicado: idis.radicado(inf.id_informe), estado: inf.estado, propio: inf.usuario === a.usuarioId,
        reporta: inf.nombre_reporta, cargoReporta: inf.cargo_reporta, fechaRegistro: inf.fecha_registro,
        trabajador: inf.nombre_trabajador, identificacion: inf.identificacion ? String(inf.identificacion) : '', cargo: inf.cargo_trabajador,
        operacion: inf.operacion, regional: inf.regional, fechaIngreso: idis.fechaIso(inf.fecha_ingreso),
        fechaHechos: idis.fechaIso(inf.fecha_hechos), tipoFalta: idis.textoFalta(inf),
        descripcion: inf.descripcion_hechos, accion: inf.accion_inmediata, consecuencias: inf.consecuencias,
        comentariosFotos: inf.comentarios_fotos, formaConocimiento: inf.forma_conocimiento, urlDoc: inf.url_doc,
        resultado: inf.resultado_cierre, notaCierre: inf.nota_cierre, fechaCierre: inf.fecha_cierre,
      },
      evidencias: evidencias.map(e => e.url),
      seguimiento,
      documentos,
      antecedentes: a.verTodos && inf.identificacion ? await antecedentes(inf.identificacion, inf.id_informe) : null,
      permisos: { puedeCerrar: a.puedeCerrar, resultadosCierre: a.resultadosCierre },
    });
  } catch (err) {
    console.error('[informesDisciplinarios] GET /api/informe/:id:', err);
    res.status(500).json({ error: 'No se pudo cargar el informe' });
  }
});

// Borrar un borrador propio (los firmados no se borran)
router.delete('/api/informe/:id', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    const inf = await obtenerInforme(req.params.id);
    if (!inf || inf.usuario !== a.usuarioId) return res.status(404).json({ error: 'No se encontró el borrador.' });
    if (inf.estado !== 'Borrador') return res.status(409).json({ error: 'Un informe firmado no se puede borrar.' });
    await pool.execute('DELETE FROM Dynamic_Informe_Disciplinario_Evidencias WHERE id_informe = ?', [inf.id_informe]);
    await pool.execute("DELETE FROM Dynamic_Informe_Disciplinario WHERE id_informe = ? AND estado = 'Borrador'", [inf.id_informe]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[informesDisciplinarios] DELETE /api/informe/:id:', err);
    res.status(500).json({ error: 'No se pudo borrar el borrador' });
  }
});

// Anotación de seguimiento (Jurídica)
router.post('/api/informe/:id/seguimiento', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    if (!a.puedeCerrar) return res.status(403).json({ error: 'Su rol no puede anotar el seguimiento.' });
    const inf = await obtenerInforme(req.params.id);
    if (!inf || inf.estado === 'Borrador') return res.status(404).json({ error: 'No se encontró el informe.' });
    const nota = String((req.body && req.body.nota) || '').trim().slice(0, 4000);
    if (!nota) return res.status(400).json({ error: 'Escriba la anotación.' });
    await pool.execute('INSERT INTO Dynamic_Informe_Disciplinario_Seguimiento (id_informe, usuario, tipo, nota, fecha) VALUES (?, ?, ?, ?, ?)',
      [inf.id_informe, a.usuarioId, 'Nota', nota, ahoraBogota()]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[informesDisciplinarios] POST seguimiento:', err);
    res.status(500).json({ error: 'No se pudo guardar la anotación' });
  }
});

// Cerrar el informe con su resultado (Jurídica)
router.post('/api/informe/:id/cerrar', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    if (!a.puedeCerrar) return res.status(403).json({ error: 'Su rol no puede cerrar informes.' });
    const inf = await obtenerInforme(req.params.id);
    if (!inf || inf.estado === 'Borrador') return res.status(404).json({ error: 'No se encontró el informe.' });
    if (inf.estado === 'Cerrado') return res.status(409).json({ error: 'El informe ya está cerrado.' });
    const resultado = String((req.body && req.body.resultado) || '').trim().slice(0, 150);
    const nota = String((req.body && req.body.nota) || '').trim().slice(0, 4000) || null;
    if (!resultado) return res.status(400).json({ error: 'Escoja el resultado del cierre.' });
    const ahora = ahoraBogota();
    await pool.execute(
      "UPDATE Dynamic_Informe_Disciplinario SET estado = 'Cerrado', resultado_cierre = ?, nota_cierre = ?, usuario_cierre = ?, fecha_cierre = ? WHERE id_informe = ? AND estado = 'Recibido'",
      [resultado, nota, a.usuarioId, ahora, inf.id_informe]
    );
    await pool.execute('INSERT INTO Dynamic_Informe_Disciplinario_Seguimiento (id_informe, usuario, tipo, nota, fecha) VALUES (?, ?, ?, ?, ?)',
      [inf.id_informe, a.usuarioId, 'Cierre', `${resultado}${nota ? ` — ${nota}` : ''}`, ahora]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[informesDisciplinarios] POST cerrar:', err);
    res.status(500).json({ error: 'No se pudo cerrar el informe' });
  }
});

// Regenerar el PDF con la plantilla vigente (mismos datos y firma)
router.post('/api/informe/:id/regenerar', async (req, res) => {
  try {
    const a = await accesoInformes(req.query.usuario);
    if (!a) return res.status(403).json({ error: 'No autorizado' });
    if (!a.puedeCerrar) return res.status(403).json({ error: 'Su rol no puede regenerar el documento.' });
    const inf = await obtenerInforme(req.params.id);
    if (!inf || inf.estado === 'Borrador') return res.status(404).json({ error: 'No se encontró el informe.' });
    const urlDoc = await idis.generarPdfInforme(inf);
    await pool.execute('UPDATE Dynamic_Informe_Disciplinario SET url_doc = ? WHERE id_informe = ?', [urlDoc, inf.id_informe]);
    await idis.registrarDocumentoTrabajador(inf, urlDoc, inf.url_doc);
    res.json({ ok: true, urlDoc });
  } catch (err) {
    console.error('[informesDisciplinarios] POST regenerar:', err);
    res.status(500).json({ error: 'No se pudo regenerar el documento' });
  }
});

module.exports = router;

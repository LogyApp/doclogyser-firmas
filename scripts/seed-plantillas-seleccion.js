const fs = require('fs');
const path = require('path');
const pool = require('../src/services/db');

const DOCS = [
  { prefijo: 'ACTCON', idConfig: 2,  tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'ARO',    idConfig: 7,  tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'CHC',    idConfig: 16, tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'CPC',    idConfig: 19, tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'CS',     idConfig: 20, tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'EVIN',   idConfig: 29, tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'INGE',   idConfig: 32, tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'ITAL',   idConfig: 33, tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'MF',     idConfig: 39, tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'SEOP',   idConfig: 48, tablaDatos: 'Dynamic_hv_aspirante' },
  { prefijo: 'TD',     idConfig: 49, tablaDatos: 'Dynamic_hv_aspirante' }
];

function generarEnvoltorioHtml(plantilla, cuerpoHtml) {
  const enc = plantilla.encabezado || {};
  const tituloEnc = enc.titulo_politica || plantilla.nombre || 'Documento Corporativo';
  const codigoDoc = enc.codigo_doc || plantilla.codigo || '';
  const versionDoc = enc.version_doc || plantilla.version || '1';
  const paginaDoc = enc.pagina || '1 de 1';
  const nombreDoc = plantilla.nombre || tituloEnc;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${nombreDoc}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #1B2A5E;
    --navy-dk: #162249;
    --navy-lt: #EEF1F8;
    --orange: #F15A22;
    --border: #D8DCEA;
    --text: #0F1C3F;
    --text-mid: #5A6A8A;
    --text-dim: #9AA5BF;
    --green: #16A34A;
    --bg: #F4F6FB;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Plus Jakarta Sans", Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px 16px;
    line-height: 1.5;
  }
  .doc-container {
    max-width: 840px;
    margin: 0 auto;
    background: #fff;
    border-radius: 10px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 20px rgba(15, 28, 63, 0.08);
    overflow: hidden;
  }
  .doc-head {
    display: grid;
    grid-template-columns: 140px 1fr 120px;
    border-bottom: 2.5px solid var(--navy);
  }
  .dh-logo {
    padding: 14px 16px;
    border-right: 1.5px solid var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dh-logo img { height: 32px; object-fit: contain; }
  .dh-title {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-right: 1.5px solid var(--navy);
  }
  .dh-title span {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--navy);
    line-height: 1.4;
  }
  .dh-meta { display: flex; flex-direction: column; }
  .dm-row {
    padding: 6px 10px;
    font-size: 9.5px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .dm-row:last-child { border-bottom: none; }
  .dm-row span:first-child { color: var(--text-dim); }
  .dm-row span:last-child { font-weight: 600; color: var(--text); }
  .stripe { height: 3px; background: linear-gradient(90deg, #F15A22, #D94E1A); }
  .colabo {
    display: grid;
    grid-template-columns: 2fr auto 1fr auto 1fr auto 1fr;
    align-items: center;
    padding: 10px 24px;
    background: var(--navy);
  }
  .ci { display: flex; flex-direction: column; gap: 2px; }
  .cl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: rgba(255,255,255,.6); }
  .cv { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cs { width: 1px; height: 28px; background: rgba(255,255,255,.15); margin: 0 14px; }
  .doc-title { padding: 18px 24px 14px; text-align: center; border-bottom: 1px solid var(--border); }
  .doc-title h1 { font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--navy); }
  .doc-body { padding: 24px 28px; border-bottom: 1px solid var(--border); }
  .doc-sig { padding: 22px 28px 26px; }
  .sig-frase { font-size: 12px; color: #333; margin-bottom: 16px; font-weight: 500; }
  .sig-table {
    width: 100%;
    border-collapse: collapse;
    border: 1.5px solid var(--navy);
    border-radius: 6px;
    overflow: hidden;
  }
  .sig-table th {
    background: var(--navy-lt);
    color: var(--navy);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .5px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    text-align: left;
  }
  .sig-table td {
    padding: 10px 10px;
    font-size: 11px;
    color: var(--text);
    border: 1px solid var(--border);
    vertical-align: middle;
  }
  .sig-box { min-height: 55px; display: flex; align-items: center; justify-content: center; }
  .sig-img { max-height: 55px; max-width: 160px; object-fit: contain; }
  @media (max-width: 640px) {
    .doc-head, .colabo { grid-template-columns: 1fr; }
    .cs { display: none; }
    .colabo { gap: 10px; padding: 14px; }
    .doc-body, .doc-sig { padding: 16px; }
  }
  @media print {
    body { background: #fff; padding: 0; }
    .doc-container { box-shadow: none; border: none; max-width: 100%; }
    .colabo { background: #f0f2f8 !important; -webkit-print-color-adjust: exact; }
    .cl { color: #555 !important; }
    .cv { color: #000 !important; }
  }
</style>
</head>
<body>
<div class="doc-container">
  <!-- ENCABEZADO -->
  <div class="doc-head">
    <div class="dh-logo">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER">
    </div>
    <div class="dh-title">
      <span>${tituloEnc}</span>
    </div>
    <div class="dh-meta">
      <div class="dm-row"><span>Código</span><span>${codigoDoc}</span></div>
      <div class="dm-row"><span>Versión</span><span>${versionDoc}</span></div>
      <div class="dm-row"><span>Página</span><span>${paginaDoc}</span></div>
    </div>
  </div>
  <div class="stripe"></div>

  <!-- BANNER COLABORADOR -->
  <div class="colabo">
    <div class="ci"><div class="cl">Colaborador</div><div class="cv">{{nombre_completo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Identificación</div><div class="cv">{{identificacion}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Cargo</div><div class="cv">{{cargo}}</div></div>
    <div class="cs"></div>
    <div class="ci"><div class="cl">Operación</div><div class="cv">{{operacion}}</div></div>
  </div>

  <!-- TITULO DOCUMENTO -->
  <div class="doc-title">
    <h1>${nombreDoc}</h1>
  </div>

  <!-- CONTENIDO ESPECÍFICO -->
  <div class="doc-body">
    ${cuerpoHtml}
  </div>

  <!-- TABLA DE FIRMA -->
  <div class="doc-sig">
    <p class="sig-frase">
      Se firma en el municipio de <strong>{{municipio_firma}}</strong>, el día <strong>{{dia_firma}}</strong> del mes <strong>{{mes_firma}}</strong> del año <strong>{{anio_firma}}</strong>.
    </p>
    <table class="sig-table">
      <thead>
        <tr>
          <th style="width:28%">Firma</th>
          <th style="width:34%">Nombres y Apellidos</th>
          <th style="width:19%">Identificación</th>
          <th style="width:19%">Lugar de Expedición</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div class="sig-box">{{firma_colaborador}}</div>
          </td>
          <td><strong>{{nombre_completo}}</strong></td>
          <td>{{identificacion}}</td>
          <td>{{ciudad_expedicion}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
</body>
</html>`;
}

async function run() {
  console.log('=== Iniciando generación y registro de plantillas de contratación ===\n');

  for (const item of DOCS) {
    const jsonPath = path.join(__dirname, '../src/config/clausulas', `${item.prefijo}.json`);
    if (!fs.existsSync(jsonPath)) {
      console.warn(`[WARN] No se encontró el archivo JSON para ${item.prefijo} en ${jsonPath}`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    // Inyectar placeholders de datos por si el renderer los requiere
    data._datos = {
      nombre_completo: '{{nombre_completo}}',
      identificacion: '{{identificacion}}',
      cargo: '{{cargo}}',
      operacion: '{{operacion}}',
      regional: '{{regional}}',
    };

    const renderer = require(`../src/renderers/${item.prefijo}.js`);
    const cuerpoHtml = renderer.buildScreen(data);
    const htmlCompleto = generarEnvoltorioHtml(data, cuerpoHtml);

    // Guardar en archivo local
    const outFile = path.join(__dirname, '../src/templates/seleccion', `${item.prefijo}.html`);
    fs.writeFileSync(outFile, htmlCompleto, 'utf8');
    console.log(`[OK] Guardado archivo local: src/templates/seleccion/${item.prefijo}.html (${htmlCompleto.length} bytes)`);

    // Insertar o actualizar en Maestro_Plantillas
    const [existentes] = await pool.execute(
      'SELECT id_plantilla FROM Maestro_Plantillas WHERE nombre_proceso = ? LIMIT 1',
      [item.prefijo]
    );

    const versionNum = parseInt(data.version, 10) || 1;

    if (existentes.length > 0) {
      const idPlantilla = existentes[0].id_plantilla;
      await pool.execute(
        `UPDATE Maestro_Plantillas 
         SET contenido_html = ?, version = ?, ultima_actualizacion = NOW(), activo = 1 
         WHERE id_plantilla = ?`,
        [htmlCompleto, versionNum, idPlantilla]
      );
      console.log(`[DB UPDATE] Maestro_Plantillas id ${idPlantilla} actualizado para '${item.prefijo}'`);
    } else {
      const [res] = await pool.execute(
        `INSERT INTO Maestro_Plantillas 
         (nombre_proceso, tabla_datos, id_campo_fk, bucket_carpeta, requiere_firma_trabajador, activo, version, contenido_html, ultima_actualizacion) 
         VALUES (?, ?, 'id_aspirante', 'hojas_vida_logyser', 1, 1, ?, ?, NOW())`,
        [item.prefijo, item.tablaDatos, versionNum, htmlCompleto]
      );
      console.log(`[DB INSERT] Maestro_Plantillas id ${res.insertId} creado para '${item.prefijo}'`);
    }
  }

  console.log('\n=== Proceso completado exitosamente ===');
  process.exit(0);
}

run().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});

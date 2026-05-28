-- ─────────────────────────────────────────────────────────────────────────────
-- PLANTILLAS PAZ Y SALVO - LOG&SER
-- Ejecutar en la base de datos Desplegables
-- ─────────────────────────────────────────────────────────────────────────────

SET SQL_SAFE_UPDATES = 0;

-- ── TH-R-021: Compromiso BAJO (solo firma Nómina) ────────────────────────────
UPDATE Maestro_Plantillas SET contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; padding: 18px 24px; }
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .header-table td { vertical-align: middle; }
  .logo-cell { width: 130px; }
  .logo-cell img { height: 52px; }
  .title-cell { text-align: center; font-size: 13px; font-weight: bold; line-height: 1.5; }
  .code-cell { width: 120px; text-align: right; }
  .code-box { border: 1px solid #999; padding: 3px 6px; font-size: 9.5px; line-height: 1.6; }
  .parrafo { font-size: 10.5px; line-height: 1.7; margin-bottom: 14px; text-align: justify; }
  table.art { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10px; }
  table.art th { background: #d9d9d9; border: 1px solid #999; padding: 5px 4px; text-align: center; font-size: 10px; }
  table.art td { border: 1px solid #999; padding: 4px; text-align: center; vertical-align: middle; }
  table.art td.art-name { text-align: left; padding-left: 6px; }
  .nota { font-size: 9px; font-style: italic; margin-bottom: 14px; }
  .firmas { width: 100%; border-collapse: collapse; margin-top: 10px; }
  .firmas td { vertical-align: top; padding: 6px 10px; width: 33.33%; }
  .firma-box { border-top: 1px solid #555; padding-top: 6px; margin-top: 48px; font-size: 9.5px; line-height: 1.5; }
  .firma-img { height: 52px; display: block; margin-bottom: 4px; }
  .obs-box { border: 1px solid #bbb; border-radius: 3px; padding: 6px 8px; font-size: 9.5px; min-height: 40px; margin-bottom: 8px; color: #444; }
  .obs-label { font-weight: bold; font-size: 9.5px; margin-bottom: 3px; }
</style>
</head>
<body>

<table class="header-table">
  <tr>
    <td class="logo-cell"><img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER"></td>
    <td class="title-cell">PAZ Y SALVO DESVINCULACIÓN LABORAL<br>LOGYSER</td>
    <td class="code-cell">
      <div class="code-box">
        TH-R-021<br>Versión 1<br>Página 1 de 1
      </div>
    </td>
  </tr>
</table>

<p class="parrafo">
  A los <strong>{{fecha_expedicion}}</strong>, se hace constar que el(la) colaborador(a)
  <strong>{{nombre_trabajador}}</strong>, portador(a) de la Cédula de Ciudadanía número
  <strong>{{identificacion}}</strong>, quien ejerció las funciones de <strong>{{cargo}}</strong>
  en la operación <strong>{{operacion}}</strong>, se encuentra a la fecha a PAZ Y SALVO por todo
  concepto con la organización, de acuerdo con la relación por áreas de trabajo descrita a
  continuación. La presente certificación se expide en virtud de la terminación de su vínculo
  laboral, fijada a partir del día <strong>{{fecha_retiro}}</strong>, siendo este su último día
  efectivamente laborado.
</p>

<table class="art">
  <thead>
    <tr>
      <th style="width:40%">ARTÍCULO</th>
      <th style="width:20%">CANTIDAD</th>
      <th style="width:20%">SÍ</th>
      <th style="width:20%">NO</th>
    </tr>
  </thead>
  <tbody>
    {{filas_articulos}}
  </tbody>
</table>

<p class="nota">Nota: En caso de que el artículo no haya sido asignado al colaborador, hacer una raya sobre la fila con la nota N/A.</p>

<p style="font-size:10px;margin-bottom:4px;font-weight:bold">Observaciones:</p>
<div class="obs-box">{{observaciones}}</div>

<table class="firmas">
  <tr>
    <td>
      <div style="font-weight:bold;font-size:9.5px;margin-bottom:4px">Firma trabajador:</div>
      {{firma_trabajador_html}}
      <div class="firma-box">
        Nombre: <strong>{{nombre_trabajador}}</strong><br>
        Cargo: {{cargo}}
      </div>
    </td>
    <td>
      <div style="font-weight:bold;font-size:9.5px;margin-bottom:4px">Nombre de quien recibe:</div>
      {{firma_responsable_html}}
      <div class="firma-box">
        Nombre: <strong>{{nombre_firmante}}</strong><br>
        Cargo: {{cargo_firmante}}
      </div>
    </td>
    <td>
      <div style="font-weight:bold;font-size:9.5px;margin-bottom:4px">Firma nómina:</div>
      {{firma_nomina_html}}
      <div class="firma-box">
        Nombre: <strong>{{firma_nomina_nombre}}</strong><br>
        Cargo: {{firma_nomina_cargo}}
      </div>
    </td>
  </tr>
</table>

</body>
</html>'
WHERE LOWER(nombre_proceso) = 'paz_y_salvo_bajo';


-- ── TH-R-022: Compromiso ALTO (firman múltiples áreas) ───────────────────────
UPDATE Maestro_Plantillas SET contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; padding: 18px 24px; }
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .header-table td { vertical-align: middle; }
  .logo-cell { width: 130px; }
  .logo-cell img { height: 52px; }
  .title-cell { text-align: center; font-size: 13px; font-weight: bold; line-height: 1.5; }
  .code-cell { width: 120px; text-align: right; }
  .code-box { border: 1px solid #999; padding: 3px 6px; font-size: 9.5px; line-height: 1.6; }
  .parrafo { font-size: 10.5px; line-height: 1.7; margin-bottom: 14px; text-align: justify; }
  table.art { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px; }
  table.art th { background: #d9d9d9; border: 1px solid #999; padding: 5px 4px; text-align: center; font-size: 10px; }
  table.art td { border: 1px solid #999; padding: 4px; text-align: center; vertical-align: middle; }
  table.art td.art-name { text-align: left; padding-left: 6px; }
  .nota { font-size: 9px; font-style: italic; margin-bottom: 10px; }
  .firmas-sup { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; }
  .firmas-sup td { vertical-align: top; padding: 6px 10px; width: 33.33%; }
  .firmas-areas { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .firmas-areas td { vertical-align: top; padding: 6px 6px; border-top: none; }
  .firma-box { border-top: 1px solid #555; padding-top: 6px; margin-top: 48px; font-size: 9.5px; line-height: 1.5; }
  .firma-img { height: 52px; display: block; margin-bottom: 4px; }
  .obs-box { border: 1px solid #bbb; border-radius: 3px; padding: 6px 8px; font-size: 9.5px; min-height: 36px; margin-bottom: 8px; color: #444; }
  .section-title { font-size: 10px; font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
</style>
</head>
<body>

<table class="header-table">
  <tr>
    <td class="logo-cell"><img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="LOG&amp;SER"></td>
    <td class="title-cell">PAZ Y SALVO DESVINCULACIÓN LABORAL ADM<br>LOGYSER</td>
    <td class="code-cell">
      <div class="code-box">
        TH-R-022<br>Versión 1<br>Página 1 de 1
      </div>
    </td>
  </tr>
</table>

<p class="parrafo">
  A los <strong>{{fecha_expedicion}}</strong>, se hace constar que el(la) colaborador(a)
  <strong>{{nombre_trabajador}}</strong>, portador(a) de la Cédula de Ciudadanía número
  <strong>{{identificacion}}</strong>, quien ejerció las funciones de <strong>{{cargo}}</strong>
  en la operación <strong>{{operacion}}</strong>, se encuentra a la fecha a PAZ Y SALVO por todo
  concepto con la organización, de acuerdo con la relación por áreas de trabajo descrita a
  continuación. La presente certificación se expide en virtud de la terminación de su vínculo
  laboral, fijada a partir del día <strong>{{fecha_retiro}}</strong>, siendo este su último día
  efectivamente laborado.
</p>

<table class="art">
  <thead>
    <tr>
      <th style="width:40%">ARTÍCULO</th>
      <th style="width:20%">CANTIDAD</th>
      <th style="width:20%">SÍ</th>
      <th style="width:20%">NO</th>
    </tr>
  </thead>
  <tbody>
    {{filas_articulos}}
  </tbody>
</table>

<p class="nota">Nota: En caso de que el artículo no haya sido asignado al colaborador, hacer una raya sobre la fila con la nota N/A.</p>

<p style="font-size:10px;margin-bottom:4px;font-weight:bold">Observaciones:</p>
<div class="obs-box">{{observaciones}}</div>

<p class="section-title" style="margin-top:10px">Firma trabajador y responsable de recepción:</p>
<table class="firmas-sup">
  <tr>
    <td>
      <div style="font-weight:bold;font-size:9.5px;margin-bottom:4px">Firma trabajador:</div>
      {{firma_trabajador_html}}
      <div class="firma-box">
        Nombre: <strong>{{nombre_trabajador}}</strong><br>
        Cargo: {{cargo}}
      </div>
    </td>
    <td>
      <div style="font-weight:bold;font-size:9.5px;margin-bottom:4px">Nombre de quien recibe:</div>
      {{firma_responsable_html}}
      <div class="firma-box">
        Nombre: <strong>{{nombre_firmante}}</strong><br>
        Cargo: {{cargo_firmante}}
      </div>
    </td>
    <td></td>
  </tr>
</table>

<p class="section-title">Firmas de áreas:</p>
{{firmas_areas_html}}

</body>
</html>'
WHERE LOWER(nombre_proceso) = 'paz_y_salvo_alto';

SET SQL_SAFE_UPDATES = 1;

-- Formatos Italcol (documento de firma 33): 4 de 5 — Política de no uso de teléfonos celulares en la jornada de trabajo.
-- Réplica exacta del formato del cliente (DN-PC-GE-001, versión 03, enero de 2019), una hoja carta: cada texto
-- va en la misma posición y con el mismo ancho del original.
-- La firma del colaborador va sobre la línea "Firma Colaborador"; debajo, nombre, C.C. y fecha de la firma electrónica.
-- El logo llega con {{logo_italcol}}. HTML también en migraciones/plantillas/ITAL_CELULAR.html.
-- Requiere 2026-11-13_italcol_politica_sig.sql (columnas id_config_doc y observaciones).
-- Ejecutada el 2026-11-13 (id 35). Se puede ejecutar más de una vez.

INSERT INTO Maestro_Plantillas
  (nombre_proceso, id_config_doc, observaciones, codigo_formato, version_formato, fecha_version, tabla_datos, id_campo_fk,
   bucket_carpeta, requiere_firma_trabajador, activo, version, contenido_html, ultima_actualizacion)
SELECT 'ITAL_CELULAR', 33, 'Política de no uso de teléfonos celulares en la jornada de trabajo', 'DN-PC-GE-001', '03', '2019-01-01',
       'Dynamic_hv_aspirante', 'id_aspirante', 'hojas_vida_logyser', 1, 1, 1, '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Política de No Uso de Teléfonos Celulares en la Jornada de Trabajo Italcol</title>
<style>
  /* Réplica del formato de Italcol DN-PC-GE-001 v03 (carta). No cambiar el diseño: es formato del cliente.
     Cada texto va en la misma posición del original (Arial / Liberation Sans, que tiene las mismas medidas).
     Algunos textos del original están comprimidos a lo ancho: se replica con transform: scaleX. */
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #ffffff; }
  body { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; color: #000000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pagina { position: relative; width: 612pt; height: 792pt; overflow: hidden; }
  .t { position: absolute; white-space: nowrap; transform-origin: left top; }
  .b { font-weight: bold; }

  .enc-logo { position: absolute; left: 91.05pt; top: 37.25pt; width: 74.65pt; height: 59.8pt; object-fit: contain; }
  /* Renglones 2 y 3 del título: en el original son Arial Narrow negrita; se ajustan al mismo ancho */
  .tit { position: absolute; white-space: nowrap; transform-origin: left top; font-family: "Arial Narrow", "Liberation Sans Narrow", Arial, "Liberation Sans", sans-serif; font-weight: bold; font-size: 12.4pt; line-height: 13.851pt; }
  .naranja { position: absolute; background: #ff6600; }

  .firma-img { position: absolute; left: 445pt; top: 583.7pt; width: 132pt; height: 42pt; display: flex; align-items: flex-end; justify-content: center; }
  .firma-img img { max-height: 42pt; max-width: 132pt; object-fit: contain; }
  .firma-datos { position: absolute; left: 451.6pt; top: 640.6pt; width: 118pt; font-size: 6.5pt; line-height: 7.8pt; color: #333333; }
</style>
</head>
<body>
  <div class="pagina">
    <img class="enc-logo" src="{{logo_italcol}}" alt="Italcol">
    <div class="tit" data-ancho="207.07" style="left:293.73pt; top:66.81pt">DE NO USO DE TELEFONOS CELULARES EN</div>
    <div class="tit" data-ancho="126.82" style="left:334.1pt; top:80.61pt">LA JORNADA DE TRABAJO</div>
    <div class="naranja" style="left:84.7pt; width:481.4pt; top:98.6pt; height:0.75pt"></div>
    <div class="naranja" style="left:84.7pt; width:481.4pt; top:100.05pt; height:3pt"></div>

    <div class="t b" data-ancho="40.44" style="left:78.98pt; top:122.87pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.84091)">ITALCOL</div>
    <div class="t" data-ancho="3.07" style="left:119.42pt; top:122.87pt; font-size:11.04pt; line-height:12.332pt">,</div>
    <div class="t" data-ancho="426.84" style="left:125.66pt; top:122.87pt; font-size:11.04pt; line-height:12.332pt">es consciente que el uso de teléfonos celulares en las áreas OPERATIVAS, tales como</div>
    <div class="t" data-ancho="483.89" style="left:78.98pt; top:135.47pt; font-size:11.04pt; line-height:12.332pt">PRODUCCIOÓN, ALMACEN, TALLERES DE MANTENIMIENTO, VIAS DE ACCESO, ETC. Puede</div>
    <div class="t" data-ancho="38.01" style="left:78.98pt; top:148.07pt; font-size:11.04pt; line-height:12.332pt">generar</div>
    <div class="t" data-ancho="75.81" style="left:120.02pt; top:148.07pt; font-size:11.04pt; line-height:12.332pt">distracciones, y</div>
    <div class="t" data-ancho="179.28" style="left:198.89pt; top:148.07pt; font-size:11.04pt; line-height:12.332pt">en consecuencia generar accidentes</div>
    <div class="t" data-ancho="164.96" style="left:381.31pt; top:148.07pt; font-size:11.04pt; line-height:12.332pt">graves, por este motivo declara la</div>
    <div class="t" data-ancho="7.36" style="left:78.98pt; top:160.79pt; font-size:11.04pt; line-height:12.332pt">P</div>
    <div class="t" data-ancho="457.31" style="left:86.30pt; top:160.79pt; font-size:11.04pt; line-height:12.332pt">ROHIBICION de la posesión y uso de teléfonos celulares y elementos distractores tales como</div>
    <div class="t" data-ancho="471.93" style="left:78.98pt; top:173.39pt; font-size:11.04pt; line-height:12.332pt">tablets (de uso personal), relojes electrónicos entre otros, durante la jornada laboral, razón por la</div>
    <div class="t" data-ancho="191.44" style="left:78.98pt; top:186.11pt; font-size:11.04pt; line-height:12.332pt">cual establece para sus colaboradores:</div>
    <div class="t" data-ancho="105.77" style="left:78.98pt; top:211.31pt; font-size:11.04pt; line-height:12.332pt">Realizar o recibir llam</div>
    <div class="t" data-ancho="346.73" style="left:184.82pt; top:211.31pt; font-size:11.04pt; line-height:12.332pt">adas durante la jornada laboral en las áreas antes mencionadas queda</div>
    <div class="t" data-ancho="48.31" style="left:78.98pt; top:224.06pt; font-size:11.04pt; line-height:12.332pt">prohibido.</div>
    <div class="t" data-ancho="479.30" style="left:78.98pt; top:236.66pt; font-size:11.04pt; line-height:12.332pt">Enviar mensajes de texto o manipular el teléfono celular durante la jornada laboral, está prohibido.</div>
    <div class="t" data-ancho="364.42" style="left:78.98pt; top:249.38pt; font-size:11.04pt; line-height:12.332pt">Hacer uso de equipos electrónicos, como tablets (de uso personal), relojes</div>
    <div class="t" data-ancho="117.31" style="left:446.71pt; top:249.38pt; font-size:11.04pt; line-height:12.332pt">electrónicos, entre otros</div>
    <div class="t" data-ancho="203.00" style="left:78.98pt; top:261.98pt; font-size:11.04pt; line-height:12.332pt">durante la jornada laboral, está prohibido.</div>
    <div class="t" data-ancho="458.20" style="left:78.98pt; top:274.7pt; font-size:11.04pt; line-height:12.332pt">La participación activa de colaboradores en los programas de señalización y capacitación que</div>
    <div class="t" data-ancho="448.84" style="left:78.98pt; top:287.3pt; font-size:11.04pt; line-height:12.332pt">promueve el cumplimiento de la política contra el uso de teléfonos celulares durante la jorna</div>
    <div class="t" data-ancho="12.26" style="left:527.98pt; top:287.3pt; font-size:11.04pt; line-height:12.332pt">da</div>
    <div class="t" data-ancho="187.85" style="left:78.98pt; top:299.9pt; font-size:11.04pt; line-height:12.332pt">laboral es de obligatorio cumplimiento.</div>
    <div class="t" data-ancho="334.57" style="left:78.98pt; top:312.62pt; font-size:11.04pt; line-height:12.332pt">Se permitirá el uso de tablets solo a personal autorizado y para fines</div>
    <div class="t" data-ancho="136.42" style="left:416.71pt; top:312.62pt; font-size:11.04pt; line-height:12.332pt">específicos de su labor y en</div>
    <div class="t" data-ancho="99.17" style="left:78.98pt; top:325.22pt; font-size:11.04pt; line-height:12.332pt">lugares autorizados.</div>
    <div class="t" data-ancho="7.36" style="left:78.98pt; top:350.54pt; font-size:11.04pt; line-height:12.332pt">E</div>
    <div class="t" data-ancho="450.69" style="left:86.30pt; top:350.54pt; font-size:11.04pt; line-height:12.332pt">l incumplimiento de cualquiera de las obligaciones antes determinadas se constituya como u</div>
    <div class="t" data-ancho="12.26" style="left:537.22pt; top:350.54pt; font-size:11.04pt; line-height:12.332pt">na</div>
    <div class="t" data-ancho="487.42" style="left:78.98pt; top:363.14pt; font-size:11.04pt; line-height:12.332pt">FALTA GRAVE y una violación a las obligaciones y prohibiciones que rigen los controles de trabajo,</div>
    <div class="t" data-ancho="491.43" style="left:78.98pt; top:375.86pt; font-size:11.04pt; line-height:12.332pt">en consecuencia, la EMPRESA pueda adoptar las medidas disciplinarias correspondientes, inclusive</div>
    <div class="t" data-ancho="268.47" style="left:78.98pt; top:388.48pt; font-size:11.04pt; line-height:12.332pt">dar por finalizado el contrato de trabajo por justa causa</div>
    <div class="t" data-ancho="173.06" style="left:350.71pt; top:388.48pt; font-size:11.04pt; line-height:12.332pt">de acuerdo con lo establecido en el</div>
    <div class="t" data-ancho="278.75" style="left:78.98pt; top:401.2pt; font-size:11.04pt; line-height:12.332pt">reglamento interno de trabajo y la ley, según sea el caso.</div>
    <div class="t" data-ancho="109.56" style="left:78.98pt; top:413.8pt; font-size:11.04pt; line-height:12.332pt">La empresa dispondrá</div>
    <div class="t" data-ancho="365.00" style="left:191.66pt; top:413.8pt; font-size:11.04pt; line-height:12.332pt">de casilleros y punto de uso de uso seguro del celular, así mismo pondrá a</div>
    <div class="t" data-ancho="317.40" style="left:78.98pt; top:426.4pt; font-size:11.04pt; line-height:12.332pt">disposición de los colaboradores las herramientas que se requier</div>
    <div class="t" data-ancho="169.30" style="left:396.55pt; top:426.4pt; font-size:11.04pt; line-height:12.332pt">an para el buen desempeño de las</div>
    <div class="t" data-ancho="276.30" style="left:78.98pt; top:439.12pt; font-size:11.04pt; line-height:12.332pt">labores tales como cámaras, relojes de pared y/o radios.</div>
    <div class="t" data-ancho="467.18" style="left:78.98pt; top:451.72pt; font-size:11.04pt; line-height:12.332pt">Esta política estará en vigencia a partir de su publicación en las instalaciones de ITALCOL, y se</div>
    <div class="t" data-ancho="296.13" style="left:78.98pt; top:464.44pt; font-size:11.04pt; line-height:12.332pt">aplicara a los colaboradores que desempeñan sus funciones</div>
    <div class="t" data-ancho="189.45" style="left:378.19pt; top:464.44pt; font-size:11.04pt; line-height:12.332pt">laborales en las áreas OPERATIVAS y</div>
    <div class="t" data-ancho="490.22" style="left:78.98pt; top:477.04pt; font-size:11.04pt; line-height:12.332pt">cualquier actor (Visitante, contratista o administrativo que ingrese a estas áreas). para los efectos de</div>
    <div class="t" data-ancho="465.83" style="left:78.98pt; top:489.64pt; font-size:11.04pt; line-height:12.332pt">la presente política se entienden por jornada laboral, el tiempo en que el trabajador presente un</div>
    <div class="t" data-ancho="81.96" style="left:78.98pt; top:502.36pt; font-size:11.04pt; line-height:12.332pt">servicio al emple</div>
    <div class="t" data-ancho="25.13" style="left:160.94pt; top:502.36pt; font-size:11.04pt; line-height:12.332pt">ador.</div>
    <div class="t" data-ancho="59.43" style="left:78.98pt; top:527.68pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">Enero del 2019</div>
    <div class="t" data-ancho="134.36" style="left:85.10pt; top:616.27pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">----------------------------------------------</div>
    <div class="t" data-ancho="131.59" style="left:439.63pt; top:616.27pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">---------------------------------------------</div>
    <div class="t" data-ancho="22.77" style="left:85.10pt; top:628.87pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">JUAN</div>
    <div class="t" data-ancho="30.19" style="left:111.26pt; top:628.87pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">FELIPE</div>
    <div class="t" data-ancho="38.93" style="left:144.74pt; top:628.87pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">CADAVID</div>
    <div class="t" data-ancho="54.40" style="left:186.86pt; top:628.87pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">HERNÁNDEZ</div>
    <div class="t" data-ancho="73.22" style="left:451.63pt; top:628.87pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">Firma Colaborador</div>
    <div class="t" data-ancho="31.64" style="left:85.10pt; top:641.47pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">Gerente</div>
    <div class="t" data-ancho="34.51" style="left:119.90pt; top:641.47pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">Regional</div>
    <div class="t" data-ancho="38.95" style="left:157.70pt; top:641.47pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">Antioquia.</div>
    <div class="t" data-ancho="2.40" style="left:85.10pt; top:665.47pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.78049)">.</div>
    <div class="t b" data-ancho="37.31" style="left:437.59pt; top:702.93pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.88636)">Código:</div>
    <div class="t" data-ancho="14.08" style="left:499.42pt; top:702.93pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.87805)">DN</div>
    <div class="t" data-ancho="3.23" style="left:513.58pt; top:702.93pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.87805)">-</div>
    <div class="t" data-ancho="13.60" style="left:516.94pt; top:702.93pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.87805)">PC</div>
    <div class="t" data-ancho="3.23" style="left:530.62pt; top:702.93pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.87805)">-</div>
    <div class="t" data-ancho="14.15" style="left:533.98pt; top:702.93pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.87805)">GE</div>
    <div class="t" data-ancho="3.23" style="left:548.26pt; top:702.93pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.87805)">-</div>
    <div class="t" data-ancho="16.43" style="left:551.62pt; top:702.93pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.87805)">001</div>
    <div class="t b" data-ancho="39.44" style="left:437.59pt; top:719.97pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.88636)">Versión:</div>
    <div class="t" data-ancho="10.91" style="left:548.14pt; top:719.97pt; font-size:11.04pt; line-height:12.332pt; transform:scaleX(0.87805)">03</div>
    <div class="t b" data-ancho="56.09" style="left:369.43pt; top:53.2pt; font-size:12.024pt; line-height:13.431pt">POLÍTICA</div>

    <div class="firma-img">{{firma_colaborador}}</div>
    <div class="firma-datos">{{nombre_completo}}<br>C.C. {{identificacion}}<br>Firma electrónica (Ley 527/1999)<br>{{fecha_generacion}}</div>

    <div class="naranja" style="left:88.6pt; width:478pt; top:699.58pt; height:0.7pt"></div>
    <div class="naranja" style="left:88.6pt; width:478pt; top:701.03pt; height:3pt"></div>
  </div>
<script>
  // Cada texto ocupa el mismo ancho que en el original (data-ancho, en pt, ya con la compresión):
  // los títulos se comprimen; en los demás se reparte la diferencia entre los espacios (como Word).
  var PX = 96 / 72;
  document.querySelectorAll(''.tit'').forEach(function (el) {
    var w = el.getBoundingClientRect().width;
    if (w > 0) el.style.transform = ''scaleX('' + (parseFloat(el.getAttribute(''data-ancho'')) * PX / w) + '')'';
  });
  document.querySelectorAll(''.t[data-ancho]'').forEach(function (el) {
    var esc = el.style.transform ? parseFloat(el.style.transform.replace(/[^0-9.]/g, '''')) || 1 : 1;
    var dif = (parseFloat(el.getAttribute(''data-ancho'')) * PX - el.getBoundingClientRect().width) / esc;
    if (Math.abs(dif) < 0.3) return;
    var espacios = (el.textContent.match(/ /g) || []).length;
    if (espacios) el.style.wordSpacing = (dif / espacios) + ''px'';
    else el.style.letterSpacing = (dif / Math.max(1, el.textContent.length - 1)) + ''px'';
  });
</script>
</body>
</html>
', NOW()
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Plantillas WHERE nombre_proceso = 'ITAL_CELULAR');

SELECT id_plantilla, nombre_proceso, id_config_doc, observaciones, LENGTH(contenido_html) AS tam,
       SHA2(contenido_html, 256) AS hash
FROM Maestro_Plantillas WHERE nombre_proceso LIKE 'ITAL\_%';

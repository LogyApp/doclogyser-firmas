-- Formatos Italcol (documento de firma 33): 2 de 5 — Formulario de Información de Emergencias.
-- Réplica exacta del formulario del cliente (carta). Los datos se llenan con variables {{ital_*}}
-- (hoja de vida del aspirante y preguntas del portal); la firma del colaborador va sobre la línea de firma.
-- El logo llega con {{logo_italcol}}. HTML también en migraciones/plantillas/ITAL_EMERG.html.
-- Requiere 2026-11-13_italcol_politica_sig.sql (columnas id_config_doc y observaciones). Ejecutada el 2026-11-13 (id 33).
-- Se puede ejecutar más de una vez.

INSERT INTO Maestro_Plantillas
  (nombre_proceso, id_config_doc, observaciones, codigo_formato, version_formato, fecha_version, tabla_datos, id_campo_fk,
   bucket_carpeta, requiere_firma_trabajador, activo, version, contenido_html, ultima_actualizacion)
SELECT 'ITAL_EMERG', 33, 'Formulario de información de emergencias', NULL, NULL, NULL, 'Dynamic_hv_aspirante', 'id_aspirante',
       'hojas_vida_logyser', 1, 1, 1, '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Formulario de Información de Emergencias Italcol</title>
<style>
  /* Réplica del formulario de Italcol (carta). No cambiar el diseño: es formato del cliente. */
  @page { size: letter; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #ffffff; }
  body { font-family: Calibri, Carlito, "Liberation Sans", Arial, sans-serif; color: #000000; font-size: 11pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pagina { position: relative; width: 612pt; height: 792pt; overflow: hidden; }

  .enc-logo { position: absolute; left: 88.4pt; top: 35.3pt; width: 77pt; height: auto; }
  .enc-titulo { position: absolute; left: 163pt; width: 336pt; top: 53.5pt; text-align: center; font-family: "Arial Narrow", "Liberation Sans Narrow", "Nimbus Sans Narrow", Arial, sans-serif; font-stretch: condensed; font-weight: bold; font-size: 11pt; }
  .enc-linea { position: absolute; left: 84.5pt; width: 477pt; top: 94.5pt; height: 4.6pt; background: #ff6600; }

  .linea-txt { position: absolute; left: 87pt; font-size: 11pt; line-height: 14pt; white-space: nowrap; }
  .linea-txt b { font-weight: bold; }
  .marca { display: inline-block; min-width: 22pt; border-bottom: 0.75pt solid #000; text-align: center; line-height: 11pt; font-weight: bold; }

  .tabla { position: absolute; left: 85pt; width: 441.3pt; border-collapse: collapse; font-size: 11pt; table-layout: fixed; }
  .tabla td { border: 0.75pt solid #000000; padding: 0 5pt; height: 13.8pt; line-height: 13.4pt; vertical-align: middle; }
  .tabla td.l { width: 220.7pt; font-weight: bold; }
  .tabla td.v { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tabla tr.doble td { height: 27pt; }
  .tabla td.hdr { background: #ff9933; font-weight: bold; text-align: center; height: 14.4pt; padding-top: 1.5pt; }
  .tabla-1 { top: 216pt; }
  .tabla-2 { top: 420.2pt; }

  .firma-lbl { position: absolute; left: 87pt; top: 538pt; font-size: 11pt; }
  .firma-img { position: absolute; left: 87pt; top: 552pt; width: 140pt; height: 38pt; display: flex; align-items: flex-end; justify-content: center; }
  .firma-img img { max-height: 38pt; max-width: 140pt; object-fit: contain; }
  .firma-linea { position: absolute; left: 87pt; top: 580pt; font-size: 11pt; letter-spacing: 0; }
  .firma-datos { position: absolute; left: 87pt; top: 596pt; font-size: 8pt; color: #333333; line-height: 10pt; }
  .confidencial { position: absolute; left: 87pt; width: 440pt; top: 668pt; font-size: 11pt; line-height: 14.6pt; }
</style>
</head>
<body>
  <div class="pagina">
    <img class="enc-logo" src="{{logo_italcol}}" alt="Italcol">
    <div class="enc-titulo">FORMULARIO DE INFORMACIÓN DE EMERGENCIAS</div>
    <div class="enc-linea"></div>

    <div class="linea-txt" style="top:159.5pt"><b>Fecha:</b> Día: <span class="marca">{{ital_dia}}</span> Mes: <span class="marca">{{ital_mes}}</span> Año: <span class="marca">{{ital_anio}}</span></div>
    <div class="linea-txt" style="top:174pt"><b>Planta: Girardota:</b> <span class="marca">{{ital_planta_girardota}}</span> Santa Rosa de Osos: <span class="marca">{{ital_planta_santa_rosa}}</span> Yarumal: <span class="marca">{{ital_planta_yarumal}}</span></div>

    <table class="tabla tabla-1">
      <tr><td class="hdr" colspan="2">INFORMACIÓN PERSONAL</td></tr>
      <tr><td class="l">Nombres y apellidos</td><td class="v">{{nombre_completo}}</td></tr>
      <tr><td class="l">Sexo</td><td class="v">Masculino: <span class="marca">{{ital_sexo_m}}</span> Femenino: <span class="marca">{{ital_sexo_f}}</span> Otro: <span class="marca">{{ital_sexo_o}}</span></td></tr>
      <tr><td class="l">Nacionalidad</td><td class="v">{{ital_nacionalidad}}</td></tr>
      <tr><td class="l">Fecha y lugar de nacimiento</td><td class="v">{{ital_nacimiento}}</td></tr>
      <tr><td class="l">Dirección de residencia</td><td class="v">{{ital_direccion}}</td></tr>
      <tr><td class="l">Nombre de contacto en caso de emergencia</td><td class="v">{{ital_contacto1_nombre}}</td></tr>
      <tr class="doble"><td class="l">Número de teléfono del contacto de emergencia</td><td class="v">{{ital_contacto1_telefono}}</td></tr>
      <tr><td class="l">Nombre de contacto en caso de emergencia</td><td class="v">{{ital_contacto2_nombre}}</td></tr>
      <tr class="doble"><td class="l">Número de teléfono contacto en caso de emergencia</td><td class="v">{{ital_contacto2_telefono}}</td></tr>
    </table>

    <table class="tabla tabla-2">
      <tr><td class="hdr" colspan="2">DATOS MÉDICOS</td></tr>
      <tr><td class="l">Grupo sanguíneo</td><td class="v">{{ital_rh}}</td></tr>
      <tr><td class="l">Alergias</td><td class="v">{{ital_alergias}}</td></tr>
      <tr><td class="l">Condición de salud</td><td class="v">{{ital_condicion_salud}}</td></tr>
    </table>

    <div class="firma-lbl">Firma del colaborador:</div>
    <div class="firma-img">{{firma_colaborador}}</div>
    <div class="firma-linea">_____________________</div>
    <div class="firma-datos">{{nombre_completo}} · C.C. {{identificacion}}<br>Firmado electrónicamente (Ley 527 de 1999) · {{fecha_generacion}}</div>

    <div class="confidencial">La información suministrada por el colaborador es de uso confidencial y solo será utilizada únicamente en caso de emergencia.</div>
  </div>
</body>
</html>
', NOW()
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Plantillas WHERE nombre_proceso = 'ITAL_EMERG');

SELECT id_plantilla, nombre_proceso, id_config_doc, observaciones, LENGTH(contenido_html) AS tam
FROM Maestro_Plantillas WHERE nombre_proceso LIKE 'ITAL\_%';

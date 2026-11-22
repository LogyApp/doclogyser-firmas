-- SST › Documentación Inicial › EVIN (Evaluación de Inducción Corporativa, SST-F-049 v04 del 23/11/2026).
-- SST escoge al trabajador, el tipo (Inducción o Reinducción) y las observaciones, y genera el enlace. El trabajador
-- califica los aspectos de la inducción (Excelente, Bueno, Regular, Malo), responde las 27 preguntas y firma. Se
-- califica sola (mínimo 80 %) y el PDF queda en su carpeta como documento 29 (solo el último). Firma como
-- Responsable de Inducción quien la creó. Rutas: src/routes/evin.js. Subpestaña: public/js/sst-evin.js.
-- La pestaña ARO pasa a ser una subpestaña de "Documentación Inicial" (ARO, EVIN y luego INGE).
-- La plantilla 'EVIN' (Maestro_Plantillas id 18) se redirige a SST con el diseño nuevo; respaldo de la anterior en
-- migraciones/respaldos/2026-11-22_respaldo_plantilla_evin_v3.sql.
-- Solo crea la tabla, agrega filas y actualiza filas puntuales. Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Dynamic_evin (
  id_evin               VARCHAR(36)   NOT NULL PRIMARY KEY,
  identificacion        BIGINT        NOT NULL,
  id_vinculacion        VARCHAR(50)   NULL,
  nombre_trabajador     VARCHAR(150)  NULL,
  cargo                 VARCHAR(100)  NULL,
  operacion             VARCHAR(50)   NULL,
  regional              VARCHAR(50)   NULL,
  ciudad                VARCHAR(100)  NULL,
  tipo                  VARCHAR(20)   NOT NULL DEFAULT 'Inducción',
  intento               TINYINT       NOT NULL DEFAULT 1,
  version_formato       VARCHAR(20)   NULL,
  observaciones         TEXT          NULL,
  nombre_responsable    VARCHAR(150)  NULL,
  cargo_responsable     VARCHAR(100)  NULL,
  url_firma_responsable VARCHAR(255)  NULL,
  token_firma           VARCHAR(64)   NULL,
  aspectos              TEXT          NULL COMMENT 'JSON {n: E|B|R|M} de los 16 aspectos de la inducción',
  respuestas            TEXT          NULL COMMENT 'JSON {n: a|b|c|d} de las 27 preguntas',
  correctas             TINYINT       NULL,
  porcentaje            DECIMAL(5,2)  NULL,
  aprobado              TINYINT(1)    NULL,
  url_firma             VARCHAR(255)  NULL,
  fecha_firma           DATETIME      NULL,
  url_doc               VARCHAR(255)  NULL,
  usuario               VARCHAR(50)   NOT NULL,
  fecha_creacion        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_evin_identificacion (identificacion),
  KEY idx_evin_token (token_firma),
  KEY idx_evin_operacion (operacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permisos (Config_Parametros sst / EVIN, ver src/services/configSst.js): los mismos roles que ARO
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'EVIN', 'Roles que pueden crear EVIN', '', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema, Archivo',
       'Roles que pueden generar la Evaluación de Inducción (enlace para el trabajador) en Documentación Inicial › EVIN de SST. Quien la genera firma como Responsable de Inducción.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN' AND Concepto = 'Roles que pueden crear EVIN');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'EVIN', 'Roles que pueden eliminar EVIN', '', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema, Archivo',
       'Roles que pueden eliminar una EVIN pendiente de respuesta (Sistema cualquiera; los demás solo las que generaron).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN' AND Concepto = 'Roles que pueden eliminar EVIN');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'EVIN', 'Roles que pueden editar y regenerar PDF de EVIN firmadas', '', 'Sistema',
       'Roles que pueden regenerar el PDF de una EVIN ya respondida con la plantilla vigente (conserva respuestas y firmas).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN' AND Concepto = 'Roles que pueden editar y regenerar PDF de EVIN firmadas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'EVIN', 'Roles que pueden eliminar EVIN firmadas', '', 'Sistema',
       'Roles que pueden eliminar una EVIN ya respondida; su documento 29 sale de la carpeta y vuelve la evaluación anterior del trabajador, si tiene.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN' AND Concepto = 'Roles que pueden eliminar EVIN firmadas');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'EVIN', 'Cargos a los que se les genera la EVIN', '', '',
       'Cargos (separados por coma) que aparecen para escoger al generar la Evaluación de Inducción. Vacío: todos los cargos.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN' AND Concepto = 'Cargos a los que se les genera la EVIN');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'EVIN', 'Porcentaje mínimo para aprobar la EVIN', '', '80',
       'Porcentaje de respuestas correctas (de 1 a 100) para aprobar la Evaluación de Inducción; con 80 son mínimo 22 de 27. Vacío o inválido: 80.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN' AND Concepto = 'Porcentaje mínimo para aprobar la EVIN');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'EVIN', 'Habilitar notificaciones de correo en EVIN', '', '1',
       'Permite enviar al trabajador el correo con el enlace de la Evaluación de Inducción. 1 = se puede enviar; 0 = no se envía (el enlace se comparte a mano).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN' AND Concepto = 'Habilitar notificaciones de correo en EVIN');

-- Subpestaña EVIN con los mismos roles y niveles de Acceso que ARO (copia las filas de ARO)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'sst', 'EVIN', m.Rol, m.Acceso, 'EVIN', '/sst?tab=docinicial&subtab=evin', 12, m.Icono,
       CONCAT('Documentación Inicial › Evaluación de Inducción Corporativa (SST-F-049): el trabajador responde y firma (',
              CASE m.Acceso WHEN 1 THEN 'todas las operaciones' WHEN 2 THEN 'operaciones de su regional' ELSE 'sus operaciones' END, ').')
  FROM Maestro_Menu m
 WHERE m.Modulo = 'sst' AND m.Seccion = 'ARO'
   AND NOT EXISTS (SELECT 1 FROM (SELECT ID FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'EVIN') ya);

-- ARO queda dentro de Documentación Inicial
UPDATE Maestro_Menu
   SET Url = '/sst?tab=docinicial&subtab=aro',
       Descripcion = REPLACE(Descripcion, 'Análisis de Riesgo por Oficio', 'Documentación Inicial › Análisis de Riesgo por Oficio')
 WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Url = '/sst?tab=aro';

-- Plantilla 'EVIN' (id 18): pasa de selección (Dynamic_hv_aspirante) a SST (Dynamic_evin), documento 29, código
-- SST-F-049 versión 04 del 23/11/2026, con el diseño nuevo. Solo la primera vez (si ya apunta a Dynamic_evin no la
-- vuelve a tocar). HTML también en migraciones/plantillas/EVIN.html.
UPDATE Maestro_Plantillas
SET id_config_doc = 29, codigo_formato = 'SST-F-049', version_formato = '04', fecha_version = '2026-11-23',
    tabla_datos = 'Dynamic_evin', id_campo_fk = 'id_evin', bucket_carpeta = 'talenthub_central',
    requiere_firma_trabajador = 1, activo = 1, version = 4, ultima_actualizacion = NOW(), contenido_html = '<style>
  /* Estilos encerrados en .evin. Datos, aspectos, preguntas, resultado y firmas los llena src/services/evin.js. */
  .evin { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; font-size: 8.8pt; line-height: 1.4; -webkit-font-smoothing: antialiased }
  .evin * { box-sizing: border-box }
  .evin p { margin: 0 0 6px 0; text-align: justify }

  .evin .doc-header-table { width: 100%; border-collapse: collapse; margin-bottom: 11px; border: 1px solid #cbd5e1 }
  .evin .doc-header-table td { border: 1px solid #cbd5e1; vertical-align: middle }
  .evin .header-logo-cell { width: 24%; text-align: center; padding: 8px 10px; background: #ffffff }
  .evin .logo-img { height: 46px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto }
  .evin .header-title-cell { width: 56%; background: #e6edf7; text-align: center; padding: 10px 14px }
  .evin .doc-title { font-size: 11pt; font-weight: 800; color: #000b59; letter-spacing: 0.4px; text-transform: uppercase; line-height: 1.25 }
  .evin .doc-subtitle { font-size: 8pt; font-weight: 700; color: #c2410c; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px }
  .evin .header-meta-cell { width: 20%; padding: 6px 10px; font-size: 8pt; text-align: center; background: #f8fafc; color: #1e293b; line-height: 1.35 }
  .evin .meta-code { font-weight: 800; color: #000b59; font-size: 8.5pt }
  .evin .meta-ver { color: #334155 }
  .evin .meta-date { color: #64748b; font-size: 7.5pt }

  .evin .metrics-card { display: table; width: 100%; table-layout: fixed; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin: 2px 0 11px 0 }
  .evin .metric-item { display: table-cell; padding: 8px 11px; border-right: 1px solid #e2e8f0; vertical-align: top }
  .evin .metric-item:last-child { border-right: none }
  .evin .metric-label { font-size: 7.1pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px }
  .evin .metric-value { font-size: 9.3pt; font-weight: 700; color: #000b59 }
  .evin .metric-sub { font-size: 7.8pt; color: #64748b; font-weight: 600 }

  .evin .section-block { margin-bottom: 10px }
  .evin .section-title { font-size: 8.2pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 6px; page-break-after: avoid; break-after: avoid }
  .evin .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; margin-right: 6px; vertical-align: -1px }

  .evin .info-table { width: 100%; border-collapse: collapse; font-size: 8pt }
  .evin .info-table td { border: 1px solid #e2e8f0; padding: 5px 8px; vertical-align: top; text-align: justify }
  .evin .info-table td.lbl { width: 24%; background: #f1f5f9; color: #000b59; font-weight: 700; text-transform: uppercase; font-size: 7.4pt; letter-spacing: 0.3px; text-align: left }

  .evin .escala { width: 100%; border-collapse: collapse; font-size: 7.6pt; text-align: center }
  .evin .escala th { background: #000b59; color: #ffffff; padding: 4px; font-size: 7.4pt }
  .evin .escala td { border: 1px solid #e2e8f0; padding: 4px; color: #475569 }

  .evin .asp-table { width: 100%; border-collapse: collapse; font-size: 7.9pt; page-break-inside: avoid; break-inside: avoid }
  .evin .asp-table th { background: #000b59; color: #ffffff; padding: 4px 6px; text-align: left; font-size: 7.4pt; text-transform: uppercase }
  .evin .asp-table td { border: 1px solid #e2e8f0; padding: 3px 6px }
  .evin .asp-table .asp-x { width: 7%; text-align: center; font-weight: 800; color: #000b59 }
  .evin .asp-table th.asp-x { color: #ffffff }

  .evin .preg-seccion { background: #000b59; color: #ffffff; font-weight: 700; font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 8px; margin: 8px 0 5px 0; page-break-after: avoid; break-after: avoid }
  .evin .preg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; align-items: start }
  .evin .preg { break-inside: avoid; page-break-inside: avoid; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px }
  .evin .preg-txt { font-weight: 700; color: #1e3a8a; font-size: 7.9pt; margin-bottom: 3px }
  .evin .preg-op { font-size: 7.6pt; color: #334155; padding-left: 2px; line-height: 1.35 }
  .evin .preg-op.marcada { color: #0f172a; font-weight: 700 }
  .evin .preg-caja { display: inline-block; width: 14px; text-align: center; border: 1px solid #94a3b8; border-radius: 2px; font-size: 6.8pt; font-weight: 800; color: #000b59; line-height: 11px; margin-right: 2px }
  .evin .preg-ok { font-size: 6.6pt; font-weight: 700; color: #15803d; white-space: nowrap }
  .evin .preg-mal { font-size: 6.6pt; font-weight: 700; color: #b91c1c; white-space: nowrap }

  .evin .resultado-box { display: table; width: 100%; table-layout: fixed; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid; break-inside: avoid }
  .evin .resultado-box > div { display: table-cell; padding: 8px 11px; vertical-align: middle; border-right: 1px solid #e2e8f0 }
  .evin .resultado-box > div:last-child { border-right: none }
  .evin .res-num { font-size: 13pt; font-weight: 800; color: #000b59 }
  .evin .res-marca { display: inline-block; width: 16px; text-align: center; border: 1.2px solid #000b59; border-radius: 3px; font-weight: 800; color: #000b59; margin-right: 4px; line-height: 14px }

  .evin .sig-table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: avoid }
  .evin .sig-table td { vertical-align: top; text-align: center; padding: 0 12px }
  .evin .sig-table td:first-child { padding-left: 0 }
  .evin .sig-table td:last-child { padding-right: 0 }
  .evin .sig-role { font-size: 7.4pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; margin-bottom: 4px }
  .evin .sig-img-wrap { height: 82px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px }
  .evin .sig-img { max-height: 62px; max-width: 200px; display: block; margin: 0 auto }
  .evin .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px }
  .evin .sig-name { font-size: 8.8pt; font-weight: 700; color: #000b59; text-transform: uppercase }
  .evin .sig-details { font-size: 7.4pt; color: #64748b; line-height: 1.35 }
  .evin .sig-nota { font-size: 22pt; font-weight: 800; color: #000b59; height: 82px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px }
  .evin .firma-nota { font-size: 7.5pt; color: #94a3b8 }

  .evin .doc-footer { margin-top: 12px; text-align: center }
  .evin .doc-footer .line { height: 2px; background: #f55400; border-radius: 1px; margin-bottom: 7px }
  .evin .doc-footer .addr { color: #000b59; font-size: 7.4pt; line-height: 1.4; letter-spacing: 0.3px }
  .evin .doc-footer .legal { color: #94a3b8; font-size: 6.8pt; margin-top: 2px }
</style>

<div class="evin">

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Evaluación de inducción corporativa</div>
        <div class="doc-subtitle">{{tipo}} &bull; Intento {{intento}} &bull; Seguridad y Salud en el Trabajo</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item">
      <div class="metric-label">Nombre</div>
      <div class="metric-value">{{nombre_trabajador}}</div>
      <div class="metric-sub">Documento {{identificacion}}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Cargo · Operación</div>
      <div class="metric-value" style="font-size:9pt">{{cargo}}</div>
      <div class="metric-sub">{{operacion}} &bull; {{ciudad}}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Fecha</div>
      <div class="metric-value" style="color:#f55400">{{fecha_evaluacion}}</div>
      <div class="metric-sub">Radicado {{radicado}}</div>
    </div>
  </div>

  <section class="section-block">
    <div class="section-title">Información general de la evaluación</div>
    <table class="info-table">
      <tr><td class="lbl">Cumplimiento normativo</td><td>Decreto 1072 de 2015 (art. 2.2.4.6.11, capacitación en SST)&#59; Resolución 0312 de 2019 (estándar 1.2.2, inducción y reinducción en SG-SST)&#59; Resolución 2184 de 2019 (código de colores para la separación de residuos en la fuente)&#59; ISO 9001:2015, Sistema de Gestión de Calidad certificado (numerales 7.2 Competencia y 7.3 Toma de conciencia).</td></tr>
      <tr><td class="lbl">Alcance</td><td>Aplica a todos los trabajadores de la empresa, independientemente de su forma de vinculación o contratación, al ingresar (inducción) y cuando se requiera actualización por cambio de cargo, operación, procesos o normas, o según el programa anual de capacitación (reinducción).</td></tr>
      <tr><td class="lbl">Objetivo de la evaluación</td><td>Verificar la comprensión de los temas de Seguridad y Salud en el Trabajo y Gestión Ambiental tratados en la inducción o reinducción, evaluar la calidad de la información recibida e identificar necesidades de refuerzo, dejando soporte documental del proceso.</td></tr>
    </table>
  </section>

  <section class="section-block" style="page-break-inside: avoid; break-inside: avoid">
    <div class="section-title">Escala de calificación de la inducción (E – B – R – M)</div>
    <table class="escala">
      <tr><th>E – Excelente</th><th>B – Buena</th><th>R – Regular</th><th>M – Mala</th></tr>
      <tr><td>La información fue completa y detallada.</td><td>La información fue suficiente.</td><td>La información fue muy general e incompleta.</td><td>No obtuve ninguna información al respecto.</td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">Aspectos de la inducción</div>
    {{aspectos_html}}
  </section>

  <section class="section-block">
    <div class="section-title">Preguntas (una sola opción por pregunta)</div>
    {{preguntas_html}}
  </section>

  <section class="section-block" style="page-break-inside: avoid; break-inside: avoid">
    <div class="section-title">Criterio de aprobación y resultado</div>
    <table class="info-table" style="margin-bottom:6px">
      <tr><td class="lbl">Puntaje mínimo para aprobar</td><td><strong>{{minimo_porcentaje}} de respuestas correctas: mínimo {{minimo_correctas}} de las {{total_preguntas}} preguntas.</strong> Cada pregunta vale 1 punto. Calificación (%) = (respuestas correctas ÷ {{total_preguntas}}) × 100.</td></tr>
    </table>
    <div class="resultado-box">
      <div><div class="metric-label">Respuestas correctas</div><div class="res-num">{{correctas}} / {{total_preguntas}}</div></div>
      <div><div class="metric-label">Porcentaje</div><div class="res-num">{{porcentaje}}</div></div>
      <div><span class="res-marca">{{marca_aprobo}}</span> <strong>APROBÓ</strong>&nbsp;&nbsp;&nbsp; <span class="res-marca">{{marca_no_aprobo}}</span> <strong>NO APROBÓ</strong></div>
    </div>
  </section>

  <section class="section-block" style="page-break-inside: avoid; break-inside: avoid">
    <table class="info-table">
      <tr><td class="lbl">Si no aprueba</td><td>1. El responsable de la inducción revisa con el trabajador las preguntas incorrectas y refuerza esos temas.<br>2. Se aplica nuevamente la evaluación en un plazo máximo de 5 días hábiles.<br>3. Si en el segundo intento no alcanza el {{minimo_porcentaje}}, se programa una reinducción completa y se informa al jefe inmediato.<br>4. Mientras no apruebe, el trabajador no podrá operar equipos como montacargas, plataformas o estibadores eléctricos.</td></tr>
      <tr><td class="lbl">Soporte</td><td>La evaluación diligenciada y firmada se archiva en la carpeta del trabajador como evidencia del estándar 1.2.2 de la Resolución 0312 de 2019.</td></tr>
      <tr><td class="lbl">Observaciones</td><td>{{observaciones}}</td></tr>
    </table>
  </section>

  <section class="section-block" style="page-break-inside: avoid; break-inside: avoid">
    <div class="section-title">Firmas</div>
    <table class="sig-table">
      <tr>
        <td style="width:40%">
          <div class="sig-role">Firma y cédula del trabajador</div>
          <div class="sig-img-wrap">{{firma_trabajador_html}}</div>
          <div class="sig-line"></div>
          <div class="sig-name">{{nombre_trabajador}}</div>
          <div class="sig-details">C.C. {{identificacion}}<br>{{cargo}}</div>
        </td>
        <td style="width:40%">
          <div class="sig-role">Responsable de inducción y cargo</div>
          <div class="sig-img-wrap">{{firma_responsable_html}}</div>
          <div class="sig-line"></div>
          <div class="sig-name">{{nombre_responsable}}</div>
          <div class="sig-details">{{cargo_responsable}}</div>
        </td>
        <td style="width:20%">
          <div class="sig-role">Calificación</div>
          <div class="sig-nota">{{calificacion}}</div>
          <div class="sig-line"></div>
          <div class="sig-details">{{resultado_texto}}</div>
        </td>
      </tr>
    </table>
    <div class="doc-footer">
      <div class="line"></div>
      <div class="addr">DIAGONAL 74B No. 33° 51-55 — ANTIGUA TRANSVERSAL 39° No 70° 51-55 — LAURELES - MEDELLÍN</div>
      <div class="legal">Apoyo Logístico y Operativo S.A.S. &bull; Documento electrónico — Ley 527 de 1999</div>
    </div>
  </section>

</div>
'
WHERE nombre_proceso = 'EVIN' AND tabla_datos <> 'Dynamic_evin';

SELECT id_plantilla, nombre_proceso, id_config_doc, codigo_formato, version_formato, fecha_version, tabla_datos, version FROM Maestro_Plantillas WHERE nombre_proceso = 'EVIN';
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'EVIN';
SELECT ID, Seccion, Acceso, Rol, Url FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion IN ('ARO', 'EVIN') ORDER BY Seccion, Acceso;

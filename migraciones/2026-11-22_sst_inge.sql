-- SST › Documentación Inicial › INGE (Comprobante de Inducción General, SST-F-050 v05 del 09/11/2026).
-- SST escoge al trabajador y el tipo (Inducción o Reinducción) y genera el enlace. El trabajador marca SI o NO en
-- los 41 temas de la inducción, lee la declaración y firma. El PDF queda en su carpeta como documento 32 (solo el
-- último generado aquí). Firma como Analista SST quien lo registra y la firma del Líder SST (rol del parámetro) sale
-- sola. Rutas: src/routes/inge.js. Subpestaña: public/js/sst-inge.js.
-- La plantilla 'INGE' (Maestro_Plantillas id 19, versión vieja de selección que ya no se usa) pasa a SST con el
-- diseño nuevo; respaldo de la anterior en migraciones/respaldos/2026-11-22_respaldo_plantilla_inge_v4.sql.
-- Solo crea la tabla, agrega filas y actualiza filas puntuales. Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Dynamic_inge (
  id_inge               VARCHAR(36)   NOT NULL PRIMARY KEY,
  identificacion        BIGINT        NOT NULL,
  id_vinculacion        VARCHAR(50)   NULL,
  nombre_trabajador     VARCHAR(150)  NULL,
  cargo                 VARCHAR(100)  NULL,
  operacion             VARCHAR(50)   NULL,
  regional              VARCHAR(50)   NULL,
  ciudad                VARCHAR(100)  NULL,
  fecha_ingreso         DATE          NULL,
  tipo                  VARCHAR(20)   NOT NULL DEFAULT 'Inducción',
  version_formato       VARCHAR(20)   NULL,
  nombre_analista       VARCHAR(150)  NULL,
  cargo_analista        VARCHAR(100)  NULL,
  url_firma_analista    VARCHAR(255)  NULL,
  nombre_lider          VARCHAR(150)  NULL,
  cargo_lider           VARCHAR(100)  NULL,
  url_firma_lider       VARCHAR(255)  NULL,
  token_firma           VARCHAR(64)   NULL,
  temas                 TEXT          NULL COMMENT 'JSON {n: SI|NO} de los 41 temas de la inducción',
  temas_no              TINYINT       NULL COMMENT 'Cantidad de temas marcados NO',
  url_firma             VARCHAR(255)  NULL,
  fecha_firma           DATETIME      NULL,
  url_doc               VARCHAR(255)  NULL,
  usuario               VARCHAR(50)   NOT NULL,
  fecha_creacion        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_inge_identificacion (identificacion),
  KEY idx_inge_token (token_firma),
  KEY idx_inge_operacion (operacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permisos (Config_Parametros sst / INGE, ver src/services/configSst.js): los mismos roles que ARO y EVIN
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'INGE', 'Roles que pueden crear INGE', '', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema, Archivo',
       'Roles que pueden generar el Comprobante de Inducción General (enlace para el trabajador) en Documentación Inicial › INGE de SST. Quien lo genera firma como Analista SST.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'INGE' AND Concepto = 'Roles que pueden crear INGE');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'INGE', 'Roles que pueden eliminar INGE', '', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema, Archivo',
       'Roles que pueden eliminar un INGE pendiente de firma (Sistema cualquiera; los demás solo los que generaron).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'INGE' AND Concepto = 'Roles que pueden eliminar INGE');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'INGE', 'Roles que pueden editar y regenerar PDF de INGE firmados', '', 'Sistema',
       'Roles que pueden regenerar el PDF de un INGE ya firmado con la plantilla vigente (conserva los temas marcados y las firmas).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'INGE' AND Concepto = 'Roles que pueden editar y regenerar PDF de INGE firmados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'INGE', 'Roles que pueden eliminar INGE firmados', '', 'Sistema',
       'Roles que pueden eliminar un INGE ya firmado; su documento 32 sale de la carpeta y vuelve el comprobante anterior del trabajador, si tiene.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'INGE' AND Concepto = 'Roles que pueden eliminar INGE firmados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'INGE', 'Cargos a los que se les genera el INGE', '', '',
       'Cargos (separados por coma) que aparecen para escoger al generar el Comprobante de Inducción General. Vacío: todos los cargos.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'INGE' AND Concepto = 'Cargos a los que se les genera el INGE');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'INGE', 'Rol que firma como Líder SST en el INGE', '', 'LiderSst',
       'Rol de Maestro_Usuarios cuya firma registrada sale sola como Líder SST cuando el trabajador firma el INGE (se toma el primer usuario con ese rol). Vacío: el PDF sale sin firma de Líder SST.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'INGE' AND Concepto = 'Rol que firma como Líder SST en el INGE');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'INGE', 'Habilitar notificaciones de correo en INGE', '', '1',
       'Permite enviar al trabajador el correo con el enlace del Comprobante de Inducción General. 1 = se puede enviar; 0 = no se envía (el enlace se comparte a mano).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'INGE' AND Concepto = 'Habilitar notificaciones de correo en INGE');

-- Subpestaña INGE con los mismos roles y niveles de Acceso que ARO (copia las filas de ARO)
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'sst', 'INGE', m.Rol, m.Acceso, 'INGE', '/sst?tab=docinicial&subtab=inge', 13, m.Icono,
       CONCAT('Documentación Inicial › Comprobante de Inducción General (SST-F-050): el trabajador marca los temas recibidos y firma (',
              CASE m.Acceso WHEN 1 THEN 'todas las operaciones' WHEN 2 THEN 'operaciones de su regional' ELSE 'sus operaciones' END, ').')
  FROM Maestro_Menu m
 WHERE m.Modulo = 'sst' AND m.Seccion = 'ARO'
   AND NOT EXISTS (SELECT 1 FROM (SELECT ID FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'INGE') ya);

-- Plantilla 'INGE' (id 19): pasa de selección (Dynamic_hv_aspirante) a SST (Dynamic_inge), documento 32, código
-- SST-F-050 versión 05 del 09/11/2026, con el diseño nuevo. Solo la primera vez (si ya apunta a Dynamic_inge no la
-- vuelve a tocar). HTML también en migraciones/plantillas/INGE.html.
UPDATE Maestro_Plantillas
SET id_config_doc = 32, codigo_formato = 'SST-F-050', version_formato = '05', fecha_version = '2026-11-09',
    tabla_datos = 'Dynamic_inge', id_campo_fk = 'id_inge', bucket_carpeta = 'talenthub_central',
    requiere_firma_trabajador = 1, activo = 1, version = 5, ultima_actualizacion = NOW(), contenido_html = '<style>
  /* Estilos encerrados en .inge. Datos, temas, declaración y firmas los llena src/services/inge.js. */
  .inge { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; font-size: 8.8pt; line-height: 1.4; -webkit-font-smoothing: antialiased }
  .inge * { box-sizing: border-box }
  .inge p { margin: 0 0 5px 0; text-align: justify }

  .inge .doc-header-table { width: 100%; border-collapse: collapse; margin-bottom: 11px; border: 1px solid #cbd5e1 }
  .inge .doc-header-table td { border: 1px solid #cbd5e1; vertical-align: middle }
  .inge .header-logo-cell { width: 24%; text-align: center; padding: 8px 10px; background: #ffffff }
  .inge .logo-img { height: 46px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto }
  .inge .header-title-cell { width: 56%; background: #e6edf7; text-align: center; padding: 10px 14px }
  .inge .doc-title { font-size: 11pt; font-weight: 800; color: #000b59; letter-spacing: 0.4px; text-transform: uppercase; line-height: 1.25 }
  .inge .doc-subtitle { font-size: 8pt; font-weight: 700; color: #c2410c; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px }
  .inge .header-meta-cell { width: 20%; padding: 6px 10px; font-size: 8pt; text-align: center; background: #f8fafc; color: #1e293b; line-height: 1.35 }
  .inge .meta-code { font-weight: 800; color: #000b59; font-size: 8.5pt }
  .inge .meta-ver { color: #334155 }
  .inge .meta-date { color: #64748b; font-size: 7.5pt }

  .inge .section-block { margin-bottom: 10px }
  .inge .section-title { font-size: 8.2pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 6px; page-break-after: avoid; break-after: avoid }
  .inge .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; margin-right: 6px; vertical-align: -1px }

  .inge .info-table { width: 100%; border-collapse: collapse; font-size: 8pt }
  .inge .info-table td { border: 1px solid #e2e8f0; padding: 5px 8px; vertical-align: middle }
  .inge .info-table td.lbl { width: 20%; background: #f1f5f9; color: #000b59; font-weight: 700; text-transform: uppercase; font-size: 7.4pt; letter-spacing: 0.3px }
  .inge .info-table td.val { font-weight: 600; color: #0f172a }
  .inge .marca { display: inline-block; width: 16px; text-align: center; border: 1.2px solid #000b59; border-radius: 3px; font-weight: 800; color: #000b59; line-height: 14px; margin: 0 3px }

  .inge .temas { width: 100%; border-collapse: collapse; font-size: 7.9pt }
  .inge .temas td { border: 1px solid #e2e8f0; padding: 3px 6px; vertical-align: middle }
  .inge .temas tr { page-break-inside: avoid; break-inside: avoid }
  .inge .temas .tema-sec td { background: #000b59; color: #ffffff; font-weight: 700; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4px; page-break-after: avoid; break-after: avoid }
  .inge .temas .tema-num { width: 4%; text-align: center; font-weight: 800 }
  .inge .temas .tema-txt { text-align: justify; color: #1e293b }
  .inge .temas .tema-x { width: 6%; text-align: center; font-weight: 800; color: #000b59 }
  .inge .temas .tema-sec .tema-x { color: #ffffff }

  .inge .resumen { display: table; width: 100%; table-layout: fixed; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-top: 6px }
  .inge .resumen > div { display: table-cell; padding: 6px 11px; border-right: 1px solid #e2e8f0; vertical-align: middle }
  .inge .resumen > div:last-child { border-right: none }
  .inge .res-lbl { font-size: 7.1pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px }
  .inge .res-num { font-size: 12pt; font-weight: 800; color: #000b59 }

  .inge .declaracion { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; font-size: 7.9pt; color: #1e293b }

  .inge .sig-table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: avoid }
  .inge .sig-table td { vertical-align: top; text-align: center; padding: 0 10px; width: 33.3% }
  .inge .sig-table td:first-child { padding-left: 0 }
  .inge .sig-table td:last-child { padding-right: 0 }
  .inge .sig-role { font-size: 7.4pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; margin-bottom: 4px }
  .inge .sig-img-wrap { height: 82px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px }
  .inge .sig-img { max-height: 62px; max-width: 190px; display: block; margin: 0 auto }
  .inge .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px }
  .inge .sig-name { font-size: 8.4pt; font-weight: 700; color: #000b59; text-transform: uppercase }
  .inge .sig-details { font-size: 7.4pt; color: #64748b; line-height: 1.35 }
  .inge .firma-nota { font-size: 7.5pt; color: #94a3b8 }

  .inge .doc-footer { margin-top: 12px; text-align: center }
  .inge .doc-footer .line { height: 2px; background: #f55400; border-radius: 1px; margin-bottom: 7px }
  .inge .doc-footer .addr { color: #000b59; font-size: 7.4pt; line-height: 1.4; letter-spacing: 0.3px }
  .inge .doc-footer .legal { color: #94a3b8; font-size: 6.8pt; margin-top: 2px }
</style>

<div class="inge">

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Comprobante de inducción general</div>
        <div class="doc-subtitle">{{tipo}} &bull; Seguridad y Salud en el Trabajo &bull; Radicado {{radicado}}</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
      </td>
    </tr>
  </table>

  <section class="section-block">
    <table class="info-table">
      <tr>
        <td class="lbl">Tipo de capacitación</td>
        <td class="val" colspan="3">Inducción (primera vez): SI <span class="marca">{{marca_induccion_si}}</span> NO <span class="marca">{{marca_induccion_no}}</span>
          &nbsp;&nbsp;&nbsp;&nbsp; Reinducción: SI <span class="marca">{{marca_reinduccion_si}}</span> NO <span class="marca">{{marca_reinduccion_no}}</span></td>
      </tr>
      <tr><td class="lbl">Ciudad y operación</td><td class="val">{{ciudad}} &bull; {{operacion}}</td><td class="lbl">Fecha de capacitación</td><td class="val">{{fecha_capacitacion}}</td></tr>
      <tr><td class="lbl">Nombre y apellidos</td><td class="val">{{nombre_trabajador}}</td><td class="lbl">No. de cédula</td><td class="val">{{identificacion}}</td></tr>
      <tr><td class="lbl">Cargo</td><td class="val">{{cargo}}</td><td class="lbl">Fecha de ingreso</td><td class="val">{{fecha_ingreso}}</td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">Marque con X, de acuerdo a la información recibida en la presente inducción</div>
    {{temas_html}}
    <div class="resumen">
      <div><div class="res-lbl">Temas recibidos (SI)</div><div class="res-num">{{temas_si}} / {{total_temas}}</div></div>
      <div><div class="res-lbl">Temas no recibidos (NO)</div><div class="res-num">{{temas_no}}</div></div>
    </div>
  </section>

  <section class="section-block">
    <div class="section-title">Declaración del trabajador</div>
    <div class="declaracion">{{declaracion_html}}</div>
  </section>

  <section class="section-block" style="page-break-inside: avoid; break-inside: avoid">
    <div class="section-title">Firmas</div>
    <table class="sig-table">
      <tr>
        <td>
          <div class="sig-role">Trabajador · firma / identificación</div>
          <div class="sig-img-wrap">{{firma_trabajador_html}}</div>
          <div class="sig-line"></div>
          <div class="sig-name">{{nombre_trabajador}}</div>
          <div class="sig-details">C.C. {{identificacion}}<br>{{cargo}}</div>
        </td>
        <td>
          <div class="sig-role">Analista SST</div>
          <div class="sig-img-wrap">{{firma_analista_html}}</div>
          <div class="sig-line"></div>
          <div class="sig-name">{{nombre_analista}}</div>
          <div class="sig-details">{{cargo_analista}}</div>
        </td>
        <td>
          <div class="sig-role">Líder SST</div>
          <div class="sig-img-wrap">{{firma_lider_html}}</div>
          <div class="sig-line"></div>
          <div class="sig-name">{{nombre_lider}}</div>
          <div class="sig-details">{{cargo_lider}}</div>
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
WHERE nombre_proceso = 'INGE' AND tabla_datos <> 'Dynamic_inge';

SELECT id_plantilla, nombre_proceso, id_config_doc, codigo_formato, version_formato, fecha_version, tabla_datos, version FROM Maestro_Plantillas WHERE nombre_proceso = 'INGE';
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'INGE';
SELECT ID, Seccion, Acceso, Rol, Url FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion IN ('ARO', 'EVIN', 'INGE') ORDER BY Seccion, Acceso;

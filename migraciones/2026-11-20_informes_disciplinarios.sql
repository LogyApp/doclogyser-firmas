-- Nómina › Informes Disciplinarios (src/routes/informesDisciplinarios.js, public/js/nomina-informes-disciplinarios.js).
-- Quien reporta registra el informe sobre un trabajador activo, lo firma con su firma registrada o una nueva,
-- y el PDF (plantilla 'informe_disciplinario', formato OP-R-010 v2) queda en la carpeta del trabajador como
-- documento 43 (Proceso Disciplinario, PDIS) y en Maestro_docTrabajador. Llega un correo a Jurídica.
-- Estados: Borrador (guardado para continuar después) -> Recibido (firmado) -> Cerrado (por Jurídica).
-- Cada usuario ve sus informes; los roles de 'Roles que ven todos los informes disciplinarios' ven todos.
-- Solo crea tablas y agrega filas. Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Dynamic_Informe_Disciplinario (
  id_informe          VARCHAR(36)  NOT NULL PRIMARY KEY,
  estado              VARCHAR(20)  NOT NULL DEFAULT 'Borrador',
  usuario             VARCHAR(50)  NOT NULL,
  nombre_reporta      VARCHAR(100) NULL,
  cargo_reporta       VARCHAR(100) NULL,
  fecha_informe       DATE         NULL,
  identificacion      BIGINT       NULL,
  id_vinculacion      VARCHAR(50)  NULL,
  nombre_trabajador   VARCHAR(150) NULL,
  cargo_trabajador    VARCHAR(100) NULL,
  operacion           VARCHAR(50)  NULL,
  regional            VARCHAR(50)  NULL,
  fecha_ingreso       DATE         NULL,
  funciones           TEXT         NULL,
  fecha_hechos        DATE         NULL,
  tipo_falta          VARCHAR(150) NULL,
  tipo_falta_otro     VARCHAR(255) NULL,
  descripcion_hechos  TEXT         NULL,
  accion_inmediata    TEXT         NULL,
  consecuencias       TEXT         NULL,
  comentarios_fotos   TEXT         NULL,
  forma_conocimiento  TEXT         NULL,
  url_firma           VARCHAR(255) NULL,
  fecha_firma         DATETIME     NULL,
  url_doc             VARCHAR(255) NULL,
  fecha_registro      DATETIME     NULL,
  resultado_cierre    VARCHAR(150) NULL,
  nota_cierre         TEXT         NULL,
  usuario_cierre      VARCHAR(50)  NULL,
  fecha_cierre        DATETIME     NULL,
  fecha_creacion      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_idis_usuario (usuario),
  KEY idx_idis_estado (estado),
  KEY idx_idis_identificacion (identificacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Dynamic_Informe_Disciplinario_Evidencias (
  id_evidencia INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_informe   VARCHAR(36)  NOT NULL,
  url          VARCHAR(500) NOT NULL,
  fecha        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_idis_ev_informe (id_informe)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS Dynamic_Informe_Disciplinario_Seguimiento (
  id_seguimiento INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_informe     VARCHAR(36) NOT NULL,
  fecha          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario        VARCHAR(50) NOT NULL,
  tipo           VARCHAR(20) NOT NULL DEFAULT 'Nota',
  nota           TEXT        NULL,
  KEY idx_idis_seg_informe (id_informe)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Parámetros (Config_Parametros nomina / Informes Disciplinarios)
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Informes Disciplinarios', 'Roles que ven todos los informes disciplinarios', '', 'Juridica, Directorth, Sistema',
       'Roles que ven en la pestaña Informes Disciplinarios los informes de todos los usuarios y los antecedentes del trabajador. Los demás solo ven los que registraron.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Roles que ven todos los informes disciplinarios');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Informes Disciplinarios', 'Roles que pueden cerrar informes disciplinarios', '', 'Juridica, Sistema',
       'Roles que pueden anotar el seguimiento, cerrar el informe con su resultado y regenerar el PDF. Vacío: nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Roles que pueden cerrar informes disciplinarios');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Informes Disciplinarios', 'Tipos de falta', '',
       'INASISTENCIA A TRABAJAR, LLEGADAS TARDE, AVERÍAS GENERADAS, FALTA DE RESPETO A LOS COMPAÑEROS O SUPERIORES, HURTO, PRESENTARSE AL TRABAJO BAJO LOS EFECTOS DE SUSTANCIAS, INCUMPLIMIENTO DE LAS ÓRDENES ASIGNADAS, BAJO RENDIMIENTO EN LA OPERACIÓN, TERMINACIÓN DE CONTRATO POR PERIODO DE PRUEBA, OTRO',
       'Opciones de la lista Tipo de falta del formulario, separadas por coma. Si escogen OTRO deben escribir cuál.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Tipos de falta');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Informes Disciplinarios', 'Resultados de cierre', '',
       'LLAMADO DE ATENCIÓN, SUSPENSIÓN, TERMINACIÓN DE CONTRATO, ARCHIVADO SIN SANCIÓN',
       'Opciones que escoge Jurídica al cerrar un informe disciplinario, separadas por coma.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Resultados de cierre');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Informes Disciplinarios', 'Días para aviso de inmediatez', '', '15',
       'Si la fecha de los hechos tiene más de estos días, el formulario advierte que la sanción podría ser tardía. Vacío o 0: sin aviso.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Días para aviso de inmediatez');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Informes Disciplinarios', 'Habilitar notificaciones de correo en Informes Disciplinarios', '', '1',
       'Interruptor del correo que se envía al registrar un informe disciplinario. 1 = se envía; 0 = no se envía a nadie.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Habilitar notificaciones de correo en Informes Disciplinarios');

-- Para las pruebas el correo llega solo al rol Sistema. En producción: Para = Juridica y Copia = Directorth, Sistema.
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Informes Disciplinarios', 'Notificación nuevo informe disciplinario - Para:', '', 'Sistema',
       'Roles (Email de Maestro_Usuarios) que reciben el correo de un informe disciplinario nuevo. Normalmente Juridica. Quien registra siempre va en copia.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Notificación nuevo informe disciplinario - Para:');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'nomina', 'Informes Disciplinarios', 'Notificación nuevo informe disciplinario - Copia:', '', '',
       'Roles que van en copia del correo de un informe disciplinario nuevo. Normalmente Directorth, Sistema. Vacío: solo va en copia quien registra.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios' AND Concepto = 'Notificación nuevo informe disciplinario - Copia:');

-- Pestaña en Nómina: roles administrativos más Coordinador, CoordinadorR, Auxiliar y AuxiliarR (sin Líderes).
-- Acceso 1: pueden reportar a cualquier trabajador activo; qué informes ve cada uno lo define el parámetro de arriba.
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'nomina', 'InformesDisciplinarios',
       'Sistema, Juridica, Directorth, Nomina, Control, Contabilidad, Facturación, Cuentas, Selección, Selección Centro, CoorSelección, Contratación, Generalista, Asistencial, Calidad, Archivo, Inventario, AuxInventario, LiderSst, AdmSst, AnaSst, AuxSst, subgerente, Coordinador, CoordinadorR, Auxiliar, AuxiliarR',
       1, 'Informes Disciplinarios', '/nomina?tab=informesdisciplinarios', 14, '⚖',
       'Registro de informes disciplinarios de los trabajadores, con firma de quien reporta y aviso a Jurídica.'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'nomina' AND Seccion = 'InformesDisciplinarios');

-- Plantilla del PDF (HTML también en migraciones/plantillas/informe_disciplinario.html)
INSERT INTO Maestro_Plantillas
  (nombre_proceso, id_config_doc, codigo_formato, version_formato, fecha_version, tabla_datos, id_campo_fk, bucket_carpeta,
   requiere_firma_trabajador, activo, version, ultima_actualizacion, contenido_html)
SELECT 'informe_disciplinario', 43, 'OP-R-010', '2', '2026-11-20', 'Dynamic_Informe_Disciplinario', 'id_informe', 'talenthub_central',
       0, 1, 1, NOW(), '<style>
  /* Estilos encerrados en .idis. Las funciones del cargo, las evidencias y la firma las arma src/services/informesDisciplinarios.js. */
  .idis { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; font-size: 9.6pt; line-height: 1.5; -webkit-font-smoothing: antialiased }
  .idis * { box-sizing: border-box }
  .idis p { margin: 0 0 8px 0; text-align: justify }

  .idis .doc-header-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; border: 1px solid #cbd5e1 }
  .idis .doc-header-table td { border: 1px solid #cbd5e1; vertical-align: middle }
  .idis .header-logo-cell { width: 24%; text-align: center; padding: 8px 10px; background: #ffffff }
  .idis .logo-img { height: 46px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto }
  .idis .header-title-cell { width: 56%; background: #e6edf7; text-align: center; padding: 10px 14px }
  .idis .doc-title { font-size: 11pt; font-weight: 800; color: #000b59; letter-spacing: 0.4px; text-transform: uppercase; line-height: 1.25 }
  .idis .doc-subtitle { font-size: 8pt; font-weight: 700; color: #c2410c; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px }
  .idis .doc-subdetail { font-size: 7pt; color: #475569; font-weight: 600; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.2px }
  .idis .header-meta-cell { width: 20%; padding: 6px 10px; font-size: 8pt; text-align: center; background: #f8fafc; color: #1e293b; line-height: 1.35 }
  .idis .meta-code { font-weight: 800; color: #000b59; font-size: 8.5pt }
  .idis .meta-ver { color: #334155 }
  .idis .meta-date { color: #64748b; font-size: 7.5pt }

  .idis .metrics-card { display: table; width: 100%; table-layout: fixed; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin: 4px 0 14px 0 }
  .idis .metric-item { display: table-cell; padding: 10px 14px; border-right: 1px solid #e2e8f0; vertical-align: top }
  .idis .metric-item:last-child { border-right: none }
  .idis .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px }
  .idis .metric-value { font-size: 10pt; font-weight: 700; color: #000b59 }
  .idis .metric-value-primary { font-size: 10pt; font-weight: 800; color: #f55400 }

  .idis .section-block { margin-bottom: 14px }
  .idis .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px }
  .idis .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; margin-right: 6px; vertical-align: -1px }

  .idis .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 9pt }
  .idis .data-grid td { padding: 7px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle }
  .idis .data-grid tr:last-child td { border-bottom: none }
  .idis .data-grid tr:nth-child(even) td { background: #fafafa }
  .idis .data-label { width: 28%; font-weight: 700; color: #64748b; border-right: 1px solid #f1f5f9 }
  .idis .data-val { font-weight: 600; color: #0f172a }

  .idis .obs-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 8px 12px; font-size: 8.8pt; color: #1e293b; white-space: pre-line; line-height: 1.5; text-align: justify }

  .idis .funciones-box { border: 1px dashed #cbd5e1; border-radius: 6px; padding: 6px 10px; background: #ffffff }
  .idis .funciones-list { margin: 0; padding-left: 16px; columns: 2; column-gap: 22px; font-size: 7.2pt; line-height: 1.35; color: #475569 }
  .idis .funciones-list li { margin-bottom: 2px; break-inside: avoid }

  .idis .evidencias-grid { width: 100%; border-collapse: separate; border-spacing: 8px; margin: -8px; width: calc(100% + 16px) }
  .idis .evidencias-grid td { width: 33.33%; vertical-align: top; text-align: center }
  .idis .evidencia { border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px; background: #ffffff; page-break-inside: avoid }
  .idis .evidencia img { max-width: 100%; max-height: 170px; object-fit: contain; display: block; margin: 0 auto }

  .idis .sig-table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: avoid }
  .idis .sig-table td { width: 50%; vertical-align: top; text-align: center; padding: 0 14px }
  .idis .sig-table td:first-child { padding-left: 0 }
  .idis .sig-role { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; margin-bottom: 4px }
  .idis .sig-img-wrap { height: 92px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px }
  .idis .sig-img { max-height: 70px; max-width: 220px; display: block; margin: 0 auto }
  .idis .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px }
  .idis .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase }
  .idis .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35 }
  .idis .firma-nota { font-size: 7.5pt; color: #94a3b8 }
  .idis .nota-legal { font-size: 7.5pt; color: #64748b; font-style: italic; margin-top: 10px; text-align: justify }

  .idis .doc-footer { margin-top: 22px; text-align: center }
  .idis .doc-footer .line { height: 2px; background: #f55400; border-radius: 1px; margin-bottom: 7px }
  .idis .doc-footer .addr { color: #000b59; font-size: 7.5pt; line-height: 1.4; letter-spacing: 0.3px }
  .idis .doc-footer .legal { color: #94a3b8; font-size: 6.8pt; margin-top: 2px }
</style>

<div class="idis">

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Formato informe disciplinario</div>
        <div class="doc-subtitle">Gestión Jurídica</div>
        <div class="doc-subdetail">Radicado {{radicado}} &bull; Registrado el {{fecha_registro}}</div>
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
      <div class="metric-label">Trabajador(a)</div>
      <div class="metric-value">{{nombre_trabajador}}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Tipo de falta</div>
      <div class="metric-value" style="font-size:9pt">{{tipo_falta}}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Fecha de los hechos</div>
      <div class="metric-value-primary">{{fecha_hechos}}</div>
    </div>
  </div>

  <section class="section-block">
    <div class="section-title">Datos del trabajador</div>
    <table class="data-grid">
      <tr><td class="data-label">Nombre</td><td class="data-val">{{nombre_trabajador}}</td></tr>
      <tr><td class="data-label">Identificación</td><td class="data-val">{{identificacion}}</td></tr>
      <tr><td class="data-label">Cargo</td><td class="data-val">{{cargo_trabajador}}</td></tr>
      <tr><td class="data-label">Operación asignada</td><td class="data-val">{{operacion}}</td></tr>
      <tr><td class="data-label">Fecha de ingreso</td><td class="data-val">{{fecha_ingreso}}</td></tr>
    </table>
  </section>

  {{seccion_funciones}}

  <section class="section-block">
    <div class="section-title">Datos del reporte</div>
    <table class="data-grid">
      <tr><td class="data-label">Fecha del informe</td><td class="data-val">{{fecha_informe}}</td></tr>
      <tr><td class="data-label">Fecha de los hechos</td><td class="data-val">{{fecha_hechos}}</td></tr>
      <tr><td class="data-label">Tipo de falta</td><td class="data-val">{{tipo_falta}}</td></tr>
      <tr><td class="data-label">Reportado por</td><td class="data-val">{{nombre_reporta}}<br><span style="color:#64748b;font-weight:600">{{cargo_reporta}}</span></td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">Descripción de los hechos</div>
    <div class="obs-box">{{descripcion_hechos}}</div>
  </section>

  <section class="section-block">
    <div class="section-title">Acción inmediata tomada para normalizar la operación</div>
    <div class="obs-box">{{accion_inmediata}}</div>
  </section>

  <section class="section-block">
    <div class="section-title">Consecuencias de los hechos (técnicas, económicas, legales, etc.)</div>
    <div class="obs-box">{{consecuencias}}</div>
  </section>

  <section class="section-block">
    <div class="section-title">Forma de conocimiento de los hechos por parte de la empresa</div>
    <div class="obs-box">{{forma_conocimiento}}</div>
  </section>

  {{seccion_evidencias}}

  <section class="section-block" style="page-break-inside: avoid; break-inside: avoid">
    <div class="section-title">Firma de quien reporta</div>
    <table class="sig-table">
      <tr>
        <td>
          <div class="sig-role">Quien reporta y diligencia</div>
          <div class="sig-img-wrap">{{firma_reporta_html}}</div>
          <div class="sig-line"></div>
          <div class="sig-name">{{nombre_reporta}}</div>
          <div class="sig-details">{{cargo_reporta}}</div>
        </td>
        <td></td>
      </tr>
    </table>
    <p class="nota-legal">Quien firma declara que la información consignada en este informe es veraz y corresponde a hechos de los que tuvo conocimiento. El informe es de uso interno y será evaluado por el área Jurídica, que determinará el trámite disciplinario que corresponda.</p>
    <div class="doc-footer" style="margin-top:14px">
      <div class="line"></div>
      <div class="addr">DIAGONAL 74B No. 33° 51-55 — ANTIGUA TRANSVERSAL 39° No 70° 51-55 — LAURELES - MEDELLÍN</div>
      <div class="legal">Apoyo Logístico y Operativo S.A.S. &bull; Documento electrónico — Ley 527 de 1999</div>
    </div>
  </section>

</div>
'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Plantillas WHERE nombre_proceso = 'informe_disciplinario');

SELECT id_plantilla, nombre_proceso, codigo_formato, version_formato, fecha_version FROM Maestro_Plantillas WHERE nombre_proceso = 'informe_disciplinario';
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'nomina' AND Seccion = 'Informes Disciplinarios';
SELECT ID, Seccion, Acceso, Etiqueta FROM Maestro_Menu WHERE Modulo = 'nomina' AND Seccion = 'InformesDisciplinarios';

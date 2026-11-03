-- TalentHub > Registro Asistencia: el mismo proceso de SST > Participación sobre las mismas
-- tablas (Dynamic_formato_asistencia, Dynamic_formato_itemsAsistencia, Dynamic_formato_evidencias),
-- con la Evaluación de Eficacia de la formación al final del PDF.
--   * Dynamic_formato_asistencia.modulo: 'sst' (Participación, todos los registros actuales) o
--     'talenthub' (Registro Asistencia). Cada pestaña solo ve los suyos.
--   * Columnas de la evaluación de eficacia (solo TalentHub): formacion_eficaz (1 Sí / 0 No),
--     resultado_evaluacion, fecha_evaluacion, accion_no_eficaz, evaluador (ID de Maestro_Usuarios),
--     firma_evaluador (URL de su firma más reciente en el bucket) y fecha_registro_evaluacion.
--   * Maestro_Menu: talenthub / RegistroAsistencia con los mismos roles y accesos (1, 2 y 3) que
--     Sociodemografica (se copian de sus filas).
--   * Config_Parametros talenthub / Registro Asistencia: permisos y notificaciones.
--   * Maestro_Plantillas: registro_asistencia_th (TH-R-013, versión 3, 03/11/2026). El HTML también
--     está en migraciones/plantillas/registro_asistencia_th.html.
-- Solo agrega (no borra ni cambia datos existentes). Se puede ejecutar más de una vez.

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND COLUMN_NAME = 'modulo');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN modulo VARCHAR(20) NOT NULL DEFAULT ''sst'' AFTER id_doc_empresa', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND COLUMN_NAME = 'formacion_eficaz');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN formacion_eficaz TINYINT(1) NULL AFTER modulo', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND COLUMN_NAME = 'resultado_evaluacion');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN resultado_evaluacion TEXT NULL AFTER formacion_eficaz', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND COLUMN_NAME = 'fecha_evaluacion');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN fecha_evaluacion DATE NULL AFTER resultado_evaluacion', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND COLUMN_NAME = 'accion_no_eficaz');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN accion_no_eficaz TEXT NULL AFTER fecha_evaluacion', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND COLUMN_NAME = 'evaluador');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN evaluador VARCHAR(50) NULL AFTER accion_no_eficaz', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND COLUMN_NAME = 'firma_evaluador');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN firma_evaluador VARCHAR(550) NULL AFTER evaluador', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND COLUMN_NAME = 'fecha_registro_evaluacion');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD COLUMN fecha_registro_evaluacion DATETIME NULL AFTER firma_evaluador', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Dynamic_formato_asistencia' AND INDEX_NAME = 'idx_asistencia_modulo');
SET @sql := IF(@c = 0, 'ALTER TABLE Dynamic_formato_asistencia ADD INDEX idx_asistencia_modulo (modulo)', 'SELECT 1');
PREPARE st FROM @sql;
EXECUTE st;
DEALLOCATE PREPARE st;

-- Maestro_Menu: mismos roles y accesos que Sociodemografica
INSERT INTO Maestro_Menu (Modulo, Seccion, Etiqueta, Rol, Acceso, Orden, Icono, Url, Descripcion)
SELECT 'talenthub', 'RegistroAsistencia', 'Registro Asistencia', s.Rol, s.Acceso, 4, '❖', '/talenthub?tab=RegistroAsistencia',
       'Registro de asistencia a formaciones y capacitaciones, con evaluación de eficacia.'
FROM Maestro_Menu s
WHERE s.Modulo = 'talenthub' AND s.Seccion = 'Sociodemografica'
  AND NOT EXISTS (SELECT 1 FROM Maestro_Menu m WHERE m.Modulo = 'talenthub' AND m.Seccion = 'RegistroAsistencia' AND m.Acceso = s.Acceso);

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden crear registros de asistencia', 'Rol', 'Contratación, CoorSelección, Directorth, Selección, Sistema, Juridica, Inventario, LiderSst, Nomina, Calidad, Generalista, AdmSst, Asistencial, Selección Centro, AuxiliarR, CoordinadorR, AuxSst, Auxiliar, Coordinador, AnaSst',
       'Roles que ven el botón "Nueva Asistencia" en TalentHub > Registro Asistencia y pueden crear registros. Si se deja vacío, nadie puede crear.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden crear registros de asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden editar cualquier registro de asistencia', 'Rol', 'Sistema',
       'Roles que pueden editar registros de asistencia de otros usuarios mientras no tienen PDF. Quien lo creó siempre puede editarlo. Si se deja vacío, solo el creador.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden editar cualquier registro de asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden eliminar cualquier registro de asistencia', 'Rol', 'Sistema',
       'Roles que pueden eliminar registros de asistencia de otros usuarios mientras no tienen PDF. Quien lo creó siempre puede eliminarlo. Si se deja vacío, solo el creador.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden eliminar cualquier registro de asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden generar el PDF de cualquier registro de asistencia', 'Rol', 'Sistema',
       'Roles que pueden generar el PDF de registros de asistencia de otros usuarios. Quien lo creó siempre puede. Si se deja vacío, solo el creador.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden generar el PDF de cualquier registro de asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden enviar enlaces de firma de cualquier registro de asistencia', 'Rol', 'Sistema',
       'Roles que pueden reenviar por correo, WhatsApp o copiar el enlace de firma a los asistentes de registros de otros usuarios. Quien lo creó siempre puede. Si se deja vacío, solo el creador.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden enviar enlaces de firma de cualquier registro de asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden editar y regenerar el PDF de registros de asistencia con PDF generado', 'Rol', 'Sistema',
       'Roles que pueden editar un registro de asistencia que ya tiene PDF (aún sin evaluación de eficacia) y regenerar su PDF. Si se deja vacío, nadie puede.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden editar y regenerar el PDF de registros de asistencia con PDF generado');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden eliminar registros de asistencia con PDF generado', 'Rol', 'Sistema',
       'Roles que pueden eliminar un registro de asistencia que ya tiene PDF (aún sin evaluación de eficacia). Si se deja vacío, nadie puede.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden eliminar registros de asistencia con PDF generado');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden registrar la evaluación de eficacia de cualquier registro de asistencia', 'Rol', 'Sistema',
       'Roles que pueden registrar la evaluación de eficacia ("Evaluar Eficacia") de registros de otros usuarios, después de generar el PDF. Quien creó el registro siempre puede. Si se deja vacío, solo el creador.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden registrar la evaluación de eficacia de cualquier registro de asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden editar y regenerar el PDF de registros de asistencia con evaluación de eficacia', 'Rol', 'Sistema',
       'Roles que pueden editar un registro de asistencia (o su evaluación de eficacia) después de registrar la evaluación, y regenerar su PDF. Si se deja vacío, nadie puede.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden editar y regenerar el PDF de registros de asistencia con evaluación de eficacia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Roles que pueden eliminar registros de asistencia con evaluación de eficacia', 'Rol', 'Sistema',
       'Roles que pueden eliminar un registro de asistencia que ya tiene la evaluación de eficacia. Si se deja vacío, nadie puede.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Roles que pueden eliminar registros de asistencia con evaluación de eficacia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Habilitar notificaciones de correo en Registro Asistencia', 'Booleano', '1',
       'Con 1 se envía a cada asistente el correo con el enlace para firmar su asistencia al guardar el registro. Con 0 no se envían correos (y no se pueden reenviar).'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Habilitar notificaciones de correo en Registro Asistencia');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Registro Asistencia', 'Anotación en el PDF para asistentes sin firma', 'Texto', 'Soportado por correo electrónico',
       'Texto que aparece en el PDF en lugar de la firma de los asistentes que no han firmado pero recibieron el correo de invitación.'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia' AND Concepto = 'Anotación en el PDF para asistentes sin firma');

-- Plantilla del PDF (TH-R-013, versión 3, 03/11/2026)
INSERT INTO Maestro_Plantillas (nombre_proceso, codigo_formato, version_formato, fecha_version, tabla_datos, id_campo_fk,
                                bucket_carpeta, requiere_firma_trabajador, activo, version, contenido_html, ultima_actualizacion)
SELECT 'registro_asistencia_th', 'TH-R-013', '3', '2026-11-03', 'Dynamic_formato_asistencia', 'id_asistencia',
       'general', 1, 1, 1, '<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Registro de Asistencia — LOG&amp;SER</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a; background: #ffffff; font-size: 9.2pt; line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }

  /* Encabezado compacto 3 columnas */
  .doc-header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1px solid #cbd5e1; }
  .doc-header-table td { border: 1px solid #cbd5e1; vertical-align: middle; }
  .header-logo-cell { width: 24%; text-align: center; padding: 8px 10px; background: #ffffff; }
  .logo-img { height: 46px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto; }
  .header-title-cell { width: 56%; background: #e6edf7; color: #000b59; text-align: center; padding: 10px 14px; }
  .doc-title { font-size: 11pt; font-weight: 800; color: #000b59; letter-spacing: 0.4px; text-transform: uppercase; line-height: 1.25; }
  .doc-subtitle { font-size: 8pt; font-weight: 700; color: #c2410c; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px; }
  .doc-subdetail { font-size: 7pt; color: #475569; font-weight: 600; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.2px; }
  .header-meta-cell { width: 20%; padding: 6px 10px; font-size: 8pt; text-align: center; background: #f8fafc; color: #1e293b; line-height: 1.35; }
  .meta-code { font-weight: 800; color: #000b59; font-size: 8.5pt; }
  .meta-ver { color: #334155; }
  .meta-date { color: #64748b; font-size: 7.5pt; }
  .meta-id { margin-top: 2px; font-size: 7.5pt; color: #000b59; font-weight: 800; }

  /* Tarjeta de datos clave */
  .metrics-card { display: flex; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
  .metric-item { flex: 1; padding: 10px 14px; border-right: 1px solid #e2e8f0; }
  .metric-item:last-child { border-right: none; }
  .metric-label { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .metric-value-primary { font-size: 13pt; font-weight: 800; color: #f55400; letter-spacing: -0.3px; }
  .metric-value { font-size: 10pt; font-weight: 700; color: #000b59; }
  .metric-sub { font-size: 7.5pt; color: #94a3b8; margin-top: 1px; }

  /* Secciones */
  .section-block { margin-bottom: 12px; }
  .section-title { font-size: 8.5pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 8px; }
  .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; }

  /* Datos */
  .data-grid { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; font-size: 8.5pt; }
  .data-grid td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .data-grid tr:last-child td { border-bottom: none; }
  .data-grid tr:nth-child(even) td { background: #fafafa; }
  .data-label { width: 22%; font-weight: 600; color: #64748b; border-right: 1px solid #f1f5f9; }
  .data-val { font-weight: 600; color: #0f172a; text-align: justify; }

  /* Tabla de asistentes */
  .doc-table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; font-size: 8pt; }
  .doc-table thead { display: table-header-group; }
  .doc-table th { background: #000b59; color: #ffffff; font-weight: 700; text-align: left; padding: 5px 8px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4px; }
  .doc-table td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  .doc-table tr { page-break-inside: avoid; }
  .doc-table tbody tr:nth-child(even) td { background: #fafafa; }
  .col-num { width: 4%; text-align: center; color: #64748b; }
  .col-op { width: 16%; }
  .col-firma { width: 22%; text-align: center; }
  .firma-img { max-height: 34px; max-width: 145px; object-fit: contain; display: block; margin: 0 auto; }
  .firma-nota { display: inline-block; font-size: 7pt; color: #475569; font-style: italic; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 6px; line-height: 1.3; }
  .resumen { font-size: 7.5pt; color: #64748b; margin-top: 5px; }

  /* Recuadro de soporte */
  .statement-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 9px 12px; margin-top: 10px; margin-bottom: 14px; page-break-inside: avoid; }
  .statement-header { font-size: 8pt; font-weight: 700; color: #000b59; text-transform: uppercase; margin-bottom: 3px; letter-spacing: 0.3px; }
  .statement-text { font-size: 8pt; color: #334155; text-align: justify; line-height: 1.4; }

  /* Evidencias */
  .evidencias-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .evidencia { width: calc(33.333% - 6px); height: 120px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #f8fafc; page-break-inside: avoid; }
  .evidencia img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* Firma del responsable */
  .signature-container { margin-top: 10px; margin-bottom: 14px; page-break-inside: avoid; }
  .signature-card { width: 280px; margin: 0 auto; text-align: center; }
  .sig-img-wrap { height: 70px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
  .sig-img { max-height: 65px; max-width: 240px; object-fit: contain; }
  .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px; }
  .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase; }
  .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35; }

  /* Evaluación de Eficacia */
  .eficacia-badge-si { display: inline-block; padding: 2px 10px; border-radius: 12px; font-weight: 800; font-size: 8pt; background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
  .eficacia-badge-no { display: inline-block; padding: 2px 10px; border-radius: 12px; font-weight: 800; font-size: 8pt; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }

  /* Pie de página */
  .doc-footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 5px; display: flex; justify-content: space-between; font-size: 7pt; color: #94a3b8; page-break-inside: avoid; }
</style>
</head>
<body>

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell">
        <img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img">
      </td>
      <td class="header-title-cell">
        <div class="doc-title">REGISTRO DE ASISTENCIA</div>
        <div class="doc-subtitle">FORMACIÓN, CAPACITACIÓN Y EVALUACIÓN DE EFICACIA</div>
        <div class="doc-subdetail">GESTIÓN DEL TALENTO HUMANO</div>
      </td>
      <td class="header-meta-cell">
        <div class="meta-code">{{codigo_formato}}</div>
        <div class="meta-ver">Versión: {{version_formato}}</div>
        <div class="meta-date">{{fecha_formato}}</div>
        <div class="meta-id">ID: #{{id_asistencia}}</div>
      </td>
    </tr>
  </table>

  <div class="metrics-card">
    <div class="metric-item">
      <div class="metric-label">Fecha de la actividad</div>
      <div class="metric-value">{{fecha}}</div>
      <div class="metric-sub">De {{hora_inicial}} a {{hora_final}}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Lugar</div>
      <div class="metric-value">{{lugar}}</div>
      <div class="metric-sub">Duración: {{duracion}} h</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Asistentes</div>
      <div class="metric-value-primary">{{total_asistentes}}</div>
      <div class="metric-sub">{{resumen_firmas}}</div>
    </div>
  </div>

  <section class="section-block">
    <div class="section-title">Información de la Actividad</div>
    <table class="data-grid">
      <tr><td class="data-label">Tema:</td><td class="data-val"><strong>{{tema}}</strong></td></tr>
      <tr><td class="data-label">Objetivo:</td><td class="data-val">{{objetivo}}</td></tr>
      <tr><td class="data-label">Responsable:</td><td class="data-val">{{nombre_responsable}} &bull; {{cargo_responsable}}</td></tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">Asistentes Registrados</div>
    <table class="doc-table">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th class="col-op">Operación</th>
          <th>Nombres y apellidos</th>
          <th style="width: 13%;">Cédula</th>
          <th style="width: 19%;">Cargo</th>
          <th class="col-firma" style="text-align: center;">Firma</th>
        </tr>
      </thead>
      <tbody>
        {{filas_asistentes}}
      </tbody>
    </table>
    <p class="resumen">{{resumen_detalle}}</p>
  </section>

  <section class="statement-box">
    <div class="statement-header">Soporte de la participación</div>
    <p class="statement-text">
      La participación de los asistentes en esta actividad se respalda con su firma digital registrada en la plataforma.
      A quienes no firmaron se les envió un correo electrónico con la invitación a firmar, que queda como soporte de su
      participación (Ley 527 de 1999 sobre mensajes de datos), junto con la evidencia fotográfica de la actividad.
    </p>
  </section>

  <div class="signature-container">
    <div class="signature-card">
      <div class="sig-img-wrap">{{firma_responsable_html}}</div>
      <div class="sig-line"></div>
      <div class="sig-name">{{nombre_responsable}}</div>
      <div class="sig-details">{{cargo_responsable}}<br>Responsable del registro</div>
    </div>
  </div>

  {{seccion_evidencias}}

  {{seccion_evaluacion_eficacia}}

  <footer class="doc-footer">
    <span>Apoyo Logístico y Operativo S.A.S. &bull; Registro de Asistencia ({{codigo_formato}})</span>
    <span>Certificación electrónica bajo Ley 527 de 1999</span>
    <span>Generado el {{fecha_generacion}}</span>
  </footer>

</body>
</html>
', NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Plantillas WHERE nombre_proceso = 'registro_asistencia_th');

-- Verificación
SELECT modulo, COUNT(*) AS formatos FROM Dynamic_formato_asistencia GROUP BY modulo;
SELECT Seccion, Acceso, Rol FROM Maestro_Menu WHERE Modulo = 'talenthub' AND Seccion IN ('Sociodemografica', 'RegistroAsistencia') ORDER BY Acceso, Seccion;
SELECT COUNT(*) AS parametros FROM Config_Parametros WHERE Modulo = 'talenthub' AND Seccion = 'Registro Asistencia';
SELECT nombre_proceso, codigo_formato, version_formato, DATE_FORMAT(fecha_version, '%d/%m/%Y') AS fecha_version, activo
FROM Maestro_Plantillas WHERE nombre_proceso = 'registro_asistencia_th';

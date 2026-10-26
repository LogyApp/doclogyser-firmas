-- Migración: Módulo SST - Pestaña ATS (Análisis de Trabajo Seguro)
-- Formato base: SST-F-036 v02 (23/09/2026)
-- Fecha: 2026-10-26

-- 1. Tabla principal de ATS
CREATE TABLE IF NOT EXISTS `Dynamic_ats` (
  `id_ats` INT AUTO_INCREMENT PRIMARY KEY,
  `regional` VARCHAR(100) NOT NULL,
  `operacion` VARCHAR(150) NOT NULL,
  `muelle_ubicacion` VARCHAR(150) NOT NULL,
  `vigencia_desde` DATE NOT NULL,
  `vigencia_hasta` DATE NOT NULL,
  `turnos` VARCHAR(100) DEFAULT NULL,
  `horarios` VARCHAR(100) DEFAULT NULL,
  `coordinador_operacion_id` VARCHAR(50) DEFAULT NULL,
  `coordinador_operacion_nombre` VARCHAR(255) DEFAULT NULL,
  `coordinador_operacion_celular` VARCHAR(50) DEFAULT NULL,
  `coordinador_operacion_email` VARCHAR(150) DEFAULT NULL,
  `token_coordinador` VARCHAR(100) DEFAULT NULL,
  `fecha_firma_coordinador` DATETIME DEFAULT NULL,
  `firma_coordinador_url` TEXT DEFAULT NULL,
  `responsable_sst_id` VARCHAR(50) NOT NULL,
  `responsable_sst_nombre` VARCHAR(255) NOT NULL,
  `responsable_sst_celular` VARCHAR(50) DEFAULT NULL,
  `responsable_sst_email` VARCHAR(150) DEFAULT NULL,
  `token_sst` VARCHAR(100) DEFAULT NULL,
  `fecha_firma_sst` DATETIME DEFAULT NULL,
  `firma_sst_url` TEXT DEFAULT NULL,
  `pasos_analisis` LONGTEXT DEFAULT NULL,
  `preoperacional_estibadores` LONGTEXT DEFAULT NULL,
  `verificacion_epp` LONGTEXT DEFAULT NULL,
  `otras_herramientas` LONGTEXT DEFAULT NULL,
  `herramienta_adicional_texto` VARCHAR(255) DEFAULT NULL,
  `observaciones_generales` TEXT DEFAULT NULL,
  `url_pdf` VARCHAR(500) DEFAULT NULL,
  `id_doc_empresa` VARCHAR(50) DEFAULT NULL,
  `estado` ENUM('pendiente_trabajadores', 'pendiente_coordinador', 'pendiente_sst', 'completado') DEFAULT 'pendiente_trabajadores',
  `usuario_creacion` VARCHAR(100) NOT NULL,
  `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_ats_regional` (`regional`),
  INDEX `idx_ats_operacion` (`operacion`),
  INDEX `idx_ats_vigencia` (`vigencia_desde`, `vigencia_hasta`),
  INDEX `idx_ats_estado` (`estado`),
  INDEX `idx_ats_token_coord` (`token_coordinador`),
  INDEX `idx_ats_token_sst` (`token_sst`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de trabajadores incluidos en el ATS
CREATE TABLE IF NOT EXISTS `Dynamic_ats_trabajadores` (
  `id_item` INT AUTO_INCREMENT PRIMARY KEY,
  `id_ats` INT NOT NULL,
  `id_vinculacion` VARCHAR(50) DEFAULT NULL,
  `identificacion` VARCHAR(50) NOT NULL,
  `nombre_trabajador` VARCHAR(255) NOT NULL,
  `cargo` VARCHAR(150) DEFAULT NULL,
  `operacion` VARCHAR(150) DEFAULT NULL,
  `celular` VARCHAR(50) DEFAULT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `token_firma` VARCHAR(100) NOT NULL,
  `estado_firma` ENUM('SIN_FIRMA', 'ACEPTADA') DEFAULT 'SIN_FIRMA',
  `firma_url` TEXT DEFAULT NULL,
  `fecha_firma` DATETIME DEFAULT NULL,
  `ip_firma` VARCHAR(45) DEFAULT NULL,
  `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ats_trab_id_ats` (`id_ats`),
  INDEX `idx_ats_trab_ident` (`identificacion`),
  INDEX `idx_ats_trab_token` (`token_firma`),
  CONSTRAINT `fk_ats_trab_id` FOREIGN KEY (`id_ats`) REFERENCES `Dynamic_ats` (`id_ats`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de evidencias fotográficas del ATS
CREATE TABLE IF NOT EXISTS `Dynamic_ats_evidencias` (
  `id_evidencia` INT AUTO_INCREMENT PRIMARY KEY,
  `id_ats` INT NOT NULL,
  `url_evidencia` VARCHAR(500) NOT NULL,
  `nombre_archivo` VARCHAR(255) DEFAULT NULL,
  `usuario_subida` VARCHAR(100) DEFAULT NULL,
  `fecha_creacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ats_evid_id_ats` (`id_ats`),
  CONSTRAINT `fk_ats_evid_id` FOREIGN KEY (`id_ats`) REFERENCES `Dynamic_ats` (`id_ats`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Pestaña ATS en Maestro_Menu (Módulo sst)
INSERT INTO `Maestro_Menu` (`Modulo`, `Seccion`, `Rol`, `Acceso`, `Etiqueta`, `Url`, `Orden`, `Icono`, `Descripcion`)
SELECT 'sst', 'ATS', 'AdmSst, LiderSst, Sistema', 1, 'ATS', '/sst?tab=ats', 10, '＋', 'Análisis de Trabajo Seguro (ATS) semanal.'
WHERE NOT EXISTS (
  SELECT 1 FROM `Maestro_Menu` WHERE `Modulo` = 'sst' AND `Seccion` = 'ATS' AND `Rol` = 'AdmSst, LiderSst, Sistema'
);

INSERT INTO `Maestro_Menu` (`Modulo`, `Seccion`, `Rol`, `Acceso`, `Etiqueta`, `Url`, `Orden`, `Icono`, `Descripcion`)
SELECT 'sst', 'ATS', 'AuxiliarR, CoordinadorR', 2, 'ATS', '/sst?tab=ats', 10, '＋', 'Análisis de Trabajo Seguro (ATS) semanal.'
WHERE NOT EXISTS (
  SELECT 1 FROM `Maestro_Menu` WHERE `Modulo` = 'sst' AND `Seccion` = 'ATS' AND `Rol` = 'AuxiliarR, CoordinadorR'
);

INSERT INTO `Maestro_Menu` (`Modulo`, `Seccion`, `Rol`, `Acceso`, `Etiqueta`, `Url`, `Orden`, `Icono`, `Descripcion`)
SELECT 'sst', 'ATS', 'AuxSst, Auxiliar, Coordinador', 3, 'ATS', '/sst?tab=ats', 10, '＋', 'Análisis de Trabajo Seguro (ATS) semanal.'
WHERE NOT EXISTS (
  SELECT 1 FROM `Maestro_Menu` WHERE `Modulo` = 'sst' AND `Seccion` = 'ATS' AND `Rol` = 'AuxSst, Auxiliar, Coordinador'
);

INSERT INTO `Maestro_Menu` (`Modulo`, `Seccion`, `Rol`, `Acceso`, `Etiqueta`, `Url`, `Orden`, `Icono`, `Descripcion`)
SELECT 'sst', 'ATS', 'AnaSst', 4, 'ATS', '/sst?tab=ats', 10, '＋', 'Análisis de Trabajo Seguro (ATS) semanal.'
WHERE NOT EXISTS (
  SELECT 1 FROM `Maestro_Menu` WHERE `Modulo` = 'sst' AND `Seccion` = 'ATS' AND `Rol` = 'AnaSst'
);

-- 5. Parámetros de permisos en Config_Parametros
INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT 'sst', 'ATS', 'Roles que pueden registrar ATS en SST', 'crear', 'Sistema, AdmSst, AnaSst, AuxSst, LiderSst, Coordinador, CoordinadorR', 'Roles autorizados para crear y diligenciar ATS en el módulo SST.'
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros` WHERE `Modulo` = 'sst' AND `Seccion` = 'ATS' AND `Concepto` = 'Roles que pueden registrar ATS en SST'
);

INSERT INTO `Config_Parametros` (`Modulo`, `Seccion`, `Concepto`, `Condicion`, `Parametro`, `Descripcion`)
SELECT 'sst', 'ATS', 'Roles que pueden eliminar ATS en SST', 'eliminar', 'Sistema, AdmSst, LiderSst', 'Roles autorizados para eliminar registros de ATS en el módulo SST.'
WHERE NOT EXISTS (
  SELECT 1 FROM `Config_Parametros` WHERE `Modulo` = 'sst' AND `Seccion` = 'ATS' AND `Concepto` = 'Roles que pueden eliminar ATS en SST'
);

-- 6. Plantilla en Maestro_Plantillas para ats_semanal
INSERT INTO `Maestro_Plantillas` (
  `nombre_proceso`, `tabla_datos`, `id_campo_fk`, `bucket_carpeta`,
  `requiere_firma_trabajador`, `activo`, `version`, `contenido_html`, `ultima_actualizacion`
)
SELECT
  'ats_semanal',
  'Dynamic_ats',
  'id_ats',
  'general',
  1,
  1,
  2,
  '<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: legal portrait; margin: 6mm 8mm 6mm 8mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #1e293b;
      font-size: 7.3pt;
      margin: 0;
      padding: 0;
      line-height: 1.25;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 3px 5px; }
    .sec-header {
      background: #0A315D;
      color: #ffffff;
      font-size: 7.6pt;
      font-weight: 700;
      padding: 3.5px 6px;
      letter-spacing: 0.3px;
    }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .badge-c { background: #f0fdf4; color: #15803d; font-weight: 700; text-align: center; }
    .badge-nc { background: #fef2f2; color: #b91c1c; font-weight: 700; text-align: center; }
    .badge-na { background: #f1f5f9; color: #475569; font-weight: 700; text-align: center; }
  </style>
</head>
<body>
  <!-- ENCABEZADO OFICIAL SST-F-036 v02 -->
  <table style="margin-bottom: 4px;">
    <tr>
      <td style="width: 25%; text-align: center; padding: 4px; background: #ffffff;">
        {{logo}}
      </td>
      <td style="width: 55%; background: #0A315D; color: #ffffff; text-align: center; padding: 4px 8px;">
        <div style="font-size: 9pt; font-weight: 700; letter-spacing: 0.3px;">ANÁLISIS DE TRABAJO SEGURO CARGUE Y DESCARGUE DE MERCANCÍAS</div>
        <div style="font-size: 7.8pt; color: #FFD0B3; font-weight: 700; margin-top: 1px;">ANÁLISIS DE TRABAJO SEGURO (ATS) SEMANAL</div>
        <div style="font-size: 6.8pt; color: #dbeafe; margin-top: 1px;">CARGUE Y DESCARGUE DE MERCANCÍAS EN MUELLES - ESTIBADOR MANUAL Y/O ELÉCTRICO</div>
      </td>
      <td style="width: 20%; padding: 3px 6px; font-size: 6.8pt; text-align: center; background: #f8fafc;">
        <div style="font-weight: 700; color: #0A315D;">SST-F-036</div>
        <div>Versión: 02</div>
        <div style="color: #64748b;">23/09/2026</div>
        <div style="margin-top: 2px; font-size: 6.2pt; color: #0A315D; font-weight: 700;">ID: #{{id_ats}}</div>
      </td>
    </tr>
  </table>

  <!-- SECCIÓN 1: DATOS GENERALES -->
  <div class="sec-header">1. DATOS GENERALES Y VIGENCIA SEMANAL</div>
  <table style="margin-bottom: 4px; font-size: 7.2pt;">
    <tr>
      <td style="width: 50%;"><strong>Ciudad / Operación:</strong> {{ciudad_operacion}}</td>
      <td style="width: 50%;"><strong>Muelle / Ubicación:</strong> {{muelle_ubicacion}}</td>
    </tr>
    <tr>
      <td><strong>Vigencia desde:</strong> {{vigencia_desde}}</td>
      <td><strong>Vigencia hasta:</strong> {{vigencia_hasta}}</td>
    </tr>
    <tr>
      <td><strong>Turno(s):</strong> {{turnos}}</td>
      <td><strong>Horario(s):</strong> {{horarios}}</td>
    </tr>
    <tr>
      <td><strong>Responsable Operación:</strong> {{coordinador_nombre}}</td>
      <td><strong>Responsable SST:</strong> {{responsable_sst_nombre}}</td>
    </tr>
    <tr>
      <td colspan="2" style="background: #fffbeb; color: #92400e; font-size: 6.6pt; padding: 3px 6px; font-style: italic;">
        <strong>Vigencia semanal:</strong> aplica mientras la actividad, personal autorizado, equipos y condiciones se mantengan. Si cambia una condición relevante o aparece un peligro no controlado, detener, revisar y actualizar el ATS antes de continuar.
      </td>
    </tr>
  </table>

  <!-- SECCIÓN 2: ANÁLISIS DE LA TAREA PASO A PASO -->
  <div class="sec-header">2. ANÁLISIS DE LA TAREA - PASO A PASO</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead>
      <tr style="background: #e2e8f0; color: #0f172a; font-weight: 700;">
        <th style="width: 4%;">No.</th>
        <th style="width: 24%;">PASO / ACTIVIDAD</th>
        <th style="width: 30%;">PELIGROS / CONSECUENCIAS</th>
        <th style="width: 30%;">CONTROLES REQUERIDOS</th>
        <th style="width: 6%; text-align: center;">CUMPLE</th>
        <th style="width: 6%; text-align: center;">OBS.</th>
      </tr>
    </thead>
    <tbody>
      {{filas_analisis_pasos}}
    </tbody>
  </table>

  <!-- SECCIÓN 3: PREOPERACIONAL ESTIBADOR -->
  <div class="sec-header">3. LISTA DE VERIFICACIÓN PREOPERACIONAL - MARCAR SÍ / NO / N.A.</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <tr>
      <td style="width: 50%; vertical-align: top; padding: 0;">
        <div style="background: #1e3a8a; color: #ffffff; font-weight: 700; padding: 2px 5px; font-size: 6.9pt; text-align: center;">ESTIBADOR MANUAL</div>
        <table>
          {{filas_estibador_manual}}
          <tr>
            <td colspan="2" style="font-size: 6.5pt; background: #f8fafc;">
              <strong>Observaciones:</strong> {{obs_estibador_manual}}
            </td>
          </tr>
        </table>
      </td>
      <td style="width: 50%; vertical-align: top; padding: 0;">
        <div style="background: #1e3a8a; color: #ffffff; font-weight: 700; padding: 2px 5px; font-size: 6.9pt; text-align: center;">ESTIBADOR ELÉCTRICO</div>
        <table>
          {{filas_estibador_electrico}}
          <tr>
            <td colspan="2" style="font-size: 6.5pt; background: #f8fafc;">
              <strong>Observaciones:</strong> {{obs_estibador_electrico}}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <!-- SECCIÓN 4: EPP -->
  <div class="sec-header">4. VERIFICACIÓN DE EPP PARA LA ACTIVIDAD</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead>
      <tr style="background: #e2e8f0; color: #0f172a; font-weight: 700;">
        <th style="width: 65%;">ITEM DE VERIFICACIÓN</th>
        <th style="width: 10%; text-align: center;">S / N / NA</th>
        <th style="width: 25%;">OBSERVACIONES</th>
      </tr>
    </thead>
    <tbody>
      {{filas_epp}}
    </tbody>
  </table>

  <!-- SECCIÓN 5: OTRAS HERRAMIENTAS -->
  <div class="sec-header">5. OTRAS HERRAMIENTAS A UTILIZAR</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead>
      <tr style="background: #e2e8f0; color: #0f172a; font-weight: 700;">
        <th style="width: 65%;">ITEM DE VERIFICACIÓN</th>
        <th style="width: 10%; text-align: center;">S / N / NA</th>
        <th style="width: 25%;">OBSERVACIONES</th>
      </tr>
    </thead>
    <tbody>
      {{filas_herramientas}}
    </tbody>
  </table>

  <!-- CRITERIO DE PARADA -->
  <div style="border: 1.5px solid #dc2626; background: #fef2f2; color: #991b1b; padding: 4px 8px; font-size: 6.8pt; font-weight: 700; margin-bottom: 4px;">
    CRITERIO DE PARADA: falla del equipo, carga inestable, persona en zona de maniobra, vehículo no inmovilizado, acceso inseguro, EPP requerido no disponible o cualquier peligro no controlado obliga a detener la actividad hasta implementar y verificar controles.
  </div>

  <!-- SECCIÓN 6: SOCIALIZACIÓN Y FIRMAS DEL PERSONAL -->
  <div class="sec-header">6. SOCIALIZACIÓN Y FIRMAS DEL PERSONAL CUBIERTO POR LA SEMANA</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead>
      <tr style="background: #e2e8f0; color: #0f172a; font-weight: 700;">
        <th style="width: 5%;">No.</th>
        <th style="width: 35%;">NOMBRE COMPLETO</th>
        <th style="width: 18%;">CÉDULA</th>
        <th style="width: 22%;">CARGO / OPERACIÓN</th>
        <th style="width: 20%; text-align: center;">FIRMA</th>
      </tr>
    </thead>
    <tbody>
      {{filas_trabajadores}}
    </tbody>
  </table>

  <!-- CIERRE Y RESPONSABLES -->
  <table style="margin-bottom: 4px; page-break-inside: avoid;">
    <tr>
      <td style="width: 50%; vertical-align: top; padding: 5px;">
        <div style="font-size: 7pt; font-weight: 700; color: #0A315D;">Coordinador Operación:</div>
        <div style="font-size: 7.2pt; font-weight: 700; margin-top: 2px;">{{coordinador_nombre}}</div>
        {{firma_coordinador_box}}
      </td>
      <td style="width: 50%; vertical-align: top; padding: 5px;">
        <div style="font-size: 7pt; font-weight: 700; color: #0A315D;">Responsable SST:</div>
        <div style="font-size: 7.2pt; font-weight: 700; margin-top: 2px;">{{responsable_sst_nombre}}</div>
        {{firma_sst_box}}
      </td>
    </tr>
  </table>

  <div style="font-size: 6.3pt; color: #64748b; line-height: 1.3;">
    <strong>Nota:</strong> la selección de EPP debe corresponder a la evaluación de riesgos del sitio. El preoperacional del equipo debe realizarse antes de su uso conforme al procedimiento interno y manual del fabricante.
  </div>

  {{seccion_evidencias}}
</body>
</html>',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM `Maestro_Plantillas` WHERE LOWER(`nombre_proceso`) = 'ats_semanal'
);

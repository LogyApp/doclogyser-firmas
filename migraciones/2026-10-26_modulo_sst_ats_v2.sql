-- ============================================================================
-- MIGRACIÓN: Módulo SST - Ajustes ATS v2 (Formato SST-F-036 v02)
-- Fecha: 2026-10-26
-- Descripción:
--   1. Permite valores nulos en columna muelle_ubicacion de Dynamic_ats.
--   2. Actualiza el formato HTML en Maestro_Plantillas (id_plantilla = 27 / ats_semanal)
--      omitiendo el campo "Muelle / Ubicación" en los datos generales y cambiando
--      las columnas de verificación por "ESTADO" (Cumple / No Cumple / No Aplica).
-- ============================================================================

-- 1. Modificar columna muelle_ubicacion para que sea opcional (NULL)
ALTER TABLE Dynamic_ats MODIFY COLUMN muelle_ubicacion VARCHAR(200) NULL DEFAULT NULL;

-- 2. Actualizar plantilla oficial ATS en Maestro_Plantillas
UPDATE Maestro_Plantillas
SET version = 3,
    contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: legal portrait;
      margin: 6mm 8mm 6mm 8mm;
    }
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
        <div style="font-size: 6.8pt; color: #dbeafe;">CARGUE Y DESCARGUE DE MERCANCÍAS EN MUELLES - ESTIBADOR MANUAL Y/O ELÉCTRICO</div>
      </td>
      <td style="width: 20%; padding: 3px 6px; font-size: 6.8pt; text-align: center; background: #f8fafc;">
        <div style="font-weight: 700; color: #0A315D;">SST-F-036</div>
        <div>Versión: 02</div>
        <div style="color: #64748b;">23/09/2026</div>
        <div style="margin-top: 2px; font-size: 6.2pt; color: #0A315D; font-weight: 700;">ID: #{{id_ats}}</div>
      </td>
    </tr>
  </table>

  <!-- 1. DATOS GENERALES -->
  <div class="sec-header">1. DATOS GENERALES Y VIGENCIA SEMANAL</div>
  <table style="margin-bottom: 4px; font-size: 7.2pt;">
    <tr>
      <td colspan="2"><strong>Ciudad / Operación:</strong> {{ciudad_operacion}}</td>
    </tr>
    <tr>
      <td style="width: 50%;"><strong>Vigencia desde:</strong> {{vigencia_desde}}</td>
      <td style="width: 50%;"><strong>Vigencia hasta:</strong> {{vigencia_hasta}}</td>
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
      <td colspan="2" style="background: #fffbeb; color: #92400e; font-size: 6.6pt; font-style: italic;">
        <strong>Vigencia semanal:</strong> Aplica mientras la actividad, personal autorizado, equipos y condiciones se mantengan. Si cambia una condición relevante o aparece un peligro no controlado, detener, revisar y actualizar el ATS.
      </td>
    </tr>
  </table>

  <!-- 2. ANÁLISIS DE LA TAREA (12 PASOS) -->
  <div class="sec-header">2. ANÁLISIS DE LA TAREA - PASO A PASO</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead>
      <tr style="background: #e2e8f0; color: #0f172a; font-weight: 700;">
        <th style="width: 4%;">No.</th>
        <th style="width: 24%;">PASO / ACTIVIDAD</th>
        <th style="width: 30%;">PELIGROS / CONSECUENCIAS</th>
        <th style="width: 26%;">CONTROLES REQUERIDOS</th>
        <th style="width: 10%; text-align: center;">ESTADO</th>
        <th style="width: 6%; text-align: center;">OBS.</th>
      </tr>
    </thead>
    <tbody>
      {{filas_analisis_pasos}}
    </tbody>
  </table>

  <!-- 3. PREOPERACIONAL ESTIBADORES -->
  <div class="sec-header">3. LISTA DE VERIFICACIÓN PREOPERACIONAL</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <tr>
      <td style="width: 50%; vertical-align: top; padding: 0;">
        <div style="background: #1e3a8a; color: #ffffff; font-weight: 700; padding: 2px 5px; font-size: 6.9pt; text-align: center;">
          ESTIBADOR MANUAL
        </div>
        <table style="width: 100%;">
          {{filas_estibador_manual}}
          <tr>
            <td colspan="2" style="font-size: 6.5pt; background: #f8fafc;">
              <strong>Observaciones:</strong> {{obs_estibador_manual}}
            </td>
          </tr>
        </table>
      </td>
      <td style="width: 50%; vertical-align: top; padding: 0;">
        <div style="background: #1e3a8a; color: #ffffff; font-weight: 700; padding: 2px 5px; font-size: 6.9pt; text-align: center;">
          ESTIBADOR ELÉCTRICO
        </div>
        <table style="width: 100%;">
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

  <!-- 4. VERIFICACIÓN EPP -->
  <div class="sec-header">4. VERIFICACIÓN DE EPP PARA LA ACTIVIDAD</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead>
      <tr style="background: #e2e8f0; color: #0f172a; font-weight: 700;">
        <th style="width: 61%;">ITEM DE VERIFICACIÓN</th>
        <th style="width: 14%; text-align: center;">ESTADO</th>
        <th style="width: 25%;">OBSERVACIONES</th>
      </tr>
    </thead>
    <tbody>
      {{filas_epp}}
    </tbody>
  </table>

  <!-- 5. OTRAS HERRAMIENTAS -->
  <div class="sec-header">5. OTRAS HERRAMIENTAS A UTILIZAR</div>
  <table style="margin-bottom: 4px; font-size: 6.8pt;">
    <thead>
      <tr style="background: #e2e8f0; color: #0f172a; font-weight: 700;">
        <th style="width: 61%;">ITEM DE VERIFICACIÓN</th>
        <th style="width: 14%; text-align: center;">ESTADO</th>
        <th style="width: 25%;">OBSERVACIONES</th>
      </tr>
    </thead>
    <tbody>
      {{filas_herramientas}}
    </tbody>
  </table>

  <!-- CRITERIO DE PARADA -->
  <div style="border: 1.5px solid #dc2626; background: #fef2f2; color: #991b1b; padding: 4px 8px; font-size: 6.8pt; font-weight: 700; margin-bottom: 4px; line-height: 1.35;">
    🛑 CRITERIO DE PARADA: Falla del equipo, carga inestable, persona en zona de maniobra, vehículo no inmovilizado, acceso inseguro, EPP requerido no disponible o cualquier peligro no controlado obliga a detener la actividad hasta implementar y verificar controles.
  </div>

  <!-- 6. FIRMAS DE PERSONAL -->
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

  <!-- 7. RESPONSABLES Y FIRMAS FINALES -->
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
    <strong>Nota:</strong> La selección de EPP debe corresponder a la evaluación de riesgos del sitio. El preoperacional del equipo debe realizarse antes de su uso conforme al procedimiento interno y manual del fabricante.
  </div>

  <!-- 8. REGISTRO FOTOGRÁFICO DE EVIDENCIAS -->
  {{seccion_evidencias}}
</body>
</html>'
WHERE id_plantilla = 27 OR LOWER(nombre_proceso) = 'ats_semanal';

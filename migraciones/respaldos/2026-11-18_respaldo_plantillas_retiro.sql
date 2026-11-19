-- Respaldo de las plantillas de retiro antes del diseño nuevo
-- (migraciones/2026-11-18_plantillas_retiro_diseno.sql). Para volver atrás, ejecutar este archivo.

-- examen_egreso (id_plantilla = 4, versión 1)
UPDATE Maestro_Plantillas
SET version = 1, codigo_formato = NULL, version_formato = NULL, fecha_version = NULL,
    ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    /* Estructura base para el layout vertical */
    body { font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #000; margin: 0; padding: 20px; display: flex; flex-direction: column; min-height: 100vh; }
    
    .header { width: 100%; margin-bottom: 30px; }
    .logo { height: 80px; }
    
    .content { flex: 1; }
    .datos-trabajador { margin-bottom: 25px; }
    p { margin: 8px 0; text-align: justify; }

    /* Pie de página anclado */
    .footer { margin-top: auto; text-align: center; color: #000b59; font-size: 7.5pt; border-top: 2px solid #F55400; padding-top: 10px; }
  </style>
</head>
<body>

  <div class="header">
    <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" class="logo">
  </div>

  <div class="content">
    <div class="datos-trabajador">
      <strong>{{ciudad_regional}}, {{fecha_expedicion}}</strong><br><br>
      Señor(a):<br>
      <strong>{{nombre_trabajador}}</strong><br>
      C.C. {{identificacion}}<br>
      <strong>Ref.: Autorización Examen Egreso</strong>
    </div>

    <p>Cordial saludo,</p>

    <p>La empresa pone a su disposición la orden del examen médico de egreso para que, dentro de los cinco (05) días hábiles siguientes a la fecha de su retiro, éste le sea practicado en el centro médico correspondiente; si está interesado en realizarse dicho examen, usted podrá solicitar su cita médica a través del correo electrónico: <a href="mailto:retiros@logyser.com" style="color:#0000EE; text-decoration:underline;">retiros@logyser.com</a> para que le sea enviada la orden correspondiente, en el centro médico más cercano al lugar de su residencia.</p>

    <p>Cordialmente,</p>

    <table style="width: 100%; border-collapse: collapse; margin-top: 40px; margin-bottom: 40px;">
      <tr>
        <td style="width: 50%; vertical-align: top;">
          {{firma_responsable_html}}
          <div style="border-top: 1px solid #000; padding-top: 5px; margin-top: 10px; display: inline-block;">
            <strong>{{nombre_firmante}}</strong><br>
            {{cargo_firmante}}<br>
            Apoyo Logístico y Operativo S.A.S
          </div>
        </td>
        <td style="width: 50%; vertical-align: top;">
          <p style="margin: 0 0 10px;">Confirma recibido:</p>
          {{firma_trabajador_html}}
          <p style="margin: 8px 0 2px; font-weight: bold;">{{nombre_trabajador}}</p>
          <p style="margin: 0;">CC {{identificacion}}</p>
        </td>
      </tr>
    </table>
  </div>

  <div class="footer">
    DIAGONAL 74B No. 33° 51-55 — ANTIGUA TRANSVERSAL 39° No 70° 51-55 — LAURELES - MEDELLÍN
  </div>

</body>
</html>'
WHERE id_plantilla = 4;

-- cesantias_retiro (id_plantilla = 5, versión 1)
UPDATE Maestro_Plantillas
SET version = 1, codigo_formato = NULL, version_formato = NULL, fecha_version = NULL,
    ultima_actualizacion = NOW(), contenido_html = '<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #000; margin: 0; padding: 20px; display: flex; flex-direction: column; min-height: 100vh; }
    .header { width: 100%; margin-bottom: 30px; }
    .logo { height: 80px; }
    .content { flex: 1; }
    .datos-trabajador { margin-bottom: 25px; }
    p { margin: 8px 0; text-align: justify; }
    .footer { margin-top: auto; text-align: center; color: #000b59; font-size: 7.5pt; border-top: 2px solid #F55400; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" class="logo">
  </div>
  
  <div class="content">
    <div class="datos-trabajador">
      <strong>{{ciudad_regional}}, {{fecha_expedicion}}</strong><br><br>
      Señor(a):<br>
      <strong>{{nombre_trabajador}}</strong><br>
      CC {{identificacion}}<br>
      E.S.M.
    </div>
    
    <p><strong>Asunto: Retiro cesantías.</strong></p>
    <p>Cordial saludo,</p>
    <p>Por medio de la presente informamos que, sus cesantías se encuentran consignadas en el fondo correspondiente <strong>{{fondo_cesantias}}</strong>, por cuestiones de seguridad administrativa, las mismas deben ser tramitadas directamente por nosotros, si su interés es realizar el retiro de estas, debe remitir solicitud a los siguientes correos electrónicos: <a href="mailto:nomina@logyser.com" style="color:#0000EE;text-decoration:underline;">nomina@logyser.com</a> y <a href="mailto:gestor.nomina@logyser.com" style="color:#0000EE;text-decoration:underline;">gestor.nomina@logyser.com</a>. Una vez se realice la solicitud el desembolso a cargo del fondo tomara entre 1 y 5 días hábiles a su cuenta de nómina.</p>
    <p>Agradezco de antemano la atención a la presente.</p>
    <p>Cordialmente,</p>

    <table style="width: 100%; border-collapse: collapse; margin-top: 40px; margin-bottom: 40px;">
      <tr>
        <td style="width: 50%; vertical-align: top;">
          {{firma_responsable_html}}
          <div style="border-top: 1px solid #000; display: inline-block; padding-top: 5px; margin-top: 5px;">
            <strong>{{nombre_firmante}}</strong><br>
            {{cargo_firmante}}<br>
            Apoyo Logístico y Operativo S.A.S
          </div>
        </td>
        <td style="width: 50%; vertical-align: top;">
          <p style="margin: 0 0 10px;">Confirma recibido:</p>
          {{firma_trabajador_html}}
          <p style="margin: 8px 0 2px; font-weight: bold;">{{nombre_trabajador}}</p>
          <p style="margin: 0;">CC {{identificacion}}</p>
        </td>
      </tr>
    </table>
  </div>

  <div class="footer">
    DIAGONAL 74B No. 33° 51-55 — ANTIGUA TRANSVERSAL 39° No 70° 51-55 — LAURELES - MEDELLÍN
  </div>
</body>
</html>'
WHERE id_plantilla = 5;

-- aceptacion_renuncia (id_plantilla = 3, versión 1)
UPDATE Maestro_Plantillas
SET version = 1, codigo_formato = 'TH-R-016', version_formato = '01', fecha_version = '2025-06-10',
    ultima_actualizacion = NOW(), contenido_html = '<div style="font-family:Arial,sans-serif;font-size:10pt;line-height:1.55;color:#000;display:flex;flex-direction:column;min-height:100vh">

  <table style="width:100%;border-collapse:collapse;margin-bottom:18px;border:1px solid #000">
    <tr>
      <td style="padding:6px 12px;border-right:1px solid #000;width:160px;vertical-align:middle">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:58px;display:block">
      </td>
      <td style="text-align:center;font-weight:bold;font-size:11pt;vertical-align:middle;padding:8px">
        FORMATO ACEPTACIÓN DE RENUNCIA
      </td>
      <td style="border-left:1px solid #000;font-size:8.5pt;width:130px;vertical-align:top;padding:0">
        <div style="border-bottom:1px solid #000;padding:4px 8px">TH-R-016</div>
        <div style="border-bottom:1px solid #000;padding:4px 8px">Versión 01</div>
        <div style="padding:4px 8px">10/06/2025</div>
      </td>
    </tr>
  </table>

  <div style="flex:1">
    <!-- Ciudad y fecha juntos -->
    <p style="margin:0 0 18px"><strong>{{ciudad_regional}}, {{fecha_expedicion}}</strong></p>

    <p style="margin:0 0 2px">Estimado:</p>
    <p style="margin:0 0 2px;font-weight:bold">{{nombre_trabajador}}</p>
    <p style="margin:0 0 18px;font-weight:bold">CC {{identificacion}}</p>

    <table style="margin-bottom:18px;border-collapse:collapse;font-size:10pt">
      <tr><td style="padding:1px 0"><strong>Ref.:</strong>&nbsp;Aceptación renuncia</td></tr>
      <tr><td style="padding:1px 0"><strong>Verbal:</strong>&nbsp;{{verbal_marca}}</td></tr>
      <tr><td style="padding:1px 0"><strong>Escrita:</strong>&nbsp;{{escrita_marca}}</td></tr>
    </table>

    <p style="text-align:justify;margin:0 0 14px">De conformidad a su decisión voluntaria de renunciar a la empresa, le informamos que <strong>APOYO LOGÍSTICO Y OPERATIVO (LOG&amp;SER) SAS</strong>, acepta a partir del día <strong>{{fecha_retiro_texto}}</strong>, su decisión unilateral de dar por finalizado el contrato laboral vigente; agradecemos la labor realizada durante su permanencia en el cargo y auguramos éxitos en sus nuevas actividades.</p>

    <p style="text-align:justify;margin:0 0 14px">La orden de examen de egreso se encuentra disponible conforme al artículo 57 de C.S.T, dentro de los 5 días hábiles siguientes a la fecha de su retiro, si es de su interés, usted podrá solicitar su cita a través del correo electrónico: <a href="mailto:retiros@logyser.com" style="color:#0000EE">retiros@logyser.com</a>, aportando sus datos personales e indicando la Ciudad de domicilio.</p>

    <p style="text-align:justify;margin:0 0 14px">Se envían junto a esta comunicación los documentos del retiro al correo electrónico y número de teléfono registrado, con el fin de dar trámite a la liquidación del contrato de trabajo.</p>

    <p style="text-align:justify;margin:0 0 36px">Tenga en cuenta, que la liquidación definitiva de sus prestaciones sociales, y salarios a la fecha, serán consignados en la cuenta de nómina registrada en nuestras bases de datos, en los siguientes días.</p>

    <p style="margin:0 0 10px">Atentamente,</p>

    <!-- Tabla de firmas alineadas simétricamente -->
<table style="width:100%; border-collapse:collapse; margin-bottom:44px;">
  <tr>
    <!-- Firma del responsable -->
    <td style="width:50%; vertical-align:top; padding-right:10px;">
      <div style="height: 80px; margin-bottom: 5px;">{{firma_responsable_html}}</div>
      <p style="margin:4px 0 2px; font-weight:bold">{{nombre_firmante}}</p>
      <p style="margin:0">{{cargo_firmante}}</p>
    </td>
    
    <!-- Firma del trabajador -->
    <td style="width:50%; vertical-align:top; padding-left:10px;">
      <div style="height: 80px; margin-bottom: 5px;">{{firma_trabajador_html}}</div>
      <p style="margin:4px 0 2px; font-weight:bold">{{nombre_trabajador}}</p>
      <p style="margin:0">CC {{identificacion}}</p>
    </td>
  </tr>
  <!-- Fila adicional para los títulos de cada columna (opcional pero ayuda a alinear visualmente) -->
  <tr>
    <td style="vertical-align:top; padding-right:10px;">
      <p style="margin:8px 0 0 0; font-size:9pt;">Atentamente,</p>
    </td>
    <td style="vertical-align:top; padding-left:10px;">
      <p style="margin:8px 0 0 0; font-size:9pt;">Confirma recibido:</p>
    </td>
  </tr>
</table>
  </div>

  <div style="margin-top:auto;text-align:center">
    <div style="width:100%;height:2px;background:#F55400;margin-bottom:12px"></div>
    <div style="color:#000b59;font-family:Arial,sans-serif;font-size:7.5pt;line-height:1.4;letter-spacing:0.3px">
      DIAGONAL 74B No. 33° 51-55 — ANTIGUA TRANSVERSAL 39° No 70° 51-55 — LAURELES - MEDELLÍN
    </div>
  </div>

</div>'
WHERE id_plantilla = 3;

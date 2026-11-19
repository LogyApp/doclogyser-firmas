-- Respaldo de la plantilla certificado_retiro (Maestro_Plantillas id_plantilla = 2, versión 1) antes del
-- diseño nuevo (migraciones/2026-11-18_plantilla_certificado_retiro_diseno.sql). Para volver atrás, ejecutar este archivo.

UPDATE Maestro_Plantillas
SET version = 1, codigo_formato = NULL, version_formato = NULL, fecha_version = NULL,
    ultima_actualizacion = NOW(), contenido_html = '<div style="font-family:Arial,sans-serif;font-size:10pt;line-height:1.55;color:#000;display:flex;flex-direction:column;min-height:100vh">
  
  <div style="flex:1">
    <div style="margin-bottom:20px">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height:72px;display:block">
    </div>

    <p style="text-align:center;font-weight:bold;text-decoration:underline;margin:0 0 48px">A QUIEN PUEDA INTERESAR:</p>

    <p style="text-align:justify;margin:0 0 20px">Por medio de la presente certifico que <strong>{{nombre_trabajador}}</strong> identificado(a) con cédula de ciudadanía número <strong>{{identificacion}}</strong> laboró para esta empresa, durante el periodo comprendido entre el <strong>{{fecha_ingreso}}</strong> hasta el <strong>{{fecha_retiro}}</strong>, desempeñando el cargo de <strong>{{cargo}}</strong>.</p>

    <p style="margin:0 0 6px"><strong>ARL:</strong> {{arl}}</p>
    <p style="margin:0 0 6px"><strong>EPS:</strong> {{eps}}</p>
    <p style="margin:0 0 22px"><strong>AFP:</strong> {{pension}}</p>

    <p style="text-align:justify;margin:0 0 18px">Para cualquier información adicional, puede comunicarse al teléfono celular <strong>+57 315 556 5490</strong>.</p>

    <p style="text-align:justify;margin:0 0 48px">Este certificado, se expide el <strong>{{fecha_expedicion}}</strong> a solicitud del interesado.</p>

    <p style="margin:0 0 8px">Atentamente,</p>

    <table style="width:100%; border-collapse:collapse; margin-top:8px">
      <tr>
        <td style="width:50%; vertical-align:top">
          {{firma_html}}
          <p style="margin:4px 0 2px; font-weight:bold">{{nombre_firmante}}</p>
          <p style="margin:0">{{cargo_firmante}}</p>
        </td>
        <td style="width:50%; vertical-align:top">
          <p style="margin:0 0 10px">Confirma recibido:</p>
          {{firma_trabajador_html}}
          <p style="margin:4px 0 2px; font-weight:bold">{{nombre_trabajador}}</p>
          <p style="margin:0">C.C. {{identificacion}}</p>
        </td>
      </tr>
    </table>
  </div>

  <div style="margin-top:auto; text-align:center">
    <div style="width:100%; height:2px; background:#F55400; margin-bottom:12px"></div>
    <div style="color:#000b59; font-family:Arial,sans-serif; font-size:7.5pt; line-height:1.4; letter-spacing:0.3px">
      DIAGONAL 74B No. 33° 51-55 — ANTIGUA TRANSVERSAL 39° No 70° 51-55 — LAURELES - MEDELLÍN
    </div>
  </div>

</div>'
WHERE id_plantilla = 2;

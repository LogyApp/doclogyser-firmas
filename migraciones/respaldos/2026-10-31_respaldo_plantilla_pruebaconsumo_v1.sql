-- RESPALDO de la plantilla 'pruebaconsumo' (versión 1, diseño anterior) antes de pasarla al diseño
-- moderno (generado el 2026-10-31). NO es una migración: solo se ejecuta si hay que volver al diseño anterior.

UPDATE Maestro_Plantillas SET version = 1, ultima_actualizacion = NOW(), contenido_html = '<table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #000;">
  <tr>
    <td style="width: 25%; padding: 10px; border-right: 1px solid #000; text-align: center; vertical-align: middle;">
      <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" style="height: 50px; display: block; margin: 0 auto;" alt="Logo LOG&SER">
    </td>
    <td style="width: 50%; padding: 10px; border-right: 1px solid #000; text-align: center; font-weight: bold; font-size: 11pt; vertical-align: middle; font-family: Arial, sans-serif;">
      CONSENTIMIENTO INFORMADO PARA PRUEBA DE ALCOHOL Y DETECCIÓN DE CONSUMO DE SUSTANCIAS PSICOACTIVAS
    </td>
    <td style="width: 25%; padding: 10px; font-size: 8.5pt; font-family: Arial, sans-serif; vertical-align: middle; line-height: 1.4;">
      <strong>Código:</strong> SST-F-02<br>
      <strong>Versión:</strong> 02<br>
      <strong>Fecha:</strong> 16/06/2026
    </td>
  </tr>
</table>

<div style="font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.6; color: #000; text-align: justify; margin-top: 30px;">
  <div style="margin-bottom: 20px; font-size: 10.5pt;">
    <strong>Ciudad:</strong> {{ciudad}} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>Fecha:</strong> {{fecha}}
  </div>

  <p style="margin-bottom: 16px;">
    APOYO LOGISTICO Y OPERATIVO SAS comprometidos en prevenir la accidentalidad laboral asociada al consumo de sustancias Psicoactivas legales y/o ilegales en el trabajo y preservar el derecho a la vida e integridad personal de los mismos trabajadores implementa de manera aleatoria y sin vulnerar los derechos fundamentales de las personas, las pruebas de toxicología a los empleados, ya sea con equipos y personal propio o de terceros y que estos a su vez aceptan dicha directriz.
  </p>

  <p style="margin-bottom: 16px;">
    Yo, <strong>{{nombre_trabajador}}</strong>, identificado con documento de identidad No <strong>{{identificacion}}</strong>, en calidad de trabajador de la empresa, manifiesto de manera expresa, libre y voluntaria AUTORIZO a que se me realice la toma de la Prueba de toxicología conforme a directrices de la empresa y/o el cliente <strong>{{cliente}}</strong>.
  </p>

  <p style="margin-bottom: 16px;">
    Declaro haber recibido y entendido la política de prevención de Sustancias Psicoactivas, normas y directrices de la compañía, así como aplicación de pruebas y proceso disciplinario por LOGYSER.
  </p>

  <p style="margin-bottom: 16px;">
    Manifiesto, además, conocer y entender los riesgos a los que voy a estar expuesto y las medidas de control que el empleador considere necesarias durante la relación laboral.
  </p>

  <p style="margin-bottom: 16px;">
    En concordancia con lo anterior, me obligo y me comprometo a cumplir con las normas y procedimientos establecidos por la empresa y otros que sean necesarios para el buen desempeño de mi trabajo y/o durante la permanencia en la compañía.
  </p>

  <p style="margin-bottom: 30px;">
    Por último, manifiesto que conozco las sanciones disciplinarias, a las cuales me encuentro expuesto en caso de incumplimiento de lo anteriormente mencionado, de acuerdo con la reglamentación legal vigente, al igual que las dispuestas en el reglamento interno de trabajo.
  </p>

  <!-- Clean Signature Section (No table borders) -->
  <div style="margin-top: 60px; font-size: 10pt; width: 300px; display: inline-block;">
    <p style="margin-bottom: 12px; font-weight: bold;">Firma del trabajador:</p>
    <div style="margin-bottom: 15px; min-height: 80px; display: block; border-bottom: 1px solid #ddd; padding-bottom: 5px;">
      {{firma_trabajador}}
    </div>
    <p style="margin: 3px 0;"><strong>Nombre:</strong> {{nombre_trabajador}}</p>
    <p style="margin: 3px 0;"><strong>Identificación:</strong> {{identificacion}}</p>
    <p style="margin: 3px 0;"><strong>Cargo:</strong> {{cargo}}</p>
  </div>
</div>'
WHERE nombre_proceso = 'pruebaconsumo';

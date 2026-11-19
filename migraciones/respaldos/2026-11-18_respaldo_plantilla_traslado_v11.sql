-- Respaldo de la plantilla Traslado (Maestro_Plantillas id_plantilla = 1, versión 11) antes del
-- diseño nuevo (migraciones/2026-11-18_plantilla_traslado_diseno.sql). Para volver atrás, ejecutar este archivo.

UPDATE Maestro_Plantillas
SET version = 11, ultima_actualizacion = NOW(), contenido_html = '<p>{{logo}}</p><p>La Ciudad, {{fecha_aviso}}</p><p><br></p><p>Señor(a):</p><p><strong>{{nombre_trabajador}}</strong></p><p>C.C. {{Identificación}}</p><p>La Ciudad.</p><p><br></p><p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<strong>Referencia</strong>: comunicación – cambio de sede de trabajo.</p><p>Reciba un cordial saludo.</p><p><br></p><p>Me permito informarle que <strong>APOYO LOGÍSTICO Y OPERATIVO S.A.S. LOG&amp;SER S.A.S.</strong>, por razones operativas, ha tomado la decisión de reasignar su lugar de trabajo en operación <strong>{{operacion_destino}}</strong>: DIRECCIÓN: {{direccion_destino}} sin que esto implique una modificación del lugar de trabajo pactado por las partes, por cuanto continúa siendo la ciudad y municipios aledaños.</p><p>Esta determinación se adopta en ejercicio del <strong><u>ius variandi locativo</u></strong>, que corresponde a la facultad que tiene el empleador de realizar variaciones sobre las condiciones de trabajo, sin que ello implique la modificación del contrato o la violación de los derechos del trabajador y como expresión del poder legítimo y subordinante que tiene respecto de aquel.</p><p>Esta reubicación de puesto de trabajo se hará bajo los mismos beneficios correspondientes al cargo que ocupa, respetando así derechos fundamentales como, <strong><u>dignidad y mínimo vital</u></strong>. Así las cosas, desde el día <strong>{{fecha_traslado}}</strong> a las <strong>{{hora_traslado}}</strong> deberá presentarse en la sede de trabajo ya mencionada ante el coordinador de esa operación, quien le dará a conocer las labores y actividades que debe ejecutar.</p><p>Al respecto, se aclara que su cargo y remuneración continuarán siendo los mismos que ostenta en la actualidad, pero con una reasignación de actividades que se ajusten a la operación de esa sede de trabajo.</p><p><br></p><p>
<p>Atentamente,</p>

<table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
    <tr>
        <td style="width: 50%; vertical-align: top; padding-right: 10px;">
            <p><strong>EL EMPLEADOR,</strong></p>
            <div style="height: 60px;">{{firma_representante}}</div>
            <p><strong>GUICELA BOHORQUEZ BERMUDEZ</strong><br>
            Representante Legal<br>
            LOG&SER S.A.S.<br>
            NIT. 900.318.733-1.</p>
        </td>
        
        <td style="width: 50%; vertical-align: top; padding-left: 10px;">
            <p><strong>Recibí:</strong></p>
            <div style="height: 60px;">{{firma_trabajador}}</div>
            <p><strong>{{nombre_trabajador}}</strong><br>
            C.C. {{Identificación}}</p>
        </td>
    </tr>
</table>'
WHERE id_plantilla = 1;

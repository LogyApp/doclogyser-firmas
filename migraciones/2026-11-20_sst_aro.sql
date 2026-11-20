-- SST › ARO (Análisis de Riesgo por Oficio, SST-FM-054 v04). El proceso deja de ser parte de la contratación
-- (Selección) y pasa a SST: se escoge al trabajador, se genera el enlace de firma, el trabajador lee y firma, y el
-- PDF queda en su carpeta como documento 7 (ARO) y en Maestro_docTrabajador. Firma también el rol de SG-SST.
-- Rutas: src/routes/aro.js. Pestaña: public/js/sst-aro.js.
-- La plantilla 'ARO' (Maestro_Plantillas id 14) se redirige a SST con el diseño nuevo; respaldo de la anterior en
-- migraciones/respaldos/2026-11-20_respaldo_plantilla_aro_v4.sql.
-- Solo crea la tabla, agrega filas y actualiza la plantilla 'ARO'. Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Dynamic_aro (
  id_aro            VARCHAR(36)  NOT NULL PRIMARY KEY,
  identificacion    BIGINT       NOT NULL,
  id_vinculacion    VARCHAR(50)  NULL,
  nombre_trabajador VARCHAR(150) NULL,
  cargo             VARCHAR(100) NULL,
  operacion         VARCHAR(50)  NULL,
  regional          VARCHAR(50)  NULL,
  version_formato   VARCHAR(20)  NULL,
  token_firma       VARCHAR(64)  NULL,
  url_firma         VARCHAR(255) NULL,
  fecha_firma       DATETIME     NULL,
  url_firma_sst     VARCHAR(255) NULL,
  nombre_sst        VARCHAR(100) NULL,
  cargo_sst         VARCHAR(100) NULL,
  url_doc           VARCHAR(255) NULL,
  usuario           VARCHAR(50)  NOT NULL,
  fecha_creacion    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_aro_identificacion (identificacion),
  KEY idx_aro_token (token_firma),
  KEY idx_aro_operacion (operacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permisos (Config_Parametros sst / ARO, ver src/services/configSst.js) y reglas de la pestaña
INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'ARO', 'Roles que pueden crear ARO', '', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que pueden generar el ARO de un trabajador (enlace de firma) en la pestaña ARO de SST.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Roles que pueden crear ARO');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'ARO', 'Roles que pueden eliminar ARO', '', 'AdmSst, AnaSst, AuxSst, LiderSst, Sistema',
       'Roles que pueden eliminar un ARO pendiente de firma (Sistema cualquiera; los demás solo los que crearon).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Roles que pueden eliminar ARO');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'ARO', 'Roles que pueden editar y regenerar PDF de ARO firmados', '', 'Sistema',
       'Roles que pueden regenerar el PDF de un ARO ya firmado con la plantilla vigente (conserva las firmas).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Roles que pueden editar y regenerar PDF de ARO firmados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'ARO', 'Roles que pueden eliminar ARO firmados', '', 'Sistema',
       'Roles que pueden eliminar un ARO ya firmado; también se quita su documento de Maestro_docTrabajador.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Roles que pueden eliminar ARO firmados');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'ARO', 'Cargos a los que se les genera el ARO', '', 'AUXILIAR LOGISTICO, LIDER AUXILIAR LOGISTICO',
       'Cargos (separados por coma) que aparecen para escoger al generar el ARO de descargue y cargue. Vacío: cualquier cargo.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Cargos a los que se les genera el ARO');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'ARO', 'Rol que firma como SG-SST en el ARO', '', 'LiderSst',
       'Rol cuya firma registrada sale como Notificado por SG-SST en el ARO (el primer usuario con ese rol). Vacío: sin firma de SST.'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Rol que firma como SG-SST en el ARO');

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'sst', 'ARO', 'Habilitar notificaciones de correo en ARO', '', '1',
       'Permite enviar al trabajador el correo con el enlace de firma del ARO. 1 = se puede enviar; 0 = no se envía (el enlace se comparte a mano).'
WHERE NOT EXISTS (SELECT 1 FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Concepto = 'Habilitar notificaciones de correo en ARO');

-- Pestaña en SST con los mismos roles y niveles de Acceso de Prueba de Consumo
INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'sst', 'ARO', 'AdmSst, LiderSst, Sistema, Archivo, Asistencial', 1, 'ARO', '/sst?tab=aro', 11, '＋',
       'Análisis de Riesgo por Oficio (SST-FM-054): notificación y firma del trabajador (todas las operaciones).'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Acceso = 1);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'sst', 'ARO', 'AuxSst', 2, 'ARO', '/sst?tab=aro', 11, '＋',
       'Análisis de Riesgo por Oficio (SST-FM-054): notificación y firma del trabajador (operaciones de su regional).'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Acceso = 2);

INSERT INTO Maestro_Menu (Modulo, Seccion, Rol, Acceso, Etiqueta, Url, Orden, Icono, Descripcion)
SELECT 'sst', 'ARO', 'AnaSst', 3, 'ARO', '/sst?tab=aro', 11, '＋',
       'Análisis de Riesgo por Oficio (SST-FM-054): notificación y firma del trabajador (sus operaciones).'
WHERE NOT EXISTS (SELECT 1 FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'ARO' AND Acceso = 3);

-- Plantilla 'ARO' (id 14): pasa de contratación (Dynamic_hv_aspirante) a SST (Dynamic_aro), documento 7, versión 04
-- del 20/11/2026, con el diseño nuevo. Solo la primera vez (si ya apunta a Dynamic_aro no la vuelve a tocar).
-- HTML también en migraciones/plantillas/ARO.html.
UPDATE Maestro_Plantillas
SET id_config_doc = 7, codigo_formato = 'SST-FM-054', version_formato = '04', fecha_version = '2026-11-20',
    tabla_datos = 'Dynamic_aro', id_campo_fk = 'id_aro', bucket_carpeta = 'talenthub_central',
    requiere_firma_trabajador = 1, activo = 1, version = 5, ultima_actualizacion = NOW(), contenido_html = '<style>
  /* Estilos encerrados en .aro. Datos del trabajador y firmas los llena src/services/aro.js. Contenido de solo lectura. */
  .aro { font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; font-size: 9.2pt; line-height: 1.45; -webkit-font-smoothing: antialiased }
  .aro * { box-sizing: border-box }
  .aro p { margin: 0 0 7px 0; text-align: justify }

  .aro .doc-header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1px solid #cbd5e1 }
  .aro .doc-header-table td { border: 1px solid #cbd5e1; vertical-align: middle }
  .aro .header-logo-cell { width: 24%; text-align: center; padding: 8px 10px; background: #ffffff }
  .aro .logo-img { height: 46px; max-width: 170px; object-fit: contain; display: block; margin: 0 auto }
  .aro .header-title-cell { width: 56%; background: #e6edf7; text-align: center; padding: 10px 14px }
  .aro .doc-title { font-size: 11pt; font-weight: 800; color: #000b59; letter-spacing: 0.4px; text-transform: uppercase; line-height: 1.25 }
  .aro .doc-subtitle { font-size: 8pt; font-weight: 700; color: #c2410c; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px }
  .aro .doc-subdetail { font-size: 7pt; color: #475569; font-weight: 600; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.2px }
  .aro .header-meta-cell { width: 20%; padding: 6px 10px; font-size: 8pt; text-align: center; background: #f8fafc; color: #1e293b; line-height: 1.35 }
  .aro .meta-code { font-weight: 800; color: #000b59; font-size: 8.5pt }
  .aro .meta-ver { color: #334155 }
  .aro .meta-date { color: #64748b; font-size: 7.5pt }

  .aro .metrics-card { display: table; width: 100%; table-layout: fixed; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin: 2px 0 12px 0 }
  .aro .metric-item { display: table-cell; padding: 9px 12px; border-right: 1px solid #e2e8f0; vertical-align: top }
  .aro .metric-item:last-child { border-right: none }
  .aro .metric-label { font-size: 7.3pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px }
  .aro .metric-value { font-size: 9.6pt; font-weight: 700; color: #000b59 }
  .aro .metric-sub { font-size: 8pt; color: #64748b; font-weight: 600 }

  .aro .section-block { margin-bottom: 11px }
  .aro .section-title { page-break-after: avoid; break-after: avoid }
  .aro .tres-col, .aro .sig-table, .aro .rep-table { page-break-inside: avoid; break-inside: avoid }
  .aro .section-title { font-size: 8.3pt; font-weight: 700; color: #000b59; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; margin-bottom: 7px }
  .aro .section-title::before { content: ''''; display: inline-block; width: 4px; height: 12px; background: #f55400; border-radius: 2px; margin-right: 6px; vertical-align: -1px }

  .aro .tres-col { width: 100%; border-collapse: separate; border-spacing: 8px 0; margin: 0 -8px; width: calc(100% + 16px) }
  .aro .tres-col td { width: 33.33%; vertical-align: top; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px }
  .aro .col-titulo { font-size: 7.6pt; font-weight: 800; color: #000b59; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 5px }
  .aro ul.vi { list-style: none; margin: 0; padding: 0 }
  .aro ul.vi li { position: relative; padding-left: 12px; margin-bottom: 3px; font-size: 8.3pt; line-height: 1.35 }
  .aro ul.vi li::before { content: ''''; position: absolute; left: 0; top: 5px; width: 5px; height: 5px; border-radius: 1px; background: #f55400 }
  .aro ol.pasos { margin: 0; padding-left: 18px }
  .aro ol.pasos li { margin-bottom: 4px; font-size: 8.6pt; text-align: justify }
  .aro .nota-box { background: #fff7ed; border: 1px solid #fed7aa; border-left: 3.5px solid #f55400; border-radius: 6px; padding: 8px 12px; font-size: 8.4pt; color: #7c2d12 }
  .aro .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3.5px solid #000b59; border-radius: 6px; padding: 8px 12px; font-size: 8.6pt; color: #1e293b }

  .aro .rep-table { width: 100%; border-collapse: collapse; font-size: 7.8pt; margin-top: 4px }
  .aro .rep-table th { background: #000b59; color: #ffffff; font-weight: 700; padding: 5px 6px; text-transform: uppercase; letter-spacing: 0.3px; font-size: 7pt }
  .aro .rep-table td { border: 1px solid #e2e8f0; height: 18px }

  .aro .sig-table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: avoid }
  .aro .sig-table td { width: 50%; vertical-align: top; text-align: center; padding: 0 14px }
  .aro .sig-table td:first-child { padding-left: 0 }
  .aro .sig-table td:last-child { padding-right: 0 }
  .aro .sig-role { font-size: 7.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; margin-bottom: 4px }
  .aro .sig-img-wrap { height: 86px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-bottom: 4px }
  .aro .sig-img { max-height: 66px; max-width: 210px; display: block; margin: 0 auto }
  .aro .sig-line { border-top: 1.5px solid #000b59; margin-bottom: 5px }
  .aro .sig-name { font-size: 9pt; font-weight: 700; color: #000b59; text-transform: uppercase }
  .aro .sig-details { font-size: 7.5pt; color: #64748b; line-height: 1.35 }
  .aro .firma-nota { font-size: 7.5pt; color: #94a3b8 }

  .aro .doc-footer { margin-top: 14px; text-align: center }
  .aro .doc-footer .line { height: 2px; background: #f55400; border-radius: 1px; margin-bottom: 7px }
  .aro .doc-footer .addr { color: #000b59; font-size: 7.5pt; line-height: 1.4; letter-spacing: 0.3px }
  .aro .doc-footer .legal { color: #94a3b8; font-size: 6.8pt; margin-top: 2px }
</style>

<div class="aro">

  <table class="doc-header-table">
    <tr>
      <td class="header-logo-cell"><img src="{{logo_src}}" alt="LOG&amp;SER" class="logo-img"></td>
      <td class="header-title-cell">
        <div class="doc-title">Análisis de riesgo por oficio</div>
        <div class="doc-subtitle">Descargue y cargue de mercancía</div>
        <div class="doc-subdetail">Área: bodegas y muelle de carga &bull; Seguridad y Salud en el Trabajo</div>
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
      <div class="metric-sub">C.C. {{identificacion}}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Cargo · Operación</div>
      <div class="metric-value" style="font-size:9pt">{{cargo}}</div>
      <div class="metric-sub">{{operacion}}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">Fecha de notificación</div>
      <div class="metric-value" style="color:#f55400">{{fecha_notificacion}}</div>
      <div class="metric-sub">Radicado {{radicado}}</div>
    </div>
  </div>

  <section class="section-block">
    <table class="tres-col">
      <tr>
        <td>
          <div class="col-titulo">Elementos de protección personal</div>
          <ul class="vi">
            <li>Casco con barbuquejo (según cliente)</li>
            <li>Guantes (durante la jornada laboral)</li>
            <li>Botas de seguridad (durante la jornada laboral)</li>
            <li>Dotación - buso reflectivo (durante la jornada laboral)</li>
            <li>Protección auditiva (según operación)</li>
            <li>Protección respiratoria (según operación)</li>
            <li>Protección visual (según operación)</li>
            <li>Chaleco reflectivo (según operación)</li>
          </ul>
        </td>
        <td>
          <div class="col-titulo">Factores de riesgo potencial</div>
          <ul class="vi">
            <li>Sintomatología osteomuscular (rotación de actividad durante el turno laboral)</li>
            <li>Ingreso de partículas (uso de gafas de seguridad para mercancía que lo requiera)</li>
            <li>Contusiones, traumatismos, fracturas, amputaciones</li>
            <li>Cortes y heridas</li>
            <li>Esguinces (control en el uso correcto de botas)</li>
            <li>Caídas a nivel y a diferente nivel (evitar posiciones cerca a desniveles y vacíos)</li>
            <li>Atrapamiento: cumplir normas de operación en manipulación de equipos, herramientas y mercancías</li>
            <li>Atropellamiento: cumplir con normas de seguridad vial</li>
          </ul>
        </td>
        <td>
          <div class="col-titulo">Equipos autorizados</div>
          <ul class="vi">
            <li>Estibador de carga manual</li>
            <li>Estibador eléctrico (solo personal con certificación)</li>
            <li>Carro para movilización de carga tipo planchón o rolling</li>
            <li>Escaleras tijera, banco y tipo avión</li>
            <li>Rampa en muelle y puertas tipo cortina (solo se activan; en caso de falla no intervenir y dar aviso al cliente)</li>
          </ul>
        </td>
      </tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">Pasos básicos de la tarea</div>
    <ol class="pasos">
      <li>Descarpe de vehículo usando escalera para acceder a 2 m, para recoger y enrollar la carpa del vehículo y colocarla encima de su carrocería.</li>
      <li>Disponer de estibas en cada muelle con altura menor a 1,70 m, ubicadas en la zona de cargue; no se deben ingresar a los vehículos los arrumes de estibas.</li>
      <li>Conformación de estiba con peso y altura según el producto: máximo 1 T y 1,80 m.</li>
      <li>El vinipelado de la estiba debe ser firme, iniciando de abajo hacia arriba con 4 vueltas para dar firmeza adicional, para evitar caídas durante el desplazamiento por rampa.</li>
      <li>Para destellar el producto, se debe clasificar según la orden entregada.</li>
      <li>El traslado de mercancía para movilizar cargas pesadas o especiales siempre debe realizarse entre dos o tres personas según la necesidad, para evitar que la carga se desnivele, pierda la verticalidad o gane velocidad en desplazamientos por terrenos inclinados o con desniveles de piso. Toda movilización o desplazamiento de mercancía se realiza con ayuda mecánica.</li>
      <li>Para el personal auxiliar de maquila de ruta, urbanos o ruteros, las entregas de mercancía de más de 50 kg se deben realizar entre dos personas y hasta el 5.º piso (aplica para mercancía de línea blanca). Los vehículos deben estar dotados de carros tipo carretilla vertical o rollines.</li>
      <li>Las puertas de vehículos y contenedores no están autorizadas para abrirlas y cerrarlas: estas tareas son del conductor.</li>
    </ol>
  </section>

  <section class="section-block">
    <div class="section-title">Desviaciones a normas SST</div>
    <ul class="vi">
      <li>Distracción: uso de elementos como celular, manos libres y otros elementos de distracción que no son contemplados como herramientas, dotación y/o EPP.</li>
      <li>Mal uso, no uso o inadecuada selección del equipo de protección personal.</li>
      <li>Peso mayor a 25 kg: para estos pesos, como bultos, el auxiliar debe movilizar la carga entre dos personas.</li>
      <li>Manipular mercancías con volumen o dificultad de sujeción, o manipular dos o más unidades a la vez, generando la condición insegura.</li>
      <li>Realizar las tareas con mala actitud, exceso de confianza o manipular mercancía generando riesgo para sí mismo y con probabilidad de daño a la mercancía.</li>
      <li>Falta de aptitud y realizar las tareas con malas prácticas de trabajo; no seguir las directrices de líderes, coordinadores y/o SST.</li>
    </ul>
  </section>

  <section class="section-block">
    <div class="section-title">Condiciones de uso de muelle y equipos</div>
    <div class="info-box">
      <p>Las rampas niveladoras de carga, las puertas tipo cortina de muelle y las puertas de vehículos o contenedores son equipos que generan alto riesgo de peligro mecánico. Por lo anterior, los auxiliares logísticos y líderes solo están autorizados a activarlos.</p>
      <p>Si las rampas niveladoras o las puertas de muelle presentan fallas o condiciones inseguras, el auxiliar y/o líder debe detener el cargue o descargue, pasar el vehículo a otro muelle, avisar a la cuadrilla completa para evitar su uso y dar aviso al cliente para el mantenimiento o ajuste necesario.</p>
      <p style="margin-bottom:0">Cuando un auxiliar identifique fallas o condiciones inseguras debe: notificar al guarda de seguridad de puertas (personal del cliente); notificar al líder, encargado de operación o coordinador logístico; entregar la ficha de reporte de condiciones al jefe (personal de LOG&amp;SER); notificar en las charlas de seguridad o de inicio de operación las condiciones de trabajo inseguras, y reportar de forma diaria sus condiciones de salud.</p>
    </div>
  </section>

  <section class="section-block">
    <div class="section-title">Plan de acción — capacitación en</div>
    <table class="tres-col">
      <tr>
        <td><ul class="vi"><li>Uso correcto de rampa y puerta de muelles</li><li>Higiene postural</li><li>Manipulación de mercancía y agarres seguros</li></ul></td>
        <td><ul class="vi"><li>Pausas activas</li><li>Fortalecimiento de espalda, tronco, miembro superior e inferior</li><li>Manejo seguro de herramientas y equipos</li></ul></td>
        <td><ul class="vi"><li>Manejo de estibas</li><li>Traslado de mercancía con ayudas mecánicas</li><li>Tarjeta de reporte de actos o condiciones inseguras</li></ul></td>
      </tr>
    </table>
  </section>

  <section class="section-block">
    <div class="section-title">Reporte de herramientas, equipos y áreas</div>
    <table class="rep-table">
      <tr><th style="width:13%">Fecha</th><th style="width:31%">Descripción de la falla que se presenta</th><th style="width:18%">Elemento</th><th style="width:19%">Quien reporta</th><th style="width:19%">Quien recibe el reporte</th></tr>
      <tr><td></td><td></td><td></td><td></td><td></td></tr>
      <tr><td></td><td></td><td></td><td></td><td></td></tr>
    </table>
    <div class="nota-box" style="margin-top:8px"><strong>Nota:</strong> los colaboradores de Apoyo Logístico no están autorizados para realizar mantenimiento ni manipular los elementos que se encuentren en mal estado o presenten fallas en su operación. Este cuadro es el modelo de la tarjeta de reporte que se usa en la operación.</div>
  </section>

  <section class="section-block">
    <div class="section-title">Declaración de conocimiento</div>
    <p>Yo, <strong>{{nombre_trabajador}}</strong>, identificado(a) con C.C. <strong>{{identificacion}}</strong>, en el cargo de <strong>{{cargo}}</strong>, manifiesto que he recibido la información sobre los riesgos asociados a mi cargo, los equipos de protección personal requeridos, los pasos básicos para la ejecución segura de mis tareas y los planes de acción establecidos por APOYO LOGÍSTICO Y OPERATIVO S.A.S. Me comprometo a cumplir con todas las normas de seguridad descritas en el presente análisis de riesgo.</p>
  </section>

  <section class="section-block" style="page-break-inside: avoid; break-inside: avoid">
    <div class="section-title">Firmas</div>
    <table class="sig-table">
      <tr>
        <td>
          <div class="sig-role">Trabajador(a) notificado(a)</div>
          <div class="sig-img-wrap">{{firma_trabajador_html}}</div>
          <div class="sig-line"></div>
          <div class="sig-name">{{nombre_trabajador}}</div>
          <div class="sig-details">C.C. {{identificacion}}<br>{{cargo}}</div>
        </td>
        <td>
          <div class="sig-role">Notificado por SG-SST</div>
          <div class="sig-img-wrap">{{firma_sst_html}}</div>
          <div class="sig-line"></div>
          <div class="sig-name">{{nombre_sst}}</div>
          <div class="sig-details">{{cargo_sst}}</div>
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
WHERE nombre_proceso = 'ARO' AND tabla_datos <> 'Dynamic_aro';

SELECT id_plantilla, nombre_proceso, id_config_doc, codigo_formato, version_formato, fecha_version, tabla_datos, version FROM Maestro_Plantillas WHERE nombre_proceso = 'ARO';
SELECT Concepto, Parametro FROM Config_Parametros WHERE Modulo = 'sst' AND Seccion = 'ARO';
SELECT ID, Seccion, Acceso, Rol FROM Maestro_Menu WHERE Modulo = 'sst' AND Seccion = 'ARO' ORDER BY Acceso;

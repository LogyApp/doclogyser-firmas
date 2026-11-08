-- Formularios de los documentos de firma de Selección (Aspirantes).
-- Config_Formulario_Preguntas: catálogo de preguntas por documento (Id de Config_Doc_Trabajador).
-- Dynamic_hv_respuestas: respuestas del aspirante (una fila por pregunta).
-- Preguntas iniciales: Reporte inicial de condiciones de salud (Id 20) y la aceptación del
-- Consentimiento (Id 16). Todas obligatorias (obligatorio = 1).
-- Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Config_Formulario_Preguntas (
  id INT NOT NULL AUTO_INCREMENT,
  id_config_doc INT NOT NULL COMMENT 'Documento de Config_Doc_Trabajador al que pertenece la pregunta',
  codigo VARCHAR(60) NOT NULL COMMENT 'Clave fija de la pregunta (no cambiarla: une las respuestas). En plantillas: {{resp_<codigo>}}',
  seccion VARCHAR(150) NULL COMMENT 'Título de la sección donde se muestra',
  orden INT NOT NULL DEFAULT 0 COMMENT 'Orden de aparición',
  texto VARCHAR(500) NOT NULL COMMENT 'Texto de la pregunta',
  tipo VARCHAR(20) NOT NULL DEFAULT 'texto' COMMENT 'si_no, texto, numero, opcion, multiple, marcas',
  opciones VARCHAR(500) NULL COMMENT 'Opciones separadas por coma (opcion, multiple, marcas)',
  obligatorio TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = obligatoria para poder firmar, 0 = opcional',
  detalle_si VARCHAR(150) NULL COMMENT 'Solo si_no: campos extra cuando responde Sí: fecha, origen, texto:Etiqueta',
  activo TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = la pregunta deja de mostrarse',
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_formulario_doc_codigo (id_config_doc, codigo),
  KEY idx_formulario_doc (id_config_doc, activo, orden)
) COMMENT = 'Preguntas de los formularios de los documentos de firma (Selección)';

CREATE TABLE IF NOT EXISTS Dynamic_hv_respuestas (
  id BIGINT NOT NULL AUTO_INCREMENT,
  id_aspirante CHAR(12) NOT NULL,
  id_config_doc INT NOT NULL,
  codigo_pregunta VARCHAR(60) NOT NULL,
  respuesta VARCHAR(500) NULL,
  detalle_fecha DATE NULL COMMENT 'Fecha del evento (si respondió Sí)',
  detalle_origen VARCHAR(5) NULL COMMENT 'AT = accidente de trabajo, T = tránsito, C = común',
  detalle_texto VARCHAR(500) NULL COMMENT 'Descripción o cantidad (si respondió Sí)',
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_respuesta (id_aspirante, id_config_doc, codigo_pregunta),
  KEY idx_respuesta_pregunta (id_config_doc, codigo_pregunta)
) COMMENT = 'Respuestas de los aspirantes a los formularios de los documentos de firma';

INSERT IGNORE INTO Config_Formulario_Preguntas
  (id_config_doc, codigo, seccion, orden, texto, tipo, opciones, obligatorio, detalle_si)
VALUES
  (20, 'seg_craneo', 'Segmento corporal afectado', 10, 'Cráneo', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_cara', 'Segmento corporal afectado', 20, 'Cara', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_cuello', 'Segmento corporal afectado', 30, 'Cuello', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_torax', 'Segmento corporal afectado', 40, 'Tórax', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_tronco', 'Segmento corporal afectado', 50, 'Tronco', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_brazo', 'Segmento corporal afectado', 60, 'Brazo', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_antebrazo', 'Segmento corporal afectado', 70, 'Antebrazo', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_mano', 'Segmento corporal afectado', 80, 'Mano', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_abdomen', 'Segmento corporal afectado', 90, 'Abdomen', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_pelvis', 'Segmento corporal afectado', 100, 'Pelvis', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_muslo', 'Segmento corporal afectado', 110, 'Muslo', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_pierna', 'Segmento corporal afectado', 120, 'Pierna', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'seg_pie', 'Segmento corporal afectado', 130, 'Pie', 'marcas', 'Fractura / amputación,Esguince o dolor (últimos 6 meses),Ninguno', 1, NULL),
  (20, 'peso', 'Datos generales de salud', 140, 'Peso (kg)', 'numero', NULL, 1, NULL),
  (20, 'altura', 'Datos generales de salud', 150, 'Altura (cm)', 'numero', NULL, 1, NULL),
  (20, 'edad', 'Datos generales de salud', 160, 'Edad (años)', 'numero', NULL, 1, NULL),
  (20, 'fuma', 'Datos generales de salud', 170, '¿Fuma?', 'si_no', NULL, 1, 'texto:¿Cuántos cigarrillos al día?'),
  (20, 'alcohol', 'Datos generales de salud', 180, '¿Consume alcohol?', 'si_no', NULL, 1, 'texto:¿Cuántas veces por semana?'),
  (20, 'actividad_fisica', 'Datos generales de salud', 190, '¿Realiza actividad física?', 'si_no', NULL, 1, 'texto:¿Cuál actividad y cuántas veces a la semana?'),
  (20, 'medio_transporte', 'Datos generales de salud', 200, 'Su medio de transporte es', 'opcion', 'Pie,Bicicleta,Moto,Vehículo particular,Transporte público', 1, NULL),
  (20, 'tiempo_desplazamiento', 'Datos generales de salud', 210, 'Tiempo de desplazamiento por recorrido (minutos)', 'numero', NULL, 1, NULL),
  (20, 'control_medico', 'Condiciones de salud actuales', 220, '¿Ha asistido a control médico? Indique cuándo fue la última vez', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'enfermedad_diagnosticada', 'Condiciones de salud actuales', 230, 'Ha tenido alguna enfermedad diagnosticada. Menciónela', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'antecedentes_familiares', 'Condiciones de salud actuales', 240, 'Tiene antecedentes familiares importantes (hipertensión, diabetes, cáncer, coronaria, artritis, dermatitis, epilepsia, otra)', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'accidente_lesiones', 'Condiciones de salud actuales', 250, 'Ha tenido algún tipo de accidente con lesiones como esguince, fracturas, amputaciones, recomendaciones', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'incapacidad_15_dias', 'Condiciones de salud actuales', 260, 'Ha tenido incapacidad mayor a 15 días por accidente de trabajo, tránsito o común en los últimos 6 meses', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'tratamiento_terapia', 'Condiciones de salud actuales', 270, 'Ha estado en tratamiento por terapia física, psicológica o por sustancias psicoactivas', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'hernias_lumbares', 'Condiciones de salud actuales', 280, 'En los últimos 6 meses ha presentado problemas de hernias o dolores lumbares, espasmos, lumbago, ciática, várices', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'lesion_articulaciones', 'Condiciones de salud actuales', 290, 'Ha presentado lesiones o dolor en hombro, clavícula, codo, manos, tronco, espalda, rodilla, tobillo, pie u otro', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'hernia_diagnostico', 'Condiciones de salud actuales', 300, 'Tiene conocimiento o diagnóstico de presentar algún tipo de hernia abdominal, inguinal, femoral, otras', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'varicocele', 'Condiciones de salud actuales', 310, 'Ha presentado varicocele, ¿en qué grado?', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'dermatitis', 'Condiciones de salud actuales', 320, 'Ha presentado dermatitis o lesiones en manos por alergias, exposición a temperaturas frío-calor', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'condicion_vision', 'Condiciones de salud actuales', 330, 'Tiene alguna condición de salud que altere su visión (accidentes en ojos, cirugías, etc.)', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'usa_gafas', 'Condiciones de salud actuales', 340, 'Actualmente utiliza gafas o lentes de contacto para la realización de sus actividades cotidianas', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'accidente_transito', 'Condiciones de salud actuales', 350, 'Ha presentado accidentes de tránsito, vehículo, moto, otro en los últimos 24 meses', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'accidente_deporte', 'Condiciones de salud actuales', 360, 'Ha presentado accidentes y lesiones al realizar deporte', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'cirugias', 'Condiciones de salud actuales', 370, 'Ha tenido cirugías. Mencione cuál', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'incapacidades_6_meses', 'Condiciones de salud actuales', 380, 'Ha presentado incapacidades en los últimos 6 meses', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'accidente_secuela', 'Condiciones de salud actuales', 390, 'Ha presentado algún accidente laboral o general que haya causado algún tipo de lesión o secuela', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'consume_medicamento', 'Condiciones de salud actuales', 400, 'Actualmente consume algún tipo de medicamento', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'apto_alturas', 'Lesiones que ha presentado en su vida', 410, 'Conoce si es apto para trabajar en alturas', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'vertigo_alturas', 'Lesiones que ha presentado en su vida', 420, 'Sufre de vértigo o tiene miedo a las alturas', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'caidas_atencion', 'Lesiones que ha presentado en su vida', 430, 'Ha tenido caídas a nivel o a diferente nivel y a causa de la misma requirió atención médica', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (20, 'lesion_arma_blanca', 'Lesiones que ha presentado en su vida', 440, 'Ha tenido lesiones por arma blanca', 'si_no', NULL, 1, 'fecha,origen,texto:Describa'),
  (16, 'acepta_finalidad', 'Aceptación', 10, 'Acepto la finalidad antes indicada', 'si_no', NULL, 1, NULL);

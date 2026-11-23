-- Vista personal de las tablas: cada usuario escoge qué columnas ve, en qué orden, con qué etiqueta y ancho.
-- Primera vista: Facturación → Servicios (Vista = 'facturacion.servicios', src/services/vistaTablaUsuario.js).
-- Columnas guarda una lista JSON en orden: [{"clave": "...", "etiqueta": "...", "ancho": 120, "visible": true}].
-- Sin fila para el usuario, la tabla se ve con la vista predeterminada. Se puede ejecutar más de una vez.

CREATE TABLE IF NOT EXISTS Maestro_Preferencias_Tabla (
  Usuario VARCHAR(50) NOT NULL,
  Vista VARCHAR(60) NOT NULL,
  Columnas JSON NOT NULL,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (Usuario, Vista)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT COUNT(*) AS filas FROM Maestro_Preferencias_Tabla;

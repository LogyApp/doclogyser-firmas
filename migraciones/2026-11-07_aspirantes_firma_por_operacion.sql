-- Aspirantes (TalentHub): documentos de firma que solo aplican a ciertas operaciones.
-- Antes estaba fijo en el código (Formatos Italcol, Id 33, solo para "Italcol La Estrella").
-- Concepto: 'Documento de firma solo para operaciones - Id <Id de Config_Doc_Trabajador>'.
-- Parametro: operaciones separadas por coma (sin distinguir mayúsculas ni tildes).
-- Se puede ejecutar varias veces: solo inserta si la fila no existe.

INSERT INTO Config_Parametros (Modulo, Seccion, Concepto, Condicion, Parametro, Descripcion)
SELECT 'talenthub', 'Aspirantes', 'Documento de firma solo para operaciones - Id 33', 'Lista', 'Italcol La Estrella',
       'Operaciones (separadas por coma) en las que el aspirante debe firmar el documento Id 33 (Formatos Italcol). En las demás operaciones no aparece. Si se deja vacío, el documento se pide en todas las operaciones.'
WHERE NOT EXISTS (
  SELECT 1 FROM Config_Parametros
  WHERE Modulo = 'talenthub' AND Seccion = 'Aspirantes'
    AND Concepto = 'Documento de firma solo para operaciones - Id 33'
);

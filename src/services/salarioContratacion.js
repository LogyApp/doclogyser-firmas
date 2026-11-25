const { normalizar } = require('./docsSeleccion');

const CONCEPTO_CARGOS = 'Cargos con salario mínimo predeterminado';

async function obtenerSalarioPredeterminado(db, idAspirante) {
  const [aspirantes] = await db.execute(
    'SELECT r.`Cargo Requerido` AS cargo FROM Dynamic_hv_aspirante a LEFT JOIN Dynamic_Requisiciones r ON r.IdRequisicion = a.IdRequisicion WHERE a.id_aspirante = ? LIMIT 1',
    [idAspirante]
  );
  if (!aspirantes.length) throw new Error('Aspirante no encontrado.');

  const [parametros] = await db.execute(
    'SELECT Parametro FROM Config_Parametros WHERE Modulo = ? AND Seccion = ? AND Concepto = ?',
    ['talenthub', 'Aspirantes', CONCEPTO_CARGOS]
  );
  if (parametros.length > 1) throw new Error('Hay parámetros duplicados para los cargos con salario mínimo predeterminado.');
  const cargos = String(parametros.length ? parametros[0].Parametro || '' : '')
    .split(',').map(normalizar).filter(Boolean);
  if (!cargos.includes(normalizar(aspirantes[0].cargo))) return null;

  const [salarios] = await db.execute(
    'SELECT `Valor Base` AS valor FROM Config_Impuestos WHERE TRIM(Concepto) = ?',
    ['Salario Minimo']
  );
  const salario = salarios.length === 1 ? Number(salarios[0].valor) : NaN;
  if (!Number.isSafeInteger(salario) || salario <= 0 || salario > 2147483647) {
    throw new Error('Revise el Salario Minimo en Config_Impuestos: debe existir una sola fila con un valor válido en pesos.');
  }
  return salario;
}

function validarSalario(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const texto = String(valor).trim();
  const numero = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(numero) || numero > 2147483647) {
    throw new Error('El salario debe ser un valor entero no negativo en pesos.');
  }
  return numero;
}

module.exports = { obtenerSalarioPredeterminado, validarSalario };

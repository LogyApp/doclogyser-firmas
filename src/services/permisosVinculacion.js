// Reglas de permisos por Rol para el formulario de edición de Maestro_Vinculación
// que se abre desde la pestaña Activos de Nómina.

const ROLES_EDITAN_BASICOS = ['Selección', 'Selección Centro', 'Contratación', 'Nomina', 'Asistencial', 'Sistema', 'Control'];
const ROLES_VEN_SALARIO    = ['Selección', 'Nomina', 'Control', 'Sistema'];
const ROLES_EDITAN_AUX_TRANSPORTE = ['Sistema', 'Nomina'];
const GRUPOS_NOMINA_SALARIO_SELECCION_CENTRO = ['Operativo', 'Aprendiz'];

// Campos de Maestro_Vinculación completamente ocultos en este formulario para todos los roles.
const CAMPOS_OCULTOS = [
  'Cod Siesa',
  'Fecha de Retiro',
  'Fecha Legalización Retiro',
  'Quien Legaliza el Retiro',
  'Fecha Examen Medico de Retiro',
  'Carta Examen Medico de Retiro',
  'Observaciones Vinculación',
  'Archivo Vinculación',
];

function calcularPermisosVinculacion(rol, grupoNominaActual) {
  const puedeEditarBasicos = ROLES_EDITAN_BASICOS.includes(rol);
  const puedeVerSalario = ROLES_VEN_SALARIO.includes(rol) ||
    (rol === 'Selección Centro' && GRUPOS_NOMINA_SALARIO_SELECCION_CENTRO.includes(grupoNominaActual));

  return {
    // Identificación, Trabajador, Estado: siempre visibles, nunca editables
    cargo:               puedeEditarBasicos,
    regional:             puedeEditarBasicos,
    operacion:            puedeEditarBasicos,
    area:                 true,  // editable para todos
    tipoContrato:         puedeEditarBasicos,
    grupoNomina:          puedeEditarBasicos,
    productividadDtjo:    true,  // editable para todos
    salarioVisible:       puedeVerSalario,
    salarioEditable:      puedeVerSalario,
    auxilioTransporte:    ROLES_EDITAN_AUX_TRANSPORTE.includes(rol), // visible para todos, editable solo para estos
    fechaIngreso:         puedeEditarBasicos,
  };
}

module.exports = {
  CAMPOS_OCULTOS,
  calcularPermisosVinculacion,
};

const {
  buscarEmpleadoParaFirma,
  buscarColaboradoresSugeridos,
  listarColaboradoresDirectorio,
  generarFirmaPNG
} = require('../src/services/firmaSyncService');

(async () => {
  try {
    console.log('=== TEST 1: Buscar Yudy Cardona (1001415776) ===');
    const emp1 = await buscarEmpleadoParaFirma('1001415776');
    console.log('Result emp1:', {
      ok: !!emp1,
      existeEnFirma: emp1.existeEnFirma,
      nombre: emp1.data?.nombre,
      cargo: emp1.data?.cargo,
      area: emp1.data?.area,
      operacion: emp1.data?.operacion,
      email: emp1.data?.email
    });

    console.log('\n=== TEST 2: Buscar sugeridos "Cardona" ===');
    const sugeridos = await buscarColaboradoresSugeridos('Cardona');
    console.log('Sugeridos count:', sugeridos.length, sugeridos.map(s => s.nombre));

    console.log('\n=== TEST 3: Listar Directorio ===');
    const colabs = await listarColaboradoresDirectorio();
    console.log('Total directorio:', colabs.length);
    const areas = [...new Set(colabs.map(c => c.area))];
    console.log('Areas encontradas (' + areas.length + '):', areas);

    console.log('\n=== TEST 4: Generar PNG con Puppeteer ===');
    const pngBuffer = await generarFirmaPNG({
      identificacion: '1001415776',
      nombre: 'Yudy Estefania Cardona Gomez',
      cargo: 'Auxiliar Administrativo Regional',
      operacion: 'Pepsico Guarne',
      direccion: 'Km 28.5, Autopista Medellín-Bogotá',
      celular: '3112302110',
      email: 'auxiliarguarnelogyser@gmail.com',
      area: 'auxiliares_administrativos'
    });
    console.log('PNG Buffer generado con exito! Bytes:', pngBuffer.length);

    console.log('\n=== TEST 5: Autocompletado desde Maestro_Vinculacion ===');
    const pool = require('../src/services/db');
    const [rowsVinc] = await pool.query(
      "SELECT v.Identificación, v.Trabajador, v.Cargo, v.Regional, v.`Operación` " +
      "FROM `Maestro_Vinculación` v " +
      "WHERE v.Estado = 'Activo' " +
      "  AND v.Identificación NOT IN (SELECT Identificacion FROM Maestro_firma_corporativa WHERE Identificacion IS NOT NULL) " +
      "LIMIT 1"
    );
    if (rowsVinc.length > 0) {
      const v = rowsVinc[0];
      console.log('Worker en vinculacion que no esta en firma:', v.Identificación, v.Trabajador);
      const resVinc = await buscarEmpleadoParaFirma(v.Identificación);
      console.log('Autocompletado con exito:', {
        existeEnFirma: resVinc.existeEnFirma,
        esDeVinculacion: resVinc.esDeVinculacion,
        nombre: resVinc.data?.nombre,
        cargo: resVinc.data?.cargo,
        area: resVinc.data?.area,
        operacion: resVinc.data?.operacion
      });
    }

    console.log('\n>>> TODOS LOS TESTS COMPLETADOS SATISFACTORIAMENTE <<<');
  } catch (err) {
    console.error('Error en test:', err);
  } finally {
    process.exit(0);
  }
})();

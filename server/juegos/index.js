// Registro de juegos. Carga solo los habilitados en games.config.json y valida su interfaz
// y su contenido al arrancar, para que cualquier error salte ANTES de la presentacion.
const fs = require('node:fs');
const path = require('node:path');

const FUNCIONES_OBLIGATORIAS = ['crearRondas', 'procesarInput', 'puntuar', 'vistaHost', 'vistaJugador'];

function validarModulo(modulo, idEsperado) {
  const faltas = [];
  for (const campo of ['id', 'nombre', 'tema']) {
    if (typeof modulo[campo] !== 'string' || !modulo[campo]) faltas.push(campo);
  }
  if (!modulo.sello || typeof modulo.sello.nombre !== 'string') faltas.push('sello.nombre');
  for (const fn of FUNCIONES_OBLIGATORIAS) {
    if (typeof modulo[fn] !== 'function') faltas.push(`${fn}()`);
  }
  if (modulo.id !== idEsperado) faltas.push(`id (esperaba "${idEsperado}", tiene "${modulo.id}")`);
  return faltas;
}

// Devuelve Map<id, entrada>. entrada = { id, nombre, tema, descripcion, sello, modulo, contenido }.
// Un juego con problemas se omite y se informa; no tumba el servidor.
function cargarJuegos({ habilitados, dirContenido, dirJuegos = __dirname, log = console }) {
  const juegos = new Map();
  for (const id of habilitados) {
    try {
      const modulo = require(path.join(dirJuegos, `${id}.js`));
      const faltas = validarModulo(modulo, id);
      if (faltas.length) throw new Error(`le falta o esta mal: ${faltas.join(', ')}`);

      let contenido = null;
      if (modulo.contenido) {
        const ruta = path.join(dirContenido, modulo.contenido);
        const crudo = fs.readFileSync(ruta, 'utf8');
        contenido = JSON.parse(crudo);
        // El contenido de ejemplo se marca con "verificar": true; avisamos para que no llegue a clase sin revisar
        const pendientes = (crudo.match(/"verificar"\s*:\s*true/g) || []).length;
        if (pendientes) log.log(`[juegos] AVISO ${id}: ${pendientes} elementos con [VERIFICAR] en ${modulo.contenido}`);
      }
      // Probamos crear las rondas una vez para detectar contenido mal formado
      const prueba = modulo.crearRondas(contenido);
      if (!Array.isArray(prueba) || prueba.length === 0) throw new Error('crearRondas() no devolvio rondas');

      juegos.set(id, {
        id,
        nombre: modulo.nombre,
        tema: modulo.tema,
        descripcion: modulo.descripcion || '',
        sello: modulo.sello,
        modulo,
        contenido,
      });
      log.log(`[juegos] Habilitado: ${id} (${prueba.length} rondas)`);
    } catch (err) {
      log.error(`[juegos] NO se pudo habilitar "${id}": ${err.message}`);
    }
  }
  return juegos;
}

module.exports = { cargarJuegos, validarModulo };

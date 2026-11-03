// Pasaporte: sellos que se ganan al participar en un juego.

// Otorga el sello del juego a quienes enviaron al menos una respuesta.
function otorgarSellos(estado, juegoId, participantes) {
  const otorgados = [];
  for (const id of participantes) {
    const jugador = estado.jugadores.get(id);
    if (jugador && !jugador.sellos.includes(juegoId)) {
      jugador.sellos.push(juegoId);
      otorgados.push(id);
    }
  }
  return otorgados;
}

// Casillas del pasaporte de un jugador: un sello por cada juego habilitado.
function casillasPasaporte(juegos, jugador) {
  return [...juegos.values()].map((e) => ({
    juegoId: e.id,
    nombre: e.sello.nombre,
    icono: e.sello.icono || '★',
    obtenido: jugador.sellos.includes(e.id),
  }));
}

module.exports = { otorgarSellos, casillasPasaporte };

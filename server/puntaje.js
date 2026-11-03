// Rankings individual y por equipos.
const { EQUIPOS } = require('./estado');

// Mas puntos primero; si empatan, gana quien acumula menos tiempo de respuesta;
// si aun asi empatan, comparten posicion.
function rankingIndividual(estado) {
  const lista = [...estado.jugadores.values()].sort(
    (a, b) => b.puntos - a.puntos || a.tiempoMs - b.tiempoMs || a.nombre.localeCompare(b.nombre, 'es'),
  );
  let posicion = 0;
  let previo = null;
  return lista.map((j, i) => {
    if (!previo || previo.puntos !== j.puntos || previo.tiempoMs !== j.tiempoMs) posicion = i + 1;
    previo = j;
    return { id: j.id, nombre: j.nombre, avatar: j.avatar, equipoId: j.equipoId, puntos: j.puntos, posicion };
  });
}

// Ranking de equipos por PROMEDIO de puntos por jugador, para no favorecer al equipo mas grande.
function rankingEquipos(estado) {
  const acumulado = new Map(EQUIPOS.map((e) => [e.id, { total: 0, jugadores: 0 }]));
  for (const j of estado.jugadores.values()) {
    const a = acumulado.get(j.equipoId);
    a.total += j.puntos;
    a.jugadores += 1;
  }
  const lista = EQUIPOS.map((e) => {
    const a = acumulado.get(e.id);
    const promedio = a.jugadores ? Math.round(a.total / a.jugadores) : 0;
    return { id: e.id, nombre: e.nombre, color: e.color, forma: e.forma, jugadores: a.jugadores, total: a.total, promedio };
  }).sort((x, y) => y.promedio - x.promedio || y.total - x.total);
  let posicion = 0;
  return lista.map((e, i) => {
    if (i === 0 || lista[i - 1].promedio !== e.promedio) posicion = i + 1;
    return { ...e, posicion };
  });
}

module.exports = { rankingIndividual, rankingEquipos };

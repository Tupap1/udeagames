// Construye lo que ve cada cliente. Los clientes solo pintan lo que reciben aqui.
const { FASES, SUBFASES, EQUIPOS } = require('./estado');
const { rankingIndividual, rankingEquipos } = require('./puntaje');
const { casillasPasaporte } = require('./pasaporte');

const equipoPublico = (id) => EQUIPOS.find((e) => e.id === id) || EQUIPOS[0];

function seguro(motor, etiqueta, fn, respaldo) {
  try {
    return fn();
  } catch (err) {
    console.error(`[vistas] Error en ${etiqueta}:`, err);
    return respaldo;
  }
}

// Se calcula una sola vez por difusion y se reutiliza para los ~40 jugadores
function crearCache(motor) {
  const ranking = rankingIndividual(motor.estado);
  return {
    ranking,
    posiciones: new Map(ranking.map((r) => [r.id, r.posicion])),
    equipos: rankingEquipos(motor.estado),
    podio: ranking.filter((r) => r.posicion <= 3).slice(0, 6),
  };
}

function resumenJuego(motor, rol, jugador) {
  const { estado } = motor;
  const j = estado.juego;
  if (!j) return null;
  const entrada = motor.juegos.get(j.id);
  const ctx = motor.contexto();
  const base = {
    id: j.id,
    nombre: entrada.nombre,
    subfase: j.subfase,
    rondaIndice: j.indiceRonda,
    rondaTotal: j.rondas.length,
    rondaId: j.rondas[j.indiceRonda]?.id ?? null,
    inicioActivaMs: j.inicioActivaMs,
    finActivaMs: j.finActivaMs,
  };
  if (rol === 'jugador') {
    const enRevelacion = j.subfase === SUBFASES.REVELACION || j.subfase === SUBFASES.RESULTADOS;
    return {
      ...base,
      yaRespondi: j.inputs.has(jugador.id),
      puntosRonda: enRevelacion ? j.puntosRonda.get(jugador.id) ?? 0 : null,
      vista: seguro(motor, 'vistaJugador', () => entrada.modulo.vistaJugador(ctx, jugador), { error: true }),
    };
  }
  let conectados = 0;
  let respondieron = 0;
  for (const p of estado.jugadores.values()) {
    if (!p.conectado) continue;
    conectados++;
    if (j.inputs.has(p.id)) respondieron++;
  }
  return {
    ...base,
    respondieron,
    conectados,
    vista: seguro(motor, 'vistaHost', () => entrada.modulo.vistaHost(ctx), { error: true }),
  };
}

// Vista personalizada de un jugador (sin serverNow: lo agrega quien emite)
function vistaJugador(motor, jugador, cache) {
  const { estado } = motor;
  const eq = equipoPublico(jugador.equipoId);
  const vista = {
    rol: 'jugador',
    fase: estado.fase,
    yo: {
      id: jugador.id,
      nombre: jugador.nombre,
      equipo: eq,
      puntos: jugador.puntos,
      posicion: cache.posiciones.get(jugador.id),
      sellos: jugador.sellos,
    },
    pasaporte: casillasPasaporte(motor.juegos, jugador),
    totalJugadores: estado.jugadores.size,
    juego: null,
    equipos: null,
    podio: null,
  };
  if (estado.fase === FASES.JUEGO) vista.juego = resumenJuego(motor, 'jugador', jugador);
  if (estado.fase === FASES.MENU || estado.fase === FASES.PODIO) vista.equipos = cache.equipos;
  if (estado.fase === FASES.PODIO) vista.podio = cache.podio;
  return vista;
}

// Vista del host (proyector)
function vistaHost(motor, cache, publicUrl) {
  const { estado } = motor;
  const lista = [...estado.jugadores.values()]
    .sort((a, b) => a.unidoEn - b.unidoEn)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      equipoId: p.equipoId,
      puntos: p.puntos,
      conectado: p.conectado,
      sellos: p.sellos.length,
    }));
  return {
    rol: 'host',
    fase: estado.fase,
    publicUrl,
    totalJugadores: estado.jugadores.size,
    conectados: motor.conectados(),
    jugadores: lista,
    equipos: cache.equipos,
    ranking: cache.ranking.slice(0, 10),
    podio: estado.fase === FASES.PODIO ? cache.podio : null,
    menu: {
      juegos: [...motor.juegos.values()].map((e) => ({
        id: e.id,
        nombre: e.nombre,
        tema: e.tema,
        descripcion: e.descripcion,
        jugado: estado.juegosJugados.includes(e.id),
      })),
    },
    juego: estado.fase === FASES.JUEGO ? resumenJuego(motor, 'host') : null,
  };
}

module.exports = { crearCache, vistaJugador, vistaHost };

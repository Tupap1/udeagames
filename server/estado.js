// Modelo de estado en memoria. El servidor es la unica fuente de verdad.

const FASES = Object.freeze({
  LOBBY: 'LOBBY',
  MENU: 'MENU',
  VOTACION: 'VOTACION',
  JUEGO: 'JUEGO',
  PODIO: 'PODIO',
});

// Subfases dentro de un juego
const SUBFASES = Object.freeze({
  INTRO: 'INTRO',
  ACTIVA: 'ACTIVA',
  REVELACION: 'REVELACION',
  RESULTADOS: 'RESULTADOS',
});

// 4 equipos. Cada uno tiene color y forma, para que se distingan sin depender solo del color.
const EQUIPOS = Object.freeze([
  Object.freeze({ id: 'rojo', nombre: 'Rojo', color: '#e0483e', forma: '▲' }),
  Object.freeze({ id: 'azul', nombre: 'Azul', color: '#3d7fe0', forma: '●' }),
  Object.freeze({ id: 'verde', nombre: 'Verde', color: '#2fa36b', forma: '■' }),
  Object.freeze({ id: 'amarillo', nombre: 'Amarillo', color: '#f2b233', forma: '◆' }),
]);

// Avatares que se eligen en la sala de espera y reacciones que se mandan al proyector.
// Son listas cerradas: el servidor rechaza cualquier otro valor.
const AVATARES = Object.freeze(['🧳', '✈️', '🌎', '🗺️', '🎒', '📸', '🏔️', '🏝️', '🚲', '⛵', '🎧', '🦜']);
const REACCIONES = Object.freeze(['👏', '🔥', '😂', '😮', '💚']);

function crearEstado() {
  return {
    fase: FASES.LOBBY,
    // La sala la abre el primer dispositivo que pulsa "Crear sala". token es secreto: nunca sale en una vista.
    sala: null,
    // id publico -> jugador
    jugadores: new Map(),
    // sessionId (secreto) -> id publico
    porSession: new Map(),
    // Juego en curso, o null
    juego: null,
    // Votacion del siguiente juego, o null
    votacion: null,
    // ids de juegos que ya terminaron (para marcarlos en el menu)
    juegosJugados: [],
    // Destinos que el host dejo en la sesion (null = todos los habilitados). La votacion y el azar eligen entre estos.
    destinos: null,
    // Modo automatico: la respuesta y el ranking avanzan solos
    automatico: true,
    // sockets autenticados como host
    hostSockets: new Set(),
  };
}

module.exports = { FASES, SUBFASES, EQUIPOS, AVATARES, REACCIONES, crearEstado };

// Modelo de estado en memoria. El servidor es la unica fuente de verdad.

const FASES = Object.freeze({
  LOBBY: 'LOBBY',
  MENU: 'MENU',
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
  Object.freeze({ id: 'rojo', nombre: 'Rojo', color: '#e53935', forma: '▲' }),
  Object.freeze({ id: 'azul', nombre: 'Azul', color: '#1e88e5', forma: '●' }),
  Object.freeze({ id: 'verde', nombre: 'Verde', color: '#2e9e4f', forma: '■' }),
  Object.freeze({ id: 'amarillo', nombre: 'Amarillo', color: '#fdd835', forma: '◆' }),
]);

function crearEstado() {
  return {
    fase: FASES.LOBBY,
    // id publico -> jugador
    jugadores: new Map(),
    // sessionId (secreto) -> id publico
    porSession: new Map(),
    // Juego en curso, o null
    juego: null,
    // ids de juegos que ya terminaron (para marcarlos en el menu)
    juegosJugados: [],
    // sockets autenticados como host
    hostSockets: new Set(),
  };
}

module.exports = { FASES, SUBFASES, EQUIPOS, crearEstado };

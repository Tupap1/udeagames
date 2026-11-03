// Registro, equipos, reconexion y expulsion de jugadores.
const crypto = require('node:crypto');
const { EQUIPOS, AVATARES } = require('./estado');

const NOMBRE_MIN = 2;
const NOMBRE_MAX = 20;

// Limpia y valida el nombre. Devuelve { ok, nombre } o { ok:false, error }.
function validarNombre(crudo) {
  if (typeof crudo !== 'string') return { ok: false, error: 'nombre_invalido' };
  const nombre = crudo
    .normalize('NFC')
    .replace(/\p{C}/gu, '') // quita caracteres de control e invisibles
    .replace(/\s+/g, ' ')
    .trim();
  const largo = [...nombre].length; // cuenta caracteres reales, no unidades UTF-16
  if (largo < NOMBRE_MIN) return { ok: false, error: 'nombre_corto' };
  if (largo > NOMBRE_MAX) return { ok: false, error: 'nombre_largo' };
  return { ok: true, nombre };
}

// Clave para comparar nombres sin distinguir mayusculas ni tildes
function claveNombre(nombre) {
  return nombre.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function nombreEnUso(estado, nombre) {
  const clave = claveNombre(nombre);
  for (const j of estado.jugadores.values()) {
    if (claveNombre(j.nombre) === clave) return true;
  }
  return false;
}

// Equipo con menos jugadores; si hay empate, uno al azar entre los empatados.
function elegirEquipo(estado, azar = Math.random) {
  const cuenta = new Map(EQUIPOS.map((e) => [e.id, 0]));
  for (const j of estado.jugadores.values()) {
    cuenta.set(j.equipoId, (cuenta.get(j.equipoId) || 0) + 1);
  }
  const minimo = Math.min(...cuenta.values());
  const candidatos = EQUIPOS.filter((e) => cuenta.get(e.id) === minimo);
  return candidatos[Math.floor(azar() * candidatos.length)].id;
}

// Registra a un jugador nuevo o reconecta a uno existente.
// Devuelve { ok, jugador, reconectado, socketAnterior } o { ok:false, error }.
function unirse(estado, { sessionId, nombre, socketId }, { ahora = Date.now, azar = Math.random } = {}) {
  // 1) Reconexion: el sessionId conocido manda y se ignora el nombre enviado
  if (typeof sessionId === 'string' && estado.porSession.has(sessionId)) {
    const jugador = estado.jugadores.get(estado.porSession.get(sessionId));
    const socketAnterior = jugador.socketId && jugador.socketId !== socketId ? jugador.socketId : null;
    jugador.socketId = socketId;
    jugador.conectado = true;
    jugador.ultimaVez = ahora();
    return { ok: true, jugador, reconectado: true, socketAnterior };
  }

  // 2) Registro nuevo
  const v = validarNombre(nombre);
  if (!v.ok) return v;
  if (nombreEnUso(estado, v.nombre)) return { ok: false, error: 'nombre_en_uso' };

  const jugador = {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    nombre: v.nombre,
    equipoId: elegirEquipo(estado, azar),
    avatar: AVATARES[Math.floor(azar() * AVATARES.length)],
    puntos: 0,
    tiempoMs: 0, // suma de tiempos de respuesta acertada, para desempatar
    sellos: [],
    porJuego: {},
    conectado: true,
    socketId: socketId,
    unidoEn: ahora(),
    ultimaVez: ahora(),
  };
  estado.jugadores.set(jugador.id, jugador);
  estado.porSession.set(jugador.sessionId, jugador.id);
  return { ok: true, jugador, reconectado: false, socketAnterior: null };
}

// Marca como desconectado, solo si el socket que se cae sigue siendo el vigente.
function desconectar(estado, socketId, ahora = Date.now) {
  for (const j of estado.jugadores.values()) {
    if (j.socketId === socketId) {
      j.conectado = false;
      j.socketId = null;
      j.ultimaVez = ahora();
      return j;
    }
  }
  return null;
}

// Elimina al jugador por completo. Devuelve el jugador eliminado o null.
function expulsar(estado, jugadorId) {
  const jugador = estado.jugadores.get(jugadorId);
  if (!jugador) return null;
  estado.jugadores.delete(jugadorId);
  estado.porSession.delete(jugador.sessionId);
  // Si estaba en medio de una ronda, se descarta lo que haya enviado
  if (estado.juego) {
    estado.juego.inputs.delete(jugadorId);
    estado.juego.participantes.delete(jugadorId);
  }
  return jugador;
}

function buscarPorSocket(estado, socketId) {
  for (const j of estado.jugadores.values()) {
    if (j.socketId === socketId) return j;
  }
  return null;
}

module.exports = {
  NOMBRE_MIN,
  NOMBRE_MAX,
  validarNombre,
  unirse,
  desconectar,
  expulsar,
  buscarPorSocket,
  elegirEquipo,
};

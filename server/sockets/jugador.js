// Eventos que envia el celular de un jugador.
// Todos reciben un callback `ack` con { ok, error? }.
const { REACCIONES, FASES } = require('../estado');

const REACCION_CADA_MS = 700; // una reaccion por jugador cada 0,7 s como maximo

function responder(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

function registrarEventosJugador(io, socket, motor, difusion) {
  // jugador:unirse { sessionId?, nombre? } -> registro nuevo o reconexion
  socket.on('jugador:unirse', (datos, ack) => {
    datos = datos && typeof datos === 'object' ? datos : {};
    // Nadie se une hasta que el presentador abre la sala
    if (!motor.estado.sala) return responder(ack, { ok: false, error: 'sin_sala' });
    const r = motor.unirse({
      sessionId: typeof datos.sessionId === 'string' ? datos.sessionId.slice(0, 64) : undefined,
      nombre: datos.nombre,
      socketId: socket.id,
    });
    if (!r.ok) {
      // Sin sessionId valido ni nombre: el cliente debe mostrar el formulario de registro
      return responder(ack, { ok: false, error: r.error });
    }
    socket.data.jugadorId = r.jugador.id;
    // Si el mismo jugador tenia otra pestana abierta, la cerramos para que no compita
    if (r.socketAnterior) {
      const anterior = io.sockets.sockets.get(r.socketAnterior);
      if (anterior) {
        anterior.data.jugadorId = null;
        anterior.emit('sesion_reemplazada');
      }
    }
    responder(ack, { ok: true, sessionId: r.jugador.sessionId, reconectado: r.reconectado });
    difusion.enviarAJugador(r.jugador, { forzar: true });
  });

  // jugador:input { rondaId, valor }
  socket.on('jugador:input', (datos, ack) => {
    const jugadorId = socket.data.jugadorId;
    if (!jugadorId || !datos || typeof datos !== 'object' || typeof datos.rondaId !== 'string') {
      return responder(ack, { ok: false, error: 'input_invalido' });
    }
    const r = motor.procesarInput(jugadorId, datos.rondaId, datos.valor);
    responder(ack, r);
  });

  // jugador:votar { juegoId }
  socket.on('jugador:votar', (datos, ack) => {
    const jugadorId = socket.data.jugadorId;
    if (!jugadorId || !datos || typeof datos !== 'object') return responder(ack, { ok: false, error: 'voto_invalido' });
    responder(ack, motor.votar(jugadorId, String(datos.juegoId)));
  });

  // jugador:avatar { avatar }
  socket.on('jugador:avatar', (datos, ack) => {
    const jugadorId = socket.data.jugadorId;
    if (!jugadorId || !datos || typeof datos !== 'object') return responder(ack, { ok: false, error: 'avatar_invalido' });
    responder(ack, motor.cambiarAvatar(jugadorId, String(datos.avatar)));
  });

  // jugador:reaccion { reaccion } -> sale directo al proyector, no toca el estado
  socket.on('jugador:reaccion', (datos, ack) => {
    const jugador = socket.data.jugadorId && motor.estado.jugadores.get(socket.data.jugadorId);
    const reaccion = datos && typeof datos === 'object' ? datos.reaccion : null;
    if (!jugador || !REACCIONES.includes(reaccion)) return responder(ack, { ok: false, error: 'reaccion_invalida' });
    // Durante un juego no: taparian la pregunta en el proyector
    if (motor.estado.fase === FASES.JUEGO) return responder(ack, { ok: false, error: 'fuera_de_fase' });
    const ahora = Date.now();
    if (ahora - (socket.data.ultimaReaccion || 0) < REACCION_CADA_MS) return responder(ack, { ok: false, error: 'muy_seguido' });
    socket.data.ultimaReaccion = ahora;
    for (const id of motor.estado.hostSockets) {
      io.to(id).emit('reaccion', { reaccion, nombre: jugador.nombre, avatar: jugador.avatar, equipoId: jugador.equipoId });
    }
    responder(ack, { ok: true });
  });

  // reloj:ping -> el cliente calcula la diferencia entre su reloj y el del servidor
  socket.on('reloj:ping', (_datos, ack) => {
    responder(ack, { ok: true, serverNow: Date.now() });
  });

  socket.on('disconnect', () => {
    motor.desconectar(socket.id);
  });
}

module.exports = { registrarEventosJugador };

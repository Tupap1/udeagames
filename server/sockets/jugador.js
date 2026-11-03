// Eventos que envia el celular de un jugador.
// Todos reciben un callback `ack` con { ok, error? }.

function responder(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

function registrarEventosJugador(io, socket, motor, difusion) {
  // jugador:unirse { sessionId?, nombre? } -> registro nuevo o reconexion
  socket.on('jugador:unirse', (datos, ack) => {
    datos = datos && typeof datos === 'object' ? datos : {};
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

  // reloj:ping -> el cliente calcula la diferencia entre su reloj y el del servidor
  socket.on('reloj:ping', (_datos, ack) => {
    responder(ack, { ok: true, serverNow: Date.now() });
  });

  socket.on('disconnect', () => {
    motor.desconectar(socket.id);
  });
}

module.exports = { registrarEventosJugador };

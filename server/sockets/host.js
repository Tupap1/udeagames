// Eventos del host (proyector). Todo requiere haberse autenticado antes con el PIN.
const crypto = require('node:crypto');

function responder(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

// Comparacion en tiempo constante, sin importar el largo de cada texto
function pinCorrecto(recibido, esperado) {
  const a = crypto.createHash('sha256').update(String(recibido)).digest();
  const b = crypto.createHash('sha256').update(String(esperado)).digest();
  return crypto.timingSafeEqual(a, b);
}

const MAX_INTENTOS_FALLIDOS = 5;
const RETRASO_FALLO_MS = 600;

function registrarEventosHost(io, socket, motor, difusion, config) {
  let fallos = 0;

  const exigirHost = (fn) => (datos, ack) => {
    if (!motor.estado.hostSockets.has(socket.id)) return responder(ack, { ok: false, error: 'no_autorizado' });
    const r = fn(datos && typeof datos === 'object' ? datos : {});
    responder(ack, r);
  };

  socket.on('host:autenticar', (datos, ack) => {
    const pin = datos && typeof datos === 'object' ? datos.pin : undefined;
    if (typeof pin === 'string' && pinCorrecto(pin, config.hostPin)) {
      fallos = 0;
      motor.estado.hostSockets.add(socket.id);
      responder(ack, { ok: true });
      difusion.enviarAHost(socket);
      return;
    }
    fallos += 1;
    // Frenamos la fuerza bruta: retraso en cada fallo y corte tras varios intentos
    setTimeout(() => {
      responder(ack, { ok: false, error: 'pin_incorrecto' });
      if (fallos >= MAX_INTENTOS_FALLIDOS) socket.disconnect(true);
    }, RETRASO_FALLO_MS);
  });

  socket.on('host:irAMenu', exigirHost(() => motor.hostIrAMenu()));
  socket.on('host:elegirJuego', exigirHost((d) => motor.hostElegirJuego(String(d.juegoId))));
  socket.on('host:avanzar', exigirHost(() => motor.hostAvanzar()));
  socket.on('host:accionJuego', exigirHost((d) => motor.hostAccion(String(d.nombre), d.datos)));
  socket.on('host:volverAMenu', exigirHost(() => motor.hostVolverAMenu()));
  socket.on('host:mostrarPodio', exigirHost(() => motor.hostMostrarPodio()));

  socket.on('host:expulsar', exigirHost((d) => {
    const r = motor.expulsar(String(d.jugadorId));
    if (r.ok && r.jugador.socketId) {
      const s = io.sockets.sockets.get(r.jugador.socketId);
      if (s) {
        s.data.jugadorId = null;
        s.emit('expulsado', { motivo: 'expulsado' });
      }
    }
    return r.ok ? { ok: true } : r;
  }));

  socket.on('host:reiniciar', exigirHost(() => {
    const r = motor.hostReiniciar();
    for (const id of r.sockets) {
      const s = io.sockets.sockets.get(id);
      if (s) {
        s.data.jugadorId = null;
        s.emit('expulsado', { motivo: 'reinicio' });
      }
    }
    return { ok: true };
  }));

  socket.on('disconnect', () => {
    motor.estado.hostSockets.delete(socket.id);
  });
}

module.exports = { registrarEventosHost, pinCorrecto };

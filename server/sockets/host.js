// Eventos de la sala y del host (proyector).
// El primer dispositivo que pulsa "Crear sala" queda como host y guarda un token para seguir siendolo
// si recarga. El PIN sirve para recuperar el control desde otro dispositivo.
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

  function hacerHost() {
    motor.estado.hostSockets.add(socket.id);
    difusion.enviarAHost(socket);
  }

  // Abre la sala si no existe y avisa a quienes estaban esperando en la pantalla de inicio
  function abrirSala() {
    const r = motor.crearSala();
    if (r.ok) io.emit('sala:abierta');
    return r;
  }

  // Cualquiera puede preguntar si ya hay sala, para saber que pantalla mostrar
  socket.on('sala:estado', (_datos, ack) => {
    responder(ack, { ok: true, abierta: Boolean(motor.estado.sala) });
  });

  socket.on('sala:crear', (_datos, ack) => {
    const r = abrirSala();
    if (!r.ok) return responder(ack, r);
    hacerHost();
    responder(ack, { ok: true, token: r.token });
  });

  // Solo pregunta si el token es el de la sala, sin volverse host (la portada lo usa para redirigir)
  socket.on('host:tokenValido', (datos, ack) => {
    const token = datos && typeof datos === 'object' ? datos.token : undefined;
    responder(ack, { ok: motor.tokenValido(token) });
  });

  // El dispositivo que abrio la sala vuelve con su token (recargo la pagina o se cayo el wifi)
  socket.on('host:reanudar', (datos, ack) => {
    const token = datos && typeof datos === 'object' ? datos.token : undefined;
    if (!motor.tokenValido(token)) return responder(ack, { ok: false, error: 'token_invalido' });
    hacerHost();
    responder(ack, { ok: true });
  });

  // Recuperar el control con el PIN. Si no hay sala, la abre.
  socket.on('host:autenticar', (datos, ack) => {
    const pin = datos && typeof datos === 'object' ? datos.pin : undefined;
    if (typeof pin === 'string' && pinCorrecto(pin, config.hostPin)) {
      fallos = 0;
      if (!motor.estado.sala) abrirSala();
      hacerHost();
      responder(ack, { ok: true, token: motor.estado.sala.token });
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
  socket.on('host:abrirVotacion', exigirHost(() => motor.hostAbrirVotacion()));
  socket.on('host:cerrarVotacion', exigirHost(() => motor.hostCerrarVotacion()));
  socket.on('host:automatico', exigirHost((d) => motor.hostAutomatico(d.activo)));

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

  function sacarJugadores(sockets, motivo) {
    for (const id of sockets) {
      const s = io.sockets.sockets.get(id);
      if (s) {
        s.data.jugadorId = null;
        s.emit('expulsado', { motivo });
      }
    }
  }

  socket.on('host:reiniciar', exigirHost(() => {
    const r = motor.hostReiniciar();
    sacarJugadores(r.sockets, 'reinicio');
    return { ok: true };
  }));

  // Cierra la sala para todos. La siguiente persona que abra el link podra crear una nueva.
  socket.on('host:cerrarSala', exigirHost(() => {
    const r = motor.cerrarSala();
    sacarJugadores(r.sockets, 'sala_cerrada');
    io.emit('sala:cerrada');
    return { ok: true };
  }));

  socket.on('disconnect', () => {
    motor.estado.hostSockets.delete(socket.id);
  });
}

module.exports = { registrarEventosHost, pinCorrecto };

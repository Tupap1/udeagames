// Envia las vistas a los clientes. Agrupa los cambios (60 ms) para no saturar con 40 celulares
// y omite el envio a quien no tiene nada nuevo que ver.
const { crearCache, vistaJugador, vistaHost } = require('../vistas');

const AGRUPAR_MS = 60;

function crearDifusion(io, motor, config) {
  const ultimoEnviado = new Map(); // clave (id de jugador o socket del host) -> JSON enviado
  let pendiente = null;

  function emitir(socketId, clave, vista, forzar) {
    const json = JSON.stringify(vista);
    if (!forzar && ultimoEnviado.get(clave) === json) return;
    ultimoEnviado.set(clave, json);
    // serverNow queda fuera de la comparacion: cambia siempre y no es contenido
    io.to(socketId).emit('vista', { ...vista, serverNow: Date.now() });
  }

  function enviarAJugador(jugador, { forzar = false, cache = crearCache(motor) } = {}) {
    if (!jugador.socketId) return;
    emitir(jugador.socketId, jugador.id, vistaJugador(motor, jugador, cache), forzar);
  }

  function enviarAHost(socket, { forzar = true, cache = crearCache(motor) } = {}) {
    emitir(socket.id, `host:${socket.id}`, vistaHost(motor, cache, config.publicUrl), forzar);
  }

  function difundirAhora() {
    const cache = crearCache(motor);
    const vivos = new Set();
    for (const j of motor.estado.jugadores.values()) {
      vivos.add(j.id);
      enviarAJugador(j, { cache });
    }
    for (const id of motor.estado.hostSockets) {
      const s = io.sockets.sockets.get(id);
      if (s) {
        vivos.add(`host:${id}`);
        enviarAHost(s, { forzar: false, cache });
      }
    }
    // Limpieza de claves de jugadores/hosts que ya no existen
    for (const clave of ultimoEnviado.keys()) if (!vivos.has(clave)) ultimoEnviado.delete(clave);
  }

  function programar() {
    if (pendiente) return;
    pendiente = setTimeout(() => {
      pendiente = null;
      try {
        difundirAhora();
      } catch (err) {
        console.error('[difusion] Error al difundir:', err);
      }
    }, AGRUPAR_MS);
  }

  return { programar, enviarAJugador, enviarAHost, difundirAhora, detener: () => clearTimeout(pendiente) };
}

module.exports = { crearDifusion };

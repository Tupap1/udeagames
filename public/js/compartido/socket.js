// Conexion con el servidor y reloj sincronizado.
// `io` lo define /socket.io/socket.io.js, que sirve el propio servidor (sin CDN).
export function crearConexion() {
  const socket = window.io();
  let desfase = 0; // servidor - cliente, en ms

  function sincronizar() {
    const t0 = Date.now();
    socket.emit('reloj:ping', {}, (r) => {
      if (!r || !r.ok) return;
      const t1 = Date.now();
      // Suponemos que la ida y la vuelta tardan lo mismo
      desfase = r.serverNow - (t0 + t1) / 2;
    });
  }
  socket.on('connect', sincronizar);
  setInterval(() => { if (socket.connected) sincronizar(); }, 20000);

  return {
    socket,
    // Hora del servidor segun nuestro reloj corregido
    ahoraServidor: () => Date.now() + desfase,
  };
}

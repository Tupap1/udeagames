// Limitador sencillo por socket: evita que un cliente inunde al servidor.
// Se descartan los eventos que excedan `max` dentro de `ventanaMs`.
function crearLimitador({ max = 40, ventanaMs = 5000 } = {}) {
  return (socket) => {
    let inicio = Date.now();
    let cuenta = 0;
    socket.use((_paquete, next) => {
      const t = Date.now();
      if (t - inicio > ventanaMs) {
        inicio = t;
        cuenta = 0;
      }
      cuenta += 1;
      if (cuenta > max) return next(new Error('demasiados_eventos'));
      next();
    });
  };
}

module.exports = { crearLimitador };

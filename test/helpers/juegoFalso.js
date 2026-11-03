// Juego falso SOLO para pruebas. No se incluye en el producto ni en games.config.json.
// Cada ronda tiene una respuesta correcta; acertar da 100 puntos.
function crearJuegoFalso({ id = 'falso', rondas = 2, duracionMs = 200 } = {}) {
  return {
    id,
    nombre: 'Juego falso',
    tema: 'prueba',
    descripcion: 'Solo para tests',
    sello: { nombre: 'Sello falso', icono: 'X' },
    duracionActivaMs: duracionMs,
    crearRondas: () => Array.from({ length: rondas }, (_, i) => ({ id: `r${i}`, correcta: 'a' })),
    procesarInput: (_ctx, _jugador, valor) => (valor === 'a' || valor === 'b' ? { ok: true, valor } : { ok: false, error: 'valor_invalido' }),
    puntuar: (ctx) => {
      const puntos = {};
      for (const [id, input] of ctx.inputs) puntos[id] = input.valor === ctx.ronda.correcta ? 100 : 0;
      return puntos;
    },
    vistaHost: (ctx) => ({ ronda: ctx.ronda?.id ?? null }),
    vistaJugador: (ctx) => ({ ronda: ctx.ronda?.id ?? null }),
    acciones: { saludar: () => ({ ok: true }) },
  };
}

function entradaFalsa(modulo) {
  return { id: modulo.id, nombre: modulo.nombre, tema: modulo.tema, descripcion: '', sello: modulo.sello, modulo, contenido: null };
}

module.exports = { crearJuegoFalso, entradaFalsa };

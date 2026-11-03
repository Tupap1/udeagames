// Sobrevive el semestre: situaciones de la vida universitaria, semana a semana. No hay una sola correcta:
// cada opcion vale distinto (la mejor 100, otras menos) y en el celular se ve la energia que llevas.
// No hay bono de rapidez: aqui importa decidir bien, no rapido.
const { SUBFASES } = require('../estado');
const { barajar, exigirTexto, indiceValido, contarOpciones } = require('./_comun');

const RONDAS_MAX = 6;

const estaRevelada = (ctx) => ctx.subfase === SUBFASES.REVELACION || ctx.subfase === SUBFASES.RESULTADOS;

const INSTRUCCIONES = 'Cada escala es una semana del semestre. Elige qué harías: no hay una sola respuesta buena, pero unas te cuidan más que otras. Al final se ve cuánta energía te quedó.';

function validarSituacion(s, i) {
  const etiqueta = `situaciones[${i}]`;
  if (!s || typeof s !== 'object') throw new Error(`${etiqueta}: no es un objeto`);
  if (!Number.isInteger(s.semana) || s.semana < 1 || s.semana > 20) throw new Error(`${etiqueta}: "semana" debe ser un número de 1 a 20`);
  if (!Array.isArray(s.opciones) || s.opciones.length < 2 || s.opciones.length > 4) throw new Error(`${etiqueta}: "opciones" debe tener de 2 a 4`);
  const opciones = s.opciones.map((o, k) => {
    if (!o || !Number.isInteger(o.puntos) || o.puntos < 0 || o.puntos > 100) throw new Error(`${etiqueta}.opciones[${k}]: "puntos" debe ser un entero de 0 a 100`);
    return { texto: exigirTexto(o.texto, `${etiqueta}.opciones[${k}].texto`), puntos: o.puntos };
  });
  return {
    semana: s.semana,
    texto: exigirTexto(s.texto, `${etiqueta}.texto`),
    opciones,
    explicacion: typeof s.explicacion === 'string' ? s.explicacion.trim() : '',
    verificar: s.verificar === true,
  };
}

// Energia del jugador en este juego: lo que lleva sobre lo maximo posible hasta ahora (0 a 100)
function energia(ctx, jugador) {
  const j = ctx.juego;
  const jugadas = j.indiceRonda + (estaRevelada(ctx) ? 1 : 0);
  if (jugadas <= 0) return 100;
  return Math.round(Math.max(0, Math.min(100, ((jugador.porJuego['sobrevive-semestre'] || 0) / (100 * jugadas)) * 100)));
}

module.exports = {
  id: 'sobrevive-semestre',
  nombre: 'Sobrevive el semestre',
  tema: 'Bienestar Universitario',
  descripcion: 'Situaciones de cada semana: unas decisiones te cuidan más que otras.',
  sello: { nombre: 'Sobreviví el semestre', icono: '🎓' },
  contenido: 'sobrevive-semestre.json',
  duracionActivaMs: 25_000,

  // Se eligen al azar pero se juegan en orden de semana, para que se sienta como un semestre
  crearRondas(contenido) {
    const lista = contenido && contenido.situaciones;
    if (!Array.isArray(lista) || lista.length === 0) throw new Error('el contenido necesita una lista "situaciones"');
    const situaciones = lista.map(validarSituacion);
    return barajar(situaciones).slice(0, RONDAS_MAX).sort((a, b) => a.semana - b.semana).map((s, i) => {
      const opciones = barajar(s.opciones);
      const mejor = Math.max(...opciones.map((o) => o.puntos));
      return { id: `r${i}`, ...s, opciones, mejor: opciones.findIndex((o) => o.puntos === mejor) };
    });
  },

  procesarInput(ctx, _jugador, valor) {
    return indiceValido(valor, ctx.ronda.opciones.length) ? { ok: true, valor } : { ok: false, error: 'valor_invalido' };
  },

  puntuar(ctx) {
    const puntos = {};
    for (const [id, input] of ctx.inputs) puntos[id] = ctx.ronda.opciones[input.valor].puntos;
    return puntos;
  },

  // Mientras la ronda esta activa no se publican los puntos de cada opcion
  vistaHost(ctx) {
    const r = ctx.ronda;
    if (!r) return { intro: true, instrucciones: INSTRUCCIONES };
    const vista = { semana: r.semana, texto: r.texto, opciones: r.opciones.map((o) => o.texto), verificar: r.verificar };
    if (estaRevelada(ctx)) {
      Object.assign(vista, { puntosOpciones: r.opciones.map((o) => o.puntos), mejor: r.mejor, explicacion: r.explicacion, conteo: contarOpciones(ctx.inputs, r.opciones.length) });
    }
    return vista;
  },

  vistaJugador(ctx, jugador) {
    const r = ctx.ronda;
    if (!r) return { intro: true, instrucciones: INSTRUCCIONES };
    const input = ctx.inputs.get(jugador.id);
    const vista = { semana: r.semana, texto: r.texto, opciones: r.opciones.map((o) => o.texto), verificar: r.verificar, mi: input ? input.valor : null, energia: energia(ctx, jugador) };
    if (estaRevelada(ctx)) Object.assign(vista, { puntosOpciones: r.opciones.map((o) => o.puntos), mejor: r.mejor, explicacion: r.explicacion });
    return vista;
  },

  generarInputBot: (vista) => Math.floor(Math.random() * ((vista && vista.opciones && vista.opciones.length) || 4)),
};

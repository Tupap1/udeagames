// Ruleta de Bienestar: el host gira la ruleta, sale una categoria y todos responden una
// pregunta de opcion multiple. Acertar da 100 puntos mas hasta 50 de rapidez.
//
// La ruleta es solo teatro: la categoria de cada ronda ya esta decidida en crearRondas (asi
// el servidor reparte las categorias parejo y nadie puede "caer" siempre en la misma).
// El host la gira ANTES de empezar la ronda, durante INTRO o RESULTADOS.
const { SUBFASES } = require('../estado');
const { barajar, exigirTexto, esColor, indiceValido, validarPregunta, barajarOpciones, bonoRapidez, contarOpciones } = require('./_comun');

const RONDAS_MAX = 6;
const PUNTOS_ACIERTO = 100;
const BONO_RAPIDEZ_MAX = 50;

const estaRevelada = (ctx) => ctx.subfase === SUBFASES.REVELACION || ctx.subfase === SUBFASES.RESULTADOS;
const esPrevia = (ctx) => ctx.subfase === SUBFASES.INTRO || ctx.subfase === SUBFASES.RESULTADOS;

const INSTRUCCIONES = 'El host gira la ruleta y sale una categoría de Bienestar. Responde la pregunta antes de que se acabe el tiempo.';

function validarCategoria(c, i) {
  const etiqueta = `categorias[${i}]`;
  if (!c || typeof c !== 'object') throw new Error(`${etiqueta}: no es un objeto`);
  if (!esColor(c.color)) throw new Error(`${etiqueta}: "color" debe ser un hex como #1e88e5`);
  if (!Array.isArray(c.preguntas) || c.preguntas.length === 0) throw new Error(`${etiqueta}: necesita "preguntas"`);
  return {
    id: exigirTexto(c.id, `${etiqueta}.id`),
    nombre: exigirTexto(c.nombre, `${etiqueta}.nombre`),
    icono: typeof c.icono === 'string' ? c.icono : '',
    color: c.color,
    preguntas: c.preguntas.map((p, k) => validarPregunta(p, `${etiqueta}.preguntas[${k}]`)),
  };
}

const rueda = (ctx) => ctx.juego.rondas[0].rueda;

module.exports = {
  id: 'ruleta-bienestar',
  nombre: 'Ruleta de Bienestar',
  tema: 'Bienestar Universitario',
  descripcion: 'Gira la ruleta, sale una categoría y todos responden.',
  sello: { nombre: 'Ruleta de Bienestar', icono: '🎡' },
  contenido: 'ruleta-bienestar.json',
  duracionActivaMs: 20_000,

  crearRondas(contenido) {
    const lista = contenido && contenido.categorias;
    if (!Array.isArray(lista) || lista.length < 2) throw new Error('el contenido necesita al menos 2 "categorias"');
    const categorias = lista.map(validarCategoria);
    const ids = new Set(categorias.map((c) => c.id));
    if (ids.size !== categorias.length) throw new Error('hay ids de categoria repetidos');

    // Las categorias se recorren en un orden al azar, una vuelta tras otra
    const publicas = categorias.map(({ id, nombre, icono, color }) => ({ id, nombre, icono, color }));
    const colas = new Map(categorias.map((c) => [c.id, barajar(c.preguntas)]));
    const orden = barajar(categorias);
    const rondas = [];
    for (let i = 0; rondas.length < RONDAS_MAX && i < RONDAS_MAX * orden.length; i++) {
      const cat = orden[i % orden.length];
      const pregunta = colas.get(cat.id).shift();
      if (!pregunta) continue; // esa categoria ya no tiene preguntas
      const mezcla = barajarOpciones(pregunta.opciones, pregunta.correcta);
      rondas.push({
        id: `r${rondas.length}`,
        categoria: publicas.find((p) => p.id === cat.id),
        rueda: publicas,
        texto: pregunta.texto,
        opciones: mezcla.opciones,
        correcta: mezcla.correcta,
        explicacion: pregunta.explicacion,
        verificar: pregunta.verificar,
      });
    }
    return rondas;
  },

  procesarInput(ctx, _jugador, valor) {
    return indiceValido(valor, ctx.ronda.opciones.length) ? { ok: true, valor } : { ok: false, error: 'valor_invalido' };
  },

  puntuar(ctx) {
    const puntos = {};
    for (const [id, input] of ctx.inputs) {
      puntos[id] = input.valor === ctx.ronda.correcta ? PUNTOS_ACIERTO + bonoRapidez(ctx, input.tMs, BONO_RAPIDEZ_MAX) : 0;
    }
    return puntos;
  },

  // En modo automatico el juego no pasa a la siguiente ronda hasta que el host gire la ruleta
  esperarHost(ctx) {
    const j = ctx.juego;
    const proxima = j.rondas[j.indiceRonda + 1];
    return Boolean(proxima) && !(j.datos.giro && j.datos.giro.rondaId === proxima.id);
  },

  acciones: {
    // El host gira la ruleta para la ronda que viene. Un segundo giro para la misma ronda se ignora.
    girar(ctx) {
      const j = ctx.juego;
      if (!esPrevia(ctx)) return { ok: false, error: 'fuera_de_fase' };
      const proxima = j.rondas[j.indiceRonda + 1];
      if (!proxima) return { ok: false, error: 'sin_mas_rondas' };
      if (j.datos.giro && j.datos.giro.rondaId === proxima.id) return { ok: true };
      j.datos.cuentaGiros = (j.datos.cuentaGiros || 0) + 1;
      j.datos.giro = { rondaId: proxima.id, n: j.datos.cuentaGiros };
      return { ok: true };
    },
  },

  vistaHost(ctx) {
    const j = ctx.juego;
    // Antes de la ronda: ruleta. La categoria del giro solo se publica una vez girada.
    if (esPrevia(ctx)) {
      const proxima = j.rondas[j.indiceRonda + 1] || null;
      const giro = proxima && j.datos.giro && j.datos.giro.rondaId === proxima.id ? j.datos.giro : null;
      return {
        modo: 'rueda',
        rueda: rueda(ctx),
        intro: ctx.subfase === SUBFASES.INTRO,
        instrucciones: INSTRUCCIONES,
        hayProxima: Boolean(proxima),
        giro: giro ? { n: giro.n, categoriaId: proxima.categoria.id } : null,
      };
    }
    const r = ctx.ronda;
    const vista = { modo: 'pregunta', categoria: r.categoria, texto: r.texto, opciones: r.opciones, verificar: r.verificar };
    if (estaRevelada(ctx)) {
      Object.assign(vista, { correcta: r.correcta, explicacion: r.explicacion, conteo: contarOpciones(ctx.inputs, r.opciones.length) });
    }
    return vista;
  },

  vistaJugador(ctx, jugador) {
    const r = ctx.ronda;
    if (!r) return { intro: true, instrucciones: INSTRUCCIONES };
    const input = ctx.inputs.get(jugador.id);
    const mi = input ? input.valor : null;
    const vista = { categoria: r.categoria, texto: r.texto, opciones: r.opciones, verificar: r.verificar, mi };
    if (estaRevelada(ctx)) Object.assign(vista, { correcta: r.correcta, explicacion: r.explicacion });
    return vista;
  },

  generarInputBot: (vista) => Math.floor(Math.random() * ((vista && vista.opciones && vista.opciones.length) || 4)),
};

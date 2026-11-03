// Mito o verdad: aparece una afirmacion y cada jugador decide si es verdad o mito.
// Acertar da 100 puntos mas hasta 50 de rapidez. Fallar o no responder da 0.
const { SUBFASES } = require('../estado');
const { barajar, intercalar, exigirTexto, bonoRapidez } = require('./_comun');

const RONDAS_MAX = 6;
const PUNTOS_ACIERTO = 100;
const BONO_RAPIDEZ_MAX = 50;

const respuestaCorrecta = (ronda) => (ronda.esVerdad ? 'verdad' : 'mito');
const estaRevelada = (ctx) => ctx.subfase === SUBFASES.REVELACION || ctx.subfase === SUBFASES.RESULTADOS;

const INSTRUCCIONES = 'Aparece una afirmación. Desliza a la derecha si es verdad y a la izquierda si es mito. Responder rápido da puntos extra.';

function conteo(ctx) {
  const c = { verdad: 0, mito: 0 };
  for (const input of ctx.inputs.values()) if (input.valor in c) c[input.valor] += 1;
  return c;
}

module.exports = {
  id: 'mito-verdad',
  nombre: 'Mito o verdad',
  tema: 'Bienestar e Internacionalización',
  descripcion: 'Desliza a la derecha si es verdad y a la izquierda si es mito.',
  sello: { nombre: 'Mito o verdad', icono: '🧐' },
  contenido: 'mito-verdad.json',
  duracionActivaMs: 12_000,

  // Mezcla los temas para que no salgan todas las de Bienestar seguidas
  crearRondas(contenido) {
    const lista = contenido && contenido.afirmaciones;
    if (!Array.isArray(lista) || lista.length === 0) throw new Error('el contenido necesita una lista "afirmaciones"');
    const validas = lista.map((a, i) => {
      const etiqueta = `afirmaciones[${i}]`;
      if (!a || typeof a.esVerdad !== 'boolean') throw new Error(`${etiqueta}: "esVerdad" debe ser true o false`);
      return {
        texto: exigirTexto(a.texto, `${etiqueta}.texto`),
        tema: typeof a.tema === 'string' && a.tema.trim() ? a.tema.trim() : 'general',
        esVerdad: a.esVerdad,
        explicacion: typeof a.explicacion === 'string' ? a.explicacion.trim() : '',
        verificar: a.verificar === true,
      };
    });
    const porTema = new Map();
    for (const a of validas) porTema.set(a.tema, [...(porTema.get(a.tema) || []), a]);
    const elegidas = intercalar([...porTema.values()].map((g) => barajar(g))).slice(0, RONDAS_MAX);
    return elegidas.map((a, i) => ({ id: `r${i}`, ...a }));
  },

  procesarInput(_ctx, _jugador, valor) {
    return valor === 'verdad' || valor === 'mito' ? { ok: true, valor } : { ok: false, error: 'valor_invalido' };
  },

  puntuar(ctx) {
    const puntos = {};
    const acertada = respuestaCorrecta(ctx.ronda);
    for (const [id, input] of ctx.inputs) {
      puntos[id] = input.valor === acertada ? PUNTOS_ACIERTO + bonoRapidez(ctx, input.tMs, BONO_RAPIDEZ_MAX) : 0;
    }
    return puntos;
  },

  // Regla de oro: mientras la ronda esta ACTIVA ninguna vista incluye esVerdad ni la explicacion
  vistaHost(ctx) {
    const r = ctx.ronda;
    if (!r) return { intro: true, instrucciones: INSTRUCCIONES };
    const vista = { texto: r.texto, tema: r.tema, verificar: r.verificar };
    if (estaRevelada(ctx)) Object.assign(vista, { esVerdad: r.esVerdad, explicacion: r.explicacion, conteo: conteo(ctx) });
    return vista;
  },

  vistaJugador(ctx, jugador) {
    const r = ctx.ronda;
    if (!r) return { intro: true, instrucciones: INSTRUCCIONES };
    const input = ctx.inputs.get(jugador.id);
    const mi = input ? input.valor : null;
    const vista = { texto: r.texto, tema: r.tema, verificar: r.verificar, mi };
    if (estaRevelada(ctx)) Object.assign(vista, { esVerdad: r.esVerdad, explicacion: r.explicacion, acerte: mi === respuestaCorrecta(r) });
    return vista;
  },

  generarInputBot: () => (Math.random() < 0.5 ? 'verdad' : 'mito'),
};

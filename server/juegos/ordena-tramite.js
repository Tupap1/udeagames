// Ordena el tramite: aparecen los pasos de un proceso desordenados y cada jugador los toca en el orden que cree.
// Cada paso en su lugar suma; si quedan todos bien, ademas hay bono de rapidez.
const { SUBFASES } = require('../estado');
const { barajar, exigirTexto, bonoRapidez } = require('./_comun');

const RONDAS_MAX = 4;
const PUNTOS_POR_PASO_MAX = 100; // se reparten entre los pasos: 4 pasos = 25 cada uno
const BONO_RAPIDEZ_MAX = 50;

const estaRevelada = (ctx) => ctx.subfase === SUBFASES.REVELACION || ctx.subfase === SUBFASES.RESULTADOS;

const INSTRUCCIONES = 'Aparecen los pasos de un trámite en desorden. Tócalos en el orden en que crees que van y envía. Cada paso en su lugar da puntos, y si aciertas todos, la rapidez suma extra.';

// Una respuesta es una permutacion: el orden en que el jugador toco los pasos que se le mostraron
function esPermutacion(valor, n) {
  return Array.isArray(valor) && valor.length === n && valor.every((i) => Number.isInteger(i) && i >= 0 && i < n) && new Set(valor).size === n;
}

// Cuantos pasos quedaron en su lugar. `correcto[k]` es el indice mostrado que va en la posicion k.
const aciertos = (valor, correcto) => valor.reduce((n, mostrado, k) => n + (mostrado === correcto[k] ? 1 : 0), 0);

module.exports = {
  id: 'ordena-tramite',
  nombre: 'Ordena el trámite',
  tema: 'Internacionalización',
  descripcion: 'Pon en orden los pasos de un trámite antes de que se acabe el tiempo.',
  sello: { nombre: 'Trámite en orden', icono: '🗂️' },
  contenido: 'ordena-tramite.json',
  duracionActivaMs: 35_000,

  crearRondas(contenido) {
    const lista = contenido && contenido.tramites;
    if (!Array.isArray(lista) || lista.length === 0) throw new Error('el contenido necesita una lista "tramites"');
    const tramites = lista.map((t, i) => {
      const etiqueta = `tramites[${i}]`;
      if (!t || !Array.isArray(t.pasos) || t.pasos.length < 3 || t.pasos.length > 5) throw new Error(`${etiqueta}: "pasos" debe tener de 3 a 5, en el orden correcto`);
      return {
        titulo: exigirTexto(t.titulo, `${etiqueta}.titulo`),
        pasos: t.pasos.map((p, k) => exigirTexto(p, `${etiqueta}.pasos[${k}]`)),
        explicacion: typeof t.explicacion === 'string' ? t.explicacion.trim() : '',
        verificar: t.verificar === true,
      };
    });
    return barajar(tramites).slice(0, RONDAS_MAX).map((t, i) => {
      // Se barajan hasta que no queden en el orden correcto (si no, el juego se regala)
      let orden = barajar(t.pasos.map((_, k) => k));
      for (let intento = 0; intento < 10 && orden.every((k, pos) => k === pos); intento++) orden = barajar(orden);
      const mostrados = orden.map((k) => t.pasos[k]);
      const correcto = t.pasos.map((_, k) => orden.indexOf(k));
      return { id: `r${i}`, titulo: t.titulo, mostrados, correcto, pasos: t.pasos, explicacion: t.explicacion, verificar: t.verificar };
    });
  },

  procesarInput(ctx, _jugador, valor) {
    return esPermutacion(valor, ctx.ronda.mostrados.length) ? { ok: true, valor: [...valor] } : { ok: false, error: 'valor_invalido' };
  },

  puntuar(ctx) {
    const puntos = {};
    const n = ctx.ronda.correcto.length;
    for (const [id, input] of ctx.inputs) {
      const bien = aciertos(input.valor, ctx.ronda.correcto);
      const base = Math.round((PUNTOS_POR_PASO_MAX / n) * bien);
      puntos[id] = base + (bien === n ? bonoRapidez(ctx, input.tMs, BONO_RAPIDEZ_MAX) : 0);
    }
    return puntos;
  },

  // Al revelar: el orden correcto y que porcentaje acerto cada posicion
  vistaHost(ctx) {
    const r = ctx.ronda;
    if (!r) return { intro: true, instrucciones: INSTRUCCIONES };
    const vista = { titulo: r.titulo, mostrados: r.mostrados, verificar: r.verificar };
    if (estaRevelada(ctx)) {
      const total = ctx.inputs.size;
      const porPosicion = r.correcto.map((mostrado, k) => {
        let n = 0;
        for (const input of ctx.inputs.values()) if (input.valor[k] === mostrado) n++;
        return total ? Math.round((n / total) * 100) : 0;
      });
      let todoBien = 0;
      for (const input of ctx.inputs.values()) if (aciertos(input.valor, r.correcto) === r.correcto.length) todoBien++;
      Object.assign(vista, { pasos: r.pasos, porPosicion, todoBien, explicacion: r.explicacion });
    }
    return vista;
  },

  vistaJugador(ctx, jugador) {
    const r = ctx.ronda;
    if (!r) return { intro: true, instrucciones: INSTRUCCIONES };
    const input = ctx.inputs.get(jugador.id);
    const vista = { titulo: r.titulo, mostrados: r.mostrados, verificar: r.verificar, mi: input ? input.valor : null };
    if (estaRevelada(ctx)) {
      Object.assign(vista, { correcto: r.correcto, aciertos: input ? aciertos(input.valor, r.correcto) : 0, total: r.correcto.length, explicacion: r.explicacion });
    }
    return vista;
  },

  generarInputBot: (vista) => {
    const n = (vista && vista.mostrados && vista.mostrados.length) || 4;
    const orden = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [orden[i], orden[k]] = [orden[k], orden[i]];
    }
    return orden;
  },
};

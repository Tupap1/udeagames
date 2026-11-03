// Adivina el destino: se muestra una pista y el host va soltando mas, de a una.
// Acertar con pocas pistas da mas puntos: 100 base mas 50 por cada pista que NO se habia mostrado.
//
// Las pistas las suelta el host (accion "siguientePista"). Se descarto soltarlas por reloj
// porque la difusion solo envia cuando cambia el estado, y para que un reloj provoque un
// envio habria que modificar el motor. Costo: depende de que el host vaya soltando pistas.
const { SUBFASES } = require('../estado');
const { barajar, exigirTexto, indiceValido, barajarOpciones, contarOpciones } = require('./_comun');

const RONDAS_MAX = 5;
const PUNTOS_BASE = 100;
const PUNTOS_POR_PISTA_NO_USADA = 50;
const OPCIONES_POR_RONDA = 4;

const estaRevelada = (ctx) => ctx.subfase === SUBFASES.REVELACION || ctx.subfase === SUBFASES.RESULTADOS;

const INSTRUCCIONES = 'Hay que adivinar un destino de intercambio. El host muestra una pista a la vez. Mientras menos pistas se hayan mostrado cuando aciertes, más puntos ganas.';

// Pistas visibles ahora mismo en la ronda activa (siempre al menos una)
const pistasVisibles = (ctx) => (ctx.juego.datos.pistas && ctx.juego.datos.pistas[ctx.ronda.id]) || 1;

function vistaComun(ctx) {
  const r = ctx.ronda;
  const reveladas = estaRevelada(ctx);
  const visibles = reveladas ? r.pistas.length : pistasVisibles(ctx);
  return {
    pistas: r.pistas.slice(0, visibles),
    totalPistas: r.pistas.length,
    // Lo que ganaria quien acierte con las pistas que se ven ahora (solo informativo, el servidor recalcula al cerrar)
    puntosPosibles: PUNTOS_BASE + (r.pistas.length - visibles) * PUNTOS_POR_PISTA_NO_USADA,
    opciones: r.opciones,
    verificar: r.verificar,
  };
}

module.exports = {
  id: 'adivina-destino',
  nombre: 'Adivina el destino',
  tema: 'Internacionalización',
  descripcion: 'Pistas que aparecen de a una: gana más quien adivine con menos.',
  sello: { nombre: 'Adivina el destino', icono: '🌎' },
  contenido: 'adivina-destino.json',
  duracionActivaMs: 45_000,

  crearRondas(contenido) {
    const lista = contenido && contenido.destinos;
    if (!Array.isArray(lista) || lista.length < OPCIONES_POR_RONDA) {
      throw new Error(`el contenido necesita al menos ${OPCIONES_POR_RONDA} "destinos"`);
    }
    const destinos = lista.map((d, i) => {
      const etiqueta = `destinos[${i}]`;
      if (!d || !Array.isArray(d.pistas) || d.pistas.length < 2) throw new Error(`${etiqueta}: necesita al menos 2 "pistas"`);
      return {
        nombre: exigirTexto(d.nombre, `${etiqueta}.nombre`),
        pais: typeof d.pais === 'string' ? d.pais.trim() : '',
        pistas: d.pistas.map((p, k) => exigirTexto(p, `${etiqueta}.pistas[${k}]`)),
        verificar: d.verificar === true,
      };
    });
    if (new Set(destinos.map((d) => d.nombre)).size !== destinos.length) throw new Error('hay destinos con el mismo nombre');

    return barajar(destinos).slice(0, RONDAS_MAX).map((d, i) => {
      // La respuesta mas 3 distractores tomados de los demas destinos
      const otros = barajar(destinos.filter((o) => o !== d)).slice(0, OPCIONES_POR_RONDA - 1);
      const mezcla = barajarOpciones([d.nombre, ...otros.map((o) => o.nombre)], 0);
      return { id: `r${i}`, pistas: d.pistas, opciones: mezcla.opciones, correcta: mezcla.correcta, nombre: d.nombre, pais: d.pais, verificar: d.verificar };
    });
  },

  // Se guarda con cuantas pistas a la vista respondio: el puntaje depende de eso
  procesarInput(ctx, _jugador, valor) {
    if (!indiceValido(valor, ctx.ronda.opciones.length)) return { ok: false, error: 'valor_invalido' };
    return { ok: true, valor: { opcion: valor, pistas: pistasVisibles(ctx) } };
  },

  puntuar(ctx) {
    const puntos = {};
    const total = ctx.ronda.pistas.length;
    for (const [id, input] of ctx.inputs) {
      if (input.valor.opcion !== ctx.ronda.correcta) {
        puntos[id] = 0;
        continue;
      }
      const noUsadas = Math.max(0, total - input.valor.pistas);
      puntos[id] = PUNTOS_BASE + noUsadas * PUNTOS_POR_PISTA_NO_USADA;
    }
    return puntos;
  },

  acciones: {
    siguientePista(ctx) {
      const j = ctx.juego;
      if (ctx.subfase !== SUBFASES.ACTIVA || !ctx.ronda) return { ok: false, error: 'fuera_de_fase' };
      const actual = pistasVisibles(ctx);
      if (actual >= ctx.ronda.pistas.length) return { ok: false, error: 'sin_mas_pistas' };
      j.datos.pistas = { ...(j.datos.pistas || {}), [ctx.ronda.id]: actual + 1 };
      return { ok: true };
    },
  },

  vistaHost(ctx) {
    if (!ctx.ronda) return { intro: true, instrucciones: INSTRUCCIONES };
    const r = ctx.ronda;
    const vista = vistaComun(ctx);
    if (estaRevelada(ctx)) {
      Object.assign(vista, { correcta: r.correcta, nombre: r.nombre, pais: r.pais, conteo: contarOpciones(ctx.inputs, r.opciones.length, (v) => v.opcion) });
    }
    return vista;
  },

  vistaJugador(ctx, jugador) {
    if (!ctx.ronda) return { intro: true, instrucciones: INSTRUCCIONES };
    const input = ctx.inputs.get(jugador.id);
    const vista = { ...vistaComun(ctx), mi: input ? input.valor.opcion : null };
    if (estaRevelada(ctx)) Object.assign(vista, { correcta: ctx.ronda.correcta, nombre: ctx.ronda.nombre, pais: ctx.ronda.pais });
    return vista;
  },

  generarInputBot: (vista) => Math.floor(Math.random() * ((vista && vista.opciones && vista.opciones.length) || 4)),
};

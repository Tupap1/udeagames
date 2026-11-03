// Mapa del mundo: aparece el nombre de un destino y cada jugador toca en el mapa donde cree que queda.
// Mientras mas cerca, mas puntos: 250 en el punto exacto y 0 a 4.000 km o mas.
const { SUBFASES } = require('../estado');
const { barajar, exigirTexto } = require('./_comun');
const { aPlano, aGeo, distanciaKm } = require('./_proyeccion');

const RONDAS_MAX = 5;
const PUNTOS_MAX = 250;
const ALCANCE_KM = 4000;

const estaRevelada = (ctx) => ctx.subfase === SUBFASES.REVELACION || ctx.subfase === SUBFASES.RESULTADOS;
const redondear = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

const INSTRUCCIONES = 'Aparece el nombre de un destino. Toca en el mapa del celular dónde crees que queda y confirma. Mientras más cerca, más puntos.';

const puntosPorDistancia = (km) => Math.round(PUNTOS_MAX * Math.max(0, 1 - km / ALCANCE_KM));

function distanciaDe(ronda, valor) {
  return distanciaKm(aGeo(valor.x, valor.y), { lat: ronda.lat, lon: ronda.lon });
}

module.exports = {
  id: 'mapa-mundo',
  nombre: 'Mapa del mundo',
  tema: 'Internacionalización',
  descripcion: 'Toca en el mapa dónde queda cada destino: gana quien quede más cerca.',
  sello: { nombre: 'Vuelta al mundo', icono: '🗺️' },
  contenido: 'mapa-mundo.json',
  duracionActivaMs: 25_000,

  crearRondas(contenido) {
    const lista = contenido && contenido.lugares;
    if (!Array.isArray(lista) || lista.length === 0) throw new Error('el contenido necesita una lista "lugares"');
    const lugares = lista.map((l, i) => {
      const etiqueta = `lugares[${i}]`;
      if (!l || typeof l.lat !== 'number' || l.lat < -58 || l.lat > 84) throw new Error(`${etiqueta}: "lat" debe ser un número entre -58 y 84`);
      if (typeof l.lon !== 'number' || l.lon < -180 || l.lon > 180) throw new Error(`${etiqueta}: "lon" debe ser un número entre -180 y 180`);
      return { nombre: exigirTexto(l.nombre, `${etiqueta}.nombre`), pais: typeof l.pais === 'string' ? l.pais.trim() : '', lat: l.lat, lon: l.lon, verificar: l.verificar === true };
    });
    return barajar(lugares).slice(0, RONDAS_MAX).map((l, i) => ({ id: `r${i}`, ...l, plano: aPlano(l.lon, l.lat) }));
  },

  // El celular manda el punto tocado como x, y entre 0 y 1 sobre la imagen del mapa
  procesarInput(_ctx, _jugador, valor) {
    const ok = valor && typeof valor === 'object' && [valor.x, valor.y].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1);
    return ok ? { ok: true, valor: { x: redondear(valor.x), y: redondear(valor.y) } } : { ok: false, error: 'valor_invalido' };
  },

  puntuar(ctx) {
    const puntos = {};
    for (const [id, input] of ctx.inputs) puntos[id] = puntosPorDistancia(distanciaDe(ctx.ronda, input.valor));
    return puntos;
  },

  // En la ronda activa el proyector no muestra los toques de nadie (para que no se copien)
  vistaHost(ctx) {
    const r = ctx.ronda;
    if (!r) return { intro: true, instrucciones: INSTRUCCIONES };
    const vista = { nombre: r.nombre, verificar: r.verificar };
    if (estaRevelada(ctx)) {
      const marcas = [];
      const cercanos = [];
      for (const [id, input] of ctx.inputs) {
        const jugador = ctx.jugadores.get(id);
        if (!jugador) continue;
        marcas.push({ x: input.valor.x, y: input.valor.y, equipoId: jugador.equipoId });
        cercanos.push({ nombre: jugador.nombre, avatar: jugador.avatar, km: Math.round(distanciaDe(r, input.valor)) });
      }
      cercanos.sort((a, b) => a.km - b.km);
      Object.assign(vista, { pais: r.pais, real: r.plano, marcas, cercanos: cercanos.slice(0, 5) });
    }
    return vista;
  },

  vistaJugador(ctx, jugador) {
    const r = ctx.ronda;
    if (!r) return { intro: true, instrucciones: INSTRUCCIONES };
    const input = ctx.inputs.get(jugador.id);
    const vista = { nombre: r.nombre, verificar: r.verificar, mi: input ? input.valor : null };
    if (estaRevelada(ctx)) Object.assign(vista, { pais: r.pais, real: r.plano, km: input ? Math.round(distanciaDe(r, input.valor)) : null });
    return vista;
  },

  generarInputBot: () => ({ x: Math.random(), y: Math.random() }),
};

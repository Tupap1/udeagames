import { el } from './dom.js';

// Circulo con el color y la forma del equipo
export function insigniaEquipo(equipo, tamano = 'chica') {
  return el('span', {
    class: `insignia ${tamano}`,
    style: { background: equipo.color, color: equipo.id === 'amarillo' ? '#2b1d00' : '#fff' },
    'aria-hidden': 'true',
  }, equipo.forma);
}

// Insignia de viajero que cada jugador elige en la sala de espera
export function avatar(simbolo, clase = '') {
  return el('span', { class: `avatar ${clase}`, 'aria-hidden': 'true' }, simbolo || '🧳');
}

// Barras de ranking por equipos (promedio de puntos por jugador)
export function barrasEquipos(equipos) {
  const maximo = Math.max(1, ...equipos.map((e) => e.promedio));
  return el('div', { class: 'barras' }, equipos.map((e) => el('div', { class: 'fila' },
    el('span', { class: 'nombre' }, insigniaEquipo(e), e.nombre),
    el('div', { class: 'pista' }, el('div', {
      class: 'relleno',
      style: { width: `${Math.max(2, (e.promedio / maximo) * 100)}%`, background: e.color },
    })),
    el('span', { class: 'valor' }, e.promedio),
  )));
}

// Tabla corta de clasificacion individual
export function tablaClasificacion(ranking, { limite = 5, resaltar = null } = {}) {
  return el('ol', { class: 'clasificacion' }, ranking.slice(0, limite).map((r) => el('li', { class: r.id === resaltar ? 'yo' : '' },
    el('span', { class: 'pos mono' }, `${r.posicion}º`),
    avatar(r.avatar),
    el('span', { class: 'nom' }, r.nombre),
    el('span', { class: 'pts mono' }, r.puntos))));
}

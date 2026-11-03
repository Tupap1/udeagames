import { el } from './dom.js';

// Circulo con el color y la forma del equipo
export function insigniaEquipo(equipo, tamano = 'chica') {
  return el('span', {
    class: `insignia ${tamano}`,
    style: { background: equipo.color, color: equipo.id === 'amarillo' ? '#1a1a1a' : '#fff' },
    'aria-hidden': 'true',
  }, equipo.forma);
}

// Barras de ranking por equipos (promedio de puntos por jugador)
export function barrasEquipos(equipos) {
  const maximo = Math.max(1, ...equipos.map((e) => e.promedio));
  return el('div', { class: 'barras' }, equipos.map((e) => el('div', { class: 'fila' },
    el('span', { class: 'nombre' }, `${e.forma} ${e.nombre}`),
    el('div', { class: 'pista' }, el('div', {
      class: 'relleno',
      style: { width: `${Math.max(2, (e.promedio / maximo) * 100)}%`, background: e.color },
    })),
    el('span', { class: 'valor' }, e.promedio),
  )));
}

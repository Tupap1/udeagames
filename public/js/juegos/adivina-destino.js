// Pantallas de Adivina el destino. Las pistas aparecen de a una cuando el host pulsa "Siguiente pista".
import { el } from '../compartido/dom.js';
import { pintarSi, renderJugadorOpciones, renderHostOpciones } from './_comun.js';

const listaPistas = (pistas) => el('ol', { class: 'pistas' }, pistas.map((p) => el('li', {}, p)));

// ---------- Celular ----------

export const jugador = {
  render(cont, j, ctx) {
    renderJugadorOpciones(cont, j, ctx, {
      claveExtra: j.vista.pistas ? j.vista.pistas.length : '',
      encabezado: (v) => el('div', { class: 'juego-opciones' },
        el('p', { class: 'suave', style: { textAlign: 'center' } }, `Pista${v.pistas.length === 1 ? '' : 's'}: ${v.pistas.length} de ${v.totalPistas}`),
        listaPistas(v.pistas)),
      pregunta: () => '¿Qué destino es?',
      pie: (v) => el('p', { class: 'puntos-posibles' }, `Si aciertas ahora ganas hasta ${v.puntosPosibles} puntos`),
    });
  },
};

// ---------- Proyector ----------

let ultimo = null; // { j, ctx } de la ultima vista, para el atajo de teclado

export const host = {
  render(cuerpo, j, ctx) {
    ultimo = { j, ctx };
    renderHostOpciones(cuerpo, j, ctx, {
      claveExtra: j.vista.pistas ? j.vista.pistas.length : '',
      pregunta: () => '¿A qué destino corresponden estas pistas?',
      bajoPregunta: (v) => listaPistas(v.pistas),
      encabezado: (v) => el('span', { class: 'etiqueta-tema' }, `Pista${v.pistas.length === 1 ? '' : 's'}: ${v.pistas.length} de ${v.totalPistas}`),
      controles: (v) => el('div', { class: 'fila-pistas' },
        el('button', {
          class: 'boton', type: 'button', disabled: v.pistas.length >= v.totalPistas, onclick: () => ctx.accion('siguientePista'),
        }, 'Mostrar siguiente pista', el('span', { class: 'atajo' }, 'P')),
        el('span', { class: 'suave' }, `Con esta pista se ganan hasta ${v.puntosPosibles} puntos`)),
      extraRevelada: (v) => el('p', { class: 'destino-revelado' }, `${v.nombre}${v.pais ? `, ${v.pais}` : ''}`),
    });
  },
};

// P suelta la siguiente pista, igual que el boton. Solo si la ronda activa del host esta en pantalla.
document.addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement || !ultimo) return;
  if (ev.key !== 'p' && ev.key !== 'P') return;
  if (!document.querySelector('[data-juego="adivina-destino"] .escena')) return;
  const { j, ctx } = ultimo;
  if (j.subfase === 'ACTIVA' && j.vista.pistas && j.vista.pistas.length < j.vista.totalPistas) ctx.accion('siguientePista');
});

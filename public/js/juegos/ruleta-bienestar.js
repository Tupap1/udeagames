// Pantallas de la Ruleta de Bienestar. La ruleta es solo animacion: el servidor ya decidio la categoria
// y el host la gira antes de empezar cada ronda. Despues es una pregunta de opcion multiple.
import { el } from '../compartido/dom.js';
import { pintarSi, chipCategoria, renderJugadorOpciones, renderHostOpciones, panelResultados } from './_comun.js';

const VUELTAS_EXTRA = 6;
const DURACION_GIRO_MS = 4500;

// ---------- Celular ----------

export const jugador = {
  render(cont, j, ctx) {
    renderJugadorOpciones(cont, j, ctx, { encabezado: (v) => el('div', { style: { textAlign: 'center' } }, chipCategoria(v.categoria)) });
  },
};

// ---------- Proyector ----------

function construirRueda(categorias) {
  const seg = 360 / categorias.length;
  const gradiente = categorias.map((c, i) => `${c.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ');
  const disco = el('div', { class: 'disco', style: { background: `conic-gradient(${gradiente})` } },
    categorias.map((c, i) => el('div', { class: 'seg', style: { transform: `rotate(${(i + 0.5) * seg}deg)` } }, el('span', {}, c.icono || c.nombre.slice(0, 1)))));
  return el('div', { class: 'ruleta' },
    el('div', {},
      el('div', { class: 'rueda' }, el('div', { class: 'puntero' }), disco),
      el('p', { class: 'nombre-categoria', 'data-categoria': '' })),
    el('div', { class: 'zona-der' }));
}

// Deja el segmento `indice` bajo el puntero (arriba). El disco parte de 0 grados, con el segmento 0 a la derecha del puntero.
function posicionar(disco, indice, total, animar) {
  const destino = 360 * VUELTAS_EXTRA - (indice + 0.5) * (360 / total);
  disco.style.transition = animar ? `transform ${DURACION_GIRO_MS}ms cubic-bezier(0.12, 0.62, 0.08, 1)` : 'none';
  disco.style.transform = `rotate(${destino}deg)`;
}

const textoCategoria = (c) => `${c.icono} ${c.nombre}`;

function renderRueda(cuerpo, j, ctx) {
  const v = j.vista;
  const nodo = pintarSi(cuerpo, `rueda|${j.rondaIndice}`, () => construirRueda(v.rueda));
  const disco = nodo.querySelector('.disco');
  const etiqueta = nodo.querySelector('[data-categoria]');

  if (nodo._giroN === undefined) {
    // Primera vez que se pinta esta ruleta. Si ya estaba girada (recarga del host) se muestra sin animar.
    nodo._giroN = v.giro ? v.giro.n : 0;
    if (v.giro) {
      const i = v.rueda.findIndex((c) => c.id === v.giro.categoriaId);
      posicionar(disco, i, v.rueda.length, false);
      etiqueta.textContent = textoCategoria(v.rueda[i]);
    } else {
      etiqueta.textContent = 'Gira la ruleta para saber la categoría';
    }
  } else if (v.giro && nodo._giroN !== v.giro.n) {
    nodo._giroN = v.giro.n;
    const i = v.rueda.findIndex((c) => c.id === v.giro.categoriaId);
    etiqueta.textContent = '…';
    void disco.offsetWidth; // fuerza el calculo de estilos para que la transicion arranque desde la posicion actual
    posicionar(disco, i, v.rueda.length, true);
    clearTimeout(nodo._temporizador);
    nodo._temporizador = setTimeout(() => { etiqueta.textContent = textoCategoria(v.rueda[i]); }, DURACION_GIRO_MS + 100);
  }

  const boton = el('button', {
    class: 'boton', type: 'button', disabled: !v.hayProxima || Boolean(v.giro), onclick: () => ctx.accion('girar'),
  }, v.hayProxima ? '🎡 Girar la ruleta' : 'No quedan más preguntas', v.hayProxima ? el('span', { class: 'atajo' }, 'G') : null);

  // replaceChildren convierte un null en el texto "null": hay que filtrarlos
  nodo.querySelector('.zona-der').replaceChildren(...[
    v.intro ? el('p', { style: { fontSize: '1.4rem' } }, v.instrucciones) : null,
    boton,
    v.giro ? el('p', { class: 'suave' }, 'Pulsa Espacio para mostrar la pregunta.') : null,
    j.subfase === 'RESULTADOS' ? panelResultados(el('div'), j, ctx) : null,
    el('div', { class: 'leyenda' }, v.rueda.map((c) => el('span', { style: { '--color': c.color } }, `${c.icono} ${c.nombre}`))),
  ].filter(Boolean));
}

let ultimo = null; // { j, ctx } de la ultima vista, para el atajo de teclado

export const host = {
  render(cuerpo, j, ctx) {
    ultimo = { j, ctx };
    const v = j.vista;
    if (v.error) return pintarSi(cuerpo, 'error', () => el('p', { class: 'suave' }, 'Algo falló en esta ronda. Puedes avanzar con Espacio.'));
    if (v.modo === 'rueda') return renderRueda(cuerpo, j, ctx);
    return renderHostOpciones(cuerpo, j, ctx, { encabezado: (vista) => chipCategoria(vista.categoria) });
  },
};

// G gira la ruleta, igual que el boton. Solo si la ruleta del host esta en pantalla.
document.addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement || !ultimo) return;
  if (ev.key !== 'g' && ev.key !== 'G') return;
  if (!document.querySelector('[data-juego="ruleta-bienestar"] .ruleta')) return;
  const v = ultimo.j.vista;
  if (v.modo === 'rueda' && v.hayProxima && !v.giro) ultimo.ctx.accion('girar');
});

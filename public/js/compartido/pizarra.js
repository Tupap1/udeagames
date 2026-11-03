// Texto de pizarra de salidas: una celda por letra, con la costura en el medio.
// voltear() hace pasar letras al azar antes de dejar la correcta, como las pizarras de aeropuerto.
import { el } from './dom.js';

const LETRAS = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ0123456789';
const PASO_MS = 42;

const movimientoReducido = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// `max` corta textos largos con "…" para que la fila no se salga de la pizarra
export function textoPizarra(texto, { max = 16 } = {}) {
  let letras = [...String(texto).toLocaleUpperCase('es')];
  if (letras.length > max) letras = [...letras.slice(0, max - 1), '…'];
  return el('span', { class: 'pizarra-texto', role: 'text', 'aria-label': texto },
    letras.map((c) => el('span', { class: `celda${c === ' ' ? ' vacia' : ''}`, 'data-c': c, 'aria-hidden': 'true' }, c === ' ' ? '·' : c)));
}

export function voltear(nodo, { retrasoPorLetra = 1 } = {}) {
  if (!nodo || movimientoReducido()) return;
  const celdas = [...nodo.querySelectorAll('.celda:not(.vacia)')];
  celdas.forEach((celda, i) => {
    const final = celda.dataset.c;
    let pasos = 5 + i * retrasoPorLetra;
    const id = setInterval(() => {
      if (pasos-- <= 0 || !celda.isConnected) {
        clearInterval(id);
        celda.textContent = final;
        return;
      }
      celda.textContent = LETRAS[Math.floor(Math.random() * LETRAS.length)];
    }, PASO_MS);
  });
}

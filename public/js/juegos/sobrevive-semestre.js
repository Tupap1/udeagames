// Pantallas de Sobrevive el semestre. Opcion multiple sin una sola correcta: al revelar se ve cuanto valia
// cada opcion y en el celular baja o sube tu energia.
import { el } from '../compartido/dom.js';
import { renderJugadorOpciones, renderHostOpciones } from './_comun.js';

const chipSemana = (v) => el('span', { class: 'chip-semana mono' }, `Semana ${v.semana}`);
const etiquetasPuntos = (v) => v.puntosOpciones.map((p) => `+${p}`);

function medidorEnergia(valor) {
  const nivel = valor >= 70 ? 'alta' : valor >= 40 ? 'media' : 'baja';
  return el('div', { class: `energia ${nivel}`, role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(valor), 'aria-label': 'Tu energía' },
    el('span', { class: 'energia-texto' }, 'Tu energía'),
    el('span', { class: 'energia-pista' }, el('span', { class: 'energia-relleno', style: { width: `${valor}%` } })),
    el('strong', { class: 'mono' }, `${valor}%`));
}

function resultadoGraduado(j, v) {
  const puntos = j.puntosRonda || 0;
  const titulo = v.mi === null ? 'No alcanzaste a decidir' : puntos >= 100 ? 'Gran decisión' : puntos >= 50 ? 'Nada mal' : 'Eso te costó energía';
  return el('div', { class: `resultado-ronda ${puntos >= 50 ? 'ok' : 'mal'}` },
    el('strong', {}, titulo),
    el('span', {}, `+${puntos} puntos`),
    v.explicacion ? el('p', { class: 'suave' }, v.explicacion) : null);
}

export const jugador = {
  render(cont, j, ctx) {
    renderJugadorOpciones(cont, j, ctx, {
      claveExtra: j.vista.energia,
      encabezado: (v) => el('div', { class: 'juego-opciones' }, chipSemana(v), medidorEnergia(v.energia)),
      correcta: (v) => v.mejor,
      etiquetas: etiquetasPuntos,
      marcarIncorrecta: false,
      resultado: resultadoGraduado,
    });
  },
};

export const host = {
  render(cuerpo, j, ctx) {
    renderHostOpciones(cuerpo, j, ctx, {
      encabezado: chipSemana,
      correcta: (v) => v.mejor,
      etiquetas: etiquetasPuntos,
    });
  },
};

// Pantallas de Ordena el tramite. En el celular se tocan los pasos en el orden que uno cree: cada toque le pone
// el siguiente numero; tocar un paso ya numerado lo quita. Se envia cuando todos tienen numero.
import { el } from '../compartido/dom.js';
import {
  pintarSi, barraTiempo, etiquetaVerificar, pantallaIntroJugador, pantallaIntroHost, panelResultados,
} from './_comun.js';

// ---------- Celular ----------

function construirActiva(j, ctx) {
  const v = j.vista;
  const orden = []; // indices de v.mostrados en el orden en que se tocaron
  let enviando = false;
  const lista = el('div', { class: 'pasos-elegir' });
  const enviar = el('button', { class: 'boton', type: 'button', disabled: true }, 'Enviar orden');
  const borrar = el('button', { class: 'boton secundario', type: 'button' }, 'Borrar');
  const mensaje = el('p', { class: 'error', role: 'alert' });

  function pintar() {
    lista.replaceChildren(...v.mostrados.map((texto, i) => {
      const pos = orden.indexOf(i);
      return el('button', {
        class: `paso-elegir${pos >= 0 ? ' numerado' : ''}`, type: 'button',
        'aria-label': pos >= 0 ? `Paso ${pos + 1}: ${texto}` : texto,
        onclick: () => {
          if (enviando) return;
          if (pos >= 0) orden.splice(pos, 1);
          else orden.push(i);
          pintar();
        },
      }, el('span', { class: 'paso-numero mono', 'aria-hidden': 'true' }, pos >= 0 ? pos + 1 : ''), el('span', {}, texto));
    }));
    enviar.disabled = orden.length !== v.mostrados.length || enviando;
  }

  enviar.addEventListener('click', async () => {
    if (orden.length !== v.mostrados.length || enviando) return;
    enviando = true;
    pintar();
    const r = await ctx.enviarInput(j.rondaId, [...orden]);
    if (r && (r.ok || r.error === 'ya_respondio')) return; // la vista del servidor rehace la pantalla
    enviando = false;
    pintar();
    mensaje.textContent = r && r.error === 'tiempo_agotado' ? 'Se acabó el tiempo.' : 'No se pudo enviar. Intenta de nuevo.';
  });
  borrar.addEventListener('click', () => { if (!enviando) { orden.length = 0; pintar(); } });

  pintar();
  return el('div', { class: 'juego-opciones' },
    el('p', { class: 'pregunta' }, v.titulo),
    el('p', { class: 'suave' }, 'Toca los pasos en el orden en que van. Toca uno numerado para quitarlo.'),
    barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
    lista,
    el('div', { class: 'botones-par' }, borrar, enviar),
    mensaje,
    etiquetaVerificar(v.verificar));
}

function construirRevelada(j) {
  const v = j.vista;
  const puntos = j.puntosRonda || 0;
  return el('div', { class: 'juego-opciones' },
    el('p', { class: 'pregunta' }, v.titulo),
    el('ol', { class: 'pasos-correctos' }, v.correcto.map((mostrado, k) => {
      const bien = v.mi && v.mi[k] === mostrado;
      return el('li', { class: v.mi ? (bien ? 'bien' : 'mal') : '' },
        el('span', { class: 'paso-numero mono' }, k + 1),
        el('span', {}, v.mostrados[mostrado]),
        v.mi ? el('span', { class: 'paso-marca', 'aria-label': bien ? 'En su lugar' : 'En otro lugar' }, bien ? '✓' : '✗') : null);
    })),
    el('div', { class: `resultado-ronda ${v.aciertos === v.total ? 'ok' : 'mal'}` },
      el('strong', {}, v.mi === null ? 'No alcanzaste a enviar' : v.aciertos === v.total ? 'Todo en orden' : `${v.aciertos} de ${v.total} en su lugar`),
      el('span', {}, `+${puntos} puntos`),
      v.explicacion ? el('p', { class: 'suave' }, v.explicacion) : null),
    etiquetaVerificar(v.verificar));
}

export const jugador = {
  render(cont, j, ctx) {
    const v = j.vista;
    if (v.error) return pintarSi(cont, 'error', () => el('p', { class: 'suave' }, 'Algo falló en esta ronda. Espera al presentador.'));
    if (v.intro) return pantallaIntroJugador(cont, j);
    const fase = j.subfase === 'RESULTADOS' ? 'REVELACION' : j.subfase;
    return pintarSi(cont, `${fase}|${j.rondaId}|${j.yaRespondi}`, () => {
      if (fase === 'REVELACION') return construirRevelada(j);
      if (j.yaRespondi) {
        return el('div', { class: 'juego-opciones' },
          el('p', { class: 'pregunta' }, v.titulo),
          barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
          el('ol', { class: 'pasos-correctos' }, v.mi.map((mostrado, k) => el('li', {}, el('span', { class: 'paso-numero mono' }, k + 1), el('span', {}, v.mostrados[mostrado])))),
          el('p', { class: 'suave', style: { textAlign: 'center' } }, 'Orden enviado. Esperando a los demás…'));
      }
      return construirActiva(j, ctx);
    });
  },
};

// ---------- Proyector ----------

export const host = {
  render(cuerpo, j, ctx) {
    const v = j.vista;
    if (v.error) return pintarSi(cuerpo, 'error', () => el('p', { class: 'suave' }, 'Algo falló en esta ronda. Puedes avanzar con Espacio.'));
    if (v.intro) return pantallaIntroHost(cuerpo, v);
    if (j.subfase === 'RESULTADOS') return panelResultados(cuerpo, j, ctx);
    const revelada = j.subfase === 'REVELACION';
    const nodo = pintarSi(cuerpo, `${j.subfase}|${j.rondaId}|${revelada ? v.todoBien : ''}`, () => el('div', { class: 'escena' },
      el('div', { class: 'fila-etiquetas' }, el('span', { class: 'etiqueta-tema' }, revelada ? 'El orden correcto' : 'Ordena los pasos'), etiquetaVerificar(v.verificar)),
      el('p', { class: 'pregunta' }, v.titulo),
      revelada
        ? el('ol', { class: 'pasos-host revelados' }, v.pasos.map((texto, k) => el('li', {},
          el('span', { class: 'paso-numero mono' }, k + 1),
          el('span', { class: 'texto' }, texto),
          el('span', { class: 'porcentaje mono' }, `${v.porPosicion[k]}% acertó`))))
        : el('ul', { class: 'pasos-host' }, v.mostrados.map((texto) => el('li', {}, el('span', { class: 'texto' }, texto)))),
      revelada
        ? el('p', { class: 'explicacion' }, `${v.todoBien} ${v.todoBien === 1 ? 'pasajero lo ordenó' : 'pasajeros lo ordenaron'} completo. ${v.explicacion}`)
        : barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
      revelada ? null : el('p', { class: 'contador-respuestas', 'data-contador': '' })));
    const contador = nodo.querySelector('[data-contador]');
    if (contador) contador.textContent = `Respondieron ${j.respondieron} de ${j.conectados}`;
    return nodo;
  },
};

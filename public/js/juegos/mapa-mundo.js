// Pantallas de Mapa del mundo. El celular manda el punto tocado como x, y entre 0 y 1 sobre la imagen;
// el servidor calcula la distancia. En el celular el mapa es mas ancho que la pantalla y se desliza de lado.
import { el } from '../compartido/dom.js';
import {
  pintarSi, barraTiempo, etiquetaVerificar, pantallaIntroJugador, pantallaIntroHost, panelResultados,
} from './_comun.js';

const COLORES_EQUIPO = { rojo: '#e0483e', azul: '#3d7fe0', verde: '#2fa36b', amarillo: '#f2b233' };

const formatoKm = (km) => `${km.toLocaleString('es-CO')} km`;

// Mapa con marcas encima, posicionadas en porcentaje para que sirvan a cualquier tamaño
function mapa({ marcas = [], clase = '' } = {}) {
  return el('div', { class: `mapa ${clase}` },
    el('img', { src: '/img/mapa-mundo.svg', alt: 'Mapa del mundo', draggable: 'false' }),
    marcas);
}

function marca(punto, clase, etiqueta = null, color = null) {
  return el('span', {
    class: `marca-mapa ${clase}`,
    style: { left: `${punto.x * 100}%`, top: `${punto.y * 100}%`, ...(color ? { background: color } : {}) },
    'aria-hidden': 'true',
  }, etiqueta ? el('span', { class: 'marca-etiqueta' }, etiqueta) : null);
}

// ---------- Celular ----------

function construirActiva(j, ctx) {
  const v = j.vista;
  let punto = null;
  let enviando = false;
  const marcaYo = marca({ x: 0, y: 0 }, 'yo');
  marcaYo.hidden = true;
  const lienzo = mapa({ marcas: [marcaYo], clase: 'tocable' });
  const desliza = el('div', { class: 'mapa-desliza' }, lienzo);
  const confirmar = el('button', { class: 'boton', type: 'button', disabled: true }, 'Confirmar aquí');
  const mensaje = el('p', { class: 'error', role: 'alert' });

  // click (no pointerdown) para que deslizar el mapa no cuente como toque
  lienzo.addEventListener('click', (ev) => {
    if (enviando) return;
    const r = lienzo.getBoundingClientRect();
    punto = { x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) };
    marcaYo.style.left = `${punto.x * 100}%`;
    marcaYo.style.top = `${punto.y * 100}%`;
    marcaYo.hidden = false;
    confirmar.disabled = false;
  });
  confirmar.addEventListener('click', async () => {
    if (!punto || enviando) return;
    enviando = true;
    confirmar.disabled = true;
    const r = await ctx.enviarInput(j.rondaId, punto);
    if (r && (r.ok || r.error === 'ya_respondio')) return;
    enviando = false;
    confirmar.disabled = false;
    mensaje.textContent = r && r.error === 'tiempo_agotado' ? 'Se acabó el tiempo.' : 'No se pudo enviar. Intenta de nuevo.';
  });
  // Arranca centrado en el Atlántico, entre América y Europa
  requestAnimationFrame(() => { desliza.scrollLeft = (desliza.scrollWidth - desliza.clientWidth) * 0.3; });

  return el('div', { class: 'juego-opciones' },
    el('p', { class: 'pregunta' }, `¿Dónde queda ${v.nombre}?`),
    barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
    desliza,
    el('p', { class: 'suave' }, 'Desliza el mapa de lado y toca para marcar. Puedes corregir antes de confirmar.'),
    confirmar,
    mensaje,
    etiquetaVerificar(v.verificar));
}

function construirRevelada(j) {
  const v = j.vista;
  const puntos = j.puntosRonda || 0;
  const marcas = [marca(v.real, 'real', v.nombre)];
  if (v.mi) marcas.unshift(marca(v.mi, 'yo'));
  return el('div', { class: 'juego-opciones' },
    el('p', { class: 'pregunta' }, `${v.nombre}${v.pais ? `, ${v.pais}` : ''}`),
    el('div', { class: 'mapa-desliza' }, mapa({ marcas })),
    el('div', { class: `resultado-ronda ${puntos > 0 ? 'ok' : 'mal'}` },
      el('strong', {}, v.mi === null ? 'No alcanzaste a marcar' : `Quedaste a ${formatoKm(v.km)}`),
      el('span', {}, `+${puntos} puntos`)),
    etiquetaVerificar(v.verificar));
}

export const jugador = {
  render(cont, j, ctx) {
    const v = j.vista;
    if (v.error) return pintarSi(cont, 'error', () => el('p', { class: 'suave' }, 'Algo falló en esta ronda. Espera al presentador.'));
    if (v.intro) return pantallaIntroJugador(cont, j);
    const fase = j.subfase === 'RESULTADOS' ? 'REVELACION' : j.subfase;
    const nodo = pintarSi(cont, `${fase}|${j.rondaId}|${j.yaRespondi}`, () => {
      if (fase === 'REVELACION') return construirRevelada(j);
      if (j.yaRespondi) {
        return el('div', { class: 'juego-opciones' },
          el('p', { class: 'pregunta' }, `¿Dónde queda ${v.nombre}?`),
          barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
          el('div', { class: 'mapa-desliza' }, mapa({ marcas: v.mi ? [marca(v.mi, 'yo')] : [] })),
          el('p', { class: 'suave', style: { textAlign: 'center' } }, 'Marca enviada. Esperando a los demás…'));
      }
      return construirActiva(j, ctx);
    });
    return nodo;
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
    const nodo = pintarSi(cuerpo, `${j.subfase}|${j.rondaId}|${revelada ? v.marcas.length : ''}`, () => {
      const marcas = revelada
        ? [...v.marcas.map((m) => marca(m, 'toque', null, COLORES_EQUIPO[m.equipoId])), marca(v.real, 'real', `${v.nombre}${v.pais ? `, ${v.pais}` : ''}`)]
        : [];
      return el('div', { class: 'escena escena-mapa' },
        el('div', { class: 'fila-etiquetas' },
          el('p', { class: 'pregunta' }, revelada ? `Así quedaron las marcas` : `¿Dónde queda ${v.nombre}?`),
          etiquetaVerificar(v.verificar)),
        el('div', { class: 'mapa-con-lista' },
          mapa({ marcas, clase: 'grande' }),
          revelada
            ? el('aside', { class: 'cercanos' }, el('h2', {}, 'Más cerca'),
              v.cercanos.length
                ? el('ol', { class: 'clasificacion' }, v.cercanos.map((c, i) => el('li', {},
                  el('span', { class: 'pos mono' }, `${i + 1}º`),
                  el('span', { class: 'avatar', 'aria-hidden': 'true' }, c.avatar),
                  el('span', { class: 'nom' }, c.nombre),
                  el('span', { class: 'pts mono' }, formatoKm(c.km)))))
                : el('p', { class: 'suave' }, 'Nadie alcanzó a marcar.'))
            : null),
        revelada ? null : barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
        revelada ? null : el('p', { class: 'contador-respuestas', 'data-contador': '' }));
    });
    const contador = nodo.querySelector('[data-contador]');
    if (contador) contador.textContent = `Respondieron ${j.respondieron} de ${j.conectados}`;
    return nodo;
  },
};

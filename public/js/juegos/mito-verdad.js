// Pantallas de Mito o verdad. El jugador desliza la tarjeta (o toca un boton) y envia 'verdad' o 'mito'.
// No decide nada: el servidor dice si acerto.
import { el } from '../compartido/dom.js';
import { pintarSi, barraTiempo, etiquetaVerificar, bloqueResultado, pantallaIntroJugador, pantallaIntroHost, panelResultados } from './_comun.js';

const NOMBRE = { verdad: 'VERDAD', mito: 'MITO' };

// ---------- Celular ----------

function tarjetaDeslizable(texto, tema, alElegir) {
  const marcaMito = el('span', { class: 'marca mito' }, 'MITO');
  const marcaVerdad = el('span', { class: 'marca verdad' }, 'VERDAD');
  const tarjeta = el('div', { class: 'tarjeta-mito' }, marcaMito, marcaVerdad, el('span', { class: 'etiqueta-tema' }, tema), texto);

  let inicioX = null;
  let dx = 0;
  const umbral = () => Math.max(80, tarjeta.offsetWidth * 0.3);

  function mover() {
    tarjeta.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
    const fuerza = Math.min(1, Math.abs(dx) / umbral());
    marcaVerdad.style.opacity = dx > 0 ? fuerza : 0;
    marcaMito.style.opacity = dx < 0 ? fuerza : 0;
  }
  tarjeta.addEventListener('pointerdown', (ev) => {
    inicioX = ev.clientX;
    tarjeta.setPointerCapture(ev.pointerId);
    tarjeta.classList.add('arrastrando');
  });
  tarjeta.addEventListener('pointermove', (ev) => {
    if (inicioX === null) return;
    dx = ev.clientX - inicioX;
    mover();
  });
  function soltar() {
    if (inicioX === null) return;
    inicioX = null;
    tarjeta.classList.remove('arrastrando');
    if (Math.abs(dx) >= umbral()) {
      const valor = dx > 0 ? 'verdad' : 'mito';
      tarjeta.style.transform = `translateX(${dx > 0 ? 120 : -120}%) rotate(${dx > 0 ? 20 : -20}deg)`;
      alElegir(valor);
    } else {
      dx = 0;
      mover();
    }
  }
  tarjeta.addEventListener('pointerup', soltar);
  tarjeta.addEventListener('pointercancel', soltar);
  return tarjeta;
}

function construirActiva(j, ctx) {
  const v = j.vista;
  let enviado = false;
  const mensaje = el('p', { class: 'error', role: 'alert' });
  const raiz = el('div', { class: 'mito' });

  async function elegir(valor) {
    if (enviado) return;
    enviado = true;
    mensaje.textContent = '';
    const r = await ctx.enviarInput(j.rondaId, valor);
    if (r && (r.ok || r.error === 'ya_respondio')) return; // la vista del servidor confirma y rehace la pantalla
    enviado = false;
    const tarjeta = raiz.querySelector('.tarjeta-mito');
    if (tarjeta) { tarjeta.style.transform = ''; tarjeta.querySelectorAll('.marca').forEach((m) => { m.style.opacity = 0; }); }
    mensaje.textContent = r && r.error === 'tiempo_agotado' ? 'Se acabó el tiempo.' : 'No se pudo enviar. Intenta de nuevo.';
  }

  raiz.append(
    barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
    tarjetaDeslizable(v.texto, v.tema, elegir),
    el('p', { class: 'suave pista-gesto' }, '◀ Desliza a la izquierda si es mito · a la derecha si es verdad ▶'),
    el('div', { class: 'botones-mito' },
      el('button', { class: 'boton mito', type: 'button', onclick: () => elegir('mito') }, '◀ Mito'),
      el('button', { class: 'boton verdad', type: 'button', onclick: () => elegir('verdad') }, 'Verdad ▶')),
    mensaje,
    etiquetaVerificar(v.verificar),
  );
  return raiz;
}

export const jugador = {
  render(cont, j, ctx) {
    const v = j.vista;
    if (v.error) return pintarSi(cont, 'error', () => el('p', { class: 'suave' }, 'Algo falló en esta ronda. Espera al host.'));
    if (v.intro) return pantallaIntroJugador(cont, j);
    const fase = j.subfase === 'RESULTADOS' ? 'REVELACION' : j.subfase;
    return pintarSi(cont, `${fase}|${j.rondaId}|${j.yaRespondi}`, () => {
      if (fase === 'ACTIVA' && !j.yaRespondi) return construirActiva(j, ctx);
      if (fase === 'ACTIVA') {
        return el('div', { class: 'mito' },
          barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
          el('div', { class: 'eleccion-enviada' },
            el('span', { class: 'suave' }, 'Elegiste'), el('strong', {}, NOMBRE[v.mi] || ''),
            el('span', { class: 'suave' }, 'Esperando a los demás…')));
      }
      return el('div', { class: 'mito' },
        el('div', { class: 'tarjeta-mito', style: { cursor: 'default' } },
          el('span', { class: 'etiqueta-tema' }, v.tema), v.texto,
          el('span', { class: `veredicto ${v.esVerdad ? 'verdad' : 'mito'}` }, v.esVerdad ? 'VERDAD' : 'MITO')),
        bloqueResultado(j, v.acerte, v.explicacion),
        etiquetaVerificar(v.verificar));
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
    const nodo = pintarSi(cuerpo, `${j.subfase}|${j.rondaId}`, () => el('div', { class: 'escena' },
      el('div', { class: 'fila-etiquetas' }, el('span', { class: 'etiqueta-tema' }, v.tema), etiquetaVerificar(v.verificar)),
      el('p', { class: 'afirmacion' }, v.texto),
      revelada
        ? el('div', { class: 'escena' },
          el('p', { class: `veredicto ${v.esVerdad ? 'verdad' : 'mito'}` }, v.esVerdad ? 'VERDAD' : 'MITO'),
          v.explicacion ? el('p', { class: 'explicacion' }, v.explicacion) : null,
          el('div', { class: 'conteo-mito' }, el('span', {}, `Dijeron verdad: ${v.conteo.verdad}`), el('span', {}, `Dijeron mito: ${v.conteo.mito}`)))
        : el('div', { class: 'escena' },
          barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
          el('div', { class: 'gestos-host' }, el('span', { class: 'mito' }, '◀ MITO'), el('span', { class: 'verdad' }, 'VERDAD ▶')),
          el('p', { class: 'contador-respuestas', 'data-contador': '' }))));
    const contador = nodo.querySelector('[data-contador]');
    if (contador) contador.textContent = `Respondieron ${j.respondieron} de ${j.conectados}`;
    return nodo;
  },
};

// Piezas que comparten las pantallas de los juegos. El nombre empieza con guion bajo porque
// no es un juego: el host y el jugador solo importan /js/juegos/<id>.js de los ids habilitados.
import { el } from '../compartido/dom.js';
import { barrasEquipos, tablaClasificacion } from '../compartido/componentes.js';

const LETRAS = ['A', 'B', 'C', 'D'];

// El cliente se llama una vez por cada `vista`. Para que el DOM del juego (un gesto a medias,
// una animacion) no se destruya, solo se reconstruye cuando cambia la `clave`.
// La clave vive en el primer hijo, asi si alguien vacia el contenedor la pantalla se rehace sola.
export function pintarSi(contenedor, clave, construir) {
  const actual = contenedor.firstElementChild;
  if (actual && actual.dataset.clave === clave) return actual;
  const nuevo = construir();
  nuevo.dataset.clave = clave;
  contenedor.replaceChildren(nuevo);
  return nuevo;
}

export const etiquetaVerificar = (activa) => (activa ? el('span', { class: 'verificar' }, '[VERIFICAR]') : null);

// Barra que se vacia hasta `finMs` (hora del servidor). Se detiene sola cuando la quitan del DOM.
export function barraTiempo(inicioMs, finMs, ahoraServidor) {
  const relleno = el('div', { class: 'relleno' });
  const segundos = el('span', { class: 'segundos' });
  const barra = el('div', { class: 'barra-tiempo' }, el('div', { class: 'pista' }, relleno), segundos);
  const total = Math.max(1, finMs - inicioMs);
  function actualizar() {
    const restante = Math.max(0, finMs - ahoraServidor());
    relleno.style.width = `${(restante / total) * 100}%`;
    segundos.textContent = `${Math.ceil(restante / 1000)} s`;
    barra.classList.toggle('urgente', restante < 4000);
    return restante;
  }
  actualizar();
  const id = setInterval(() => { if (!barra.isConnected || actualizar() <= 0) clearInterval(id); }, 200);
  return barra;
}

export function chipCategoria(c) {
  return el('span', { class: 'chip-categoria', style: { background: c.color } }, c.icono, c.nombre);
}

// Botones A, B, C, D. `correcta` solo se pasa cuando la ronda ya se revelo.
// `etiquetas` (opcional) pone un texto a la derecha de cada opcion, por ejemplo los puntos que valia.
// Con `marcarIncorrecta: false` la opcion elegida no se pinta de rojo (juegos sin una sola correcta).
export function listaOpciones({ opciones, seleccion = null, correcta = null, bloqueada = false, onElegir, etiquetas = null, marcarIncorrecta = true }) {
  return el('div', { class: 'opciones' }, opciones.map((texto, i) => {
    const clases = ['opcion'];
    if (seleccion === i) clases.push('elegida');
    if (correcta !== null) {
      if (i === correcta) clases.push('correcta');
      else if (seleccion === i && marcarIncorrecta) clases.push('incorrecta');
    }
    return el('button', { class: clases.join(' '), type: 'button', disabled: bloqueada, onclick: () => onElegir && onElegir(i) },
      el('span', { class: 'letra', 'aria-hidden': 'true' }, LETRAS[i]), el('span', { class: 'opcion-texto' }, texto),
      etiquetas ? el('span', { class: 'opcion-etiqueta mono' }, etiquetas[i]) : null);
  }));
}

export function listaOpcionesHost({ opciones, correcta = null, conteo = null, etiquetas = null }) {
  return el('div', { class: 'opciones-host' }, opciones.map((texto, i) => el('div', {
    class: `opcion-host${correcta === i ? ' correcta' : ''}${correcta !== null && correcta !== i && !etiquetas ? ' apagada' : ''}`,
  },
  el('span', { class: 'letra' }, LETRAS[i]), el('span', { class: 'texto' }, texto),
  etiquetas ? el('span', { class: 'etiqueta-puntos mono' }, etiquetas[i]) : null,
  conteo ? el('span', { class: 'conteo' }, conteo[i]) : null)));
}

export function bloqueResultado(j, acerto, explicacion) {
  const mi = j.vista.mi;
  const puntos = j.puntosRonda || 0;
  return el('div', { class: `resultado-ronda ${acerto ? 'ok' : 'mal'}` },
    el('strong', {}, mi === null ? 'No alcanzaste a responder' : acerto ? '¡Correcto!' : 'Esta vez no'),
    el('span', {}, puntos > 0 ? `+${puntos} puntos` : 'Sin puntos en esta ronda'),
    explicacion ? el('p', { class: 'suave' }, explicacion) : null);
}

// ---------- Celular ----------

export function pantallaIntroJugador(cont, j) {
  pintarSi(cont, 'intro', () => el('div', { class: 'estado-grande' },
    el('h1', {}, j.nombre),
    el('p', { class: 'suave' }, j.vista.instrucciones),
    el('p', { class: 'nota' }, 'Mira el proyector: ya casi despegamos.')));
}

// Pantalla de opcion multiple del celular (Ruleta y Adivina el destino la comparten).
// `encabezado(v)` aporta lo propio de cada juego (la categoria o las pistas) y `claveExtra` hace
// que la pantalla se rehaga cuando ese encabezado cambia.
export function renderJugadorOpciones(cont, j, ctx, {
  encabezado, claveExtra = '', pregunta = (v) => v.texto, pie,
  correcta = (v) => v.correcta, etiquetas = null, resultado = null, marcarIncorrecta = true,
}) {
  const v = j.vista;
  if (v.error) return pintarSi(cont, 'error', () => el('p', { class: 'suave' }, 'Algo falló en esta ronda. Espera al host.'));
  if (v.intro) return pantallaIntroJugador(cont, j);
  const fase = j.subfase === 'RESULTADOS' ? 'REVELACION' : j.subfase;
  const clave = `${fase}|${j.rondaId}|${j.yaRespondi}|${claveExtra}`;
  return pintarSi(cont, clave, () => {
    const revelada = fase === 'REVELACION';
    let enviado = j.yaRespondi;
    const zonaOpciones = el('div');
    const mensaje = el('p', { class: 'error', role: 'alert' });
    const pintar = (seleccion) => zonaOpciones.replaceChildren(listaOpciones({
      opciones: v.opciones,
      seleccion,
      correcta: revelada ? correcta(v) : null,
      bloqueada: revelada || enviado,
      onElegir: elegir,
      etiquetas: revelada && etiquetas ? etiquetas(v) : null,
      marcarIncorrecta,
    }));
    async function elegir(i) {
      if (enviado) return;
      enviado = true;
      mensaje.textContent = '';
      pintar(i);
      const r = await ctx.enviarInput(j.rondaId, i);
      if (r && (r.ok || r.error === 'ya_respondio')) return; // la vista del servidor lo confirma
      enviado = false;
      pintar(null);
      mensaje.textContent = r && r.error === 'tiempo_agotado' ? 'Se acabó el tiempo.' : 'No se pudo enviar. Intenta de nuevo.';
    }
    pintar(v.mi);
    return el('div', { class: 'juego-opciones' },
      encabezado ? encabezado(v) : null,
      el('p', { class: 'pregunta' }, pregunta(v)),
      fase === 'ACTIVA' ? barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor) : null,
      zonaOpciones,
      mensaje,
      fase === 'ACTIVA' && j.yaRespondi ? el('p', { class: 'suave', style: { textAlign: 'center' } }, 'Respuesta enviada. Esperando a los demás…') : null,
      pie && fase === 'ACTIVA' && !j.yaRespondi ? pie(v) : null,
      revelada ? (resultado ? resultado(j, v) : bloqueResultado(j, v.mi === correcta(v), v.explicacion)) : null,
      etiquetaVerificar(v.verificar));
  });
}

// ---------- Proyector ----------

export function pantallaIntroHost(cuerpo, v) {
  return pintarSi(cuerpo, 'intro', () => el('div', { class: 'intro-host' },
    el('p', {}, v.instrucciones),
    el('p', { class: 'suave' }, 'Pulsa Espacio cuando todos estén dentro.')));
}

export function panelResultados(cuerpo, j, ctx) {
  const ranking = ctx.ranking || [];
  const clave = `resultados|${j.rondaIndice}|${ranking.slice(0, 5).map((r) => `${r.id}:${r.puntos}`).join(',')}|${ctx.equipos.map((e) => e.promedio).join(',')}`;
  return pintarSi(cuerpo, clave, () => el('div', { class: 'panel-resultados' },
    el('section', {}, el('h2', {}, 'Clasificación'), tablaClasificacion(ranking, { limite: 5 })),
    el('section', {}, el('h2', {}, 'Equipos'), el('p', { class: 'nota' }, 'Promedio de puntos por pasajero'), barrasEquipos(ctx.equipos))));
}

// Pantalla de opcion multiple del proyector.
// `encabezado(v)` y `extraRevelada(v)` aportan lo propio del juego.
export function renderHostOpciones(cuerpo, j, ctx, {
  encabezado, claveExtra = '', pregunta = (v) => v.texto, bajoPregunta, extraRevelada, controles,
  correcta = (v) => v.correcta, etiquetas = null,
}) {
  const v = j.vista;
  if (v.error) return pintarSi(cuerpo, 'error', () => el('p', { class: 'suave' }, 'Algo falló en esta ronda. Puedes avanzar con Espacio.'));
  if (v.intro) return pantallaIntroHost(cuerpo, v);
  if (j.subfase === 'RESULTADOS') return panelResultados(cuerpo, j, ctx);
  const revelada = j.subfase === 'REVELACION';
  const clave = `${j.subfase}|${j.rondaId}|${claveExtra}|${revelada ? JSON.stringify(v.conteo) : ''}`;
  const nodo = pintarSi(cuerpo, clave, () => el('div', { class: 'escena' },
    el('div', { class: 'fila-etiquetas' }, encabezado ? encabezado(v) : el('span'), etiquetaVerificar(v.verificar)),
    el('p', { class: 'pregunta' }, pregunta(v)),
    bajoPregunta ? bajoPregunta(v) : null,
    revelada ? null : barraTiempo(j.inicioActivaMs, j.finActivaMs, ctx.ahoraServidor),
    listaOpcionesHost({
      opciones: v.opciones,
      correcta: revelada ? correcta(v) : null,
      conteo: revelada ? v.conteo : null,
      etiquetas: revelada && etiquetas ? etiquetas(v) : null,
    }),
    revelada && extraRevelada ? extraRevelada(v) : null,
    revelada && v.explicacion ? el('p', { class: 'explicacion' }, v.explicacion) : null,
    revelada ? null : el('p', { class: 'contador-respuestas', 'data-contador': '' }),
    !revelada && controles ? controles(v, ctx) : null));
  const contador = nodo.querySelector('[data-contador]');
  if (contador) contador.textContent = `Respondieron ${j.respondieron} de ${j.conectados}`;
  return nodo;
}

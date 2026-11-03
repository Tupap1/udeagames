// Cliente del host (proyector). Pinta la ultima `vista` y manda las ordenes del host.
import { el, almacen } from './compartido/dom.js';
import { crearConexion } from './compartido/socket.js';
import { insigniaEquipo, barrasEquipos } from './compartido/componentes.js';

const CLAVE_PIN = 'pasaporte.hostPin';
const $ = (id) => document.getElementById(id);
const { socket, ahoraServidor } = crearConexion();

let vista = null;
let autenticado = false;
const modulosJuego = new Map();
const equipoPorId = (id) => (vista?.equipos || []).find((e) => e.id === id);

// ---------- Autenticacion ----------

function autenticar(pin, manual) {
  socket.emit('host:autenticar', { pin }, (r) => {
    if (r && r.ok) {
      autenticado = true;
      almacen.guardar(CLAVE_PIN, pin, 'sessionStorage');
      $('pantalla-pin').hidden = true;
      $('pantalla-host').hidden = false;
      return;
    }
    autenticado = false;
    almacen.borrar(CLAVE_PIN, 'sessionStorage');
    $('pantalla-pin').hidden = false;
    $('pantalla-host').hidden = true;
    $('error-pin').textContent = manual ? 'PIN incorrecto.' : '';
  });
}

socket.on('connect', () => {
  $('estado-conexion').textContent = '';
  const guardado = almacen.leer(CLAVE_PIN, 'sessionStorage');
  if (guardado) autenticar(guardado, false); // reautentica solo tras recargar o reconectar
});
socket.on('disconnect', () => { $('estado-conexion').textContent = 'Sin conexión, reconectando…'; });

$('form-pin').addEventListener('submit', (ev) => {
  ev.preventDefault();
  autenticar($('pin').value, true);
});

socket.on('vista', (v) => {
  vista = v;
  renderizar();
});

// ---------- Ordenes ----------

function enviar(evento, datos = {}) {
  socket.emit(evento, datos, (r) => {
    if (r && !r.ok) console.warn(`[host] ${evento}:`, r.error);
  });
}

// ---------- Pintado ----------

function renderizar() {
  if (!vista || !autenticado) return;
  $('resumen-jugadores').textContent = `${vista.conectados} conectados / ${vista.totalJugadores} jugadores`;
  renderPanelJugadores();
  const esc = $('escenario');
  const ctl = $('controles');
  switch (vista.fase) {
    case 'LOBBY': return renderLobby(esc, ctl);
    case 'MENU': return renderMenu(esc, ctl);
    case 'JUEGO': return renderJuego(esc, ctl);
    case 'PODIO': return renderPodio(esc, ctl);
  }
}

function botonControl(texto, atajo, onclick, clase = '') {
  return el('button', { class: `boton ${clase}`, type: 'button', onclick },
    texto, atajo ? el('span', { class: 'atajo' }, atajo) : null);
}

function chipJugador(j) {
  const eq = equipoPorId(j.equipoId);
  return el('span', { class: `chip${j.conectado ? '' : ' desconectado'}` }, eq ? insigniaEquipo(eq, 'chica') : null, j.nombre);
}

function renderLobby(esc, ctl) {
  esc.replaceChildren(el('div', { class: 'lobby' },
    el('div', {},
      el('div', { class: 'qr-caja' }, el('img', { src: '/qr.svg', alt: 'Código QR para unirse' })),
      el('p', { class: 'url-grande' }, vista.publicUrl.replace(/^https?:\/\//, '')),
    ),
    el('div', {},
      el('h1', { class: 'titulo' }, 'Escanea y juega'),
      el('p', { class: 'suave' }, 'Abre la cámara del celular, escanea el código y escribe tu nombre.'),
      el('p', { class: 'contador-grande', style: { marginTop: '1.2rem' } }, vista.totalJugadores),
      el('p', { class: 'suave' }, vista.totalJugadores === 1 ? 'jugador dentro' : 'jugadores dentro'),
      el('div', { class: 'nube' }, vista.jugadores.map(chipJugador)),
    ),
  ));
  ctl.replaceChildren(botonControl('Ir al menú ▶', 'Espacio', () => enviar('host:irAMenu')));
  atajoPrincipal = () => enviar('host:irAMenu');
}

function renderMenu(esc, ctl) {
  const { juegos } = vista.menu;
  esc.replaceChildren(el('div', { class: 'menu' },
    el('div', {},
      el('h1', { class: 'titulo', style: { marginBottom: '1rem' } }, '¿Qué jugamos?'),
      juegos.length
        ? el('div', { class: 'juegos' }, juegos.map((j) => el('button', {
          class: 'juego-tarjeta', type: 'button', onclick: () => enviar('host:elegirJuego', { juegoId: j.id }),
        },
        el('span', { class: 'tema' }, j.tema),
        el('span', { class: 'nombre' }, j.nombre),
        el('span', { class: 'suave' }, j.descripcion),
        j.jugado ? el('span', { class: 'jugado' }, '✓ Ya jugado') : null)))
        : el('div', { class: 'aviso-vacio' }, 'No hay juegos habilitados. Agrega su id en games.config.json y reinicia el servidor.'),
      el('div', { class: 'mini-qr' },
        el('div', { class: 'qr-caja' }, el('img', { src: '/qr.svg', alt: 'QR' })),
        el('p', { class: 'suave' }, `¿Falta alguien? Que escanee y entre: ${vista.publicUrl.replace(/^https?:\/\//, '')}`)),
    ),
    el('div', {},
      el('h2', { class: 'subtitulo' }, 'Top individual'),
      el('table', { class: 'tabla-ranking' }, el('tbody', {}, vista.ranking.slice(0, 5).map((r) => el('tr', {},
        el('td', {}, `${r.posicion}º`), el('td', {}, r.nombre), el('td', {}, r.puntos))))),
      el('h2', { class: 'subtitulo', style: { marginTop: '1.5rem' } }, 'Equipos'),
      barrasEquipos(vista.equipos),
    ),
  ));
  ctl.replaceChildren(botonControl('Ver podio final 🏆', '', () => enviar('host:mostrarPodio'), 'secundario'));
  atajoPrincipal = null;
}

// Cada juego trae su render de host en /js/juegos/<id>.js
async function renderJuego(esc, ctl) {
  const j = vista.juego;
  const id = j.id;
  const etiquetas = { INTRO: 'Introducción', ACTIVA: 'En juego', REVELACION: 'Respuesta', RESULTADOS: 'Resultados' };
  const textoAvanzar = {
    INTRO: 'Empezar',
    ACTIVA: 'Cerrar ronda',
    REVELACION: 'Ver resultados',
    RESULTADOS: j.rondaIndice + 1 < j.rondaTotal ? 'Siguiente ronda' : 'Terminar juego',
  }[j.subfase];
  const accion = () => enviar('host:avanzar');
  ctl.replaceChildren(
    botonControl('Volver al menú', '', () => { if (confirm('¿Cancelar este juego y volver al menú? Nadie recibirá el sello.')) enviar('host:volverAMenu'); }, 'peligro'),
    botonControl(`${textoAvanzar} ▶`, 'Espacio', accion),
  );
  atajoPrincipal = accion;

  let modulo = modulosJuego.get(id);
  if (!modulo) {
    try {
      if (!/^[a-z0-9-]+$/.test(id)) throw new Error('id invalido');
      modulo = await import(`/js/juegos/${id}.js`);
    } catch {
      modulo = { host: { render: renderJuegoGenerico } };
    }
    modulosJuego.set(id, modulo);
  }
  if (!vista || vista.fase !== 'JUEGO' || vista.juego.id !== id) return;

  // El marco se crea una vez por juego y despues solo se actualiza la cabecera,
  // para que el modulo del juego conserve su propio DOM entre vistas
  if (esc.firstElementChild?.dataset.juego !== id) {
    esc.replaceChildren(el('div', { class: 'marco-juego', 'data-juego': id },
      el('div', { class: 'cabecera-juego' },
        el('h1', { class: 'titulo' }, j.nombre),
        el('span', { class: 'etiqueta', id: 'etiqueta-subfase' }),
        el('span', { class: 'suave', id: 'etiqueta-ronda' })),
      el('div', { class: 'cuerpo-juego', id: 'cuerpo-juego' }),
    ));
  }
  $('etiqueta-subfase').textContent = etiquetas[j.subfase];
  $('etiqueta-ronda').textContent = j.rondaIndice >= 0 ? `Ronda ${j.rondaIndice + 1} de ${j.rondaTotal}` : '';
  modulo.host.render($('cuerpo-juego'), j, {
    accion: (nombre, datos) => enviar('host:accionJuego', { nombre, datos }),
    avanzar: accion,
    ahoraServidor,
    equipos: vista.equipos,
  });
}

function renderJuegoGenerico(cuerpo, j) {
  cuerpo.replaceChildren(
    j.subfase === 'ACTIVA' ? el('p', { class: 'contador-respuestas' }, `Respondieron ${j.respondieron} de ${j.conectados}`) : null,
  );
}

function renderPodio(esc, ctl) {
  const [p1, p2, p3] = vista.podio || [];
  const puesto = (p, clase, medalla) => p
    ? el('div', { class: `puesto ${clase}` }, el('span', { class: 'medalla' }, medalla), el('span', { class: 'nom' }, p.nombre), el('span', { class: 'pts' }, `${p.puntos} pts`))
    : null;
  esc.replaceChildren(
    el('h1', { class: 'titulo', style: { textAlign: 'center' } }, '🏆 Podio final'),
    vista.podio?.length
      ? el('div', { class: 'podio-final' }, puesto(p2, 'p2', '🥈'), puesto(p1, 'p1', '🥇'), puesto(p3, 'p3', '🥉'))
      : el('p', { class: 'suave', style: { textAlign: 'center' } }, 'Aún no hay puntajes.'),
    el('div', { style: { maxWidth: '40rem', margin: '0 auto', width: '100%' } },
      el('h2', { class: 'subtitulo' }, 'Ranking por equipos'), barrasEquipos(vista.equipos)),
  );
  ctl.replaceChildren(botonControl('Volver al menú', '', () => enviar('host:volverAMenu'), 'secundario'));
  atajoPrincipal = null;
}

// ---------- Panel de jugadores (expulsar, reiniciar) ----------

let confirmando = null; // id del jugador pendiente de confirmar expulsion
let temporizadorConfirmacion = null;

function renderPanelJugadores() {
  const lista = $('lista-jugadores');
  lista.replaceChildren(...vista.jugadores.map((j) => {
    const eq = equipoPorId(j.equipoId);
    const pendiente = confirmando === j.id;
    return el('li', {},
      el('span', { class: `punto${j.conectado ? '' : ' off'}`, title: j.conectado ? 'Conectado' : 'Desconectado' }),
      eq ? insigniaEquipo(eq, 'chica') : null,
      el('span', { class: 'nom' }, j.nombre),
      el('span', { class: 'suave' }, `${j.puntos}`),
      el('button', {
        class: `boton chico ${pendiente ? 'peligro' : 'secundario'}`, type: 'button',
        'aria-label': `Expulsar a ${j.nombre}`,
        onclick: () => {
          if (confirmando === j.id) {
            confirmando = null;
            enviar('host:expulsar', { jugadorId: j.id });
          } else {
            confirmando = j.id;
            clearTimeout(temporizadorConfirmacion);
            temporizadorConfirmacion = setTimeout(() => { confirmando = null; renderPanelJugadores(); }, 3000);
            renderPanelJugadores();
          }
        },
      }, pendiente ? '¿Seguro?' : '✕'));
  }));
  if (!vista.jugadores.length) lista.replaceChildren(el('li', { class: 'suave' }, 'Nadie se ha unido todavía.'));
}

const panel = $('panel-jugadores');
const alternarPanel = () => { panel.hidden = !panel.hidden; };
$('btn-jugadores').addEventListener('click', alternarPanel);
$('btn-cerrar-panel').addEventListener('click', () => { panel.hidden = true; });
$('btn-reiniciar').addEventListener('click', () => {
  if (confirm('Esto borra a TODOS los jugadores y puntajes. ¿Reiniciar?')) enviar('host:reiniciar');
});

// ---------- Atajos de teclado ----------

let atajoPrincipal = null;
document.addEventListener('keydown', (ev) => {
  if (!autenticado || ev.target instanceof HTMLInputElement) return;
  if (ev.key === 'j' || ev.key === 'J') alternarPanel();
  if ((ev.key === ' ' || ev.key === 'ArrowRight') && atajoPrincipal && panel.hidden) {
    ev.preventDefault();
    atajoPrincipal();
  }
});

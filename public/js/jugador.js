// Cliente del jugador. No decide nada: muestra la ultima `vista` que manda el servidor
// y envia inputs. Si se cae el internet o recarga, vuelve con su sessionId.
import { el, almacen } from './compartido/dom.js';
import { crearConexion } from './compartido/socket.js';
import { insigniaEquipo, barrasEquipos } from './compartido/componentes.js';

const CLAVE_SESION = 'pasaporte.sessionId';
const CLAVE_NOMBRE = 'pasaporte.nombre';

const MENSAJES_ERROR = {
  nombre_corto: 'El nombre debe tener al menos 2 caracteres.',
  nombre_largo: 'El nombre puede tener máximo 20 caracteres.',
  nombre_en_uso: 'Ese nombre ya está en uso. Prueba con otro.',
  nombre_invalido: 'Escribe tu nombre para entrar.',
};

const $ = (id) => document.getElementById(id);
const pantallas = ['conexion', 'registro', 'aviso', 'principal'];
const { socket, ahoraServidor } = crearConexion();

let vista = null;
let pestana = 'jugar';
let primeraConexion = true;
const modulosJuego = new Map();

function mostrar(nombre) {
  for (const p of pantallas) $(`pantalla-${p}`).hidden = p !== nombre;
}

function mostrarAviso(titulo, texto) {
  $('aviso-titulo').textContent = titulo;
  $('aviso-texto').textContent = texto;
  mostrar('aviso');
}

function mostrarRegistro(mensaje = '') {
  $('error-registro').textContent = mensaje;
  $('btn-entrar').disabled = false;
  const guardado = almacen.leer(CLAVE_NOMBRE);
  if (guardado && !$('nombre').value) $('nombre').value = guardado;
  mostrar('registro');
}

// ---------- Registro y reconexion ----------

function unirse(nombre, manual) {
  socket.emit('jugador:unirse', { sessionId: almacen.leer(CLAVE_SESION) || undefined, nombre }, (r) => {
    if (r && r.ok) {
      almacen.guardar(CLAVE_SESION, r.sessionId);
      if (nombre) almacen.guardar(CLAVE_NOMBRE, nombre);
      // Esperamos la primera vista para pintar; mientras tanto seguimos en "conectando"
      if (vista) mostrar('principal');
      return;
    }
    // La sesion guardada ya no existe (por ejemplo el servidor se reinicio): hay que registrarse
    almacen.borrar(CLAVE_SESION);
    mostrarRegistro(manual ? MENSAJES_ERROR[r?.error] || 'No se pudo entrar. Intenta de nuevo.' : '');
  });
}

socket.on('connect', () => {
  $('banner').hidden = true;
  const habiaSesion = Boolean(almacen.leer(CLAVE_SESION));
  // Si ya estaba escribiendo su nombre, no interrumpimos
  if (habiaSesion || primeraConexion) unirse(undefined, false);
  primeraConexion = false;
});

socket.on('disconnect', () => { $('banner').hidden = false; });

$('form-registro').addEventListener('submit', (ev) => {
  ev.preventDefault();
  $('btn-entrar').disabled = true;
  unirse($('nombre').value, true);
});

socket.on('expulsado', ({ motivo }) => {
  almacen.borrar(CLAVE_SESION);
  vista = null;
  mostrarRegistro(motivo === 'reinicio'
    ? 'El host reinició la dinámica. Regístrate de nuevo.'
    : 'El host te sacó de la dinámica. Puedes volver con otro nombre.');
});

socket.on('sesion_reemplazada', () => {
  vista = null;
  mostrarAviso('Sesión abierta en otro lugar', 'Abriste el juego en otra pestaña. Usa esa o recarga esta página.');
});

socket.on('vista', (v) => {
  vista = v;
  mostrar('principal');
  renderizar();
});

// ---------- Pestanas ----------

function elegirPestana(nueva) {
  pestana = nueva;
  $('tab-jugar').classList.toggle('activa', nueva === 'jugar');
  $('tab-pasaporte').classList.toggle('activa', nueva === 'pasaporte');
  renderizar();
}
$('tab-jugar').addEventListener('click', () => elegirPestana('jugar'));
$('tab-pasaporte').addEventListener('click', () => elegirPestana('pasaporte'));

// ---------- Pintado ----------

function renderizar() {
  if (!vista) return;
  renderCabecera();
  const cont = $('contenido');
  if (vista.fase !== 'JUEGO' || pestana !== 'jugar') delete cont.dataset.juego;
  if (pestana === 'pasaporte') return renderPasaporte(cont);
  switch (vista.fase) {
    case 'LOBBY': return renderLobby(cont);
    case 'MENU': return renderMenu(cont);
    case 'JUEGO': return renderJuego(cont);
    case 'PODIO': return renderPodio(cont);
    default: cont.replaceChildren(el('p', {}, 'Esperando…'));
  }
}

function renderCabecera() {
  const { yo, totalJugadores } = vista;
  $('cabecera').replaceChildren(
    insigniaEquipo(yo.equipo, 'chica'),
    el('div', { class: 'quien' }, el('strong', {}, yo.nombre), el('span', { class: 'suave' }, `Equipo ${yo.equipo.nombre}`)),
    el('div', { class: 'puntos' }, el('strong', {}, `${yo.puntos} pts`), el('span', { class: 'suave' }, `${yo.posicion}º de ${totalJugadores}`)),
  );
}

function renderLobby(cont) {
  const { yo, totalJugadores } = vista;
  cont.replaceChildren(el('div', { class: 'bienvenida' },
    insigniaEquipo(yo.equipo, 'grande'),
    el('h2', {}, `¡Hola, ${yo.nombre}!`),
    el('p', { class: 'equipo-nombre' }, `Equipo ${yo.equipo.nombre}`),
    el('p', { class: 'suave' }, 'Ya estás dentro. Espera a que el host empiece la dinámica.'),
    el('p', { class: 'suave' }, `${totalJugadores} jugador${totalJugadores === 1 ? '' : 'es'} conectado${totalJugadores === 1 ? '' : 's'}`),
  ));
}

function renderMenu(cont) {
  const { yo, totalJugadores, equipos } = vista;
  cont.replaceChildren(
    el('div', { class: 'bienvenida' },
      el('h2', {}, 'El host está eligiendo el siguiente juego'),
      el('p', { class: 'suave' }, 'Mira cómo van mientras esperas.'),
    ),
    el('div', { class: 'tarjeta' }, el('h2', {}, 'Tu posición'),
      el('p', {}, `${yo.posicion}º de ${totalJugadores} · ${yo.puntos} puntos`)),
    equipos ? el('div', { class: 'tarjeta' }, el('h2', {}, 'Equipos (promedio por jugador)'), barrasEquipos(equipos)) : null,
  );
}

// Cada juego trae su propio render en /js/juegos/<id>.js. Si no existe, mostramos algo generico.
async function renderJuego(cont) {
  const id = vista.juego.id;
  let modulo = modulosJuego.get(id);
  if (!modulo) {
    try {
      if (!/^[a-z0-9-]+$/.test(id)) throw new Error('id invalido');
      modulo = await import(`/js/juegos/${id}.js`);
    } catch {
      modulo = { jugador: { render: renderJuegoGenerico } };
    }
    modulosJuego.set(id, modulo);
  }
  // Mientras cargaba el modulo pudo cambiar la vista
  if (!vista || vista.fase !== 'JUEGO' || vista.juego.id !== id || pestana !== 'jugar') return;
  // Al entrar a un juego se limpia el contenedor una vez; despues el modulo conserva su DOM
  if (cont.dataset.juego !== id) {
    cont.replaceChildren();
    cont.dataset.juego = id;
  }
  modulo.jugador.render(cont, vista.juego, {
    yo: vista.yo,
    ahoraServidor,
    enviarInput: (rondaId, valor) => new Promise((res) => socket.emit('jugador:input', { rondaId, valor }, res)),
  });
}

function renderJuegoGenerico(cont, juego) {
  cont.replaceChildren(el('div', { class: 'bienvenida' },
    el('h2', {}, juego.nombre),
    el('p', { class: 'suave' }, `Ronda ${Math.max(juego.rondaIndice + 1, 0)} de ${juego.rondaTotal}`),
  ));
}

function renderPodio(cont) {
  const { yo, podio, equipos, totalJugadores } = vista;
  cont.replaceChildren(
    el('div', { class: 'bienvenida' },
      el('h2', {}, '¡Fin de la dinámica!'),
      el('p', { class: 'equipo-nombre' }, `Quedaste ${yo.posicion}º de ${totalJugadores} con ${yo.puntos} puntos`),
    ),
    podio ? el('div', { class: 'tarjeta' }, el('h2', {}, 'Top 3'),
      el('ol', { class: 'lista-podio' }, podio.map((p) => el('li', { class: p.id === yo.id ? 'yo' : '' },
        el('span', { class: 'pos' }, `${p.posicion}º`), el('span', { class: 'nom' }, p.nombre), el('strong', {}, `${p.puntos}`))))) : null,
    equipos ? el('div', { class: 'tarjeta' }, el('h2', {}, 'Ranking por equipos'), barrasEquipos(equipos)) : null,
  );
}

function renderPasaporte(cont) {
  const { pasaporte, yo } = vista;
  const obtenidos = pasaporte.filter((c) => c.obtenido).length;
  cont.replaceChildren(el('div', { class: 'tarjeta' },
    el('h2', {}, 'Tu pasaporte'),
    pasaporte.length
      ? [el('p', { class: 'suave', style: { marginBottom: '12px' } }, `${obtenidos} de ${pasaporte.length} sellos · participa en cada juego para ganarlos`),
        el('div', { class: 'sellos' }, pasaporte.map((c) => el('div', { class: `sello${c.obtenido ? ' obtenido' : ''}` },
          el('span', { class: 'icono', 'aria-hidden': 'true' }, c.icono),
          el('strong', {}, c.nombre),
          el('span', { class: 'estado' }, c.obtenido ? '¡Sello ganado!' : 'Por ganar'))))]
      : el('p', { class: 'suave' }, `Aún no hay sellos disponibles, ${yo.nombre}. Pronto empiezan los juegos.`),
  ));
}

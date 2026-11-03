// Cliente del jugador. No decide nada: muestra la ultima `vista` que manda el servidor
// y envia inputs. Si se cae el internet o recarga, vuelve con su sessionId.
// Si todavia no hay sala, ofrece crearla: quien la crea pasa a ser el proyector.
import { el, almacen } from './compartido/dom.js';
import { crearConexion } from './compartido/socket.js';
import { insigniaEquipo, barrasEquipos, avatar, tablaClasificacion } from './compartido/componentes.js';

const CLAVE_SESION = 'pasaporte.sessionId';
const CLAVE_NOMBRE = 'pasaporte.nombre';
const CLAVE_TOKEN_HOST = 'pasaporte.hostToken';

const MENSAJES_ERROR = {
  nombre_corto: 'El nombre necesita al menos 2 letras.',
  nombre_largo: 'El nombre puede tener máximo 20 caracteres.',
  nombre_en_uso: 'Ese nombre ya está en la pizarra. Prueba con otro, por ejemplo con tu apellido.',
  nombre_invalido: 'Escribe tu nombre para abordar.',
};

const $ = (id) => document.getElementById(id);
const pantallas = ['conexion', 'sin-sala', 'registro', 'aviso', 'principal'];
const { socket, ahoraServidor } = crearConexion();
const emitir = (evento, datos = {}) => new Promise((res) => socket.emit(evento, datos, (r) => res(r || {})));

let vista = null;
let pestana = 'jugar';
let pantallaActual = 'conexion';
const modulosJuego = new Map();

function mostrar(nombre) {
  pantallaActual = nombre;
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

// ---------- Sala, registro y reconexion ----------

function unirse(nombre, manual) {
  socket.emit('jugador:unirse', { sessionId: almacen.leer(CLAVE_SESION) || undefined, nombre }, (r) => {
    if (r && r.ok) {
      almacen.guardar(CLAVE_SESION, r.sessionId);
      if (nombre) almacen.guardar(CLAVE_NOMBRE, nombre);
      if (vista) mostrar('principal'); // si no, se espera la primera vista
      return;
    }
    if (r && r.error === 'sin_sala') return mostrar('sin-sala');
    // La sesion guardada ya no existe (por ejemplo, el servidor se reinicio): hay que registrarse
    almacen.borrar(CLAVE_SESION);
    mostrarRegistro(manual ? MENSAJES_ERROR[r?.error] || 'No se pudo abordar. Intenta de nuevo.' : '');
  });
}

socket.on('connect', async () => {
  $('banner').hidden = true;
  // Este dispositivo abrio la sala: es el proyector
  const token = almacen.leer(CLAVE_TOKEN_HOST);
  if (token) {
    const r = await emitir('host:tokenValido', { token });
    if (r.ok) return location.replace('/host');
    almacen.borrar(CLAVE_TOKEN_HOST);
  }
  const e = await emitir('sala:estado');
  if (!e.abierta) return mostrar('sin-sala');
  // Si ya estaba escribiendo su nombre, no lo interrumpimos
  if (pantallaActual !== 'registro' || almacen.leer(CLAVE_SESION)) unirse(undefined, false);
});

socket.on('disconnect', () => { $('banner').hidden = false; });

socket.on('sala:abierta', () => {
  if (pantallaActual === 'sin-sala') unirse(undefined, false);
});

socket.on('sala:cerrada', () => {
  almacen.borrar(CLAVE_SESION);
  vista = null;
  mostrar('sin-sala');
});

$('btn-crear-sala').addEventListener('click', async () => {
  const r = await emitir('sala:crear');
  if (r.ok) {
    almacen.guardar(CLAVE_TOKEN_HOST, r.token);
    location.href = '/host';
    return;
  }
  unirse(undefined, false); // otro la abrio primero: este dispositivo entra como jugador
});

$('form-registro').addEventListener('submit', (ev) => {
  ev.preventDefault();
  $('btn-entrar').disabled = true;
  unirse($('nombre').value, true);
});

socket.on('expulsado', ({ motivo }) => {
  almacen.borrar(CLAVE_SESION);
  vista = null;
  if (motivo === 'sala_cerrada') return mostrar('sin-sala');
  mostrarRegistro(motivo === 'reinicio'
    ? 'El presentador reinició la dinámica. Vuelve a abordar.'
    : 'El presentador te sacó de la sala. Puedes volver con otro nombre.');
});

socket.on('sesion_reemplazada', () => {
  vista = null;
  mostrarAviso('Abriste el juego en otra pestaña', 'Sigue jugando desde esa, o recarga esta página para traerlo aquí.');
});

socket.on('vista', (v) => {
  if (!v || v.rol !== 'jugador') return;
  vista = v;
  mostrar('principal');
  renderizar();
});

// ---------- Pestañas ----------

function elegirPestana(nueva) {
  pestana = nueva;
  $('tab-jugar').classList.toggle('activa', nueva === 'jugar');
  $('tab-pasaporte').classList.toggle('activa', nueva === 'pasaporte');
  renderizar();
}
$('tab-jugar').addEventListener('click', () => elegirPestana('jugar'));
$('tab-pasaporte').addEventListener('click', () => elegirPestana('pasaporte'));

// ---------- Pintado ----------

// Solo se reconstruye una pantalla cuando cambia su clave, para no interrumpir un toque a medias
function marco(cont, clave, construir) {
  const actual = cont.firstElementChild;
  if (actual && actual.dataset.clave === clave) return actual;
  const nuevo = construir();
  nuevo.dataset.clave = clave;
  cont.replaceChildren(nuevo);
  return nuevo;
}

function renderizar() {
  if (!vista) return;
  renderCabecera();
  const cont = $('contenido');
  if (vista.fase !== 'JUEGO' || pestana !== 'jugar') delete cont.dataset.juego;
  if (pestana === 'pasaporte') return renderPasaporte(cont);
  switch (vista.fase) {
    case 'LOBBY': return renderLobby(cont);
    case 'MENU': return renderMenu(cont);
    case 'VOTACION': return renderVotacion(cont);
    case 'JUEGO': return renderJuego(cont);
    case 'PODIO': return renderPodio(cont);
    default: cont.replaceChildren(el('p', {}, 'Esperando…'));
  }
}

function renderCabecera() {
  const { yo, totalJugadores } = vista;
  $('cabecera').replaceChildren(
    avatar(yo.avatar),
    el('div', { class: 'quien' },
      el('strong', {}, yo.nombre),
      el('span', { class: 'zona' }, insigniaEquipo(yo.equipo, 'chica'), `Zona ${yo.equipo.nombre.toLowerCase()}`)),
    el('div', { class: 'puntos' },
      el('strong', { class: 'mono' }, yo.puntos),
      el('span', {}, `${yo.posicion}º de ${totalJugadores}`)),
  );
}

// Reacciones que salen en el proyector. Se pueden mandar en la sala de espera y entre juegos.
function filaReacciones() {
  return el('section', { class: 'bloque' },
    el('h2', {}, 'Saluda en la pantalla'),
    el('div', { class: 'reacciones' }, vista.catalogo.reacciones.map((r) => el('button', {
      class: 'boton-reaccion', type: 'button', 'aria-label': `Enviar ${r}`,
      onclick: async (ev) => {
        const b = ev.currentTarget;
        b.classList.remove('enviada');
        void b.offsetWidth; // reinicia la animacion de confirmacion
        b.classList.add('enviada');
        await emitir('jugador:reaccion', { reaccion: r });
      },
    }, r))));
}

function paseDeAbordar() {
  const { yo } = vista;
  return el('article', { class: 'pase' },
    el('header', { class: 'pase-cabecera' },
      el('span', {}, 'Pase de abordar'),
      el('span', { class: 'mono' }, 'VLU 2026')),
    el('div', { class: 'pase-cuerpo' },
      el('div', {},
        el('span', { class: 'pase-etiqueta' }, 'Pasajero'),
        el('strong', { class: 'pase-nombre' }, yo.nombre)),
      el('span', { class: 'pase-insignia' }, yo.avatar)),
    el('dl', { class: 'pase-datos' },
      el('div', {}, el('dt', {}, 'Zona'), el('dd', {}, insigniaEquipo(yo.equipo, 'chica'), yo.equipo.nombre)),
      el('div', {}, el('dt', {}, 'Puerta'), el('dd', { class: 'mono' }, 'U1')),
      el('div', {}, el('dt', {}, 'Estado'), el('dd', {}, 'A bordo'))));
}

function renderLobby(cont) {
  const { yo, totalJugadores, catalogo } = vista;
  marco(cont, `lobby|${yo.avatar}|${yo.equipo.id}|${totalJugadores}`, () => el('div', { class: 'pila' },
    paseDeAbordar(),
    el('section', { class: 'bloque' },
      el('h2', {}, 'Elige tu insignia de viajero'),
      el('div', { class: 'insignias', role: 'radiogroup', 'aria-label': 'Insignia de viajero' }, catalogo.avatares.map((a) => el('button', {
        class: `insignia-opcion${a === yo.avatar ? ' elegida' : ''}`, type: 'button', role: 'radio',
        'aria-checked': a === yo.avatar ? 'true' : 'false', 'aria-label': `Insignia ${a}`,
        onclick: () => emitir('jugador:avatar', { avatar: a }),
      }, a)))),
    filaReacciones(),
    el('p', { class: 'nota centrada' }, `${totalJugadores} ${totalJugadores === 1 ? 'pasajero' : 'pasajeros'} a bordo. El presentador empieza pronto.`)));
}

function renderMenu(cont) {
  const { yo, equipos } = vista;
  marco(cont, `menu|${yo.puntos}|${yo.posicion}|${equipos.map((e) => e.promedio).join(',')}`, () => el('div', { class: 'pila' },
    el('div', { class: 'estado-grande' },
      el('h1', {}, 'Escala en tierra'),
      el('p', { class: 'suave' }, 'El presentador está eligiendo el próximo destino.')),
    el('section', { class: 'bloque' }, el('h2', {}, 'Tu equipo frente a los demás'), barrasEquipos(equipos)),
    filaReacciones()));
}

function renderVotacion(cont) {
  const v = vista.votacion;
  const clave = `votacion|${v.inicioMs}|${v.miVoto}|${v.cerrada}`;
  marco(cont, clave, () => {
    const elegido = v.opciones.find((o) => o.id === v.ganador);
    return el('div', { class: 'pila' },
      el('div', { class: 'estado-grande' },
        el('h1', {}, v.cerrada ? 'Votación cerrada' : '¿A dónde vamos?'),
        el('p', { class: 'suave' }, v.cerrada
          ? (elegido ? `El destino elegido es ${elegido.nombre}.` : 'Hubo empate. Decide el presentador.')
          : 'Vota el próximo destino. Puedes cambiar tu voto mientras siga abierta.')),
      v.cerrada ? null : cuentaRegresiva(v.inicioMs, v.finMs),
      el('div', { class: 'opciones-voto' }, v.opciones.map((o) => el('button', {
        class: `opcion-voto${v.miVoto === o.id ? ' elegida' : ''}${v.cerrada && v.ganador === o.id ? ' ganadora' : ''}`,
        type: 'button',
        disabled: v.cerrada,
        'aria-pressed': v.miVoto === o.id ? 'true' : 'false',
        onclick: () => emitir('jugador:votar', { juegoId: o.id }),
      },
      el('span', { class: 'voto-nombre' }, o.nombre),
      el('span', { class: 'voto-tema' }, o.tema),
      v.miVoto === o.id ? el('span', { class: 'voto-marca' }, 'Tu voto') : null))));
  });
}

function cuentaRegresiva(inicioMs, finMs) {
  const relleno = el('span', { class: 'cuenta-relleno' });
  const seg = el('span', { class: 'cuenta-seg mono' });
  const barra = el('div', { class: 'cuenta' }, el('span', { class: 'cuenta-pista' }, relleno), seg);
  const total = Math.max(1, finMs - inicioMs);
  const tic = () => {
    const resta = Math.max(0, finMs - ahoraServidor());
    relleno.style.width = `${(resta / total) * 100}%`;
    seg.textContent = `${Math.ceil(resta / 1000)} s`;
    return resta;
  };
  tic();
  const id = setInterval(() => { if (!barra.isConnected || tic() <= 0) clearInterval(id); }, 200);
  return barra;
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
  cont.replaceChildren(el('div', { class: 'estado-grande' },
    el('h1', {}, juego.nombre),
    el('p', { class: 'suave' }, `Escala ${Math.max(juego.rondaIndice + 1, 0)} de ${juego.rondaTotal}`),
  ));
}

function renderPodio(cont) {
  const { yo, podio, equipos, totalJugadores } = vista;
  marco(cont, `podio|${yo.puntos}|${(podio || []).map((p) => p.id).join(',')}`, () => el('div', { class: 'pila' },
    el('div', { class: 'estado-grande' },
      el('h1', {}, 'Llegamos'),
      el('p', { class: 'suave' }, `Terminaste en el puesto ${yo.posicion} de ${totalJugadores}, con ${yo.puntos} puntos.`)),
    podio && podio.length ? el('section', { class: 'bloque' }, el('h2', {}, 'Podio'), tablaClasificacion(podio, { limite: 6, resaltar: yo.id })) : null,
    equipos ? el('section', { class: 'bloque' }, el('h2', {}, 'Equipos'), barrasEquipos(equipos)) : null));
}

// ---------- Pasaporte con sellos ----------

const GIROS_SELLO = [-9, 6, -4, 8, -6, 3];
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// Linea de lectura mecanica del pasaporte (la de los simbolos <)
function lineaMecanica(nombre) {
  const limpio = nombre.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, '<');
  return `P<UDEA${limpio}`.padEnd(32, '<').slice(0, 32);
}

function renderPasaporte(cont) {
  const { pasaporte, yo } = vista;
  const obtenidos = pasaporte.filter((c) => c.obtenido).length;
  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2, '0')} ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`;
  marco(cont, `pasaporte|${pasaporte.map((c) => `${c.juegoId}${c.obtenido}`).join(',')}|${yo.avatar}`, () => el('article', { class: 'pagina-pasaporte' },
    el('header', { class: 'pagina-cabecera' },
      el('div', {},
        el('span', { class: 'pase-etiqueta' }, 'Pasaporte UdeA'),
        el('strong', { class: 'pase-nombre' }, yo.nombre)),
      el('span', { class: 'pase-insignia' }, yo.avatar)),
    el('p', { class: 'pagina-resumen' }, pasaporte.length
      ? `${obtenidos} de ${pasaporte.length} sellos. Cada juego en el que participas te deja su sello.`
      : 'Todavía no hay destinos habilitados.'),
    el('div', { class: 'sellos' }, pasaporte.map((c, i) => c.obtenido
      ? el('div', { class: 'sello', style: { '--giro': `${GIROS_SELLO[i % GIROS_SELLO.length]}deg` } },
        el('span', { class: 'sello-icono', 'aria-hidden': 'true' }, c.icono),
        el('strong', {}, c.nombre),
        el('span', { class: 'sello-fecha mono' }, fecha))
      : el('div', { class: 'sello pendiente' },
        el('strong', {}, c.nombre),
        el('span', {}, 'Sin sello')))),
    el('p', { class: 'linea-mecanica mono', 'aria-hidden': 'true' }, lineaMecanica(yo.nombre))));
}

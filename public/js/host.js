// Cliente del proyector. Pinta la ultima `vista` y manda las ordenes del host.
// Este computador es el host porque abrio la sala: guarda un token para seguir siendolo si recarga.
import { el, almacen } from './compartido/dom.js';
import { crearConexion } from './compartido/socket.js';
import { insigniaEquipo, barrasEquipos, avatar, tablaClasificacion } from './compartido/componentes.js';
import { textoPizarra, voltear } from './compartido/pizarra.js';

const CLAVE_TOKEN = 'pasaporte.hostToken';
const $ = (id) => document.getElementById(id);
const { socket, ahoraServidor } = crearConexion();

let vista = null;
let autenticado = false;
const modulosJuego = new Map();
const equipoPorId = (id) => (vista?.equipos || []).find((e) => e.id === id);
const emitir = (evento, datos = {}) => new Promise((res) => socket.emit(evento, datos, (r) => res(r || {})));

// ---------- Acceso: crear sala, volver con el token o tomar el control con el PIN ----------

function mostrarAcceso(modo) {
  autenticado = false;
  $('pantalla-acceso').hidden = false;
  $('pantalla-host').hidden = true;
  $('btn-crear-sala').hidden = modo !== 'crear';
  $('form-pin').hidden = modo !== 'pin';
  if (modo === 'crear') {
    $('acceso-titulo').textContent = 'Abre la sala';
    $('acceso-texto').textContent = 'Este computador quedará como proyector. Tus compañeros entran escaneando el código que aparece en pantalla.';
  } else {
    $('acceso-titulo').textContent = 'La sala ya está abierta';
    $('acceso-texto').textContent = 'La abrió otro computador. Si eres el presentador, escribe el PIN para mover el proyector a este equipo.';
    setTimeout(() => $('pin').focus(), 50);
  }
}

function entrar(token) {
  if (token) almacen.guardar(CLAVE_TOKEN, token);
  autenticado = true;
  $('pantalla-acceso').hidden = true;
  $('pantalla-host').hidden = false;
  renderizar();
}

socket.on('connect', async () => {
  $('estado-conexion').textContent = '';
  const token = almacen.leer(CLAVE_TOKEN);
  if (token) {
    const r = await emitir('host:reanudar', { token });
    if (r.ok) return entrar();
    almacen.borrar(CLAVE_TOKEN);
  }
  const e = await emitir('sala:estado');
  mostrarAcceso(e.abierta ? 'pin' : 'crear');
});
socket.on('disconnect', () => { $('estado-conexion').textContent = 'Sin conexión. Reconectando…'; });
socket.on('sala:cerrada', () => {
  almacen.borrar(CLAVE_TOKEN);
  vista = null;
  mostrarAcceso('crear');
});

$('btn-crear-sala').addEventListener('click', async () => {
  const r = await emitir('sala:crear');
  if (r.ok) return entrar(r.token);
  mostrarAcceso('pin'); // otro computador la abrio primero
});

$('form-pin').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const r = await emitir('host:autenticar', { pin: $('pin').value });
  if (r.ok) return entrar(r.token);
  $('error-pin').textContent = 'Ese PIN no es. Revisa el que aparece en la consola del servidor.';
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

let atajoPrincipal = null;

function renderizar() {
  if (!vista || !autenticado) return;
  $('resumen-jugadores').textContent = `${vista.conectados} a bordo`;
  renderPanelJugadores();
  const esc = $('escenario');
  const ctl = $('controles');
  esc.dataset.fase = vista.fase;
  if (vista.fase === 'JUEGO') $('capa-reacciones').replaceChildren(); // nada tapa la pregunta
  switch (vista.fase) {
    case 'LOBBY': return renderLobby(esc, ctl);
    case 'MENU': return renderMenu(esc, ctl);
    case 'VOTACION': return renderVotacion(esc, ctl);
    case 'JUEGO': return renderJuego(esc, ctl);
    case 'PODIO': return renderPodio(esc, ctl);
  }
}

// replaceChildren convierte un null en el texto "null": los controles opcionales se filtran antes
const poner = (nodo, ...hijos) => nodo.replaceChildren(...hijos.filter(Boolean));

function botonControl(texto, atajo, onclick, clase = '') {
  return el('button', { class: `boton ${clase}`, type: 'button', onclick },
    texto, atajo ? el('span', { class: 'atajo' }, atajo) : null);
}

// Las pantallas grandes se construyen una vez y luego solo se actualizan sus partes,
// para que la pizarra no vuelva a voltear cada vez que alguien hace algo.
function marco(esc, nombre, construir) {
  const actual = esc.firstElementChild;
  if (actual && actual.dataset.vista === nombre) return actual;
  const nuevo = construir();
  nuevo.dataset.vista = nombre;
  esc.replaceChildren(nuevo);
  return nuevo;
}

const urlCorta = () => vista.publicUrl.replace(/^https?:\/\//, '');

// ---------- Puerta de embarque (sala de espera) ----------

const filasLobby = new Map();

function paseDeAbordar() {
  return el('article', { class: 'pase' },
    el('header', { class: 'pase-cabecera' },
      el('span', { class: 'pase-marca' }, 'Pasaporte UdeA'),
      el('span', { class: 'mono' }, 'Vuelo VLU 2026')),
    el('dl', { class: 'pase-datos' },
      el('div', {}, el('dt', {}, 'Destino'), el('dd', {}, 'Bienestar e Internacionalización')),
      el('div', {}, el('dt', {}, 'Puerta'), el('dd', { class: 'mono' }, 'U1'))),
    el('div', { class: 'pase-qr' }, el('img', { src: '/qr.svg', alt: 'Código QR para entrar a la dinámica' })),
    el('footer', { class: 'pase-talon' },
      el('span', {}, 'Escanea para abordar'),
      el('strong', { class: 'mono' }, urlCorta())));
}

function filaPasajero(j) {
  const nombre = textoPizarra(j.nombre, { max: 14 });
  const fila = el('li', { class: 'fila-pasajero' },
    el('span', { class: 'col-avatar' }),
    nombre,
    el('span', { class: 'col-zona' }),
    el('span', { class: 'col-estado mono' }));
  voltear(nombre);
  return fila;
}

function actualizarPasajero(fila, j) {
  const eq = equipoPorId(j.equipoId);
  const av = fila.querySelector('.col-avatar');
  if (av.dataset.a !== j.avatar) { av.dataset.a = j.avatar; av.replaceChildren(avatar(j.avatar)); }
  const zona = fila.querySelector('.col-zona');
  if (eq && zona.dataset.z !== eq.id) { zona.dataset.z = eq.id; zona.replaceChildren(insigniaEquipo(eq), eq.nombre); }
  const estado = fila.querySelector('.col-estado');
  estado.textContent = j.conectado ? 'A BORDO' : 'SIN SEÑAL';
  fila.classList.toggle('sin-senal', !j.conectado);
}

function renderLobby(esc, ctl) {
  const raiz = marco(esc, 'lobby', () => {
    filasLobby.clear();
    const titulo = textoPizarra('Embarque', { max: 10 });
    setTimeout(() => voltear(titulo, { retrasoPorLetra: 2 }), 100);
    return el('div', { class: 'puerta' },
      paseDeAbordar(),
      el('section', { class: 'tablero', 'aria-label': 'Pasajeros a bordo' },
        el('div', { class: 'tablero-cabecera' },
          el('h1', { class: 'titulo-pizarra' }, titulo),
          el('p', { class: 'contador-tablero', 'data-contador': '' })),
        el('div', { class: 'tablero-columnas', 'aria-hidden': 'true' },
          el('span', {}, ''), el('span', {}, 'Pasajero'), el('span', {}, 'Zona'), el('span', {}, 'Estado')),
        el('ol', { class: 'filas', 'data-filas': '' }),
        el('p', { class: 'tablero-vacio', 'data-vacio': '' }, 'Todavía no hay pasajeros. Escaneen el código del pase para abordar.')));
  });

  const lista = raiz.querySelector('[data-filas]');
  const vivos = new Set();
  for (const j of vista.jugadores) {
    vivos.add(j.id);
    let fila = filasLobby.get(j.id);
    if (!fila) {
      fila = filaPasajero(j);
      filasLobby.set(j.id, fila);
      lista.append(fila);
    }
    actualizarPasajero(fila, j);
  }
  for (const [id, fila] of filasLobby) if (!vivos.has(id)) { fila.remove(); filasLobby.delete(id); }
  raiz.querySelector('[data-vacio]').hidden = vista.jugadores.length > 0;
  const denso = vista.jugadores.length > 12;
  lista.classList.toggle('denso', denso);
  raiz.querySelector('.tablero').classList.toggle('denso', denso);
  const n = vista.totalJugadores;
  raiz.querySelector('[data-contador]').textContent = n === 1 ? '1 pasajero' : `${n} pasajeros`;

  poner(ctl,
    el('p', { class: 'pista-control' }, 'Las reacciones de sus celulares aparecen en esta pantalla.'),
    botonControl('Cerrar embarque y empezar', 'Espacio', () => enviar('host:irAMenu')));
  atajoPrincipal = () => enviar('host:irAMenu');
}

// ---------- Próximos destinos (menú) ----------

function columnaClasificacion() {
  return el('aside', { class: 'columna-clasificacion' },
    el('h2', {}, 'Clasificación'),
    // Con todos en cero, todos saldrian "1º": mejor no mostrar la tabla todavia
    vista.ranking.some((r) => r.puntos > 0) ? tablaClasificacion(vista.ranking, { limite: 5 }) : el('p', { class: 'suave' }, 'Los puntos aparecen después del primer destino.'),
    el('h2', {}, 'Equipos'),
    el('p', { class: 'nota' }, 'Promedio de puntos por pasajero'),
    barrasEquipos(vista.equipos));
}

function filaDestino(j, { onclick, derecha, clase = '' }) {
  return el('li', {},
    el('button', { class: `fila-destino ${clase}`, type: 'button', onclick, disabled: !onclick },
      textoPizarra(j.nombre, { max: 20 }),
      el('span', { class: 'destino-tema' }, j.tema),
      derecha));
}

function renderMenu(esc, ctl) {
  const { juegos } = vista.menu;
  const clave = `menu|${juegos.map((j) => `${j.id}${j.jugado}`).join(',')}|${vista.ranking.map((r) => r.puntos).join(',')}`;
  const raiz = marco(esc, clave, () => el('div', { class: 'destinos' },
    el('section', { class: 'tablero' },
      el('div', { class: 'tablero-cabecera' },
        el('h1', { class: 'titulo-pizarra' }, textoPizarra('Salidas', { max: 10 })),
        el('p', { class: 'contador-tablero' }, 'Toca un destino para elegirlo, o deja que voten')),
      el('div', { class: 'tablero-columnas destinos-columnas', 'aria-hidden': 'true' },
        el('span', {}, 'Destino'), el('span', {}, 'Tema'), el('span', {}, 'Estado')),
      juegos.length
        ? el('ol', { class: 'filas-destino' }, juegos.map((j) => filaDestino(j, {
          onclick: () => enviar('host:elegirJuego', { juegoId: j.id }),
          derecha: el('span', { class: `destino-estado mono ${j.jugado ? 'completado' : ''}` }, j.jugado ? 'LLEGÓ' : 'ABORDANDO'),
        })))
        : el('p', { class: 'tablero-vacio' }, 'No hay juegos habilitados. Agrega su id en games.config.json y reinicia el servidor.')),
    columnaClasificacion()));
  raiz.querySelectorAll('.titulo-pizarra .pizarra-texto').forEach((t) => { if (!t.dataset.volteado) { t.dataset.volteado = '1'; voltear(t, { retrasoPorLetra: 2 }); } });

  poner(ctl,
    botonControl('Podio final', '', () => enviar('host:mostrarPodio'), 'secundario'),
    el('span', { class: 'espaciador' }),
    juegos.length >= 2 ? botonControl('Votar el destino', 'Espacio', () => enviar('host:abrirVotacion')) : null);
  atajoPrincipal = juegos.length >= 2 ? () => enviar('host:abrirVotacion') : null;
}

// ---------- Votación ----------

function renderVotacion(esc, ctl) {
  const v = vista.votacion;
  const total = Math.max(1, ...v.opciones.map((o) => o.votos || 0));
  const raiz = marco(esc, `votacion|${v.inicioMs}`, () => el('div', { class: 'destinos votacion' },
    el('section', { class: 'tablero' },
      el('div', { class: 'tablero-cabecera' },
        el('h1', { class: 'titulo-votacion' }, '¿A dónde vamos?'),
        el('p', { class: 'contador-tablero mono', 'data-contador': '' })),
      el('div', { 'data-reloj': '' }),
      el('ol', { class: 'filas-destino', 'data-opciones': '' }),
      el('p', { class: 'resultado-votacion', 'data-resultado': '', role: 'status' })),
    columnaClasificacion()));

  raiz.querySelector('[data-contador]').textContent = `${v.totalVotos} de ${vista.conectados} votaron`;
  const reloj = raiz.querySelector('[data-reloj]');
  if (!v.cerrada && !reloj.firstChild) reloj.append(barraCuenta(v.inicioMs, v.finMs));
  if (v.cerrada) reloj.replaceChildren();

  const elegibles = v.empate || [];
  raiz.querySelector('[data-opciones]').replaceChildren(...v.opciones.map((o) => {
    const gana = v.ganador === o.id;
    const enEmpate = elegibles.includes(o.id);
    return filaDestino(o, {
      clase: `${gana || enEmpate ? 'resaltada' : ''} ${v.cerrada && !gana && !enEmpate ? 'apagada' : ''}`,
      onclick: v.cerrada && enEmpate ? () => enviar('host:elegirJuego', { juegoId: o.id }) : null,
      derecha: el('span', { class: 'votos' },
        el('span', { class: 'votos-pista' }, el('span', { class: 'votos-relleno', style: { width: `${((o.votos || 0) / total) * 100}%` } })),
        el('strong', { class: 'mono' }, o.votos || 0)),
    });
  }));

  const resultado = raiz.querySelector('[data-resultado]');
  const ganador = v.opciones.find((o) => o.id === v.ganador);
  resultado.textContent = !v.cerrada ? '' : ganador ? `Destino elegido: ${ganador.nombre}` : 'Empate. Toca el destino que van a jugar.';

  poner(ctl,
    botonControl('Cancelar votación', '', () => enviar('host:volverAMenu'), 'secundario'),
    el('span', { class: 'espaciador' }),
    !v.cerrada ? botonControl('Cerrar votación', 'Espacio', () => enviar('host:cerrarVotacion')) : null,
    ganador ? botonControl(`Empezar ${ganador.nombre}`, 'Espacio', () => enviar('host:avanzar')) : null);
  atajoPrincipal = !v.cerrada || ganador ? () => enviar('host:avanzar') : null;
}

// Barra que se vacia hasta finMs, con los segundos que quedan
function barraCuenta(inicioMs, finMs) {
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

// ---------- Juego ----------

const ETIQUETAS = { INTRO: 'Antes de despegar', ACTIVA: 'En juego', REVELACION: 'Respuesta', RESULTADOS: 'Clasificación' };

// Indicador del modo automatico: cuenta lo que falta para seguir y permite pausar
function controlAutomatico(j) {
  if (!vista.automatico) {
    return el('div', { class: 'auto' },
      el('span', { class: 'auto-texto' }, 'En pausa: avanza con Espacio'),
      botonControl('Reanudar automático', '', () => enviar('host:automatico', { activo: true }), 'secundario chico'));
  }
  const texto = el('span', { class: 'auto-texto mono' });
  if (j.autoHastaMs) {
    const tic = () => {
      const s = Math.max(0, Math.ceil((j.autoHastaMs - ahoraServidor()) / 1000));
      texto.textContent = `Sigue solo en ${s} s`;
      return s;
    };
    tic();
    const id = setInterval(() => { if (!texto.isConnected || tic() <= 0) clearInterval(id); }, 250);
  } else {
    texto.textContent = 'Automático';
  }
  return el('div', { class: 'auto' }, texto,
    botonControl('Pausar', '', () => enviar('host:automatico', { activo: false }), 'secundario chico'));
}

// Cada juego trae su render de proyector en /js/juegos/<id>.js
async function renderJuego(esc, ctl) {
  const j = vista.juego;
  const id = j.id;
  const textoAvanzar = {
    INTRO: 'Empezar',
    ACTIVA: 'Cerrar ronda',
    REVELACION: 'Ver clasificación',
    RESULTADOS: j.rondaIndice + 1 < j.rondaTotal ? 'Siguiente ronda' : 'Terminar juego',
  }[j.subfase];
  const accion = () => enviar('host:avanzar');
  poner(ctl,
    botonControl('Salir del juego', '', () => { if (confirm('¿Salir de este juego y volver a los destinos? Nadie recibe el sello.')) enviar('host:volverAMenu'); }, 'peligro'),
    j.subfase === 'REVELACION' || j.subfase === 'RESULTADOS' ? controlAutomatico(j) : null,
    el('span', { class: 'espaciador' }),
    botonControl(textoAvanzar, 'Espacio', accion));
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
        el('h1', { class: 'titulo-juego' }, j.nombre),
        el('span', { class: 'etiqueta-subfase', id: 'etiqueta-subfase' }),
        el('span', { class: 'espaciador' }),
        el('span', { class: 'escala mono', id: 'etiqueta-ronda' })),
      el('div', { class: 'cuerpo-juego', id: 'cuerpo-juego' }),
    ));
  }
  $('etiqueta-subfase').textContent = ETIQUETAS[j.subfase];
  $('etiqueta-subfase').dataset.subfase = j.subfase;
  $('etiqueta-ronda').textContent = j.rondaIndice >= 0 ? `Escala ${j.rondaIndice + 1} de ${j.rondaTotal}` : `${j.rondaTotal} escalas`;
  modulo.host.render($('cuerpo-juego'), j, {
    accion: (nombre, datos) => enviar('host:accionJuego', { nombre, datos }),
    avanzar: accion,
    ahoraServidor,
    equipos: vista.equipos,
    ranking: vista.ranking,
  });
}

function renderJuegoGenerico(cuerpo, j) {
  cuerpo.replaceChildren(
    j.subfase === 'ACTIVA' ? el('p', { class: 'contador-respuestas' }, `Respondieron ${j.respondieron} de ${j.conectados}`) : el('span'),
  );
}

// ---------- Podio ----------

function renderPodio(esc, ctl) {
  const [p1, p2, p3] = vista.podio || [];
  const puesto = (p, clase, lugar) => p
    ? el('div', { class: `puesto ${clase}` },
      avatar(p.avatar, 'grande'),
      el('span', { class: 'nom' }, p.nombre),
      el('span', { class: 'pts mono' }, `${p.puntos} pts`),
      el('span', { class: 'lugar mono' }, lugar))
    : null;
  marco(esc, `podio|${(vista.podio || []).map((p) => p.id).join(',')}`, () => el('div', { class: 'podio' },
    el('h1', { class: 'titulo-pizarra' }, textoPizarra('Llegadas', { max: 10 })),
    vista.podio?.length
      ? el('div', { class: 'podio-final' }, puesto(p2, 'p2', '2º'), puesto(p1, 'p1', '1º'), puesto(p3, 'p3', '3º'))
      : el('p', { class: 'tablero-vacio' }, 'Aún no hay puntajes. Jueguen al menos un destino.'),
    el('section', { class: 'podio-equipos' }, el('h2', {}, 'Equipos'), barrasEquipos(vista.equipos))));
  esc.querySelectorAll('.titulo-pizarra .pizarra-texto').forEach((t) => { if (!t.dataset.volteado) { t.dataset.volteado = '1'; voltear(t, { retrasoPorLetra: 2 }); } });
  poner(ctl,el('span', { class: 'espaciador' }), botonControl('Volver a los destinos', '', () => enviar('host:volverAMenu'), 'secundario'));
  atajoPrincipal = null;
}

// ---------- Reacciones del público ----------

const MAX_REACCIONES = 30;
socket.on('reaccion', (r) => {
  if (!autenticado || vista?.fase === 'JUEGO') return;
  const capa = $('capa-reacciones');
  if (capa.childElementCount >= MAX_REACCIONES) return;
  const eq = equipoPorId(r.equipoId);
  const burbuja = el('div', { class: 'reaccion', style: { left: `${6 + Math.random() * 86}%`, '--deriva': `${(Math.random() - 0.5) * 6}rem` } },
    el('span', { class: 'reaccion-emoji' }, r.reaccion),
    el('span', { class: 'reaccion-quien', style: { borderColor: eq ? eq.color : 'transparent' } }, r.nombre));
  // Se borra por tiempo: si la pestaña no está visible, animationend puede no llegar nunca
  setTimeout(() => burbuja.remove(), 3600);
  capa.append(burbuja);
});

// ---------- Reloj de aeropuerto ----------

function actualizarReloj() {
  $('reloj').textContent = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
}
actualizarReloj();
setInterval(actualizarReloj, 10_000);

// ---------- Panel de pasajeros (expulsar, borrar, cerrar sala) ----------

let confirmando = null; // id del jugador pendiente de confirmar expulsion
let temporizadorConfirmacion = null;

function renderPanelJugadores() {
  const lista = $('lista-jugadores');
  lista.replaceChildren(...vista.jugadores.map((j) => {
    const eq = equipoPorId(j.equipoId);
    const pendiente = confirmando === j.id;
    return el('li', { class: j.conectado ? '' : 'sin-senal' },
      avatar(j.avatar),
      eq ? insigniaEquipo(eq, 'chica') : null,
      el('span', { class: 'nom' }, j.nombre),
      el('span', { class: 'mono suave' }, `${j.puntos}`),
      el('button', {
        class: `boton chico ${pendiente ? 'peligro' : 'secundario'}`, type: 'button',
        'aria-label': `Sacar a ${j.nombre}`,
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
      }, pendiente ? '¿Seguro?' : 'Sacar'));
  }));
  if (!vista.jugadores.length) lista.replaceChildren(el('li', { class: 'suave' }, 'Nadie ha abordado todavía.'));
}

const panel = $('panel-jugadores');
const alternarPanel = () => { panel.hidden = !panel.hidden; };
$('btn-jugadores').addEventListener('click', alternarPanel);
$('btn-cerrar-panel').addEventListener('click', () => { panel.hidden = true; });
$('btn-reiniciar').addEventListener('click', () => {
  if (confirm('Esto saca a todos los pasajeros y borra los puntajes. La sala sigue abierta. ¿Continuar?')) enviar('host:reiniciar');
});
$('btn-cerrar-sala').addEventListener('click', () => {
  if (confirm('Esto cierra la sala para todos. La próxima persona que abra el link podrá crear una nueva. ¿Cerrar la sala?')) {
    panel.hidden = true;
    enviar('host:cerrarSala');
  }
});

// ---------- Atajos de teclado ----------

document.addEventListener('keydown', (ev) => {
  if (!autenticado || ev.target instanceof HTMLInputElement) return;
  if (ev.key === 'j' || ev.key === 'J') alternarPanel();
  if ((ev.key === ' ' || ev.key === 'ArrowRight') && atajoPrincipal && panel.hidden) {
    ev.preventDefault();
    atajoPrincipal();
  }
});

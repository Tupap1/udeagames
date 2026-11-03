// Pruebas del flujo de la dinamica: sala, votacion del juego, modo automatico, avatar y reacciones.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { io: conectarCliente } = require('socket.io-client');
const { crearMotor } = require('../server/motor');
const { crearServidor } = require('../server/index');
const { FASES, SUBFASES, AVATARES } = require('../server/estado');
const { crearJuegoFalso, entradaFalsa } = require('./helpers/juegoFalso');

const silencio = { log() {}, error() {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Motor con dos juegos falsos y tiempos cortos
function crear(tiempos = {}) {
  const a = crearJuegoFalso({ id: 'falso-a', rondas: 2, duracionMs: 5000 });
  const b = crearJuegoFalso({ id: 'falso-b', rondas: 1, duracionMs: 5000 });
  const juegos = new Map([[a.id, entradaFalsa(a)], [b.id, entradaFalsa(b)]]);
  const motor = crearMotor({ juegos, log: silencio, tiempos: { revelacionMs: 40, resultadosMs: 40, votacionMs: 5000, ...tiempos } });
  return { motor, a, b };
}
function unir(motor, ...nombres) {
  return nombres.map((n, i) => motor.unirse({ nombre: n, socketId: `s-${n}-${i}` }).jugador);
}

// ---------- Votacion ----------

test('votacion: se puede cambiar el voto y cierra sola cuando todos votaron', () => {
  const { motor } = crear();
  const [ana, beto] = unir(motor, 'Ana', 'Beto');
  motor.hostIrAMenu();
  assert.equal(motor.votar(ana.id, 'falso-a').error, 'fuera_de_fase');
  assert.ok(motor.hostAbrirVotacion().ok);
  assert.equal(motor.estado.fase, FASES.VOTACION);
  assert.deepEqual(motor.estado.votacion.opciones, ['falso-a', 'falso-b']);
  assert.equal(motor.votar(ana.id, 'otro').error, 'opcion_invalida');
  assert.ok(motor.votar(ana.id, 'falso-a').ok);
  assert.ok(motor.votar(ana.id, 'falso-b').ok); // cambia de opinion
  assert.equal(motor.estado.votacion.cerrada, false);
  assert.ok(motor.votar(beto.id, 'falso-b').ok);
  assert.equal(motor.estado.votacion.cerrada, true);
  assert.equal(motor.estado.votacion.ganador, 'falso-b');
  // Espacio arranca el juego ganador
  assert.ok(motor.hostAvanzar().ok);
  assert.equal(motor.estado.fase, FASES.JUEGO);
  assert.equal(motor.estado.juego.id, 'falso-b');
  assert.equal(motor.estado.votacion, null);
  motor.detener();
});

test('votacion: con empate o sin votos decide el host', () => {
  const { motor } = crear();
  const [ana, beto] = unir(motor, 'Ana', 'Beto');
  motor.hostIrAMenu();
  motor.hostAbrirVotacion();
  motor.votar(ana.id, 'falso-a');
  motor.votar(beto.id, 'falso-b');
  assert.deepEqual(motor.estado.votacion.empate, ['falso-a', 'falso-b']);
  assert.equal(motor.hostAvanzar().error, 'empate_sin_resolver');
  assert.ok(motor.hostElegirJuego('falso-a').ok);

  const otro = crear();
  unir(otro.motor, 'Caro');
  otro.motor.hostIrAMenu();
  otro.motor.hostAbrirVotacion();
  assert.ok(otro.motor.hostCerrarVotacion().ok); // nadie voto
  assert.deepEqual(otro.motor.estado.votacion.empate, ['falso-a', 'falso-b']);
  motor.detener();
  otro.motor.detener();
});

test('votacion: el reloj la cierra y los juegos ya jugados salen de las opciones', async () => {
  const c = crearJuegoFalso({ id: 'falso-c', rondas: 1 });
  const { motor } = crear({ votacionMs: 60 });
  motor.juegos.set(c.id, entradaFalsa(c));
  const [ana] = unir(motor, 'Ana', 'Beto');
  motor.hostIrAMenu();
  motor.estado.juegosJugados.push('falso-a');
  motor.hostAbrirVotacion();
  assert.deepEqual(motor.estado.votacion.opciones, ['falso-b', 'falso-c']);
  motor.votar(ana.id, 'falso-c');
  let avisos = 0;
  motor.alCambiar = () => { avisos += 1; };
  await esperar(120);
  assert.equal(motor.estado.votacion.cerrada, true);
  assert.equal(motor.estado.votacion.ganador, 'falso-c');
  assert.ok(avisos > 0, 'al cerrar por tiempo debe avisar a los clientes');
  motor.detener();
});

// ---------- Modo automatico ----------

test('modo automatico: la respuesta y el ranking avanzan solos hasta terminar el juego', async () => {
  const { motor } = crear();
  const [ana] = unir(motor, 'Ana');
  motor.hostIrAMenu();
  motor.hostElegirJuego('falso-a');
  motor.hostAvanzar(); // INTRO -> ACTIVA (esto sigue siendo manual)
  motor.procesarInput(ana.id, 'r0', 'a'); // responde el unico conectado: cierra sola
  assert.equal(motor.estado.juego.subfase, SUBFASES.REVELACION);
  assert.ok(motor.estado.juego.autoHastaMs > 0);
  await esperar(60);
  assert.equal(motor.estado.juego.subfase, SUBFASES.RESULTADOS);
  await esperar(60);
  assert.equal(motor.estado.juego.subfase, SUBFASES.ACTIVA, 'paso sola a la ronda 2');
  assert.equal(motor.estado.juego.indiceRonda, 1);
  motor.procesarInput(ana.id, 'r1', 'a');
  await esperar(120);
  assert.equal(motor.estado.fase, FASES.MENU, 'termino el juego solo');
  assert.deepEqual(ana.sellos, ['falso-a']);
  motor.detener();
});

test('modo automatico: en pausa no avanza y un juego puede pedir esperar al host', async () => {
  const { motor, a } = crear();
  const [ana] = unir(motor, 'Ana');
  motor.hostIrAMenu();
  motor.hostElegirJuego('falso-a');
  motor.hostAutomatico(false);
  motor.hostAvanzar();
  motor.procesarInput(ana.id, 'r0', 'a');
  await esperar(80);
  assert.equal(motor.estado.juego.subfase, SUBFASES.REVELACION, 'en pausa se queda quieto');

  // El juego pide esperar al host en RESULTADOS hasta que haga su accion
  let listo = false;
  a.esperarHost = () => !listo;
  a.acciones.preparar = () => { listo = true; return { ok: true }; };
  motor.hostAutomatico(true);
  await esperar(60);
  assert.equal(motor.estado.juego.subfase, SUBFASES.RESULTADOS);
  await esperar(80);
  assert.equal(motor.estado.juego.subfase, SUBFASES.RESULTADOS, 'espera la accion del host');
  assert.ok(motor.hostAccion('preparar').ok);
  await esperar(60);
  assert.equal(motor.estado.juego.subfase, SUBFASES.ACTIVA);
  motor.detener();
});

// ---------- Sala, avatar y reacciones por sockets ----------

async function arrancar() {
  const config = { raiz: path.join(__dirname, '..'), dirContenido: '', port: 0, publicUrl: 'http://localhost:3000', hostPin: '123456', juegosHabilitados: [] };
  const a = crearJuegoFalso({ id: 'falso-a' });
  const b = crearJuegoFalso({ id: 'falso-b' });
  const s = await crearServidor(config, { juegos: new Map([[a.id, entradaFalsa(a)], [b.id, entradaFalsa(b)]]) });
  const puerto = await s.escuchar(0);
  const clientes = [];
  const nuevo = () => {
    const c = conectarCliente(`http://localhost:${puerto}`, { transports: ['websocket'], forceNew: true });
    clientes.push(c);
    c.ultimaVista = null;
    c.on('vista', (v) => { c.ultimaVista = v; });
    return new Promise((res) => c.on('connect', () => res(c)));
  };
  return { s, nuevo, cerrar: async () => { clientes.forEach((c) => c.close()); await s.cerrar(); } };
}
const emitir = (c, ev, datos = {}) => new Promise((res) => c.emit(ev, datos, res));
async function hasta(cond, ms = 1500) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (cond()) return true; await esperar(15); }
  return false;
}

test('sala: el primero la crea, el token lo devuelve como host y cerrarla saca a todos', async () => {
  const { nuevo, cerrar } = await arrancar();
  try {
    const temprano = await nuevo();
    assert.equal((await emitir(temprano, 'sala:estado')).abierta, false);
    assert.equal((await emitir(temprano, 'jugador:unirse', { nombre: 'Ana' })).error, 'sin_sala');
    let avisoAbierta = false;
    temprano.on('sala:abierta', () => { avisoAbierta = true; });

    const host = await nuevo();
    const r = await emitir(host, 'sala:crear');
    assert.ok(r.ok && typeof r.token === 'string');
    assert.equal((await emitir(await nuevo(), 'sala:crear')).error, 'sala_abierta');
    assert.ok(await hasta(() => avisoAbierta), 'quien esperaba se entera de que se abrio la sala');
    assert.ok(await hasta(() => host.ultimaVista?.rol === 'host'));

    // El mismo computador recarga: vuelve con su token. Otro con un token falso no entra.
    const recarga = await nuevo();
    assert.equal((await emitir(recarga, 'host:reanudar', { token: 'falso' })).error, 'token_invalido');
    assert.ok((await emitir(recarga, 'host:reanudar', { token: r.token })).ok);
    assert.ok((await emitir(recarga, 'host:irAMenu')).ok);

    // Jugador: avatar y reaccion que llega al proyector con su nombre
    const ana = await nuevo();
    assert.ok((await emitir(ana, 'jugador:unirse', { nombre: 'Ana' })).ok);
    assert.equal((await emitir(ana, 'jugador:avatar', { avatar: 'no-existe' })).error, 'avatar_invalido');
    assert.ok((await emitir(ana, 'jugador:avatar', { avatar: AVATARES[2] })).ok);
    assert.ok(await hasta(() => ana.ultimaVista?.yo?.avatar === AVATARES[2]));
    let reaccion = null;
    host.on('reaccion', (x) => { reaccion = x; });
    assert.ok((await emitir(ana, 'jugador:reaccion', { reaccion: '👏' })).ok);
    assert.equal((await emitir(ana, 'jugador:reaccion', { reaccion: '👏' })).error, 'muy_seguido');
    assert.equal((await emitir(ana, 'jugador:reaccion', { reaccion: '<script>' })).error, 'reaccion_invalida');
    assert.ok(await hasta(() => reaccion));
    assert.equal(reaccion.nombre, 'Ana');

    // Votacion por sockets
    assert.ok((await emitir(host, 'host:abrirVotacion')).ok);
    assert.ok(await hasta(() => ana.ultimaVista?.votacion?.opciones?.length === 2));
    assert.equal(ana.ultimaVista.votacion.opciones[0].votos, null, 'el jugador no ve el conteo mientras se vota');
    assert.ok((await emitir(ana, 'jugador:votar', { juegoId: 'falso-b' })).ok);
    assert.ok(await hasta(() => host.ultimaVista?.votacion?.ganador === 'falso-b'));

    // Cerrar la sala
    let expulsada = null;
    ana.on('expulsado', (x) => { expulsada = x; });
    assert.ok((await emitir(host, 'host:cerrarSala')).ok);
    assert.ok(await hasta(() => expulsada));
    assert.equal(expulsada.motivo, 'sala_cerrada');
    assert.equal((await emitir(ana, 'sala:estado')).abierta, false);
    assert.equal((await emitir(host, 'host:irAMenu')).error, 'no_autorizado');
    assert.equal((await emitir(recarga, 'host:reanudar', { token: r.token })).error, 'token_invalido');
  } finally {
    await cerrar();
  }
});

test('reiniciar deja la sala abierta y al host con el control', () => {
  const { motor } = crear();
  const { token } = motor.crearSala();
  motor.estado.hostSockets.add('h1');
  unir(motor, 'Ana');
  motor.hostAutomatico(false);
  motor.hostReiniciar();
  assert.equal(motor.estado.jugadores.size, 0);
  assert.ok(motor.tokenValido(token));
  assert.ok(motor.estado.hostSockets.has('h1'));
  assert.equal(motor.estado.automatico, false);
  motor.detener();
});

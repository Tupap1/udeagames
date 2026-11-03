// Pruebas de integracion: servidor real + clientes socket.io reales.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: conectarCliente } = require('socket.io-client');
const { crearServidor } = require('../server/index');
const { crearJuegoFalso, entradaFalsa } = require('./helpers/juegoFalso');

const PIN = '123456';

async function arrancar() {
  const config = {
    raiz: require('node:path').join(__dirname, '..'),
    dirContenido: '',
    port: 0,
    publicUrl: 'http://localhost:3000',
    hostPin: PIN,
    juegosHabilitados: [],
  };
  const modulo = crearJuegoFalso({ rondas: 1, duracionMs: 5000 });
  const s = await crearServidor(config, { juegos: new Map([[modulo.id, entradaFalsa(modulo)]]) });
  const puerto = await s.escuchar(0);
  const clientes = [];
  const nuevo = () => {
    const c = conectarCliente(`http://localhost:${puerto}`, { transports: ['websocket'], forceNew: true });
    clientes.push(c);
    c.ultimaVista = null;
    c.on('vista', (v) => { c.ultimaVista = v; });
    return new Promise((res) => c.on('connect', () => res(c)));
  };
  const cerrar = async () => { clientes.forEach((c) => c.close()); await s.cerrar(); };
  return { s, nuevo, cerrar };
}

const emitir = (c, evento, datos) => new Promise((res) => c.emit(evento, datos, res));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond, ms = 1500) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (cond()) return true; await esperar(15); }
  return false;
}

test('registro, vista de jugador, reconexion y expulsion por socket', async () => {
  const { s, nuevo, cerrar } = await arrancar();
  try {
    const host = await nuevo();
    assert.equal((await emitir(host, 'host:irAMenu', {})).error, 'no_autorizado');
    assert.equal((await emitir(host, 'host:autenticar', { pin: 'mal' })).error, 'pin_incorrecto');
    assert.ok((await emitir(host, 'host:autenticar', { pin: PIN })).ok);
    assert.ok(await hasta(() => host.ultimaVista?.rol === 'host'));

    const a = await nuevo();
    const r = await emitir(a, 'jugador:unirse', { nombre: 'Ana' });
    assert.ok(r.ok && r.sessionId);
    assert.ok(await hasta(() => a.ultimaVista?.yo?.nombre === 'Ana'));
    assert.equal(a.ultimaVista.fase, 'LOBBY');
    assert.equal(a.ultimaVista.yo.sessionId, undefined, 'la vista no debe filtrar el sessionId');
    assert.ok(await hasta(() => host.ultimaVista.totalJugadores === 1));
    assert.equal(host.ultimaVista.jugadores[0].sessionId, undefined);

    // nombre repetido
    const b = await nuevo();
    assert.equal((await emitir(b, 'jugador:unirse', { nombre: 'ana' })).error, 'nombre_en_uso');

    // reconexion desde otro socket con el mismo sessionId
    a.close();
    assert.ok(await hasta(() => host.ultimaVista.conectados === 0));
    const a2 = await nuevo();
    const r2 = await emitir(a2, 'jugador:unirse', { sessionId: r.sessionId });
    assert.ok(r2.ok && r2.reconectado);
    assert.ok(await hasta(() => a2.ultimaVista?.yo?.nombre === 'Ana'));
    assert.ok(await hasta(() => host.ultimaVista.conectados === 1));

    // el host expulsa
    let expulsado = false;
    a2.on('expulsado', () => { expulsado = true; });
    assert.ok((await emitir(host, 'host:expulsar', { jugadorId: a2.ultimaVista.yo.id })).ok);
    assert.ok(await hasta(() => expulsado));
    assert.ok(await hasta(() => host.ultimaVista.totalJugadores === 0));
    assert.equal((await emitir(a2, 'jugador:input', { rondaId: 'r0', valor: 'a' })).error, 'input_invalido');
  } finally {
    await cerrar();
  }
});

test('partida completa por sockets: menu, juego, input y sello', async () => {
  const { nuevo, cerrar } = await arrancar();
  try {
    const host = await nuevo();
    await emitir(host, 'host:autenticar', { pin: PIN });
    const a = await nuevo();
    await emitir(a, 'jugador:unirse', { nombre: 'Ana' });
    // Beto no responde, asi la ronda sigue abierta tras la respuesta de Ana
    const beto = await nuevo();
    await emitir(beto, 'jugador:unirse', { nombre: 'Beto' });

    assert.ok((await emitir(host, 'host:irAMenu', {})).ok);
    assert.ok(await hasta(() => host.ultimaVista.menu.juegos.length === 1));
    assert.ok((await emitir(host, 'host:elegirJuego', { juegoId: 'falso' })).ok);
    assert.ok((await emitir(host, 'host:avanzar', {})).ok); // INTRO -> ACTIVA
    assert.ok(await hasta(() => a.ultimaVista?.juego?.subfase === 'ACTIVA'));
    const { rondaId } = a.ultimaVista.juego;

    assert.ok((await emitir(a, 'jugador:input', { rondaId, valor: 'a' })).ok);
    assert.equal((await emitir(a, 'jugador:input', { rondaId, valor: 'b' })).error, 'ya_respondio');
    assert.ok(await hasta(() => host.ultimaVista.juego?.respondieron === 1));
    await emitir(host, 'host:avanzar', {}); // el host cierra la ronda a mano
    assert.ok(await hasta(() => a.ultimaVista.juego?.subfase === 'REVELACION'));
    assert.equal(a.ultimaVista.juego.puntosRonda, 100);
    assert.equal(beto.ultimaVista.juego.puntosRonda, 0);

    await emitir(host, 'host:avanzar', {}); // -> RESULTADOS
    await emitir(host, 'host:avanzar', {}); // fin del juego
    assert.ok(await hasta(() => a.ultimaVista.fase === 'MENU'));
    assert.equal(a.ultimaVista.yo.puntos, 100);
    assert.equal(a.ultimaVista.pasaporte[0].obtenido, true);
  } finally {
    await cerrar();
  }
});

test('un cliente que inunda eventos es limitado', async () => {
  const { nuevo, cerrar } = await arrancar();
  try {
    const c = await nuevo();
    let respondidos = 0;
    for (let i = 0; i < 100; i++) c.emit('reloj:ping', {}, () => { respondidos++; });
    await esperar(400);
    // Solo se atienden ~40 eventos por ventana; el resto se descarta
    assert.ok(respondidos <= 40, `se atendieron ${respondidos}`);
    assert.ok(respondidos > 0);
    // y el servidor sigue vivo para otros clientes
    assert.ok((await emitir(await nuevo(), 'reloj:ping', {})).ok);
  } finally {
    await cerrar();
  }
});

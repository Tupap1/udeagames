const test = require('node:test');
const assert = require('node:assert/strict');
const { crearMotor } = require('../server/motor');
const { FASES, SUBFASES } = require('../server/estado');
const { crearJuegoFalso, entradaFalsa } = require('./helpers/juegoFalso');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function crear(opciones) {
  const modulo = crearJuegoFalso(opciones);
  const juegos = new Map([[modulo.id, entradaFalsa(modulo)]]);
  const motor = crearMotor({ juegos, log: { error() {}, log() {} } });
  return { motor, modulo };
}
function unir(motor, ...nombres) {
  return nombres.map((n, i) => motor.unirse({ nombre: n, socketId: `s-${n}-${i}` }).jugador);
}

test('flujo LOBBY -> MENU -> JUEGO -> MENU con sellos y puntos', () => {
  const { motor } = crear({ rondas: 2 });
  const [ana, beto] = unir(motor, 'Ana', 'Beto');
  assert.equal(motor.estado.fase, FASES.LOBBY);
  assert.ok(motor.hostIrAMenu().ok);
  assert.ok(motor.hostElegirJuego('falso').ok);
  assert.equal(motor.estado.juego.subfase, SUBFASES.INTRO);

  motor.hostAvanzar(); // INTRO -> ACTIVA ronda 0
  assert.equal(motor.estado.juego.subfase, SUBFASES.ACTIVA);
  assert.ok(motor.procesarInput(ana.id, 'r0', 'a').ok);
  assert.ok(motor.procesarInput(beto.id, 'r0', 'b').ok);
  // al responder todos los conectados, la ronda cierra sola
  assert.equal(motor.estado.juego.subfase, SUBFASES.REVELACION);
  assert.equal(ana.puntos, 100);
  assert.equal(beto.puntos, 0);

  motor.hostAvanzar(); // -> RESULTADOS
  motor.hostAvanzar(); // -> ronda 1
  motor.procesarInput(ana.id, 'r1', 'a');
  motor.procesarInput(beto.id, 'r1', 'a');
  motor.hostAvanzar(); // REVELACION -> RESULTADOS
  motor.hostAvanzar(); // fin del juego

  assert.equal(motor.estado.fase, FASES.MENU);
  assert.equal(motor.estado.juego, null);
  assert.deepEqual(ana.sellos, ['falso']);
  assert.deepEqual(beto.sellos, ['falso']); // participo aunque fallo
  assert.equal(ana.puntos, 200);
  assert.deepEqual(motor.estado.juegosJugados, ['falso']);
  motor.detener();
});

test('ignora inputs fuera de fase, repetidos, de ronda vieja o invalidos', () => {
  const { motor } = crear();
  const [ana] = unir(motor, 'Ana', 'Beto'); // Beto no responde, la ronda sigue abierta
  assert.equal(motor.procesarInput(ana.id, 'r0', 'a').error, 'fuera_de_fase'); // LOBBY
  motor.hostIrAMenu();
  motor.hostElegirJuego('falso');
  assert.equal(motor.procesarInput(ana.id, 'r0', 'a').error, 'fuera_de_fase'); // INTRO
  motor.hostAvanzar();
  assert.equal(motor.procesarInput(ana.id, 'rX', 'a').error, 'ronda_invalida');
  assert.equal(motor.procesarInput(ana.id, 'r0', 'zzz').error, 'valor_invalido');
  assert.ok(motor.procesarInput(ana.id, 'r0', 'a').ok);
  assert.equal(motor.procesarInput(ana.id, 'r0', 'b').error, 'ya_respondio');
  assert.equal(motor.procesarInput('no-existe', 'r0', 'a').error, 'no_registrado');
  motor.detener();
});

test('el temporizador cierra la ronda activa y se ignoran los inputs tardios', async () => {
  const { motor } = crear({ duracionMs: 80 });
  const [ana] = unir(motor, 'Ana', 'Beto');
  let avisos = 0;
  motor.alCambiar = () => { avisos += 1; };
  motor.hostIrAMenu();
  motor.hostElegirJuego('falso');
  motor.hostAvanzar();
  const antes = avisos;
  await esperar(150);
  assert.equal(motor.estado.juego.subfase, SUBFASES.REVELACION);
  assert.ok(avisos > antes, 'al cerrar por tiempo el motor debe avisar a los clientes');
  assert.equal(motor.procesarInput(ana.id, 'r0', 'a').error, 'fuera_de_fase');
  motor.detener();
});

test('cuando se desconecta quien faltaba por responder, la ronda cierra', () => {
  const { motor } = crear();
  const [ana, beto] = unir(motor, 'Ana', 'Beto');
  motor.hostIrAMenu();
  motor.hostElegirJuego('falso');
  motor.hostAvanzar();
  motor.procesarInput(ana.id, 'r0', 'a');
  assert.equal(motor.estado.juego.subfase, SUBFASES.ACTIVA);
  motor.desconectar(beto.socketId);
  assert.equal(motor.estado.juego.subfase, SUBFASES.REVELACION);
  motor.detener();
});

test('expulsar a quien respondio descarta su input y no le da sello', () => {
  const { motor } = crear({ rondas: 1 });
  const [ana, beto] = unir(motor, 'Ana', 'Beto');
  motor.hostIrAMenu();
  motor.hostElegirJuego('falso');
  motor.hostAvanzar();
  motor.procesarInput(ana.id, 'r0', 'a');
  assert.ok(motor.expulsar(ana.id).ok); // al irse Ana, solo falta Beto
  assert.equal(motor.estado.juego.inputs.has(ana.id), false);
  motor.procesarInput(beto.id, 'r0', 'a');
  motor.hostAvanzar();
  motor.hostAvanzar();
  assert.deepEqual(beto.sellos, ['falso']);
  assert.equal(motor.estado.jugadores.has(ana.id), false);
  motor.detener();
});

test('volver al menu en pleno juego aborta sin sellos y limpia el timer', () => {
  const { motor } = crear();
  const [ana] = unir(motor, 'Ana', 'Beto');
  motor.hostIrAMenu();
  motor.hostElegirJuego('falso');
  motor.hostAvanzar();
  motor.procesarInput(ana.id, 'r0', 'a');
  assert.ok(motor.hostVolverAMenu().ok);
  assert.equal(motor.estado.fase, FASES.MENU);
  assert.deepEqual(ana.sellos, []);
  assert.deepEqual(motor.estado.juegosJugados, []);
});

test('transiciones invalidas devuelven error y no cambian la fase', () => {
  const { motor } = crear();
  assert.equal(motor.hostElegirJuego('falso').error, 'fase_invalida'); // sigue en LOBBY
  assert.equal(motor.hostAvanzar().error, 'fase_invalida');
  motor.hostIrAMenu();
  assert.equal(motor.hostElegirJuego('no-existe').error, 'juego_no_habilitado');
  assert.equal(motor.hostIrAMenu().error, 'fase_invalida');
  assert.ok(motor.hostMostrarPodio().ok);
  assert.equal(motor.estado.fase, FASES.PODIO);
  assert.ok(motor.hostVolverAMenu().ok);
});

test('un juego que lanza excepciones no tumba el motor', () => {
  const modulo = crearJuegoFalso();
  modulo.puntuar = () => { throw new Error('bug en el juego'); };
  modulo.vistaJugador = () => { throw new Error('bug en la vista'); };
  const motor = crearMotor({ juegos: new Map([[modulo.id, entradaFalsa(modulo)]]), log: { error() {}, log() {} } });
  const [ana] = unir(motor, 'Ana');
  motor.hostIrAMenu();
  motor.hostElegirJuego('falso');
  motor.hostAvanzar();
  assert.ok(motor.procesarInput(ana.id, 'r0', 'a').ok); // cierra la ronda; puntuar falla
  assert.equal(motor.estado.juego.subfase, SUBFASES.REVELACION);
  assert.equal(ana.puntos, 0);
  motor.detener();
});

test('los puntos que devuelve un juego se sanean', () => {
  const modulo = crearJuegoFalso();
  modulo.puntuar = (ctx) => Object.fromEntries([...ctx.inputs.keys()].map((id) => [id, 9e12]));
  const motor = crearMotor({ juegos: new Map([[modulo.id, entradaFalsa(modulo)]]), log: { error() {}, log() {} } });
  const [ana] = unir(motor, 'Ana');
  motor.hostIrAMenu();
  motor.hostElegirJuego('falso');
  motor.hostAvanzar();
  motor.procesarInput(ana.id, 'r0', 'a');
  assert.equal(ana.puntos, 10_000);
  motor.detener();
});

test('reiniciar borra jugadores y conserva a los hosts autenticados', () => {
  const { motor } = crear();
  unir(motor, 'Ana');
  motor.estado.hostSockets.add('h1');
  const r = motor.hostReiniciar();
  assert.equal(r.sockets.length, 1);
  assert.equal(motor.estado.jugadores.size, 0);
  assert.equal(motor.estado.fase, FASES.LOBBY);
  assert.ok(motor.estado.hostSockets.has('h1'));
});

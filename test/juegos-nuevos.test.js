// Pruebas de Sobrevive el semestre, Ordena el tramite y Mapa del mundo, y de como el host elige
// los destinos de la sesion y el sorteo al azar.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { crearMotor } = require('../server/motor');
const { cargarJuegos } = require('../server/juegos');
const { FASES } = require('../server/estado');
const { aPlano } = require('../server/juegos/_proyeccion');

const silencio = { log() {}, error() {} };
const IDS = ['sobrevive-semestre', 'ordena-tramite', 'mapa-mundo'];

function crear(opciones = {}) {
  const juegos = cargarJuegos({ habilitados: IDS, dirContenido: path.join(__dirname, '..', 'content'), log: silencio });
  const motor = crearMotor({ juegos, log: silencio, ...opciones });
  return { motor, juegos };
}
function empezar(id, opciones) {
  const { motor, juegos } = crear(opciones);
  const [ana, beto] = ['Ana', 'Beto'].map((n, i) => motor.unirse({ nombre: n, socketId: `s${i}` }).jugador);
  motor.hostIrAMenu();
  assert.ok(motor.hostElegirJuego(id).ok);
  motor.hostAvanzar(); // ACTIVA, ronda 0
  return { motor, ana, beto, modulo: juegos.get(id).modulo, ronda: () => motor.contexto().ronda };
}

test('los tres juegos nuevos cargan con su contenido de ejemplo', () => {
  assert.deepEqual([...crear().juegos.keys()].sort(), [...IDS].sort());
});

test('Sobrevive el semestre: cada opcion vale distinto y no se revela antes de tiempo', () => {
  const { motor, ana, beto, modulo, ronda } = empezar('sobrevive-semestre');
  const r = ronda();
  const semanas = motor.contexto().juego.rondas.map((x) => x.semana);
  assert.deepEqual(semanas, [...semanas].sort((a, b) => a - b), 'las semanas van en orden');
  const activa = modulo.vistaJugador(motor.contexto(), ana);
  assert.ok(!('puntosOpciones' in activa) && !('mejor' in activa));
  assert.equal(activa.energia, 100);

  const peor = r.opciones.findIndex((o) => o.puntos === Math.min(...r.opciones.map((x) => x.puntos)));
  assert.ok(motor.procesarInput(ana.id, r.id, r.mejor).ok);
  assert.ok(motor.procesarInput(beto.id, r.id, peor).ok);
  assert.equal(ana.puntos, r.opciones[r.mejor].puntos);
  assert.equal(beto.puntos, r.opciones[peor].puntos);
  const rev = modulo.vistaJugador(motor.contexto(), beto);
  assert.equal(rev.mejor, r.mejor);
  assert.equal(rev.energia, r.opciones[peor].puntos, 'la energia es el promedio de lo que lleva sobre 100');
  motor.detener();
});

test('Ordena el tramite: puntos por paso en su lugar y bono solo si estan todos', () => {
  const { motor, ana, beto, modulo, ronda } = empezar('ordena-tramite');
  const r = ronda();
  const n = r.correcto.length;
  assert.notDeepEqual(r.correcto, [...Array(n).keys()], 'no se muestra ya ordenado');
  assert.equal(motor.procesarInput(ana.id, r.id, [0, 0, 1, 2]).error, 'valor_invalido');
  assert.equal(motor.procesarInput(ana.id, r.id, [0, 1]).error, 'valor_invalido');
  assert.ok(!('correcto' in modulo.vistaJugador(motor.contexto(), ana)));

  // Beto cambia de lugar solo los dos primeros pasos: n-2 bien
  const casi = [...r.correcto];
  [casi[0], casi[1]] = [casi[1], casi[0]];
  assert.ok(motor.procesarInput(ana.id, r.id, r.correcto).ok);
  assert.ok(motor.procesarInput(beto.id, r.id, casi).ok);
  assert.ok(ana.puntos >= 100 && ana.puntos <= 150, `Ana: ${ana.puntos}`);
  assert.equal(beto.puntos, Math.round((100 / n) * (n - 2)));
  const host = modulo.vistaHost(motor.contexto());
  assert.equal(host.todoBien, 1);
  assert.equal(host.porPosicion[0], 50);
  assert.equal(host.porPosicion[n - 1], 100);
  assert.equal(modulo.vistaJugador(motor.contexto(), beto).aciertos, n - 2);
  motor.detener();
});

test('Mapa del mundo: mas cerca da mas puntos y el proyector no muestra toques en la ronda activa', () => {
  const { motor, ana, beto, modulo, ronda } = empezar('mapa-mundo');
  const r = ronda();
  assert.equal(motor.procesarInput(ana.id, r.id, { x: 2, y: 0.5 }).error, 'valor_invalido');
  assert.equal(motor.procesarInput(ana.id, r.id, 'aqui').error, 'valor_invalido');
  assert.ok(!('marcas' in modulo.vistaHost(motor.contexto())) && !('real' in modulo.vistaJugador(motor.contexto(), ana)));

  const exacto = aPlano(r.lon, r.lat);
  // Las antipodas del lugar: lo mas lejos posible
  const lejos = aPlano(r.lon > 0 ? r.lon - 180 : r.lon + 180, Math.max(-57, Math.min(83, -r.lat)));
  assert.ok(motor.procesarInput(ana.id, r.id, exacto).ok);
  assert.ok(motor.procesarInput(beto.id, r.id, lejos).ok);
  assert.ok(ana.puntos >= 245, `Ana: ${ana.puntos}`);
  assert.equal(beto.puntos, 0);
  const host = modulo.vistaHost(motor.contexto());
  assert.equal(host.marcas.length, 2);
  assert.equal(host.cercanos[0].nombre, 'Ana');
  assert.ok(modulo.vistaJugador(motor.contexto(), ana).km < 50);
  motor.detener();
});

test('los bots de los juegos nuevos mandan entradas validas', () => {
  for (const id of IDS) {
    const { motor, ana, modulo } = empezar(id);
    const vista = modulo.vistaJugador(motor.contexto(), ana);
    for (let i = 0; i < 20; i++) assert.ok(modulo.procesarInput(motor.contexto(), ana, modulo.generarInputBot(vista)).ok, id);
    motor.detener();
  }
});

// ---------- Destinos de la sesion y sorteo ----------

test('el host deja destinos por fuera y la votacion y el sorteo solo usan los de la sesion', () => {
  let valor = 0.99;
  const { motor } = crear({ azar: () => valor });
  motor.unirse({ nombre: 'Ana', socketId: 's1' });
  assert.equal(motor.hostDestinos([]).error, 'sin_destinos');
  assert.equal(motor.hostDestinos(['no-existe']).error, 'sin_destinos');
  assert.ok(motor.hostDestinos(['mapa-mundo', 'ordena-tramite', 'no-existe']).ok);
  assert.deepEqual(motor.destinosActivos(), ['ordena-tramite', 'mapa-mundo']);

  motor.hostIrAMenu();
  motor.hostAbrirVotacion();
  assert.deepEqual(motor.estado.votacion.opciones, ['ordena-tramite', 'mapa-mundo']);
  motor.hostVolverAMenu();

  // Sorteo: con azar 0.99 cae el ultimo de la lista; Espacio arranca el juego sorteado
  assert.ok(motor.hostAleatorio().ok);
  assert.equal(motor.estado.fase, FASES.VOTACION);
  assert.equal(motor.estado.votacion.modo, 'azar');
  assert.equal(motor.estado.votacion.ganador, 'mapa-mundo');
  assert.equal(motor.votar([...motor.estado.jugadores.keys()][0], 'mapa-mundo').error, 'fuera_de_fase');
  assert.ok(motor.hostAvanzar().ok);
  assert.equal(motor.estado.juego.id, 'mapa-mundo');

  // Con los dos jugados, el sorteo vuelve a usar todos los de la sesion
  motor.hostVolverAMenu();
  motor.estado.juegosJugados.push('ordena-tramite', 'mapa-mundo');
  valor = 0;
  motor.hostAleatorio();
  assert.equal(motor.estado.votacion.ganador, 'ordena-tramite');
  assert.equal(motor.estado.juego, null);
  motor.detener();
});

test('con un solo destino en la sesion no hay votacion pero si sorteo', () => {
  const { motor } = crear();
  motor.hostDestinos(['sobrevive-semestre']);
  motor.hostIrAMenu();
  assert.equal(motor.hostAbrirVotacion().error, 'pocas_opciones');
  assert.ok(motor.hostAleatorio().ok);
  assert.equal(motor.estado.votacion.ganador, 'sobrevive-semestre');
  assert.equal(motor.estado.juego, null);
  motor.detener();
});

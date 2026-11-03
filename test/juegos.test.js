// Pruebas de los juegos reales (Mito o verdad, Ruleta de Bienestar, Adivina el destino)
// usando el motor y el contenido de content/.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { crearMotor } = require('../server/motor');
const { cargarJuegos } = require('../server/juegos');
const { SUBFASES } = require('../server/estado');

const silencio = { log() {}, error() {}, warn() {} };
const IDS = ['mito-verdad', 'ruleta-bienestar', 'adivina-destino'];

function crear() {
  const juegos = cargarJuegos({ habilitados: IDS, dirContenido: path.join(__dirname, '..', 'content'), log: silencio });
  const motor = crearMotor({ juegos, log: silencio });
  return { motor, juegos };
}
function unir(motor, ...nombres) {
  return nombres.map((n, i) => motor.unirse({ nombre: n, socketId: `s-${n}-${i}` }).jugador);
}
// Deja el motor listo en la subfase INTRO del juego pedido. Beto nunca responde: la ronda no cierra sola.
function empezar(id) {
  const { motor, juegos } = crear();
  const [ana, beto] = unir(motor, 'Ana', 'Beto');
  motor.hostIrAMenu();
  assert.ok(motor.hostElegirJuego(id).ok);
  return { motor, ana, beto, modulo: juegos.get(id).modulo };
}
const ronda = (motor) => motor.contexto().ronda;
// Las pruebas no deben depender del texto de ejemplo: cuando el equipo cambie el contenido siguen valiendo
const leerContenido = (archivo) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', archivo), 'utf8'));

test('los tres juegos cargan con el contenido de ejemplo', () => {
  const { juegos } = crear();
  assert.deepEqual([...juegos.keys()].sort(), [...IDS].sort());
});

test('un contenido mal formado hace que el juego se omita sin tumbar el registro', () => {
  const errores = [];
  const juegos = cargarJuegos({
    habilitados: ['mito-verdad'],
    dirContenido: path.join(__dirname, 'helpers'), // aqui no existe mito-verdad.json
    log: { log() {}, error: (m) => errores.push(m) },
  });
  assert.equal(juegos.size, 0);
  assert.match(errores[0], /NO se pudo habilitar "mito-verdad"/);

  const { modulo } = empezar('mito-verdad');
  assert.throws(() => modulo.crearRondas({ afirmaciones: [{ texto: 'x' }] }), /esVerdad/);
  assert.throws(() => modulo.crearRondas({}), /afirmaciones/);
});

test('Mito o verdad: no revela la respuesta en ACTIVA y puntua acierto, error y rapidez', () => {
  const { motor, ana, beto, modulo } = empezar('mito-verdad');
  assert.equal(motor.contexto().juego.rondas.length, Math.min(6, leerContenido('mito-verdad.json').afirmaciones.length));
  assert.equal(modulo.vistaJugador(motor.contexto(), ana).intro, true);

  motor.hostAvanzar(); // ACTIVA, ronda 0
  const r = ronda(motor);
  const ctx = motor.contexto();
  for (const vista of [modulo.vistaJugador(ctx, ana), modulo.vistaHost(ctx)]) {
    const texto = JSON.stringify(vista);
    assert.ok(!('esVerdad' in vista) && !('explicacion' in vista), 'la vista activa no debe traer la respuesta');
    assert.ok(!texto.includes(r.explicacion) || r.explicacion === '');
  }

  assert.equal(motor.procesarInput(ana.id, r.id, 'quizas').error, 'valor_invalido');
  assert.ok(motor.procesarInput(ana.id, r.id, r.esVerdad ? 'verdad' : 'mito').ok);
  assert.ok(motor.procesarInput(beto.id, r.id, r.esVerdad ? 'mito' : 'verdad').ok);
  assert.equal(motor.estado.juego.subfase, SUBFASES.REVELACION);
  assert.ok(ana.puntos >= 100 && ana.puntos <= 150, `puntos de Ana: ${ana.puntos}`);
  assert.equal(beto.puntos, 0);

  const rev = modulo.vistaJugador(motor.contexto(), ana);
  assert.equal(rev.esVerdad, r.esVerdad);
  assert.equal(rev.acerte, true);
  assert.equal(modulo.vistaHost(motor.contexto()).conteo[r.esVerdad ? 'verdad' : 'mito'], 1);
  motor.detener();
});

test('Mito o verdad: mezcla los temas y completa las rondas hasta el sello', () => {
  const { motor, ana, beto } = empezar('mito-verdad');
  const temas = new Set(motor.contexto().juego.rondas.map((r) => r.tema));
  assert.ok(temas.size >= 2, 'deberia haber afirmaciones de los dos temas');
  const total = motor.contexto().juego.rondas.length;
  motor.hostAvanzar();
  for (let i = 0; i < total; i++) {
    const r = ronda(motor);
    motor.procesarInput(ana.id, r.id, 'verdad');
    motor.procesarInput(beto.id, r.id, 'mito'); // ambos responden: cierra sola
    motor.hostAvanzar(); // -> RESULTADOS
    motor.hostAvanzar(); // -> siguiente ronda o fin
  }
  assert.equal(motor.estado.fase, 'MENU');
  assert.deepEqual(ana.sellos, ['mito-verdad']);
  motor.detener();
});

test('Ruleta: solo gira antes de la ronda y la categoria sale despues del giro', () => {
  const { motor, ana, modulo } = empezar('ruleta-bienestar');
  assert.equal(motor.hostAccion('girar').ok, true);
  const girar = () => motor.hostAccion('girar', {});
  let host = modulo.vistaHost(motor.contexto());
  assert.equal(host.modo, 'rueda');
  assert.equal(host.giro.n, 1);
  assert.equal(host.giro.categoriaId, motor.contexto().juego.rondas[0].categoria.id);
  assert.equal(host.rueda.length, leerContenido('ruleta-bienestar.json').categorias.length);
  girar(); // un segundo giro para la misma ronda no cambia nada
  assert.equal(modulo.vistaHost(motor.contexto()).giro.n, 1);

  motor.hostAvanzar(); // ACTIVA
  assert.equal(girar().error, 'fuera_de_fase');
  const r = ronda(motor);
  const vista = modulo.vistaJugador(motor.contexto(), ana);
  assert.ok(!('correcta' in vista) && !('explicacion' in vista), 'no revela la respuesta en ACTIVA');
  assert.equal(vista.opciones.length, r.opciones.length);
  assert.equal(motor.procesarInput(ana.id, r.id, 9).error, 'valor_invalido');
  assert.equal(motor.procesarInput(ana.id, r.id, 'a').error, 'valor_invalido');
  assert.ok(motor.procesarInput(ana.id, r.id, r.correcta).ok);
  motor.hostAvanzar(); // cierra la ronda
  assert.ok(ana.puntos >= 100 && ana.puntos <= 150);
  assert.equal(modulo.vistaJugador(motor.contexto(), ana).correcta, r.correcta);
  assert.equal(modulo.vistaHost(motor.contexto()).conteo[r.correcta], 1);

  motor.hostAvanzar(); // RESULTADOS: la ruleta vuelve para la ronda 1, sin giro todavia
  host = modulo.vistaHost(motor.contexto());
  assert.equal(host.modo, 'rueda');
  assert.equal(host.giro, null);
  assert.equal(girar().ok, true);
  assert.equal(modulo.vistaHost(motor.contexto()).giro.n, 2);
  motor.detener();
});

test('Ruleta: la opcion correcta sigue siendo correcta tras barajar y se reparten las categorias', () => {
  const { motor } = empezar('ruleta-bienestar');
  const { categorias } = leerContenido('ruleta-bienestar.json');
  const rondas = motor.contexto().juego.rondas;
  // El texto de la opcion correcta tiene que ser el que el JSON marca como correcto, en el orden que sea
  const correctas = new Set(categorias.flatMap((c) => c.preguntas.map((p) => p.opciones[p.correcta])));
  for (const r of rondas) assert.ok(correctas.has(r.opciones[r.correcta]), `la ronda ${r.id} marca como correcta "${r.opciones[r.correcta]}"`);
  // Mientras haya preguntas, una vuelta completa visita cada categoria una vez
  const vuelta = rondas.slice(0, categorias.length);
  assert.equal(new Set(vuelta.map((r) => r.categoria.id)).size, vuelta.length);
  motor.detener();
});

test('Adivina el destino: las pistas las suelta el host y el puntaje baja con cada pista', () => {
  const { motor, ana, beto, modulo } = empezar('adivina-destino');
  assert.equal(motor.hostAccion('siguientePista').error, 'fuera_de_fase'); // en INTRO no
  motor.hostAvanzar();
  const r = ronda(motor);
  const total = r.pistas.length;
  assert.equal(r.opciones.length, 4);
  let vista = modulo.vistaJugador(motor.contexto(), ana);
  assert.equal(vista.pistas.length, 1);
  assert.equal(vista.totalPistas, total);
  assert.ok(!('nombre' in vista) && !('correcta' in vista), 'no revela el destino en ACTIVA');

  // Ana responde con 1 pista a la vista
  assert.ok(motor.procesarInput(ana.id, r.id, r.correcta).ok);
  assert.ok(motor.hostAccion('siguientePista').ok);
  assert.equal(modulo.vistaHost(motor.contexto()).pistas.length, 2);
  for (let i = 2; i < total; i++) assert.ok(motor.hostAccion('siguientePista').ok);
  assert.equal(modulo.vistaHost(motor.contexto()).pistas.length, total);
  assert.equal(motor.hostAccion('siguientePista').error, 'sin_mas_pistas');
  // Beto responde bien, pero con todas las pistas a la vista
  assert.ok(motor.procesarInput(beto.id, r.id, r.correcta).ok);
  assert.equal(motor.estado.juego.subfase, SUBFASES.REVELACION);
  assert.equal(ana.puntos, 100 + (total - 1) * 50);
  assert.equal(beto.puntos, 100);

  vista = modulo.vistaJugador(motor.contexto(), ana);
  assert.equal(vista.pistas.length, total);
  assert.equal(vista.nombre, r.nombre);
  motor.detener();
});

test('Adivina el destino: una respuesta incorrecta da 0 y las opciones incluyen la correcta', () => {
  const { motor, ana, beto } = empezar('adivina-destino');
  motor.hostAvanzar();
  const r = ronda(motor);
  assert.ok(r.opciones.includes(r.nombre));
  assert.equal(new Set(r.opciones).size, 4);
  const mala = [0, 1, 2, 3].find((i) => i !== r.correcta);
  motor.procesarInput(ana.id, r.id, mala);
  motor.procesarInput(beto.id, r.id, r.correcta);
  assert.equal(ana.puntos, 0);
  assert.equal(beto.puntos, 100 + (r.pistas.length - 1) * 50); // respondio con 1 sola pista a la vista
  motor.detener();
});

test('los generadores de bots devuelven entradas que el juego acepta', () => {
  for (const id of IDS) {
    const { motor, ana, beto, modulo } = empezar(id);
    motor.hostAvanzar();
    const vista = modulo.vistaJugador(motor.contexto(), ana);
    for (let i = 0; i < 20; i++) {
      const valor = modulo.generarInputBot(vista);
      const r = modulo.procesarInput(motor.contexto(), ana, valor);
      assert.ok(r.ok, `${id}: el bot mando ${JSON.stringify(valor)}`);
    }
    assert.ok(beto);
    motor.detener();
  }
});

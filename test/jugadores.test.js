const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEstado } = require('../server/estado');
const J = require('../server/jugadores');
const { rankingIndividual, rankingEquipos } = require('../server/puntaje');

test('valida nombres: espacios, largo y caracteres de control', () => {
  assert.equal(J.validarNombre('  Ana   María ').nombre, 'Ana María');
  assert.equal(J.validarNombre('A').error, 'nombre_corto');
  assert.equal(J.validarNombre('x'.repeat(21)).error, 'nombre_largo');
  assert.equal(J.validarNombre(42).error, 'nombre_invalido');
  assert.equal(J.validarNombre('Ana\u0000​').nombre, 'Ana');
});

test('rechaza nombres repetidos sin importar mayusculas ni tildes', () => {
  const e = crearEstado();
  assert.ok(J.unirse(e, { nombre: 'María', socketId: 's1' }).ok);
  assert.equal(J.unirse(e, { nombre: 'maria', socketId: 's2' }).error, 'nombre_en_uso');
});

test('los equipos quedan balanceados (diferencia maxima de 1)', () => {
  const e = crearEstado();
  for (let i = 0; i < 18; i++) J.unirse(e, { nombre: `Jugador ${i}`, socketId: `s${i}` });
  const cuenta = {};
  for (const p of e.jugadores.values()) cuenta[p.equipoId] = (cuenta[p.equipoId] || 0) + 1;
  const valores = Object.values(cuenta);
  assert.equal(valores.length, 4);
  assert.ok(Math.max(...valores) - Math.min(...valores) <= 1, JSON.stringify(cuenta));
});

test('reconexion con sessionId conserva nombre, equipo y puntos, e ignora el nombre enviado', () => {
  const e = crearEstado();
  const a = J.unirse(e, { nombre: 'Ana', socketId: 's1' }).jugador;
  a.puntos = 450;
  J.desconectar(e, 's1');
  assert.equal(a.conectado, false);
  const r = J.unirse(e, { sessionId: a.sessionId, nombre: 'Otro', socketId: 's2' });
  assert.ok(r.ok && r.reconectado);
  assert.equal(r.jugador.nombre, 'Ana');
  assert.equal(r.jugador.puntos, 450);
  assert.equal(r.jugador.equipoId, a.equipoId);
  assert.equal(r.jugador.conectado, true);
});

test('una pestana duplicada devuelve el socket anterior para cerrarlo', () => {
  const e = crearEstado();
  const a = J.unirse(e, { nombre: 'Ana', socketId: 's1' }).jugador;
  const r = J.unirse(e, { sessionId: a.sessionId, socketId: 's2' });
  assert.equal(r.socketAnterior, 's1');
  // la desconexion tardia del socket viejo no debe marcar como caido al jugador
  J.desconectar(e, 's1');
  assert.equal(a.conectado, true);
});

test('sessionId desconocido sin nombre pide registro', () => {
  const e = crearEstado();
  assert.equal(J.unirse(e, { sessionId: 'no-existe', socketId: 's1' }).error, 'nombre_invalido');
});

test('expulsar elimina al jugador y su sessionId deja de servir', () => {
  const e = crearEstado();
  const a = J.unirse(e, { nombre: 'Ana', socketId: 's1' }).jugador;
  assert.ok(J.expulsar(e, a.id));
  assert.equal(e.jugadores.size, 0);
  assert.equal(J.unirse(e, { sessionId: a.sessionId, socketId: 's2' }).error, 'nombre_invalido');
});

test('ranking individual: puntos, desempate por tiempo y posicion compartida', () => {
  const e = crearEstado();
  const a = J.unirse(e, { nombre: 'Ana', socketId: '1' }).jugador;
  const b = J.unirse(e, { nombre: 'Beto', socketId: '2' }).jugador;
  const c = J.unirse(e, { nombre: 'Carla', socketId: '3' }).jugador;
  a.puntos = 100; a.tiempoMs = 5000;
  b.puntos = 100; b.tiempoMs = 3000;
  c.puntos = 300;
  const r = rankingIndividual(e);
  assert.deepEqual(r.map((x) => x.nombre), ['Carla', 'Beto', 'Ana']);
  assert.deepEqual(r.map((x) => x.posicion), [1, 2, 3]);
  b.tiempoMs = 5000; // empate total entre Ana y Beto
  assert.deepEqual(rankingIndividual(e).map((x) => x.posicion), [1, 2, 2]);
});

test('ranking de equipos usa el promedio, no la suma', () => {
  const e = crearEstado();
  // Se fuerzan equipos para controlar la prueba
  const ps = ['A', 'B', 'C'].map((n, i) => J.unirse(e, { nombre: `J${n}`, socketId: String(i) }).jugador);
  ps[0].equipoId = 'rojo'; ps[0].puntos = 100;
  ps[1].equipoId = 'rojo'; ps[1].puntos = 100;
  ps[2].equipoId = 'azul'; ps[2].puntos = 150;
  const r = rankingEquipos(e);
  assert.equal(r[0].id, 'azul'); // 150 de promedio gana a 100 aunque rojo sume 200
  assert.equal(r[0].promedio, 150);
});

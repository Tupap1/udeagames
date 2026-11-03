// Simula N jugadores con socket.io-client para probar carga sin tener 40 celulares.
//
// Uso:
//   npm run bots                              (40 bots contra http://localhost:PORT)
//   npm run bots -- --n 20 --url https://juego.btw-one.com --caidas 0.1
//
// Opciones:
//   --n        cantidad de bots (por defecto 40)
//   --url      servidor (por defecto http://localhost:PORT o 3000)
//   --caidas   probabilidad por segundo de que un bot se desconecte y reconecte (por defecto 0.02)
//   --retraso  ms maximos para responder una ronda (por defecto 4000)
//   --rampa    ms entre la entrada de un bot y el siguiente (por defecto 50)
const { io } = require('socket.io-client');
const path = require('node:path');
const { cargarJuegos } = require('../server/juegos');
const { cargarConfig } = require('../server/config');

function leerArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

const args = leerArgs(process.argv.slice(2));
const config = cargarConfig();
const N = Number(args.n) || 40;
const URL = args.url || `http://localhost:${config.port}`;
const PROB_CAIDA = args.caidas !== undefined ? Number(args.caidas) : 0.02;
const RETRASO_MAX = Number(args.retraso) || 4000;
const RAMPA = Number(args.rampa) || 50;

// Cada juego define como responder al azar con generarInputBot(vistaJugador)
const juegos = cargarJuegos({ habilitados: config.juegosHabilitados, dirContenido: config.dirContenido, log: { log() {}, error() {} } });

const stats = { unidos: 0, errores: 0, caidas: 0, reconexiones: 0, inputsOk: 0, inputsRechazados: 0, latenciasJoin: [] };
const bots = [];

function crearBot(indice) {
  const nombre = `Bot-${String(indice + 1).padStart(2, '0')}`;
  const bot = { nombre, socket: null, sessionId: null, vista: null, rondaRespondida: null, timer: null };

  function conectar() {
    const socket = io(URL, { forceNew: true, reconnection: false });
    bot.socket = socket;
    const t0 = Date.now();

    socket.on('connect', () => {
      socket.emit('jugador:unirse', { sessionId: bot.sessionId || undefined, nombre }, (r) => {
        if (r && r.ok) {
          bot.sessionId = r.sessionId;
          if (r.reconectado) stats.reconexiones++;
          else {
            stats.unidos++;
            stats.latenciasJoin.push(Date.now() - t0);
          }
        } else {
          stats.errores++;
          console.error(`[${nombre}] no pudo unirse:`, r && r.error);
        }
      });
    });

    socket.on('vista', (v) => {
      bot.vista = v;
      responderSiToca(bot);
    });
    socket.on('expulsado', () => { bot.sessionId = null; });
    socket.on('connect_error', () => { stats.errores++; });
  }

  bot.conectar = conectar;
  return bot;
}

function responderSiToca(bot) {
  const j = bot.vista && bot.vista.juego;
  if (!j || j.subfase !== 'ACTIVA' || j.yaRespondi || bot.rondaRespondida === j.rondaId) return;
  const entrada = juegos.get(j.id);
  if (!entrada || typeof entrada.modulo.generarInputBot !== 'function') return;
  bot.rondaRespondida = j.rondaId;
  const espera = Math.random() * RETRASO_MAX;
  setTimeout(() => {
    if (!bot.socket || !bot.socket.connected) return;
    const valor = entrada.modulo.generarInputBot(j.vista, bot.vista);
    bot.socket.emit('jugador:input', { rondaId: j.rondaId, valor }, (r) => {
      if (r && r.ok) stats.inputsOk++;
      else stats.inputsRechazados++;
    });
  }, espera);
}

// Cada segundo, algunos bots se caen y vuelven a los 1 a 4 s con su sessionId
function simularCaidas() {
  for (const bot of bots) {
    if (bot.socket && bot.socket.connected && Math.random() < PROB_CAIDA) {
      stats.caidas++;
      bot.socket.disconnect();
      setTimeout(() => bot.conectar(), 1000 + Math.random() * 3000);
    }
  }
}

function resumen() {
  const conectados = bots.filter((b) => b.socket && b.socket.connected).length;
  const l = stats.latenciasJoin;
  const prom = l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0;
  const max = l.length ? Math.max(...l) : 0;
  console.log(
    `[bots] conectados ${conectados}/${N} | unidos ${stats.unidos} | caidas ${stats.caidas} | reconexiones ${stats.reconexiones}` +
    ` | inputs ok ${stats.inputsOk} rechazados ${stats.inputsRechazados} | errores ${stats.errores}` +
    ` | latencia de union prom ${prom} ms, max ${max} ms`,
  );
}

console.log(`[bots] ${N} bots hacia ${URL} (caidas/s: ${PROB_CAIDA}, juegos conocidos: ${[...juegos.keys()].join(', ') || 'ninguno'})`);
for (let i = 0; i < N; i++) {
  const bot = crearBot(i);
  bots.push(bot);
  setTimeout(() => bot.conectar(), i * RAMPA);
}
setInterval(simularCaidas, 1000);
setInterval(resumen, 5000);

function salir() {
  resumen();
  for (const b of bots) b.socket && b.socket.close();
  process.exit(0);
}
process.on('SIGINT', salir);
process.on('SIGTERM', salir);

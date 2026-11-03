// Punto de entrada: Express (archivos estaticos + QR) y Socket.io en un solo proceso.
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const { cargarConfig } = require('./config');
const { cargarJuegos } = require('./juegos');
const { crearMotor } = require('./motor');
const { crearDifusion } = require('./sockets/difusion');
const { crearLimitador } = require('./sockets/limite');
const { registrarEventosJugador } = require('./sockets/jugador');
const { registrarEventosHost } = require('./sockets/host');

async function crearServidor(config, { juegos } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  const publico = path.join(config.raiz, 'public');
  app.get('/healthz', (_req, res) => res.type('text').send('ok'));
  app.get('/host', (_req, res) => res.sendFile(path.join(publico, 'host.html')));

  // El QR se genera una sola vez en el servidor (no depende de librerias del navegador)
  const qrSvg = await QRCode.toString(config.publicUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  app.get('/qr.svg', (_req, res) => res.type('image/svg+xml').send(qrSvg));

  app.use(express.static(publico));

  const servidor = http.createServer(app);
  // maxHttpBufferSize chico: ningun evento del juego necesita mas de unos pocos bytes
  const io = new Server(servidor, { maxHttpBufferSize: 10_000 });

  const juegosCargados = juegos || cargarJuegos({
    habilitados: config.juegosHabilitados,
    dirContenido: config.dirContenido,
  });
  const motor = crearMotor({ juegos: juegosCargados });
  const difusion = crearDifusion(io, motor, config);
  motor.alCambiar = difusion.programar;

  const limitar = crearLimitador({ max: 40, ventanaMs: 5000 });
  io.on('connection', (socket) => {
    limitar(socket);
    registrarEventosJugador(io, socket, motor, difusion);
    registrarEventosHost(io, socket, motor, difusion, config);
  });

  return {
    app,
    servidor,
    io,
    motor,
    difusion,
    escuchar: (puerto = config.port) => new Promise((resolver) => servidor.listen(puerto, () => resolver(servidor.address().port))),
    cerrar: () => new Promise((resolver) => {
      motor.detener();
      difusion.detener();
      io.close(() => resolver());
    }),
  };
}

if (require.main === module) {
  const config = cargarConfig();
  crearServidor(config)
    .then(async (s) => {
      await s.escuchar();
      console.log('\n=== Pasaporte UdeA en vivo ===');
      console.log(`Jugadores:  ${config.publicUrl}`);
      console.log(`Host:       ${config.publicUrl}/host`);
      console.log(`PIN host:   ${config.hostPin}${config.pinGenerado ? '  (generado al azar; defina HOST_PIN para fijarlo)' : ''}`);
      console.log(`Puerto:     ${config.port}`);
      console.log(`Juegos habilitados: ${s.motor.juegos.size ? [...s.motor.juegos.keys()].join(', ') : '(ninguno)'}\n`);

      const apagar = () => s.cerrar().then(() => process.exit(0));
      process.on('SIGINT', apagar);
      process.on('SIGTERM', apagar);
    })
    .catch((err) => {
      console.error('No se pudo iniciar el servidor:', err);
      process.exit(1);
    });
}

module.exports = { crearServidor };

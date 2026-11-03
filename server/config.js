// Lee la configuracion desde variables de entorno y games.config.json.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RAIZ = path.join(__dirname, '..');

function leerJuegosHabilitados() {
  try {
    const crudo = fs.readFileSync(path.join(RAIZ, 'games.config.json'), 'utf8');
    const cfg = JSON.parse(crudo);
    return Array.isArray(cfg.habilitados) ? cfg.habilitados : [];
  } catch (err) {
    console.warn('[config] No pude leer games.config.json:', err.message);
    return [];
  }
}

function cargarConfig(env = process.env) {
  const port = Number(env.PORT) || 3000;
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, '');

  let hostPin = (env.HOST_PIN || '').trim();
  let pinGenerado = false;
  if (!hostPin) {
    // Sin PIN configurado generamos uno aleatorio de 6 digitos para no dejar /host abierto
    hostPin = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    pinGenerado = true;
  }

  return {
    raiz: RAIZ,
    dirContenido: path.join(RAIZ, 'content'),
    port,
    publicUrl,
    hostPin,
    pinGenerado,
    juegosHabilitados: leerJuegosHabilitados(),
  };
}

module.exports = { cargarConfig };

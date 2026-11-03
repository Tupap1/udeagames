// Proyeccion del mapa del mundo (equirectangular). La usan el juego "mapa-mundo" y scripts/generar-mapa.js,
// asi el punto que toca el jugador y el lugar real se miden con la misma regla.
// Se recorta la Antartida y el extremo norte para aprovechar la pantalla.
const LON_MIN = -180;
const LON_MAX = 180;
const LAT_MAX = 84;
const LAT_MIN = -58;
const ANCHO = 1000;
const ALTO = Math.round((ANCHO * (LAT_MAX - LAT_MIN)) / (LON_MAX - LON_MIN));

// lon/lat -> x/y normalizados entre 0 y 1
function aPlano(lon, lat) {
  return {
    x: (lon - LON_MIN) / (LON_MAX - LON_MIN),
    y: (LAT_MAX - lat) / (LAT_MAX - LAT_MIN),
  };
}

// x/y normalizados -> lon/lat
function aGeo(x, y) {
  return {
    lon: LON_MIN + x * (LON_MAX - LON_MIN),
    lat: LAT_MAX - y * (LAT_MAX - LAT_MIN),
  };
}

// Distancia sobre la Tierra en km (formula del haversine)
function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

module.exports = { LON_MIN, LON_MAX, LAT_MAX, LAT_MIN, ANCHO, ALTO, aPlano, aGeo, distanciaKm };

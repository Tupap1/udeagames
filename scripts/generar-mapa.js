// Genera public/img/mapa-mundo.svg a partir de los paises de world-atlas (Natural Earth 1:110m, dominio publico).
// Se corre una sola vez (o si cambia la proyeccion): node scripts/generar-mapa.js
// El SVG queda dentro del proyecto; el dia de la presentacion no se descarga nada.
const fs = require('node:fs');
const path = require('node:path');
const { feature } = require('topojson-client');
const mundo = require('world-atlas/countries-110m.json');
const { ANCHO, ALTO, aPlano } = require('../server/juegos/_proyeccion');

const ANTARTIDA = '010';
const redondear = (n) => Math.round(n * 10) / 10;

function trazo(coordenadas) {
  return coordenadas.map(([lon, lat], i) => {
    const p = aPlano(lon, lat);
    return `${i ? 'L' : 'M'}${redondear(p.x * ANCHO)} ${redondear(p.y * ALTO)}`;
  }).join('') + 'Z';
}

// Los paises que cruzan la linea de cambio de fecha (Rusia, Fiyi) saltan de +180 a -180 y dibujarian una raya
// de lado a lado. Se "desenrolla" el contorno (longitudes negativas + 360) y se dibuja dos veces, una corrida
// 360 grados a la izquierda: el SVG recorta lo que sobra y cada pedazo queda en su borde.
function anillo(coordenadas) {
  const cruza = coordenadas.some(([lon], i) => i > 0 && Math.abs(lon - coordenadas[i - 1][0]) > 180);
  if (!cruza) return trazo(coordenadas);
  const desenrollado = coordenadas.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);
  return trazo(desenrollado) + trazo(desenrollado.map(([lon, lat]) => [lon - 360, lat]));
}

const paises = feature(mundo, mundo.objects.countries).features.filter((f) => f.id !== ANTARTIDA && f.geometry);
const trazos = paises.map((f) => {
  const g = f.geometry;
  const poligonos = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return poligonos.map((pol) => pol.map(anillo).join('')).join('');
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" preserveAspectRatio="none">`
  + `<path d="${trazos}" fill="#2b4a6e" stroke="#0f1b2d" stroke-width="0.6" stroke-linejoin="round"/></svg>\n`;

const destino = path.join(__dirname, '..', 'public', 'img', 'mapa-mundo.svg');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, svg);
console.log(`Mapa generado: ${destino} (${paises.length} paises, ${Math.round(svg.length / 1024)} KB, ${ANCHO}x${ALTO})`);

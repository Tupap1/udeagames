# Pasaporte UdeA en vivo

Plataforma propia tipo Kahoot para la dinámica de "Vivamos la Universidad" (Bienestar Universitario e
Internacionalización). El host proyecta la pantalla, los compañeros escanean un QR, se registran una sola vez
y el host elige desde un menú qué juego sigue.

> **Estado actual: motor más 3 juegos.** Funcionan lobby con QR, registro, equipos, menú del host, ranking,
> reconexión, expulsar jugadores, pasaporte, el simulador de bots y los juegos Mito o verdad, Ruleta de
> Bienestar y Adivina el destino. **Todo el contenido de los juegos es de ejemplo** y está marcado con
> `[VERIFICAR]`: hay que reemplazarlo por lo visto en clase (ver "Cómo cambiar el contenido").

## Cómo correrlo

Requiere Node 22 o superior.

```bash
npm install
npm start
```

Al arrancar imprime las URLs y el PIN del host. Abre `http://localhost:3000/host` en el computador del proyector
y `http://localhost:3000/` en un celular (o en otra pestaña) para jugar.

### Con Docker

```bash
docker build -t pasaporte-udea .
docker run -d --name pasaporte -p 3000:3000 -e HOST_PIN=1234 -e PUBLIC_URL=http://localhost:3000 pasaporte-udea
```

Para ver los logs (ahí aparecen los avisos de contenido) y para detenerlo:

```bash
docker logs pasaporte
docker rm -f pasaporte
```

Si cambian algo en `content/` o en `games.config.json` hay que volver a construir la imagen (o montar la carpeta
con `-v`), porque el contenido se copia dentro de la imagen.

### Variables de entorno

Se pueden poner en un archivo `.env` (hay un ejemplo en `.env.example`).

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `PUBLIC_URL` | URL que se codifica en el QR. Debe ser la que abren los celulares (con https si va detrás del túnel) | `http://localhost:PORT` |
| `HOST_PIN` | PIN para entrar a `/host` | se genera uno al azar y se imprime en consola |

## Probar con muchos jugadores (bots)

Con el servidor corriendo, en otra terminal:

```bash
npm run bots
npm run bots -- --n 20 --url https://juego.btw-one.com --caidas 0.1
```

Simula 40 jugadores (por defecto) que entran, responden al azar y se caen y reconectan. Imprime cada 5 segundos
cuántos están conectados, las reconexiones, los inputs aceptados o rechazados y la latencia de unión.
Los bots usan nombres `Bot-01`, `Bot-02`... Si repites la prueba contra el mismo servidor, reinícialo o usa
"Reiniciar todo" en el panel de jugadores del host, porque los nombres de la corrida anterior siguen ocupados.

## Pruebas automáticas

```bash
npm test
```

Cubren equipos balanceados, reconexión, expulsión, rankings, la máquina de estados y una partida completa por
sockets reales. Usan un juego falso que vive solo en `test/` y no forma parte del producto.

## Cómo se usa (host)

- `Espacio` o `→`: acción principal de la pantalla (ir al menú, avanzar de fase).
- `J`: abre o cierra el panel de jugadores, donde se expulsa (dos clics) o se reinicia todo para ensayar.
- `G`: gira la ruleta (solo en la Ruleta de Bienestar, antes de cada ronda).
- `P`: muestra la siguiente pista (solo en Adivina el destino, con la ronda en juego).
- El host se reautentica solo si se recarga la página, mientras la pestaña siga abierta.

## Los juegos

Cada juego tiene intro, rondas (en juego, respuesta, resultados) y al terminar da un sello en el pasaporte a
quien participó. En cada ronda el host pulsa `Espacio` para avanzar: empezar, cerrar (si no cierra sola),
ver resultados y siguiente. La ronda cierra sola cuando todos los conectados respondieron o se acaba el tiempo.

| Juego | Rondas | Tiempo | Puntos |
|---|---|---|---|
| Mito o verdad | 6 | 12 s | 100 si aciertas, más hasta 50 por rapidez |
| Ruleta de Bienestar | 6 | 20 s | 100 si aciertas, más hasta 50 por rapidez |
| Adivina el destino | 5 | 45 s | 100 si aciertas, más 50 por cada pista que aún no se había mostrado |

- **Mito o verdad**: la tarjeta se desliza a la derecha (verdad) o a la izquierda (mito), con botones de respaldo.
- **Ruleta de Bienestar**: el host gira la ruleta antes de empezar la ronda. La categoría ya está decidida en el
  servidor (la ruleta es solo animación), así las categorías se reparten parejo.
- **Adivina el destino**: las pistas las suelta el host con `P` o con el botón. Se descartó soltarlas por reloj
  porque obligaba a modificar el motor; el costo es que depende de que el host las vaya mostrando.

Con 10 a 15 minutos caben dos juegos, tres como máximo. Con 3 juegos hay que elegir cuáles se presentan.

## Cómo cambiar el contenido

Todo vive en `content/`, un JSON por juego, y cada archivo trae un campo `_aviso` con las reglas. Mientras un
elemento tenga `"verificar": true` se muestra la etiqueta `[VERIFICAR]` en pantalla y al arrancar el servidor
imprime cuántos quedan. Al reemplazar el contenido por lo visto en clase, borren `verificar` (o pónganlo en
`false`).

- `mito-verdad.json`: `afirmaciones`, cada una con `texto`, `tema`, `esVerdad` (true o false) y `explicacion`.
  Se mezclan los temas y se juegan 6.
- `ruleta-bienestar.json`: `categorias` (mínimo 2) con `id`, `nombre`, `icono`, `color` (hex de 6 dígitos) y
  `preguntas`. Cada pregunta: `texto`, `opciones` (2 a 4), `correcta` (índice, 0 es la primera) y `explicacion`.
  El servidor baraja las opciones al jugar. Cada categoría necesita al menos una pregunta.
- `adivina-destino.json`: `destinos` (mínimo 4) con `nombre`, `pais` y `pistas` (de la más difícil a la más
  fácil, mínimo 2). Las opciones falsas de cada ronda salen de los otros destinos.

Si un archivo está mal formado, el servidor dice cuál es el error en la consola y ese juego no aparece en el
menú (no se cae). Por eso conviene arrancar y leer la consola antes de la presentación.

## Estructura

```
server/        Backend: motor de estados, jugadores, puntajes, pasaporte, sockets y vistas
server/juegos/ Un módulo por juego + el registro que carga solo los habilitados (_comun.js: utilidades)
content/       Contenido de cada juego (un JSON por juego)
public/        Frontend sin framework y sin build (jugador, host, estilos)
public/js/juegos/  Pantalla de cada juego (_comun.js: piezas compartidas)
scripts/       bots.js
test/          Pruebas automáticas
games.config.json   Lista de juegos habilitados
```

## Cómo habilitar un juego

Un juego solo aparece en el menú cuando su id está en `games.config.json`:

```json
{ "habilitados": ["mito-verdad"] }
```

Al arrancar, el servidor valida el módulo y su contenido. Si algo falla lo dice en consola y ese juego no aparece,
sin tumbar el servidor. Por eso conviene arrancar y leer la consola antes de la presentación.

## Cómo agregar un juego (para quien programe)

Cada juego son tres piezas y no se toca el motor:

1. `server/juegos/<id>.js`: reglas. Exporta `id`, `nombre`, `tema`, `descripcion`, `sello`, `contenido`
   (nombre del JSON en `content/`), `crearRondas(contenido)`, `procesarInput(ctx, jugador, valor)`,
   `puntuar(ctx)`, `vistaHost(ctx)` y `vistaJugador(ctx, jugador)`. Opcionales: `duracionActivaMs`,
   `cierreAnticipado`, `alIniciar(ctx)`, `acciones`, `generarInputBot(vista)`.
2. `public/js/juegos/<id>.js`: pantalla. Exporta `host.render(el, vista, ctx)` y `jugador.render(el, vista, ctx)`.
   El cliente llama a `render` en cada cambio de vista: usen `pintarSi` de `_comun.js` para no destruir el DOM
   (un gesto a medias, una animación) mientras la pantalla siga siendo la misma.
3. `content/<id>.json`: preguntas o situaciones.

Regla de oro: `vistaJugador` nunca debe revelar la respuesta correcta mientras la ronda está activa.

## Despliegue y plan B

Esta sección es la base y **no está probada de punta a punta** (ver "Checklist antes de presentar").
En todos los casos `PUBLIC_URL` debe ser exactamente la dirección que abren los celulares, con `https://`
si hay túnel, porque es la que se codifica en el QR.

### Plan A: servidor propio con Cloudflare

Cadena: celular, Cloudflare, túnel (`cloudflared`), app en el puerto 3000. Con Nginx Proxy Manager en medio
quedaría: celular, Cloudflare, túnel, Nginx Proxy Manager, app.

- Con Nginx Proxy Manager hay que activar **Websockets Support** en el proxy host, o Socket.io cae a
  sondeo largo y se nota lento con 20 personas.
- Opción más simple a evaluar: apuntar el túnel directo a `http://localhost:3000` y saltarse el proxy. Tiene un
  salto menos y un punto menos de fallo. Se queda sin lo que ya tengan configurado en el proxy (certificados
  propios, reglas, registros), que el túnel de Cloudflare ya cubre en su mayor parte. Decídanlo con el equipo.
- Revisar que ninguna regla de Cloudflare (Access, Bot Fight Mode, WAF) bloquee `/socket.io/`.
- Comando de la imagen para el servidor:
  `docker run -d --name pasaporte --restart unless-stopped -p 3000:3000 -e HOST_PIN=<pin> -e PUBLIC_URL=https://juego.btw-one.com pasaporte-udea`
  (cambien el subdominio por el real).

### Plan B: el portátil con Tailscale Funnel (2 minutos)

1. Con el contenedor corriendo en el portátil (`-p 3000:3000`), abrir una terminal y ejecutar
   `tailscale funnel 3000`. Imprime una URL pública `https://...ts.net`.
2. Detener el contenedor y volver a lanzarlo con `-e PUBLIC_URL=<esa URL>`, para que el QR apunte ahí.
3. Abrir `/host` en el navegador del portátil con esa misma URL, no con localhost.

### Checklist antes de presentar

- [ ] Contenido reemplazado por lo visto en clase y sin `[VERIFICAR]` en pantalla.
- [ ] `npm test` en verde y `docker build` sin errores.
- [ ] Servidor arrancado: la consola lista los juegos habilitados y no dice "NO se pudo habilitar".
- [ ] Un celular iPhone con Safari y uno Android con Chrome probaron: registro, deslizar la tarjeta, elegir
  una opción y ver el pasaporte, con la URL real (no localhost).
- [ ] El QR del proyector abre la URL correcta desde un celular con datos móviles (no solo wifi).
- [ ] Ensayo completo con "Reiniciar todo" (panel `J`) antes de la clase, y el PIN del host a mano.
- [ ] Plan B probado una vez: `tailscale funnel 3000`.

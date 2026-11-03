# Pasaporte UdeA en vivo

Plataforma propia tipo Kahoot para la dinámica de "Vivamos la Universidad" (Bienestar Universitario e
Internacionalización). El host proyecta la pantalla, los compañeros escanean un QR, se registran una sola vez
y el host elige desde un menú qué juego sigue.

> **Estado actual: Fase 1 (motor).** Ya funcionan lobby con QR, registro, equipos, menú del host, ranking,
> reconexión, expulsar jugadores, pasaporte y el simulador de bots. Todavía no hay juegos: el primero es la Fase 2.

## Cómo correrlo

Requiere Node 22 o superior.

```bash
npm install
npm start
```

Al arrancar imprime las URLs y el PIN del host. Abre `http://localhost:3000/host` en el computador del proyector
y `http://localhost:3000/` en un celular (o en otra pestaña) para jugar.

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
- El host se reautentica solo si se recarga la página, mientras la pestaña siga abierta.

## Estructura

```
server/        Backend: motor de estados, jugadores, puntajes, pasaporte, sockets y vistas
server/juegos/ Un módulo por juego + el registro que carga solo los habilitados
content/       Contenido de cada juego (un JSON por juego)
public/        Frontend sin framework y sin build (jugador, host, estilos)
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
3. `content/<id>.json`: preguntas o situaciones.

Regla de oro: `vistaJugador` nunca debe revelar la respuesta correcta mientras la ronda está activa.

## Despliegue y plan B

Pendiente para la Fase 6: configuración del reverse proxy (Nginx Proxy Manager con WebSockets detrás del túnel
de Cloudflare) y los pasos del plan B con Tailscale Funnel.

## Cómo agregar preguntas

Pendiente: el esquema de cada JSON se documenta junto con cada juego (Fase 2 en adelante).

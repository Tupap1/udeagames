# Traspaso a sesión local: Pasaporte UdeA en vivo

Este proyecto se empezó en una sesión en la nube. Se continúa en una sesión local en el PC del equipo.
Lee este archivo y `README.md` antes de hacer nada.

## Contexto

Equipo de 3 estudiantes de la Universidad de Antioquia. Clase "Vivamos la Universidad". Presentación el
**miércoles 4 de noviembre de 2026**, dinámica interactiva sobre Bienestar Universitario e Internacionalización
(20% de la nota). Salón de 10 a 20 personas, 10 a 15 minutos, TV conectado a este PC. Lo que no esté probado el
martes en la noche no se presenta. (La sesión en la nube marcaba martes 3 de nov como fecha de hoy: hay que
confirmar con el equipo cuánto tiempo real queda.)

Plataforma propia tipo Kahoot: el host proyecta, los compañeros escanean un QR, se registran una vez y el host
elige desde un menú qué juego sigue. Premios para ganadores individuales y por equipos.

## Cómo quiere trabajar el equipo (reglas)

- Antes de escribir código nuevo, proponer y esperar OK.
- En cada decisión no trivial, decir qué alternativa se descartó y el trade-off, en una o dos líneas.
- Trabajo por fases. Al terminar cada fase: correr todo, decir cómo probarlo y hacer un **checkpoint de
  explain-back**: pedir que expliquen con sus palabras cómo funciona lo hecho y esperar confirmación antes de
  seguir. Prefieren entender el código y poder arreglarlo en vivo que ir rápido.
- No inventar datos reales de la UdeA (programas, requisitos, cifras). El contenido de ejemplo va marcado con
  `[VERIFICAR]` y ellos lo reemplazan con lo visto en clase.
- **No usar la raya larga (em dash)** en ningún texto, comentario ni README.
- Comentarios del código y README en español. Identificadores de dominio en español (jugador, equipo, sello).
- Sin frameworks de frontend, sin build, sin CDNs en tiempo de ejecución (el wifi del salón puede ser malo).
- Mobile first, botones grandes, inputs de 16px o más (iOS no debe hacer zoom).

## Stack

Node 22 LTS + Express + Socket.io, un solo proceso que sirve el frontend estático. QR generado en el servidor
(paquete `qrcode`) apuntando a `PUBLIC_URL`. Config por variables: `PORT`, `PUBLIC_URL`, `HOST_PIN`.
`npm start` levanta todo. **Todo debe correr en Docker** (hay Dockerfile).

## Despliegue (Fase 6)

- Principal: servidor propio (Windows Server con Docker/WSL) en un subdominio tipo `juego.btw-one.com`.
  Cadena: navegador, Cloudflare, túnel de Cloudflare (cloudflared), **Nginx Proxy Manager**, app.
  Los WebSockets ya funcionan en Cloudflare y el túnel; en Nginx Proxy Manager hay que activar
  "Websockets Support" en el proxy host. `PUBLIC_URL` debe ser `https://...`.
  Evaluar luego la opción más simple: apuntar el túnel directo a `http://localhost:3000` sin el proxy
  (un salto menos, un punto menos de fallo). Pendiente comparar pros y contras con el equipo.
- Plan B: mismo proyecto en el portátil expuesto con `tailscale funnel 3000`. Documentar en el README para
  hacerlo en 2 minutos.
- Revisar que ninguna regla de Cloudflare (Access, Bot Fight Mode, WAF) bloquee `/socket.io/`.

## Estado: Fase 1 terminada y probada (salvo lo marcado)

Hecho: lobby con QR, registro, equipos balanceados (4 colores con forma), menú del host, ranking individual y por
equipos (promedio, no suma), reconexión por `sessionId`, expulsar jugador, pasaporte, podio, atajos del host,
`npm run bots` (40 bots con caídas y reconexiones al azar) y la máquina de estados completa del motor.

Verificado en la nube:
- `npm test`: 22 pruebas pasan (motor, jugadores, y partida completa por sockets reales con un juego falso
  que vive solo en `test/`).
- 40 bots entran sin errores (unión 8 ms promedio), 30 reconexiones recuperan al mismo jugador.
- En Chromium: PIN malo, validación de nombres, nombres con HTML se muestran como texto, recarga conserva al
  jugador, expulsión desde el host, sin errores de consola. Layout del host revisado a 1600x900.

**NO verificado todavía:**
- `docker build`. En la nube falló en `npm ci` con "Exit handler never called" (error interno de npm, muy
  probablemente por la red restringida de ese entorno; no confirmado). Es lo primero a probar en local.
- Safari en iPhone y Chrome en Android reales.
- El proxy y el túnel.
- Ningún juego real todavía.

## Primeros pasos en la sesión local

1. `npm install`, `npm test` (deben pasar 22) y `docker build -t pasaporte-udea .`; correr el contenedor con
   `-p 3000:3000 -e HOST_PIN=1234 -e PUBLIC_URL=http://localhost:3000`, abrir `/host` y `/`, y correr
   `npm run bots` contra el contenedor. Reportar qué pasó, incluido cualquier ajuste al Dockerfile.
2. Retomar el **checkpoint de explain-back de la Fase 1** (preguntas abajo) y esperar la confirmación del
   equipo antes de empezar la Fase 2.
3. Confirmar la fecha real de la presentación para decidir el recorte de alcance.

### Preguntas del explain-back (Fase 1)

1. Qué pasa en el servidor cuando un jugador recarga: qué manda el cliente, qué decide el servidor, por qué
   conserva nombre y puntos.
2. Por qué el cliente solo pinta la `vista` y no decide nada, y qué evita que un jugador vea datos de otro.
3. Qué pasa con un `jugador:input` fuera de fase, repetido o tardío.
4. Cómo se reparten los equipos y por qué el ranking por equipos usa promedio.
5. Qué hay que hacer para agregar un juego y por qué no se toca `server/motor.js`.

## Hoja de ruta

Orden de juegos y fases originales:
1. Fase 1 Motor (hecha).
2. Fase 2 **Mito o verdad** (los dos temas): afirmación, deslizar derecha (verdad) o izquierda (mito), con
   botones de respaldo. Probar gestos en Safari de iPhone. Valida el motor.
3. Fase 3 Ruleta de Bienestar (host gira ruleta, categoría, pregunta de opción múltiple) y ¿Quién soy? /
   Adivina el destino (pistas que aparecen de a una, más puntos con menos pistas). Comparten mecánica de
   opción múltiple.
4. Fase 4 Sobrevive el semestre.
5. Fase 5 Mapa en vivo (mapa SVG local) y `/remote`.
6. Fase 6 Despliegue, plan B y prueba con celulares reales (Android e iPhone).

**Recomendación de recorte** (con 10 a 15 min caben 2 juegos, 3 como máximo): Fases 2 y 3 más una Fase 6
mínima. Sobrevive el semestre, Mapa y `/remote` solo si sobra tiempo.

## Mapa del código y decisiones clave

- `server/motor.js`: único que muta el estado. LOBBY, MENU, JUEGO (INTRO, ACTIVA, REVELACION, RESULTADOS,
  por ronda), PODIO. Temporizador con el reloj del servidor, un input por jugador por ronda, inputs fuera de
  fase se rechazan, cierre anticipado si todos los conectados respondieron, puntos saneados, un juego con un
  bug no tumba el servidor.
- `server/juegos/index.js`: registro que valida el módulo y su contenido al arrancar. Solo carga los ids de
  `games.config.json`. La interfaz de módulo está en `README.md`.
- `server/vistas.js` y `server/sockets/difusion.js`: el servidor arma una `vista` por cliente, la envía agrupada
  cada 60 ms y omite el envío si no cambió. `sessionId` nunca sale en una vista.
- Frontend: ES modules nativos. Todo texto entra con `textContent` (helper `el()` en `public/js/compartido/dom.js`),
  nunca `innerHTML`. Cada juego carga `public/js/juegos/<id>.js` con `host.render` y `jugador.render`.
- Descartado y por qué: estado solo en memoria (si el proceso cae se pierde todo; un snapshot a disco se evalúa
  en la Fase 6 si sobra tiempo); `vista` completa en vez de deltas (más simple y reconecta gratis); expulsar sin
  lista negra (el jugador puede volver con otro nombre).
- Limitación conocida: mientras todos tienen 0 puntos todos aparecen como "1º" (empate correcto, se ve raro).
- Trampa de pruebas: los bots usan nombres `Bot-01`..; repetir la corrida contra el mismo servidor da
  `nombre_en_uso`. Reiniciar el servidor o usar "Reiniciar todo" en el panel del host.
- En Node 22, `node --test` necesita un glob (`"test/*.test.js"`), no una carpeta.

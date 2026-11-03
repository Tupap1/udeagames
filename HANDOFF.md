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

## Actualización de la sesión local (2 de noviembre de 2026)

Hecho en local, sin el explain-back de la Fase 1: el equipo pidió saltarlo y hablarlo aparte con el otro agente.
**El explain-back de la Fase 1 sigue pendiente** (preguntas más abajo) y conviene hacerlo antes de presentar, porque
el equipo quiere poder arreglar el código en vivo.

- `npm install` (0 vulnerabilidades), `npm test` y `docker build` funcionan. El fallo de `npm ci` de la nube era
  del entorno. Contenedor y 40 bots sin errores.
- **Bug del motor corregido** (`server/motor.js`): cuando el temporizador cerraba una ronda no se avisaba a los
  clientes, así que la pantalla se quedaba en "0 s" hasta el siguiente cambio. Los bots no lo detectaban porque no
  había juegos. Hay una prueba nueva en `test/motor.test.js`.
- **Fase 2 y Fase 3 hechas**: Mito o verdad, Ruleta de Bienestar y Adivina el destino (servidor en
  `server/juegos/`, pantallas en `public/js/juegos/`, contenido en `content/`, pruebas en `test/juegos.test.js`).
  Los tres están habilitados en `games.config.json`. Ver `README.md` ("Los juegos").
- **Todo el contenido es de ejemplo** y lleva `"verificar": true`. El servidor avisa al arrancar y la pantalla
  muestra `[VERIFICAR]`. Los destinos de Adivina el destino NO son convenios reales de la UdeA.
- Prueba de punta a punta en el contenedor: un host automático jugó los 3 juegos completos con 40 bots (77 caídas,
  75 reconexiones, 666 inputs aceptados, 0 rechazados, 0 errores, sin errores en los logs del servidor).
- Recorrido manual en navegador (Chromium del escritorio, 375x812 para el celular): deslizar la tarjeta, ruleta
  que aterriza en la categoría anunciada, pistas con `P`, puntajes correctos.
- `scripts/bots.js` ahora distingue rondas de juegos distintos (los ids `r0`, `r1` se repiten entre juegos y los
  bots se saltaban rondas).
- README: sección de despliegue (plan A, plan B con Tailscale Funnel) y checklist previa a la presentación.

Decisiones de esta sesión (y lo descartado):
- Las pistas de Adivina el destino las suelta el host (`P`). Descartado soltarlas por reloj: la difusión solo
  envía cuando cambia el estado y habría que modificar el motor. Costo: depende del host.
- La ruleta es animación: la categoría ya está decidida en `crearRondas`. Descartado un giro aleatorio en el
  servidor por ronda: puede repetir categoría y no hay ventaja real.
- Un solo cambio en el motor (el aviso al cerrar por tiempo). El resto de los juegos no lo toca.
- Los juegos reciben `ranking` en el `ctx` del host (cambio en `public/js/host.js`) para mostrarlo en RESULTADOS.

**Sigue sin verificar:** Safari en iPhone y Chrome en Android reales (sobre todo el gesto de deslizar), el proxy y
el túnel de Cloudflare, el plan B con Tailscale. Fecha: hoy es lunes 2 de noviembre y la presentación es el
miércoles 4, así que quedan el lunes y el martes. Falta confirmarlo con el equipo.

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
2. Fase 2 **Mito o verdad** (hecha, ver la actualización de arriba) (los dos temas): afirmación, deslizar derecha (verdad) o izquierda (mito), con
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

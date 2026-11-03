// Motor: maquina de estados global. Es el unico que modifica el estado.
// LOBBY -> MENU -> (VOTACION) -> JUEGO (INTRO -> ACTIVA -> REVELACION -> RESULTADOS, por ronda) -> MENU ... -> PODIO
//
// Los juegos son modulos enchufables (ver server/juegos/index.js). El motor nunca sabe de reglas
// de un juego concreto: solo llama a su interfaz.
const crypto = require('node:crypto');
const { FASES, SUBFASES, AVATARES, crearEstado } = require('./estado');
const jugadores = require('./jugadores');
const { otorgarSellos } = require('./pasaporte');

const DURACION_ACTIVA_POR_DEFECTO_MS = 15_000;
const PUNTOS_MIN = -10_000;
const PUNTOS_MAX = 10_000;

// Tiempos del modo automatico y de la votacion. Las pruebas los acortan.
const TIEMPOS_POR_DEFECTO = Object.freeze({
  revelacionMs: 7_000, // cuanto se ve la respuesta antes de pasar al ranking
  resultadosMs: 7_000, // cuanto se ve el ranking antes de la siguiente ronda
  votacionMs: 20_000,
});

function crearMotor({ juegos = new Map(), ahora = Date.now, log = console, tiempos = {} } = {}) {
  const estado = crearEstado();
  const t = { ...TIEMPOS_POR_DEFECTO, ...tiempos };
  let timer = null; // cierre de la ronda activa
  let timerAuto = null; // avance automatico de REVELACION y RESULTADOS
  let timerVotacion = null;

  const motor = {
    estado,
    juegos,
    // El servidor de sockets se engancha aqui para difundir las vistas
    alCambiar: null,
  };

  function cambio() {
    if (motor.alCambiar) motor.alCambiar();
  }

  // Un juego con un bug no debe tumbar el servidor en plena presentacion
  function seguro(etiqueta, fn, respaldo) {
    try {
      return fn();
    } catch (err) {
      log.error(`[motor] Error en ${etiqueta}:`, err);
      return respaldo;
    }
  }

  function limpiarTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function limpiarTodo() {
    limpiarTimer();
    clearTimeout(timerAuto);
    clearTimeout(timerVotacion);
    timerAuto = null;
    timerVotacion = null;
  }

  // Contexto que se le pasa a los modulos de juego
  function contexto() {
    const j = estado.juego;
    if (!j) return null;
    return {
      estado,
      juego: j,
      ronda: j.rondas[j.indiceRonda] || null,
      subfase: j.subfase,
      ahora: ahora(),
      jugadores: estado.jugadores,
      inputs: j.inputs,
    };
  }
  motor.contexto = contexto;

  const ok = (extra = {}) => ({ ok: true, ...extra });
  const error = (codigo) => ({ ok: false, error: codigo });

  function conectados() {
    let n = 0;
    for (const p of estado.jugadores.values()) if (p.conectado) n++;
    return n;
  }
  motor.conectados = conectados;

  // ---------- Sala ----------

  // La abre el primer dispositivo que la pide. El token lo guarda ese dispositivo para seguir siendo host.
  motor.crearSala = () => {
    if (estado.sala) return error('sala_abierta');
    estado.sala = { token: crypto.randomBytes(24).toString('hex'), creadaEn: ahora() };
    cambio();
    return ok({ token: estado.sala.token });
  };

  motor.tokenValido = (token) => {
    if (!estado.sala || typeof token !== 'string') return false;
    const a = Buffer.from(token);
    const b = Buffer.from(estado.sala.token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  // Cierra la sala: se borra todo, incluidos jugadores y hosts. Devuelve los sockets de jugadores afectados.
  motor.cerrarSala = () => {
    limpiarTodo();
    const sockets = [...estado.jugadores.values()].map((p) => p.socketId).filter(Boolean);
    Object.assign(estado, crearEstado());
    cambio();
    return ok({ sockets });
  };

  // ---------- Jugadores ----------

  motor.unirse = (datos) => {
    const r = jugadores.unirse(estado, datos, { ahora });
    if (r.ok) {
      revisarCierreVotacion();
      cambio();
    }
    return r;
  };

  motor.desconectar = (socketId) => {
    const j = jugadores.desconectar(estado, socketId, ahora);
    if (j) {
      revisarCierreAnticipado();
      revisarCierreVotacion();
      cambio();
    }
    return j;
  };

  motor.expulsar = (jugadorId) => {
    const j = jugadores.expulsar(estado, jugadorId);
    if (!j) return error('jugador_no_existe');
    if (estado.votacion) estado.votacion.votos.delete(jugadorId);
    revisarCierreAnticipado();
    revisarCierreVotacion();
    cambio();
    return ok({ jugador: j });
  };

  motor.cambiarAvatar = (jugadorId, avatar) => {
    const jugador = estado.jugadores.get(jugadorId);
    if (!jugador) return error('no_registrado');
    if (!AVATARES.includes(avatar)) return error('avatar_invalido');
    jugador.avatar = avatar;
    cambio();
    return ok();
  };

  // ---------- Input de jugadores ----------

  motor.procesarInput = (jugadorId, rondaId, valor) => {
    const jugador = estado.jugadores.get(jugadorId);
    if (!jugador) return error('no_registrado');
    const j = estado.juego;
    // Se ignora todo lo que llegue fuera de la fase activa
    if (estado.fase !== FASES.JUEGO || !j || j.subfase !== SUBFASES.ACTIVA) return error('fuera_de_fase');
    const tAhora = ahora();
    if (tAhora > j.finActivaMs) return error('tiempo_agotado');
    const ronda = j.rondas[j.indiceRonda];
    if (!ronda || ronda.id !== rondaId) return error('ronda_invalida');
    if (j.inputs.has(jugadorId)) return error('ya_respondio');

    const entrada = juegos.get(j.id);
    const r = seguro('procesarInput', () => entrada.modulo.procesarInput(contexto(), jugador, valor), null);
    if (!r || !r.ok) return error((r && r.error) || 'input_invalido');

    j.inputs.set(jugadorId, { valor: 'valor' in r ? r.valor : valor, tMs: tAhora - j.inicioActivaMs });
    j.participantes.add(jugadorId);
    revisarCierreAnticipado();
    cambio();
    return ok();
  };

  // Si todos los conectados ya respondieron no hace falta esperar al reloj
  function revisarCierreAnticipado() {
    const j = estado.juego;
    if (!j || j.subfase !== SUBFASES.ACTIVA) return;
    const entrada = juegos.get(j.id);
    if (entrada.modulo.cierreAnticipado === false) return;
    let conectadosTotal = 0;
    let respondieron = 0;
    for (const p of estado.jugadores.values()) {
      if (!p.conectado) continue;
      conectadosTotal++;
      if (j.inputs.has(p.id)) respondieron++;
    }
    if (conectadosTotal > 0 && respondieron === conectadosTotal) cerrarActiva();
  }

  // ---------- Votacion del siguiente juego ----------

  motor.hostAbrirVotacion = () => {
    if (estado.fase !== FASES.MENU) return error('fase_invalida');
    const todos = [...juegos.keys()];
    const pendientes = todos.filter((id) => !estado.juegosJugados.includes(id));
    // Se vota entre los que faltan; si queda uno solo no tiene sentido votar, entonces entran todos
    const opciones = pendientes.length >= 2 ? pendientes : todos;
    if (opciones.length < 2) return error('pocas_opciones');
    const inicio = ahora();
    estado.fase = FASES.VOTACION;
    estado.votacion = { opciones, votos: new Map(), inicioMs: inicio, finMs: inicio + t.votacionMs, cerrada: false, ganador: null, empate: null };
    clearTimeout(timerVotacion);
    const v = estado.votacion;
    timerVotacion = setTimeout(() => {
      if (estado.votacion !== v || v.cerrada) return;
      cerrarVotacion();
      cambio();
    }, t.votacionMs);
    if (timerVotacion.unref) timerVotacion.unref();
    cambio();
    return ok();
  };

  motor.votar = (jugadorId, juegoId) => {
    if (!estado.jugadores.has(jugadorId)) return error('no_registrado');
    const v = estado.votacion;
    if (estado.fase !== FASES.VOTACION || !v || v.cerrada) return error('fuera_de_fase');
    if (!v.opciones.includes(juegoId)) return error('opcion_invalida');
    v.votos.set(jugadorId, juegoId); // se puede cambiar el voto mientras siga abierta
    revisarCierreVotacion();
    cambio();
    return ok();
  };

  function conteoVotos(v) {
    const conteo = Object.fromEntries(v.opciones.map((id) => [id, 0]));
    for (const id of v.votos.values()) if (id in conteo) conteo[id] += 1;
    return conteo;
  }
  motor.conteoVotos = conteoVotos;

  function cerrarVotacion() {
    const v = estado.votacion;
    if (!v || v.cerrada) return;
    clearTimeout(timerVotacion);
    timerVotacion = null;
    const conteo = conteoVotos(v);
    const maximo = Math.max(...Object.values(conteo));
    const lideres = v.opciones.filter((id) => conteo[id] === maximo);
    v.cerrada = true;
    // Sin votos o con empate decide el host entre los que quedaron arriba
    if (maximo > 0 && lideres.length === 1) v.ganador = lideres[0];
    else v.empate = lideres;
  }

  function revisarCierreVotacion() {
    const v = estado.votacion;
    if (estado.fase !== FASES.VOTACION || !v || v.cerrada) return;
    let total = 0;
    let votaron = 0;
    for (const p of estado.jugadores.values()) {
      if (!p.conectado) continue;
      total++;
      if (v.votos.has(p.id)) votaron++;
    }
    if (total > 0 && votaron === total) cerrarVotacion();
  }

  motor.hostCerrarVotacion = () => {
    if (estado.fase !== FASES.VOTACION || !estado.votacion || estado.votacion.cerrada) return error('fase_invalida');
    cerrarVotacion();
    cambio();
    return ok();
  };

  // ---------- Flujo del juego ----------

  function iniciarRonda() {
    const j = estado.juego;
    j.indiceRonda += 1;
    const ronda = j.rondas[j.indiceRonda];
    const entrada = juegos.get(j.id);
    const duracion = ronda.duracionMs || entrada.modulo.duracionActivaMs || DURACION_ACTIVA_POR_DEFECTO_MS;
    j.subfase = SUBFASES.ACTIVA;
    j.inputs = new Map();
    j.puntosRonda = new Map();
    j.inicioActivaMs = ahora();
    j.finActivaMs = j.inicioActivaMs + duracion;
    limpiarTimer();
    const token = ++j.token;
    timer = setTimeout(() => {
      if (!estado.juego || estado.juego.token !== token) return;
      cerrarActiva();
      cambio(); // sin esto los clientes no se enteran de que el tiempo se acabo
    }, duracion);
  }

  function cerrarActiva() {
    const j = estado.juego;
    if (!j || j.subfase !== SUBFASES.ACTIVA) return;
    limpiarTimer();
    const entrada = juegos.get(j.id);
    const crudo = seguro('puntuar', () => entrada.modulo.puntuar(contexto()), {}) || {};
    const pares = crudo instanceof Map ? [...crudo.entries()] : Object.entries(crudo);
    for (const [id, valor] of pares) {
      const jugador = estado.jugadores.get(id);
      // Se sanean los puntos: solo enteros dentro de un rango razonable
      const puntos = Math.max(PUNTOS_MIN, Math.min(PUNTOS_MAX, Math.round(Number(valor))));
      if (!jugador || !Number.isFinite(puntos)) continue;
      jugador.puntos += puntos;
      jugador.porJuego[j.id] = (jugador.porJuego[j.id] || 0) + puntos;
      j.puntosRonda.set(id, puntos);
      const input = j.inputs.get(id);
      if (puntos > 0 && input) jugador.tiempoMs += input.tMs;
    }
    j.subfase = SUBFASES.REVELACION;
    programarAuto();
  }

  function terminarJuego() {
    const j = estado.juego;
    limpiarTodo();
    otorgarSellos(estado, j.id, j.participantes);
    if (!estado.juegosJugados.includes(j.id)) estado.juegosJugados.push(j.id);
    estado.juego = null;
    estado.fase = FASES.MENU;
  }

  // Un paso adelante dentro del juego. Es lo que hace la tecla Espacio y lo que repite el modo automatico.
  function avanzarJuego() {
    const j = estado.juego;
    switch (j.subfase) {
      case SUBFASES.INTRO:
        iniciarRonda();
        break;
      case SUBFASES.ACTIVA:
        cerrarActiva();
        break;
      case SUBFASES.REVELACION:
        j.subfase = SUBFASES.RESULTADOS;
        break;
      case SUBFASES.RESULTADOS:
        if (j.indiceRonda + 1 < j.rondas.length) iniciarRonda();
        else terminarJuego();
        break;
      default:
        return error('subfase_invalida');
    }
    programarAuto();
    return ok();
  }

  // Modo automatico: la respuesta y el ranking se muestran un rato y el juego sigue solo.
  // Un juego puede pedir que el host haga algo antes de seguir (la ruleta espera a que la giren).
  function programarAuto() {
    clearTimeout(timerAuto);
    timerAuto = null;
    const j = estado.juego;
    if (!j) return;
    j.autoHastaMs = null;
    if (!estado.automatico || estado.fase !== FASES.JUEGO) return;
    let espera = null;
    if (j.subfase === SUBFASES.REVELACION) espera = t.revelacionMs;
    else if (j.subfase === SUBFASES.RESULTADOS) {
      const entrada = juegos.get(j.id);
      const esperaHost = seguro('esperarHost', () => Boolean(entrada.modulo.esperarHost && entrada.modulo.esperarHost(contexto())), false);
      if (!esperaHost) espera = t.resultadosMs;
    }
    if (espera === null) return;
    const token = j.token;
    const subfase = j.subfase;
    j.autoHastaMs = ahora() + espera;
    timerAuto = setTimeout(() => {
      const k = estado.juego;
      if (!k || k !== j || k.token !== token || k.subfase !== subfase || !estado.automatico) return;
      avanzarJuego();
      cambio();
    }, espera);
    if (timerAuto.unref) timerAuto.unref();
  }

  // ---------- Acciones del host ----------

  motor.hostIrAMenu = () => {
    if (estado.fase !== FASES.LOBBY) return error('fase_invalida');
    estado.fase = FASES.MENU;
    cambio();
    return ok();
  };

  // Se puede elegir desde el menu o desde la votacion (el host siempre puede decidir)
  motor.hostElegirJuego = (juegoId) => {
    if (estado.fase !== FASES.MENU && estado.fase !== FASES.VOTACION) return error('fase_invalida');
    const entrada = juegos.get(juegoId);
    if (!entrada) return error('juego_no_habilitado');
    // Las rondas se crean frescas en cada partida (el juego puede barajarlas)
    const rondas = seguro('crearRondas', () => entrada.modulo.crearRondas(entrada.contenido), null);
    if (!Array.isArray(rondas) || rondas.length === 0 || rondas.some((r) => !r || typeof r.id !== 'string')) {
      return error('contenido_invalido');
    }
    clearTimeout(timerVotacion);
    estado.votacion = null;
    estado.fase = FASES.JUEGO;
    estado.juego = {
      id: juegoId,
      subfase: SUBFASES.INTRO,
      rondas,
      indiceRonda: -1,
      inicioActivaMs: null,
      finActivaMs: null,
      autoHastaMs: null,
      inputs: new Map(),
      participantes: new Set(),
      puntosRonda: new Map(),
      datos: {}, // espacio privado del modulo de juego
      token: 0,
    };
    seguro('alIniciar', () => entrada.modulo.alIniciar && entrada.modulo.alIniciar(contexto()));
    cambio();
    return ok();
  };

  motor.hostAvanzar = () => {
    // En la votacion, Espacio cierra la votacion y luego arranca el juego ganador
    if (estado.fase === FASES.VOTACION && estado.votacion) {
      if (!estado.votacion.cerrada) return motor.hostCerrarVotacion();
      if (estado.votacion.ganador) return motor.hostElegirJuego(estado.votacion.ganador);
      return error('empate_sin_resolver');
    }
    if (estado.fase !== FASES.JUEGO || !estado.juego) return error('fase_invalida');
    const r = avanzarJuego();
    cambio();
    return r;
  };

  // Acciones propias de un juego (por ejemplo, girar una ruleta)
  motor.hostAccion = (nombre, datos) => {
    const j = estado.juego;
    if (estado.fase !== FASES.JUEGO || !j) return error('fase_invalida');
    const entrada = juegos.get(j.id);
    const accion = entrada.modulo.acciones && entrada.modulo.acciones[nombre];
    if (typeof accion !== 'function') return error('accion_desconocida');
    const r = seguro('accion', () => accion(contexto(), datos), null);
    programarAuto(); // la accion pudo destrabar el avance automatico (la ruleta ya giro)
    cambio();
    return r && r.ok === false ? r : ok();
  };

  motor.hostAutomatico = (activo) => {
    estado.automatico = Boolean(activo);
    programarAuto();
    cambio();
    return ok();
  };

  // Aborta el juego en curso (sin sellos), cancela la votacion o vuelve del podio
  motor.hostVolverAMenu = () => {
    if (estado.fase === FASES.JUEGO || estado.fase === FASES.VOTACION) {
      limpiarTodo();
      estado.juego = null;
      estado.votacion = null;
    } else if (estado.fase !== FASES.PODIO) {
      return error('fase_invalida');
    }
    estado.fase = FASES.MENU;
    cambio();
    return ok();
  };

  motor.hostMostrarPodio = () => {
    if (estado.fase !== FASES.MENU) return error('fase_invalida');
    estado.fase = FASES.PODIO;
    cambio();
    return ok();
  };

  // Borra a los jugadores y los puntajes pero deja la sala abierta. Sirve para ensayar.
  motor.hostReiniciar = () => {
    limpiarTodo();
    const sockets = [...estado.jugadores.values()].map((p) => p.socketId).filter(Boolean);
    const { hostSockets, sala, automatico } = estado;
    Object.assign(estado, crearEstado());
    Object.assign(estado, { hostSockets, sala, automatico }); // el host sigue autenticado
    cambio();
    return ok({ sockets });
  };

  // Para detener timers al apagar o en pruebas
  motor.detener = () => limpiarTodo();

  return motor;
}

module.exports = {
  crearMotor,
  DURACION_ACTIVA_POR_DEFECTO_MS,
  TIEMPOS_POR_DEFECTO,
};

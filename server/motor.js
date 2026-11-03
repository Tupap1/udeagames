// Motor: maquina de estados global. Es el unico que modifica el estado.
// LOBBY -> MENU -> JUEGO (INTRO -> ACTIVA -> REVELACION -> RESULTADOS, por ronda) -> MENU ... -> PODIO
//
// Los juegos son modulos enchufables (ver server/juegos/index.js). El motor nunca sabe de reglas
// de un juego concreto: solo llama a su interfaz.
const { FASES, SUBFASES, crearEstado } = require('./estado');
const jugadores = require('./jugadores');
const { otorgarSellos } = require('./pasaporte');

const DURACION_ACTIVA_POR_DEFECTO_MS = 15_000;
const PUNTOS_MIN = -10_000;
const PUNTOS_MAX = 10_000;

function crearMotor({ juegos = new Map(), ahora = Date.now, log = console } = {}) {
  const estado = crearEstado();
  let timer = null;

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

  // ---------- Jugadores ----------

  motor.unirse = (datos) => {
    const r = jugadores.unirse(estado, datos, { ahora });
    if (r.ok) cambio();
    return r;
  };

  motor.desconectar = (socketId) => {
    const j = jugadores.desconectar(estado, socketId, ahora);
    if (j) {
      revisarCierreAnticipado();
      cambio();
    }
    return j;
  };

  motor.expulsar = (jugadorId) => {
    const j = jugadores.expulsar(estado, jugadorId);
    if (!j) return error('jugador_no_existe');
    revisarCierreAnticipado();
    cambio();
    return ok({ jugador: j });
  };

  // ---------- Input de jugadores ----------

  motor.procesarInput = (jugadorId, rondaId, valor) => {
    const jugador = estado.jugadores.get(jugadorId);
    if (!jugador) return error('no_registrado');
    const j = estado.juego;
    // Se ignora todo lo que llegue fuera de la fase activa
    if (estado.fase !== FASES.JUEGO || !j || j.subfase !== SUBFASES.ACTIVA) return error('fuera_de_fase');
    const t = ahora();
    if (t > j.finActivaMs) return error('tiempo_agotado');
    const ronda = j.rondas[j.indiceRonda];
    if (!ronda || ronda.id !== rondaId) return error('ronda_invalida');
    if (j.inputs.has(jugadorId)) return error('ya_respondio');

    const entrada = juegos.get(j.id);
    const r = seguro('procesarInput', () => entrada.modulo.procesarInput(contexto(), jugador, valor), null);
    if (!r || !r.ok) return error((r && r.error) || 'input_invalido');

    j.inputs.set(jugadorId, { valor: 'valor' in r ? r.valor : valor, tMs: t - j.inicioActivaMs });
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
  }

  function terminarJuego() {
    const j = estado.juego;
    limpiarTimer();
    otorgarSellos(estado, j.id, j.participantes);
    if (!estado.juegosJugados.includes(j.id)) estado.juegosJugados.push(j.id);
    estado.juego = null;
    estado.fase = FASES.MENU;
  }

  // ---------- Acciones del host ----------

  motor.hostIrAMenu = () => {
    if (estado.fase !== FASES.LOBBY) return error('fase_invalida');
    estado.fase = FASES.MENU;
    cambio();
    return ok();
  };

  motor.hostElegirJuego = (juegoId) => {
    if (estado.fase !== FASES.MENU) return error('fase_invalida');
    const entrada = juegos.get(juegoId);
    if (!entrada) return error('juego_no_habilitado');
    // Las rondas se crean frescas en cada partida (el juego puede barajarlas)
    const rondas = seguro('crearRondas', () => entrada.modulo.crearRondas(entrada.contenido), null);
    if (!Array.isArray(rondas) || rondas.length === 0 || rondas.some((r) => !r || typeof r.id !== 'string')) {
      return error('contenido_invalido');
    }
    estado.fase = FASES.JUEGO;
    estado.juego = {
      id: juegoId,
      subfase: SUBFASES.INTRO,
      rondas,
      indiceRonda: -1,
      inicioActivaMs: null,
      finActivaMs: null,
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
    const j = estado.juego;
    if (estado.fase !== FASES.JUEGO || !j) return error('fase_invalida');
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
    cambio();
    return ok();
  };

  // Acciones propias de un juego (por ejemplo, girar una ruleta)
  motor.hostAccion = (nombre, datos) => {
    const j = estado.juego;
    if (estado.fase !== FASES.JUEGO || !j) return error('fase_invalida');
    const entrada = juegos.get(j.id);
    const accion = entrada.modulo.acciones && entrada.modulo.acciones[nombre];
    if (typeof accion !== 'function') return error('accion_desconocida');
    const r = seguro('accion', () => accion(contexto(), datos), null);
    cambio();
    return r && r.ok === false ? r : ok();
  };

  // Aborta el juego en curso (sin sellos) o vuelve del podio
  motor.hostVolverAMenu = () => {
    if (estado.fase === FASES.JUEGO) {
      limpiarTimer();
      estado.juego = null;
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

  // Borra todo, incluidos los jugadores. Sirve para ensayar. Devuelve los sockets afectados.
  motor.hostReiniciar = () => {
    limpiarTimer();
    const sockets = [...estado.jugadores.values()].map((p) => p.socketId).filter(Boolean);
    const hosts = estado.hostSockets;
    Object.assign(estado, crearEstado());
    estado.hostSockets = hosts; // el host sigue autenticado
    cambio();
    return ok({ sockets });
  };

  // Para detener timers al apagar o en pruebas
  motor.detener = () => limpiarTimer();

  return motor;
}

module.exports = {
  crearMotor,
  DURACION_ACTIVA_POR_DEFECTO_MS,
};

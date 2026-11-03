// Utilidades compartidas por los juegos. El nombre empieza con guion bajo: no es un juego
// y el registro nunca lo carga como tal (solo carga los ids de games.config.json).

function barajar(lista, azar = Math.random) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Reparte por turnos entre varios grupos (para mezclar temas en vez de agruparlos)
function intercalar(grupos) {
  const colas = grupos.map((g) => [...g]);
  const salida = [];
  while (colas.some((c) => c.length)) {
    for (const c of colas) if (c.length) salida.push(c.shift());
  }
  return salida;
}

function exigirTexto(valor, campo) {
  if (typeof valor !== 'string' || !valor.trim()) throw new Error(`falta "${campo}"`);
  return valor.trim();
}

// Bono de rapidez: de 0 a `maximo`, segun cuanto tiempo sobraba de la ronda al responder
function bonoRapidez(ctx, tMs, maximo) {
  const total = ctx.juego.finActivaMs - ctx.juego.inicioActivaMs;
  if (!(total > 0)) return 0;
  const sobrante = Math.max(0, Math.min(1, 1 - tMs / total));
  return Math.round(maximo * sobrante);
}

const indiceValido = (valor, cantidad) => Number.isInteger(valor) && valor >= 0 && valor < cantidad;

// Valida una pregunta de opcion multiple y devuelve la version limpia
function validarPregunta(p, etiqueta) {
  if (!p || typeof p !== 'object') throw new Error(`${etiqueta}: no es un objeto`);
  const texto = exigirTexto(p.texto, `${etiqueta}.texto`);
  if (!Array.isArray(p.opciones) || p.opciones.length < 2 || p.opciones.length > 4) {
    throw new Error(`${etiqueta}: "opciones" debe tener de 2 a 4 textos`);
  }
  const opciones = p.opciones.map((o, i) => exigirTexto(o, `${etiqueta}.opciones[${i}]`));
  if (!indiceValido(p.correcta, opciones.length)) throw new Error(`${etiqueta}: "correcta" debe ser el indice de una opcion`);
  return {
    texto,
    opciones,
    correcta: p.correcta,
    explicacion: typeof p.explicacion === 'string' ? p.explicacion.trim() : '',
    verificar: p.verificar === true,
  };
}

// Baraja las opciones y recalcula cual es la correcta, para que no sea siempre la "A"
function barajarOpciones(opciones, correcta, azar = Math.random) {
  const orden = barajar(opciones.map((texto, i) => ({ texto, ok: i === correcta })), azar);
  return { opciones: orden.map((o) => o.texto), correcta: orden.findIndex((o) => o.ok) };
}

// Cuantos eligieron cada opcion. `leer` saca el indice del valor guardado.
function contarOpciones(inputs, cantidad, leer = (valor) => valor) {
  const conteo = new Array(cantidad).fill(0);
  for (const input of inputs.values()) {
    const i = leer(input.valor);
    if (indiceValido(i, cantidad)) conteo[i] += 1;
  }
  return conteo;
}

const esColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);

module.exports = {
  barajar,
  intercalar,
  exigirTexto,
  bonoRapidez,
  indiceValido,
  validarPregunta,
  barajarOpciones,
  contarOpciones,
  esColor,
};

// Ayudante para crear elementos. Todo el texto entra como nodo de texto (nunca innerHTML),
// asi un nombre malicioso como "<img onerror=...>" jamas se ejecuta.
export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave === 'style' && typeof valor === 'object') Object.assign(nodo.style, valor);
    else if (clave.startsWith('on') && typeof valor === 'function') nodo.addEventListener(clave.slice(2), valor);
    else nodo.setAttribute(clave, valor === true ? '' : String(valor));
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

// localStorage puede fallar (modo privado de Safari, datos bloqueados): siempre con try/catch
export const almacen = {
  leer(clave, almacenamiento = 'localStorage') {
    try { return window[almacenamiento].getItem(clave); } catch { return null; }
  },
  guardar(clave, valor, almacenamiento = 'localStorage') {
    try { window[almacenamiento].setItem(clave, valor); } catch { /* sin almacenamiento */ }
  },
  borrar(clave, almacenamiento = 'localStorage') {
    try { window[almacenamiento].removeItem(clave); } catch { /* sin almacenamiento */ }
  },
};

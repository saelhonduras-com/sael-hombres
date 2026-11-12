// Opción "Todo en MAYÚSCULAS" para los PDF (y la impresión, que abre el
// mismo PDF) y para los Excel. Se activa con ?mayusculas=1 en la URL del
// reporte; si no viene, todo sale exactamente como siempre.
//
// En vez de tocar cada línea de cada reporte, se "envuelven" las 3 funciones
// de PDFKit que manejan texto: text() para escribir, y widthOfString() /
// heightOfString() para medir. Así lo que se mide (alturas de fila, ajuste
// de líneas) coincide con lo que se escribe, y el diseño no se descuadra.

function pedidoEnMayusculas(req) {
  const v = req.query.mayusculas;
  return v === '1' || v === 'true';
}

function aMayusculas(valor) {
  return typeof valor === 'string' ? valor.toUpperCase() : valor;
}

function aplicarMayusculas(doc) {
  const text = doc.text.bind(doc);
  const widthOfString = doc.widthOfString.bind(doc);
  const heightOfString = doc.heightOfString.bind(doc);

  doc.text = (t, ...resto) => text(aMayusculas(t), ...resto);
  doc.widthOfString = (t, ...resto) => widthOfString(aMayusculas(t), ...resto);
  doc.heightOfString = (t, ...resto) => heightOfString(aMayusculas(t), ...resto);
  return doc;
}

// Excel: recorre las celdas de la hoja y pasa a mayúsculas solo las de texto.
// Los números, fechas y fórmulas no se tocan.
function mayusculasEnHoja(hoja) {
  Object.keys(hoja).forEach((ref) => {
    if (ref[0] === '!') return; // propiedades de la hoja (anchos, rango), no son celdas
    const celda = hoja[ref];
    if (celda && celda.t === 's' && typeof celda.v === 'string') {
      celda.v = celda.v.toUpperCase();
      delete celda.w; // texto ya formateado: se regenera al escribir
    }
  });
  return hoja;
}

module.exports = { pedidoEnMayusculas, aplicarMayusculas, mayusculasEnHoja };

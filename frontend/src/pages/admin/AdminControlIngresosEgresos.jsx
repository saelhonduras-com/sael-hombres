import { useEffect, useState } from 'react';
import api, { mensajeError } from '../../api';

function formatoL(n) {
  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminControlIngresosEgresos() {
  const [eventoActual, setEventoActual] = useState(null);
  const [pestana, setPestana] = useState('ingresos'); // 'ingresos' | 'egresos'
  const [datosIngresos, setDatosIngresos] = useState(null);
  const [datosEgresos, setDatosEgresos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exportando, setExportando] = useState(null); // 'excel' | 'pdf' | null

  useEffect(() => {
    api.get('/eventos')
      .then(({ data }) => {
        const actual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
        setEventoActual(actual || null);
      })
      .catch(() => setError('No se pudo cargar la información del evento.'));
  }, []);

  // Se cargan Ingresos Y Egresos juntos siempre — así el Total Global se
  // puede mostrar sin importar qué pestaña esté abierta, y cambiar de
  // pestaña es instantáneo (no hay que volver a pedir datos al servidor).
  async function cargar() {
    if (!eventoActual) return;
    setCargando(true);
    setError('');
    try {
      const [rIngresos, rEgresos] = await Promise.all([
        api.get(`/admin/eventos/${eventoActual.id}/control-ingresos`),
        api.get(`/admin/eventos/${eventoActual.id}/control-egresos`),
      ]);
      setDatosIngresos(rIngresos.data);
      setDatosEgresos(rEgresos.data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, [eventoActual]);

  const totalIngresos = datosIngresos?.total || 0;
  const totalEgresos = datosEgresos?.total || 0;
  const totalGlobal = totalIngresos - totalEgresos;
  const datos = pestana === 'ingresos' ? datosIngresos : datosEgresos;

  async function exportar(formato) {
    if (!eventoActual) return;
    setExportando(formato);
    setError('');
    try {
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/control-financiero/${formato}`, {
        responseType: 'blob',
      });
      const extension = formato === 'excel' ? 'xlsx' : 'pdf';
      const nombreArchivo = `control-ingresos-egresos-${eventoActual.nombre.replace(/\s+/g, '-')}.${extension}`;
      const url = window.URL.createObjectURL(new Blob([data]));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreArchivo;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setExportando(null);
    }
  }

  // "Imprimir" abre el PDF real (mismo diseño que el botón PDF) en una
  // pestaña nueva, para imprimir desde el visor de PDF del navegador — así
  // se ve idéntico al PDF descargado, en vez de imprimir la página web con
  // otro diseño.
  async function imprimir() {
    if (!eventoActual) return;
    // Se abre la pestaña ANTES de la llamada async, porque si se abre
    // después de un await, la mayoría de navegadores lo bloquea como pop-up.
    const ventana = window.open('', '_blank');
    setExportando('imprimir');
    setError('');
    try {
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/control-financiero/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      if (ventana) {
        ventana.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err) {
      setError('No se pudo generar la vista de impresión.');
      if (ventana) ventana.close();
    } finally {
      setExportando(null);
    }
  }

  return (
    <div>
      <div className="print:hidden">
        <h1 className="font-display text-2xl font-bold text-ink">Control de Ingresos & Egresos</h1>
        <p className="mt-1 text-sm text-ink/50">
          Solo lectura — todo lo que ves aquí viene de lo ya capturado en Entradas/Salidas de Efectivo, el módulo de
          cobro, Habitaciones, y Asistencia de Saelistas{eventoActual ? <> — mostrando <strong>{eventoActual.nombre}</strong></> : ''}.
        </p>
      </div>

      {/* Título solo para la versión impresa/PDF de pantalla */}
      <div className="hidden print:block">
        <h1 className="font-display text-2xl font-bold text-ink">Control de Ingresos & Egresos</h1>
        {eventoActual && <p className="text-sm text-ink/60">{eventoActual.nombre}</p>}
      </div>

      {/* TOTAL GLOBAL — siempre visible, sin importar la pestaña */}
      {datosIngresos && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink/10 bg-[#EAF3DE] p-4">
            <p className="text-xs font-semibold text-[#007334]">Total Ingresos</p>
            <p className="mt-1 text-2xl font-bold text-ink">{formatoL(totalIngresos)}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-[#FCEBEB] p-4">
            <p className="text-xs font-semibold text-ember">Total Egresos</p>
            <p className="mt-1 text-2xl font-bold text-ink">{formatoL(totalEgresos)}</p>
          </div>
          <div className="rounded-2xl border-2 border-[#1F3464] bg-[#E6F1FB] p-4">
            <p className="text-xs font-semibold text-[#1F3464]">Total Global</p>
            <p className="mt-1 text-2xl font-bold text-ink">{formatoL(totalGlobal)}</p>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex gap-2">
          <button
            onClick={() => setPestana('ingresos')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${pestana === 'ingresos' ? 'bg-[#007334] text-white' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'}`}
          >
            Ingresos
          </button>
          <button
            onClick={() => setPestana('egresos')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${pestana === 'egresos' ? 'bg-ember text-white' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'}`}
          >
            Egresos
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportar('excel')}
            disabled={exportando !== null || !datosIngresos}
            className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exportando === 'excel' ? 'Generando…' : '📊 Excel'}
          </button>
          <button
            onClick={() => exportar('pdf')}
            disabled={exportando !== null || !datosIngresos}
            className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exportando === 'pdf' ? 'Generando…' : '📄 PDF'}
          </button>
          <button
            onClick={imprimir}
            disabled={exportando !== null || !datosIngresos}
            className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exportando === 'imprimir' ? 'Preparando…' : '🖨️ Imprimir'}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember print:hidden">{error}</p>}

      {!eventoActual && !cargando && (
        <p className="mt-6 text-sm text-ink/40">No hay un evento SAEL marcado como actual/abierto en este momento.</p>
      )}

      {eventoActual && cargando && <p className="mt-6 text-ink/40 print:hidden">Cargando…</p>}

      {/* Pantalla normal: solo la pestaña activa. Al imprimir: ambas, una tras otra. */}
      {eventoActual && !cargando && (
        <>
          <div className="print:hidden">
            <TablaCuentas titulo={pestana === 'ingresos' ? 'Ingresos' : 'Egresos'} datos={datos} pestana={pestana} />
          </div>
          <div className="hidden print:block">
            <TablaCuentas titulo="Ingresos" datos={datosIngresos} pestana="ingresos" />
            <div className="mt-6">
              <TablaCuentas titulo="Egresos" datos={datosEgresos} pestana="egresos" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TablaCuentas({ titulo, datos, pestana }) {
  if (!datos?.raiz) {
    return (
      <p className="mt-6 text-sm text-ink/40">
        Todavía no hay ninguna cuenta raíz de {pestana === 'ingresos' ? 'ingreso' : 'egreso'} en el Catálogo de Cuentas.
      </p>
    );
  }
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink/10 bg-[#1F3464]/12 text-left text-xs uppercase tracking-wide text-[#1F3464]">
            <th className="px-3 py-3">Catálogo</th>
            <th className="px-3 py-3">Concepto</th>
            <th className="px-3 py-3 text-right">Cantidad</th>
            <th className="px-3 py-3 text-right">Valor</th>
            <th className="px-3 py-3 text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          <FilaCuenta cuenta={datos.raiz} nivel={0} />
        </tbody>
        <tfoot>
          <tr className={`border-t-2 border-ink font-bold text-ink ${pestana === 'ingresos' ? 'bg-[#FDC41F]/20' : 'bg-ember/10'}`}>
            <td className="px-3 py-3" colSpan={4}>Total {titulo}</td>
            <td className="px-3 py-3 text-right">{formatoL(datos.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Componente recursivo de solo lectura — sin ningún botón de editar,
// agregar o eliminar. Todo lo que se ve aquí se administra en otro lado
// (Entradas/Salidas de Efectivo, módulo de cobro, Habitaciones,
// Asistencia de Saelistas, o Catálogo de Cuentas para la estructura).
function FilaCuenta({ cuenta, nivel }) {
  // Negrita para la raíz y para cualquier cuenta que realmente tenga hijos
  // (es un "padre" de verdad) — antes dependía de un corte fijo de nivel
  // (nivel <= 1), que dejaba sin negrita a padres más profundos como
  // "Otros Ingresos" (4.4) aunque tuviera sus propios hijos (4.4.1, 4.4.2...).
  const esPadre = cuenta.hijos && cuenta.hijos.length > 0;
  const negrita = nivel === 0 || esPadre;
  const indentacion = { paddingLeft: `${12 + nivel * 20}px` };

  return (
    <>
      <tr className={`border-b border-ink/5 ${negrita ? 'bg-ink/5 font-bold' : ''} text-ink`}>
        <td className="px-3 py-2 text-xs text-ink/40">{cuenta.codigo || ''}</td>
        <td className="py-2" style={indentacion}>{cuenta.nombre}</td>
        <td className="px-3 py-2 text-right">
          {cuenta.origen === 'categoria' && cuenta.cantidad !== undefined
            ? <span className="font-bold underline">{cuenta.cantidad}</span>
            : (cuenta.cantidad ?? '')}
        </td>
        <td className="px-3 py-2 text-right">{cuenta.valor !== undefined && cuenta.valor !== null ? formatoL(cuenta.valor) : ''}</td>
        <td className="px-3 py-2 text-right">{formatoL(cuenta.monto)}</td>
      </tr>
      {cuenta.hijos && cuenta.hijos.map((h) => (
        <FilaCuenta key={h.id} cuenta={h} nivel={nivel + 1} />
      ))}
    </>
  );
}

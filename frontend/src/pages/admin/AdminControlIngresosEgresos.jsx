import { useEffect, useState } from 'react';
import api, { mensajeError } from '../../api';

function formatoL(n) {
  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminControlIngresosEgresos() {
  const [eventoActual, setEventoActual] = useState(null);
  const [pestana, setPestana] = useState('ingresos'); // 'ingresos' | 'egresos'
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/eventos')
      .then(({ data }) => {
        const actual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
        setEventoActual(actual || null);
      })
      .catch(() => setError('No se pudo cargar la información del evento.'));
  }, []);

  async function cargar() {
    if (!eventoActual) return;
    setCargando(true);
    setError('');
    try {
      const ruta = pestana === 'ingresos' ? 'control-ingresos' : 'control-egresos';
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/${ruta}`);
      setDatos(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, [eventoActual, pestana]);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Control de Ingresos & Egresos</h1>
      <p className="mt-1 text-sm text-ink/50">
        Solo lectura — todo lo que ves aquí viene de lo ya capturado en Entradas/Salidas de Efectivo, el módulo de
        cobro, Habitaciones, y Asistencia de Saelistas{eventoActual ? <> — mostrando <strong>{eventoActual.nombre}</strong></> : ''}.
      </p>

      <div className="mt-3 flex gap-2">
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

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {!eventoActual && !cargando && (
        <p className="mt-6 text-sm text-ink/40">No hay un evento SAEL marcado como actual/abierto en este momento.</p>
      )}

      {eventoActual && (cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : datos?.raiz && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-night text-left text-xs uppercase tracking-wide text-white">
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
                <td className="px-3 py-3" colSpan={4}>Total {pestana === 'ingresos' ? 'Ingresos' : 'Egresos'}</td>
                <td className="px-3 py-3 text-right">{formatoL(datos.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {eventoActual && !cargando && !datos?.raiz && (
        <p className="mt-6 text-sm text-ink/40">
          Todavía no hay ninguna cuenta raíz de {pestana === 'ingresos' ? 'ingreso' : 'egreso'} en el Catálogo de Cuentas.
        </p>
      )}
    </div>
  );
}

// Componente recursivo de solo lectura — sin ningún botón de editar,
// agregar o eliminar. Todo lo que se ve aquí se administra en otro lado
// (Entradas/Salidas de Efectivo, módulo de cobro, Habitaciones,
// Asistencia de Saelistas, o Catálogo de Cuentas para la estructura).
function FilaCuenta({ cuenta, nivel }) {
  const negrita = nivel <= 1;
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
        <td className="px-3 py-2 text-right">{cuenta.origen !== 'categoria' || nivel === 0 ? formatoL(cuenta.monto) : ''}</td>
      </tr>
      {cuenta.hijos && cuenta.hijos.map((h) => (
        <FilaCuenta key={h.id} cuenta={h} nivel={nivel + 1} />
      ))}
    </>
  );
}

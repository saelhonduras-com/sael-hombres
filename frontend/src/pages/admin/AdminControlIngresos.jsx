import { useEffect, useState } from 'react';
import api, { mensajeError } from '../../api';

const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none';
const btnGuardar = 'rounded-full bg-[#007334] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#005c29] disabled:opacity-50';
const btnEliminar = 'rounded-full bg-ember px-3 py-1 text-xs font-semibold text-white hover:bg-ember-light';

function formatoL(n) {
  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminControlIngresos() {
  const [eventoActual, setEventoActual] = useState(null);
  const [datos, setDatos] = useState(null); // { raiz, total }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [agregando, setAgregando] = useState(null); // { cuenta_id, cuenta_nombre } | null
  const [formNuevo, setFormNuevo] = useState({ concepto: '', cantidad: '1', valor: '' });
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

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
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/control-ingresos`);
      setDatos(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, [eventoActual]);

  function abrirAgregar(cuenta) {
    setFormNuevo({ concepto: '', cantidad: '1', valor: '' });
    setAgregando({ cuenta_id: cuenta.id, cuenta_nombre: cuenta.nombre });
  }

  async function guardarNuevo() {
    if (!formNuevo.concepto || formNuevo.valor === '') {
      setError('El concepto y el valor son obligatorios.');
      return;
    }
    setGuardandoNuevo(true);
    setError('');
    try {
      await api.post(`/admin/eventos/${eventoActual.id}/movimientos`, {
        cuenta_id: agregando.cuenta_id,
        concepto: formNuevo.concepto,
        cantidad: Number(formNuevo.cantidad) || 1,
        valor: Number(formNuevo.valor),
      });
      setAgregando(null);
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoNuevo(false);
    }
  }

  async function eliminarMovimiento(movimientoId) {
    setError('');
    try {
      await api.delete(`/admin/movimientos/${movimientoId}`);
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Control de Ingresos</h1>
      <p className="mt-1 text-sm text-ink/50">
        Boletos y habitaciones se calculan solos a partir de lo que ya está registrado. Ofrenda y Otros Ingresos se
        agregan a mano{eventoActual ? <> — mostrando <strong>{eventoActual.nombre}</strong></> : ''}.
      </p>

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
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <FilaCategoria cuenta={datos.raiz} nivel={0} onAgregar={abrirAgregar} onEliminar={eliminarMovimiento} />
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink bg-[#FDC41F]/20 font-bold text-ink">
                <td className="px-3 py-3" colSpan={4}>Total Ingresos</td>
                <td className="px-3 py-3 text-right">{formatoL(datos.total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {agregando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="font-display text-lg font-bold text-ink">Agregar renglón — {agregando.cuenta_nombre}</h3>
            <div className="mt-4 space-y-4">
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Concepto</span>
                <input type="text" value={formNuevo.concepto} onChange={(e) => setFormNuevo((f) => ({ ...f, concepto: e.target.value }))} className={claseInput} placeholder="Ej. Ofrenda Visión para Tu Negocio" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Cantidad</span>
                <input type="number" min="1" value={formNuevo.cantidad} onChange={(e) => setFormNuevo((f) => ({ ...f, cantidad: e.target.value }))} className={claseInput} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Valor (L.)</span>
                <input type="number" min="0" step="0.01" value={formNuevo.valor} onChange={(e) => setFormNuevo((f) => ({ ...f, valor: e.target.value }))} className={claseInput} />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setAgregando(null)} className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
              <button onClick={guardarNuevo} disabled={guardandoNuevo} className={btnGuardar}>{guardandoNuevo ? 'Guardando…' : 'Agregar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente recursivo: pinta una cuenta y todos sus hijos, con
// indentación según el nivel — igual estructura visual que el Excel.
function FilaCategoria({ cuenta, nivel, onAgregar, onEliminar }) {
  const esCategoriaConHijos = cuenta.hijos && cuenta.hijos.length >= 0 && (cuenta.origen === 'categoria' || cuenta.origen === 'manual');
  const negrita = nivel <= 1;
  const indentacion = { paddingLeft: `${12 + nivel * 20}px` };

  return (
    <>
      <tr className={`border-b border-ink/5 ${negrita ? 'bg-ink/5 font-bold' : ''} text-ink`}>
        <td className="px-3 py-2 text-xs text-ink/40">{cuenta.codigo}</td>
        <td className="py-2" style={indentacion}>{cuenta.nombre}</td>
        <td className="px-3 py-2 text-right">{cuenta.cantidad ?? ''}</td>
        <td className="px-3 py-2 text-right">{cuenta.valor !== undefined && cuenta.valor !== null ? formatoL(cuenta.valor) : ''}</td>
        <td className="px-3 py-2 text-right">{cuenta.origen !== 'categoria' || nivel === 0 ? formatoL(cuenta.monto) : ''}</td>
        <td className="px-3 py-2 text-right">
          {cuenta.origen === 'manual' && (
            <button onClick={() => onAgregar(cuenta)} className="rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/5">
              + Agregar
            </button>
          )}
          {cuenta.movimiento_id && (
            <button onClick={() => onEliminar(cuenta.movimiento_id)} className={btnEliminar}>Eliminar</button>
          )}
        </td>
      </tr>
      {cuenta.hijos && cuenta.hijos.map((h) => (
        <FilaCategoria key={h.id} cuenta={h} nivel={nivel + 1} onAgregar={onAgregar} onEliminar={onEliminar} />
      ))}
    </>
  );
}

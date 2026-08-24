import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { mensajeError } from '../../api';

function formatoFecha(iso) {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminMantenimiento() {
  const { rol, refrescarResumen } = useOutletContext();

  const [papelera, setPapelera] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [restaurandoId, setRestaurandoId] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null); // { item, onConfirmar } | null
  const [aviso, setAviso] = useState('');

  function mostrarAviso(mensaje) {
    setAviso(mensaje);
    setTimeout(() => setAviso(''), 2000);
  }

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/admin/papelera');
      setPapelera(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function restaurar(item) {
    setRestaurandoId(item.id);
    setError('');
    try {
      await api.post(`/admin/papelera/${item.id}/restaurar`);
      setPapelera((prev) => prev.filter((p) => p.id !== item.id));
      mostrarAviso(`✓ "${item.descripcion}" restaurado`);
      refrescarResumen();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setRestaurandoId(null);
    }
  }

  function pedirEliminarDefinitivo(item) {
    setConfirmacion({
      item,
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/papelera/${item.id}`);
          setPapelera((prev) => prev.filter((p) => p.id !== item.id));
          mostrarAviso('✓ Eliminado definitivamente');
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  // Candado extra del lado del frontend, por si alguien entra por URL
  // directa sin ser Super Admin — el backend ya lo bloquea de todas
  // formas, esto es solo para no mostrarle la pantalla a nadie más.
  if (rol !== 'super_admin') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-sm">
        <p className="text-4xl">🔒</p>
        <h1 className="mt-3 font-display text-lg font-bold text-ink">Solo Super Admin</h1>
        <p className="mt-2 text-sm text-ink/60">Este módulo es exclusivo del rol Super Admin.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Mantenimiento</h1>
      <p className="mt-1 text-sm text-ink/50">Solo visible para Super Admin.</p>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      <div className="mt-4 rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="border-b border-ink/10 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">🗑️ Papelera</h2>
          <p className="mt-1 text-sm text-ink/50">
            Todo lo que se elimine en el sistema queda guardado aquí — puedes restaurarlo si fue un error, o
            borrarlo para siempre.
          </p>
        </div>

        {cargando ? (
          <p className="p-5 text-sm text-ink/40">Cargando…</p>
        ) : papelera.length === 0 ? (
          <p className="p-5 text-sm text-ink/40">La Papelera está vacía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5 text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Descripción</th>
                <th className="px-5 py-3">Eliminado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {papelera.map((item) => (
                <tr key={item.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-night/10 px-2.5 py-1 text-xs font-semibold text-night">{item.tipo}</span>
                  </td>
                  <td className="px-5 py-3 font-medium text-ink">{item.descripcion}</td>
                  <td className="px-5 py-3 text-ink/50">
                    {formatoFecha(item.eliminado_en)}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => restaurar(item)}
                      disabled={restaurandoId === item.id}
                      className="rounded-full bg-[#007334]/10 px-3 py-1 text-xs font-semibold text-[#007334] hover:bg-[#007334]/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {restaurandoId === item.id ? 'Restaurando…' : 'Restaurar'}
                    </button>
                    <button
                      onClick={() => pedirEliminarDefinitivo(item)}
                      className="ml-2 rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember hover:bg-ember/20"
                    >
                      Eliminar definitivamente
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-ink/15 bg-ink/5 p-5">
        <h2 className="font-display text-base font-bold text-ink/50">📦 Respaldos completos</h2>
        <p className="mt-1 text-sm text-ink/40">Próximamente — descargar y restaurar respaldos completos del sistema.</p>
      </div>

      {confirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/10 text-xl">⚠️</span>
              <h3 className="font-display text-lg font-bold text-ink">¿Eliminar para siempre?</h3>
            </div>
            <p className="mt-3 text-sm text-ink/60">
              "{confirmacion.item.descripcion}" se borrará por completo de la Papelera. A diferencia de "Restaurar",
              esto ya no se puede deshacer de ninguna forma.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmacion(null)} className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/5">
                Cancelar
              </button>
              <button
                onClick={() => { const accion = confirmacion.onConfirmar; setConfirmacion(null); accion(); }}
                className="rounded-full border border-ember/30 bg-ember/10 px-4 py-1.5 text-sm font-semibold text-ember hover:bg-ember/20"
              >
                Sí, eliminar para siempre
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          {aviso}
        </div>
      )}
    </div>
  );
}

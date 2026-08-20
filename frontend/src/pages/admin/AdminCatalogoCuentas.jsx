import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { mensajeError } from '../../api';

const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none';
const btnEditar = 'rounded-full bg-[#007334] px-3 py-1 text-xs font-semibold text-white hover:bg-[#005c29]';
const btnEliminar = 'rounded-full bg-ember px-3 py-1 text-xs font-semibold text-white hover:bg-ember-light';

const vacio = { codigo: '', nombre: '', tipo: 'ingreso', cuenta_padre_id: '', origen: 'manual', orden: '0' };

function aplanar(nodos, nivel = 0, resultado = []) {
  nodos.forEach((n) => {
    resultado.push({ ...n, nivel });
    if (n.hijos && n.hijos.length > 0) aplanar(n.hijos, nivel + 1, resultado);
  });
  return resultado;
}

const ORIGEN_LABEL = { categoria: 'Categoría', automatico: 'Automático', manual: 'Manual' };
const ORIGEN_COLOR = { categoria: 'bg-night/10 text-night', automatico: 'bg-[#007334]/10 text-[#007334]', manual: 'bg-ember/10 text-ember' };

export default function AdminCatalogoCuentas() {
  const { rol, permisosPorModulo } = useOutletContext();
  // Solo el rol "admin" queda sujeto al nivel configurado en Usuarios —
  // super_admin y los demás roles fijos quedan exactamente como estaban.
  const puedeEditar = rol === 'admin' ? permisosPorModulo?.['catalogo_cuentas'] === 'edicion' : true;

  const [arbol, setArbol] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modoEdicion, setModoEdicion] = useState(false);

  const [editandoId, setEditandoId] = useState(null); // id o 'nueva'
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);

  const [confirmacion, setConfirmacion] = useState(null);
  function pedirConfirmacion({ mensaje, textoConfirmar = 'Eliminar', onConfirmar }) {
    setConfirmacion({ mensaje, textoConfirmar, onConfirmar });
  }

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/admin/catalogo-cuentas');
      setArbol(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const plano = aplanar(arbol);

  function abrirNueva(padre) {
    setForm({ ...vacio, cuenta_padre_id: padre ? String(padre.id) : '' });
    setEditandoId('nueva');
  }

  function abrirEditar(cuenta) {
    setForm({
      codigo: cuenta.codigo, nombre: cuenta.nombre, tipo: cuenta.tipo,
      cuenta_padre_id: cuenta.cuenta_padre_id ? String(cuenta.cuenta_padre_id) : '',
      origen: cuenta.origen, orden: String(cuenta.orden ?? 0),
    });
    setEditandoId(cuenta.id);
  }

  async function guardar() {
    if (!form.codigo || !form.nombre) {
      setError('El código y el nombre son obligatorios.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const payload = {
        codigo: form.codigo, nombre: form.nombre, tipo: form.tipo,
        cuenta_padre_id: form.cuenta_padre_id || null, origen: form.origen, orden: Number(form.orden) || 0,
      };
      if (editandoId === 'nueva') {
        await api.post('/admin/catalogo-cuentas', payload);
      } else {
        await api.put(`/admin/catalogo-cuentas/${editandoId}`, payload);
      }
      setEditandoId(null);
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  function eliminar(cuenta) {
    pedirConfirmacion({
      mensaje: `Se eliminará "${cuenta.codigo} ${cuenta.nombre}" — y también todas sus cuentas hijas y cualquier renglón manual que tuvieran registrado. Esta acción no se puede deshacer.`,
      textoConfirmar: 'Sí, eliminar',
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/catalogo-cuentas/${cuenta.id}`);
          cargar();
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink">Catálogo de Cuentas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => puedeEditar && setModoEdicion((m) => !m)}
            disabled={!puedeEditar}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              !puedeEditar
                ? 'cursor-not-allowed bg-ink/5 text-ink/30'
                : modoEdicion ? 'bg-[#007334] text-white hover:bg-[#005c29]' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
            }`}
          >
            {!puedeEditar ? '🔒 Solo consulta' : modoEdicion ? '🔓 Edición activada' : '🔒 Activar edición'}
          </button>
          <button
            onClick={() => abrirNueva(null)}
            disabled={!modoEdicion}
            className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Nueva cuenta raíz
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink/50">
        Estas cuentas se usan en Control de Ingresos, Control de Egresos y el Resumen Financiero. Agrega, edita o
        elimina las que necesites — se reutilizan en todos esos módulos automáticamente.
      </p>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">Cuenta</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Origen</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {plano.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink/40">Sin cuentas creadas todavía.</td></tr>
              )}
              {plano.map((c) => (
                <tr key={c.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-3 py-2 text-xs text-ink/50">{c.codigo}</td>
                  <td className="px-3 py-2 text-ink" style={{ paddingLeft: `${12 + c.nivel * 20}px` }}>
                    {c.nombre}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${c.tipo === 'ingreso' ? 'bg-[#007334]/10 text-[#007334]' : 'bg-ember/10 text-ember'}`}>
                      {c.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${ORIGEN_COLOR[c.origen]}`}>
                      {ORIGEN_LABEL[c.origen]}
                      {c.clave_sistema ? ' 🔒' : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => abrirNueva(c)} disabled={!modoEdicion} className="rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40">
                      + Sub-cuenta
                    </button>
                    <button onClick={() => abrirEditar(c)} disabled={!modoEdicion} className={`ml-2 ${btnEditar} disabled:cursor-not-allowed disabled:opacity-40`}>
                      Editar
                    </button>
                    <button onClick={() => eliminar(c)} disabled={!modoEdicion} className={`ml-2 ${btnEliminar} disabled:cursor-not-allowed disabled:opacity-40`}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-ink/40">🔒 = esta cuenta está conectada a un cálculo automático del sistema — puedes renombrarla o recodificarla libremente, pero si la eliminas, ese cálculo deja de tener dónde guardar su resultado.</p>

      {editandoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="font-display text-lg font-bold text-ink">{editandoId === 'nueva' ? 'Nueva cuenta' : 'Editar cuenta'}</h3>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1 block text-xs font-semibold text-ink/60">Código *</span>
                  <input type="text" value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} className={claseInput} placeholder="4.1.1" />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold text-ink/60">Orden</span>
                  <input type="number" value={form.orden} onChange={(e) => setForm((f) => ({ ...f, orden: e.target.value }))} className={claseInput} />
                </label>
              </div>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre de la cuenta *</span>
                <input type="text" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className={claseInput} placeholder="Aportación por Boletos en Evento" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Cuenta padre</span>
                <select value={form.cuenta_padre_id} onChange={(e) => setForm((f) => ({ ...f, cuenta_padre_id: e.target.value }))} className={claseInput}>
                  <option value="">— Ninguna (cuenta raíz) —</option>
                  {plano.filter((c) => c.id !== editandoId).map((c) => (
                    <option key={c.id} value={c.id}>{'　'.repeat(c.nivel)}{c.codigo} — {c.nombre}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1 block text-xs font-semibold text-ink/60">Tipo</span>
                  <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))} className={claseInput}>
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold text-ink/60">Origen</span>
                  <select value={form.origen} onChange={(e) => setForm((f) => ({ ...f, origen: e.target.value }))} className={claseInput}>
                    <option value="categoria">Categoría (solo agrupa)</option>
                    <option value="manual">Manual (renglones sueltos)</option>
                    <option value="automatico">Automático (calculado)</option>
                  </select>
                </label>
              </div>
              {form.origen === 'automatico' && (
                <p className="text-xs text-ember">
                  Marcar "Automático" aquí no conecta nada por sí solo — solo lo hacen las 6 cuentas que ya vienen
                  enganchadas al sistema (verás el 🔒 en la lista). Una cuenta nueva marcada "Automático" no calculará
                  nada hasta que se conecte por código.
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditandoId(null)} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="rounded-full bg-[#007334] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005c29] disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/10 text-xl">⚠️</span>
              <h3 className="font-display text-lg font-bold text-ink">¿Estás seguro?</h3>
            </div>
            <p className="mt-3 text-sm text-ink/60">{confirmacion.mensaje}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmacion(null)} className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
              <button
                onClick={() => { const accion = confirmacion.onConfirmar; setConfirmacion(null); accion(); }}
                className="rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-white hover:bg-ember-light"
              >
                {confirmacion.textoConfirmar}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import api, { mensajeError } from '../../api';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre',
];

const vacio = {
  nombre: '', anio: new Date().getFullYear(), mes: 1,
  fecha_inicio: '', fecha_fin: '', fecha_limite_registro: '',
  abierto: true, es_actual: false,
};

// Cuenta regresiva a la fecha límite de registro, mismo estilo que el
// contador del hero público (días / horas / min). Regresa null si ya venció.
function calcularCuentaRegresiva(fechaLimite) {
  const limite = new Date(`${fechaLimite}T23:59:59`);
  const diff = limite - new Date();
  if (diff <= 0) return null;
  return {
    dias: Math.floor(diff / (1000 * 60 * 60 * 24)),
    horas: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutos: Math.floor((diff / (1000 * 60)) % 60),
  };
}

function CajaTiempo({ valor, etiqueta }) {
  return (
    <div className="rounded-lg bg-night px-2.5 py-1 text-center text-white">
      <p className="font-display text-base font-bold leading-none">{String(valor).padStart(2, '0')}</p>
      <p className="text-[9px] uppercase tracking-wide text-white/60">{etiqueta}</p>
    </div>
  );
}

export default function AdminEventos() {
  const [eventos, setEventos] = useState([]);
  const [conteos, setConteos] = useState({}); // { [eventoId]: { total, confirmados } }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(null); // id o 'nuevo'
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null); // { mensaje, textoConfirmar, onConfirmar } | null
  const [, setTick] = useState(0); // fuerza recalcular la cuenta regresiva cada 30s

  useEffect(() => {
    const intervalo = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(intervalo);
  }, []);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/eventos');
      setEventos(data);
      const resultados = await Promise.all(
        data.map((ev) =>
          api.get(`/admin/eventos/${ev.id}/inscripciones`)
            .then(({ data: d }) => [ev.id, { total: d.total, confirmados: d.total_registrados }])
            .catch(() => [ev.id, null])
        )
      );
      setConteos(Object.fromEntries(resultados));
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirNuevo() {
    setForm(vacio);
    setEditando('nuevo');
  }

  function abrirEditar(ev) {
    setForm({
      nombre: ev.nombre, anio: ev.anio, mes: ev.mes,
      fecha_inicio: ev.fecha_inicio.slice(0, 10), fecha_fin: ev.fecha_fin.slice(0, 10),
      fecha_limite_registro: ev.fecha_limite_registro.slice(0, 10),
      abierto: ev.abierto, es_actual: ev.es_actual,
    });
    setEditando(ev.id);
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      if (editando === 'nuevo') {
        await api.post('/admin/eventos', form);
      } else {
        await api.put(`/admin/eventos/${editando}`, form);
      }
      setEditando(null);
      cargar();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  function eliminar(id, nombre) {
    setConfirmacion({
      mensaje: `Se eliminará "${nombre}" y también todas las inscripciones asociadas a este evento. Esta acción no se puede deshacer.`,
      textoConfirmar: 'Sí, eliminar',
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/eventos/${id}`);
          cargar();
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none';

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Eventos</h1>
        {!editando && (
          <button onClick={abrirNuevo} className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light">
            + Nuevo evento
          </button>
        )}
      </div>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {editando && (
        <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold text-ink">{editando === 'nuevo' ? 'Nuevo evento' : 'Editar evento'}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre</span>
              <input type="text" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className={claseInput} placeholder="SAEL Septiembre 2026" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Año</span>
              <input type="number" value={form.anio} onChange={(e) => setForm((f) => ({ ...f, anio: Number(e.target.value) }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Mes</span>
              <select value={form.mes} onChange={(e) => setForm((f) => ({ ...f, mes: Number(e.target.value) }))} className={claseInput}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha inicio</span>
              <input type="date" value={form.fecha_inicio} onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha fin</span>
              <input type="date" value={form.fecha_fin} onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))} className={claseInput} />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha límite de registro</span>
              <input type="date" value={form.fecha_limite_registro} onChange={(e) => setForm((f) => ({ ...f, fecha_limite_registro: e.target.value }))} className={claseInput} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.abierto} onChange={(e) => setForm((f) => ({ ...f, abierto: e.target.checked }))} />
              <span className="text-sm text-ink/70">Registro abierto</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.es_actual} onChange={(e) => setForm((f) => ({ ...f, es_actual: e.target.checked }))} />
              <span className="text-sm text-ink/70">Marcar como evento actual</span>
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setEditando(null)} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
            <button onClick={guardar} disabled={guardando} className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {!editando && (
        cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : (
          <div className="mt-4 space-y-3">
            {eventos.length === 0 && <p className="text-sm text-ink/40">Sin eventos registrados todavía.</p>}
            {eventos.map((ev) => {
              const cuenta = ev.abierto ? calcularCuentaRegresiva(ev.fecha_limite_registro.slice(0, 10)) : null;
              const conteo = conteos[ev.id];
              return (
                <div key={ev.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
                  <div>
                    <p className="font-semibold text-ink">
                      {ev.nombre} {ev.es_actual && <span className="ml-2 rounded-full bg-flame/15 px-2 py-0.5 text-xs font-semibold text-flame">Actual</span>}
                    </p>
                    <p className="text-xs text-ink/50">
                      {ev.fecha_inicio.slice(0, 10)} al {ev.fecha_fin.slice(0, 10)} · Límite: {ev.fecha_limite_registro.slice(0, 10)} · {ev.abierto ? 'Abierto' : 'Cerrado'}
                    </p>
                  </div>

                  <div className="flex items-center gap-5">
                    {conteo && (
                      <div className="flex gap-4">
                        <div className="text-center">
                          <p className="font-display text-lg font-bold text-ink">{conteo.total}</p>
                          <p className="text-[10px] uppercase tracking-wide text-ink/40">Inscritos</p>
                        </div>
                        <div className="text-center">
                          <p className="font-display text-lg font-bold text-ink">{conteo.confirmados}</p>
                          <p className="text-[10px] uppercase tracking-wide text-ink/40">Confirmados</p>
                        </div>
                      </div>
                    )}

                    {cuenta && (
                      <div className="flex gap-1.5">
                        <CajaTiempo valor={cuenta.dias} etiqueta="Días" />
                        <CajaTiempo valor={cuenta.horas} etiqueta="Hrs" />
                        <CajaTiempo valor={cuenta.minutos} etiqueta="Min" />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => abrirEditar(ev)} className="rounded-full bg-[#007334] px-3 py-1 text-xs font-semibold text-white hover:bg-[#005c29]">
                      Editar
                    </button>
                    <button onClick={() => eliminar(ev.id, ev.nombre)} className="rounded-full bg-ember px-3 py-1 text-xs font-semibold text-white hover:bg-ember-light">
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {confirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/10 text-xl">
                ⚠️
              </span>
              <h3 className="font-display text-lg font-bold text-ink">¿Estás seguro?</h3>
            </div>
            <p className="mt-3 text-sm text-ink/60">{confirmacion.mensaje}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmacion(null)}
                className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const accion = confirmacion.onConfirmar;
                  setConfirmacion(null);
                  accion();
                }}
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

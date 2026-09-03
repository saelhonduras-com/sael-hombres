import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { mensajeError } from '../../api';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const vacio = {
  nombre: '', anio: new Date().getFullYear(), mes: 1,
  fecha_inicio: '', fecha_fin: '', fecha_limite_registro: '', hora_limite_registro: '23:59',
  abierto: true, es_actual: false,
};

// Honduras es UTC-6 todo el año — mismo cálculo que usa el backend, para que
// el bloqueo se sienta consistente aunque esto solo sea la capa de aviso.
function mesEnCursoHonduras() {
  const ahoraHN = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return { mes: ahoraHN.getUTCMonth() + 1, anio: ahoraHN.getUTCFullYear() };
}

// Nombre del mes siguiente al actual, para decirle a la persona hasta
// cuándo dura el bloqueo — no solo "por qué", también "hasta cuándo".
function proximoMesTexto() {
  const { mes, anio } = mesEnCursoHonduras();
  const siguienteMes = mes === 12 ? 1 : mes + 1;
  const siguienteAnio = mes === 12 ? anio + 1 : anio;
  return `1 de ${MESES[siguienteMes - 1]} de ${siguienteAnio}`;
}

// Cuenta regresiva a la fecha (y hora) límite de registro, mismo estilo
// que el contador del hero público (días / horas / min). Regresa null si
// ya venció. horaLimite viene en formato "HH:MM" — si no llega ninguna
// (eventos viejos sin el campo todavía), cae a medianoche como antes.
function calcularCuentaRegresiva(fechaLimite, horaLimite) {
  const limite = new Date(`${fechaLimite}T${horaLimite || '23:59'}:00`);
  const diff = limite - new Date();
  if (diff <= 0) return null;
  return {
    dias: Math.floor(diff / (1000 * 60 * 60 * 24)),
    horas: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutos: Math.floor((diff / (1000 * 60)) % 60),
  };
}

// Convierte "HH:MM" (24h, como se guarda en la base) a las tres partes
// que necesita el selector de 12 horas con AM/PM.
function a12Horas(horaHHMM) {
  const [h, m] = (horaHHMM || '23:59').split(':').map(Number);
  const meridiano = h >= 12 ? 'PM' : 'AM';
  let hora12 = h % 12;
  if (hora12 === 0) hora12 = 12;
  return { hora12, minuto: m, meridiano };
}

// Y de vuelta a "HH:MM" (24h) para guardar en la base.
function a24Horas(hora12, minuto, meridiano) {
  let h = Number(hora12) % 12;
  if (meridiano === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

// Para mostrar en el listado, ej. "23:59" → "11:59 PM"
function formatearHora12(horaHHMM) {
  const { hora12, minuto, meridiano } = a12Horas(horaHHMM);
  return `${hora12}:${String(minuto).padStart(2, '0')} ${meridiano}`;
}

function CajaTiempo({ valor, etiqueta }) {
  return (
    <div className="rounded-md bg-night px-2 py-0.5 text-center text-white">
      <p className="font-display text-sm font-bold leading-none">{String(valor).padStart(2, '0')}</p>
      <p className="text-[8px] uppercase tracking-wide text-white/60">{etiqueta}</p>
    </div>
  );
}

export default function AdminEventos() {
  const { rol, permisosPorModulo } = useOutletContext();
  // Solo el rol "admin" queda sujeto al nivel configurado en Usuarios —
  // super_admin y los demás roles fijos quedan exactamente como estaban.
  const puedeEditar = rol === 'admin' ? permisosPorModulo?.['eventos'] === 'edicion' : true;

  const [eventos, setEventos] = useState([]);
  const [conteos, setConteos] = useState({}); // { [eventoId]: { total, confirmados } }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(null); // id o 'nuevo'
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);
  // Bloqueado por defecto — evita clics accidentales en Editar/Eliminar evento.
  const [modoEdicion, setModoEdicion] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null); // { mensaje, textoConfirmar, onConfirmar } | null
  const [negacion, setNegacion] = useState(false); // true = mostrar el modal de "esto no se puede"
  const [bloqueoMes, setBloqueoMes] = useState(null); // string | null = mensaje del bloqueo duro por mes en curso
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
      hora_limite_registro: ev.hora_limite_registro || '23:59',
      abierto: ev.abierto, es_actual: ev.es_actual,
    });
    setEditando(ev.id);
  }

  async function guardar() {
    const { mes: mesHoy, anio: anioHoy } = mesEnCursoHonduras();
    const eventoDelMes = eventos.find((e) => Number(e.mes) === mesHoy && Number(e.anio) === anioHoy);

    // Bloqueo duro: mientras el mes en curso tenga su propio evento, nada de
    // marcar otro evento como actual, abrir otro evento, ni quitarle "actual"
    // al del mes en curso. Sin excepciones — se libera solo cuando cambie el mes.
    if (eventoDelMes) {
      const esElDelMes = String(eventoDelMes.id) === String(editando);
      const intentaCambiarloAOtro = !esElDelMes && (form.es_actual || form.abierto);
      const intentaQuitarleActual = esElDelMes && eventoDelMes.es_actual && !form.es_actual;
      if (intentaCambiarloAOtro || intentaQuitarleActual) {
        setBloqueoMes(
          `No se puede cambiar el evento actual ni su registro mientras estemos en el mes de "${eventoDelMes.nombre}". Este bloqueo es intencional — se libera solo automáticamente a partir del ${proximoMesTexto()}, sin que nadie tenga que hacer nada.`
        );
        return;
      }
    }

    if (form.abierto && !form.es_actual) {
      setNegacion(true);
      return;
    }
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
      mensaje: `Se eliminará "${nombre}" permanentemente — junto con TODAS sus inscripciones, asignaciones y cobros de habitación, todo su financiero (Entradas & Salidas, Control de Ingresos/Egresos), y la asistencia de Saelistas registrada para este evento. Esta acción no se puede deshacer ni restaurar.`,
      textoConfirmar: 'Sí, eliminar todo',
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

  // Para el aviso permanente de arriba — mismo criterio que usa guardar().
  const { mes: mesHoyBanner, anio: anioHoyBanner } = mesEnCursoHonduras();
  const eventoDelMesActual = eventos.find((e) => Number(e.mes) === mesHoyBanner && Number(e.anio) === anioHoyBanner);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink">Eventos</h1>
        {!editando && (
          <div className="flex flex-wrap items-center gap-3">
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
              onClick={abrirNuevo}
              disabled={!modoEdicion}
              className="rounded-full bg-ember/10 px-5 py-2 text-sm font-semibold text-ember hover:bg-ember/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Nuevo evento
            </button>
          </div>
        )}
      </div>
      {!editando && eventoDelMesActual && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border-2 border-night/20 bg-night/5 px-4 py-3.5 text-base text-night">
          <span className="shrink-0 text-2xl">🔒</span>
          <span>
            <span className="font-display font-bold uppercase tracking-wide">Aviso importante:</span> estás en el mes de{' '}
            <strong>{eventoDelMesActual.nombre}</strong> — el evento actual y su registro quedan bloqueados hasta el{' '}
            <strong>{proximoMesTexto()}</strong>, cuando se liberan solos, sin que nadie tenga que hacer nada.
          </span>
        </div>
      )}
      {!editando && !modoEdicion && (
        <p className="mt-2 text-xs text-ink/40">Activa la edición arriba para crear, editar o eliminar eventos.</p>
      )}

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {editando && (
        <div className="mx-auto mt-4 max-w-xl overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <div className="flex h-1.5">
            <span className="flex-1 bg-ember" />
            <span className="flex-1 bg-gold" />
            <span className="flex-1 bg-[#007334]" />
          </div>
          <div className="p-5">
            <h2 className="font-display text-lg font-bold text-ink">{editando === 'nuevo' ? 'Nuevo evento' : 'Editar evento'}</h2>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre</span>
              <input type="text" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className={claseInput} placeholder="SAEL Septiembre 2026" />
            </label>

            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink/40">Fechas</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Mes</span>
                <select value={form.mes} onChange={(e) => setForm((f) => ({ ...f, mes: Number(e.target.value) }))} className={claseInput}>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Año</span>
                <input type="number" value={form.anio} onChange={(e) => setForm((f) => ({ ...f, anio: Number(e.target.value) }))} className={claseInput} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha inicio</span>
                <input type="date" value={form.fecha_inicio} onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))} className={claseInput} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha fin</span>
                <input type="date" value={form.fecha_fin} onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))} className={claseInput} />
              </label>
              <label className="col-span-2">
                <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha límite de registro</span>
                <input type="date" value={form.fecha_limite_registro} onChange={(e) => setForm((f) => ({ ...f, fecha_limite_registro: e.target.value }))} className={claseInput} />
              </label>
              <label className="col-span-2">
                <span className="mb-1 block text-xs font-semibold text-ink/60">Hora límite de registro (Honduras)</span>
                <div className="flex gap-2">
                  <select
                    value={a12Horas(form.hora_limite_registro).hora12}
                    onChange={(e) => {
                      const { minuto, meridiano } = a12Horas(form.hora_limite_registro);
                      setForm((f) => ({ ...f, hora_limite_registro: a24Horas(e.target.value, minuto, meridiano) }));
                    }}
                    className={claseInput}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <select
                    value={a12Horas(form.hora_limite_registro).minuto}
                    onChange={(e) => {
                      const { hora12, meridiano } = a12Horas(form.hora_limite_registro);
                      setForm((f) => ({ ...f, hora_limite_registro: a24Horas(hora12, e.target.value, meridiano) }));
                    }}
                    className={claseInput}
                  >
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
                  </select>
                  <select
                    value={a12Horas(form.hora_limite_registro).meridiano}
                    onChange={(e) => {
                      const { hora12, minuto } = a12Horas(form.hora_limite_registro);
                      setForm((f) => ({ ...f, hora_limite_registro: a24Horas(hora12, minuto, e.target.value) }));
                    }}
                    className={claseInput}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </label>
            </div>

            <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink/40">Estado</p>
            <div className="flex flex-col gap-2 rounded-lg bg-ink/5 p-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.abierto} onChange={(e) => setForm((f) => ({ ...f, abierto: e.target.checked }))} />
                <span className="text-sm text-ink/70">Registro abierto</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.es_actual} onChange={(e) => setForm((f) => ({ ...f, es_actual: e.target.checked }))} />
                <span className="text-sm text-ink/70">Marcar como evento actual</span>
              </label>
              {form.es_actual && !form.abierto && (
                <p className="rounded-lg bg-[#1F3464]/10 px-3 py-2 text-xs text-[#1F3464]">
                  💡 Marcarlo como actual no abre el registro solo — si quieres que el público ya pueda inscribirse, activa también "Registro abierto" arriba.
                </p>
              )}
              {form.es_actual && eventos.some((e) => e.es_actual && e.id !== editando) && (
                <p className="rounded-lg bg-flame/10 px-3 py-2 text-xs text-flame">
                  ⚠️ Esto reemplazará a "{eventos.find((e) => e.es_actual && e.id !== editando)?.nombre}" como el evento actual.
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setEditando(null)} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="rounded-full bg-ember/10 px-5 py-2 text-sm font-semibold text-ember hover:bg-ember/20 disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!editando && (
        cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : (
          <div className="mt-4 space-y-2">
            {eventos.length === 0 && <p className="text-sm text-ink/40">Sin eventos registrados todavía.</p>}
            {eventos.map((ev) => {
              const cuenta = ev.abierto ? calcularCuentaRegresiva(ev.fecha_limite_registro.slice(0, 10), ev.hora_limite_registro) : null;
              const conteo = conteos[ev.id];
              return (
                <div key={ev.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-ink/10 bg-white p-3 shadow-sm">
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{ev.nombre}</span>
                      {ev.es_actual && (
                        <span className="shrink-0 rounded-full bg-flame/15 px-2 py-0.5 text-[10px] font-semibold text-flame">Actual</span>
                      )}
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ev.abierto ? 'bg-[#007334]/10 text-[#007334]' : 'bg-ink/10 text-ink/50'}`}>
                        {ev.abierto ? 'Abierto' : 'Cerrado'}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink/50">
                      {ev.fecha_inicio.slice(0, 10)} al {ev.fecha_fin.slice(0, 10)} · Límite: {ev.fecha_limite_registro.slice(0, 10)} {formatearHora12(ev.hora_limite_registro)}
                    </p>
                  </div>

                  {conteo && (
                    <div className="flex gap-4 text-xs text-ink/60">
                      <span><strong className="font-display text-ink">{conteo.total}</strong> inscritos</span>
                      <span><strong className="font-display text-ink">{conteo.confirmados}</strong> confirmados</span>
                    </div>
                  )}

                  {cuenta && (
                    <div className="flex gap-1">
                      <CajaTiempo valor={cuenta.dias} etiqueta="Días" />
                      <CajaTiempo valor={cuenta.horas} etiqueta="Hrs" />
                      <CajaTiempo valor={cuenta.minutos} etiqueta="Min" />
                    </div>
                  )}

                  <div className="ml-auto flex shrink-0 gap-2">
                    <button
                      onClick={() => abrirEditar(ev)}
                      disabled={!modoEdicion}
                      className="rounded-full bg-[#007334]/10 px-3 py-1 text-xs font-semibold text-[#007334] hover:bg-[#007334]/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Editar
                    </button>
                    {rol === 'super_admin' && (
                      <button
                        onClick={() => eliminar(ev.id, ev.nombre)}
                        disabled={!modoEdicion}
                        className="rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember hover:bg-ember/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Eliminar
                      </button>
                    )}
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
                className="rounded-full border border-ember/30 bg-ember/10 px-4 py-1.5 text-sm font-semibold text-ember hover:bg-ember/20"
              >
                {confirmacion.textoConfirmar}
              </button>
            </div>
          </div>
        </div>
      )}

      {negacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/10 text-xl">
                🚫
              </span>
              <h3 className="font-display text-lg font-bold text-ink">No se puede abrir este evento</h3>
            </div>

            <p className="mt-3 text-sm text-ink/60">
              Solo el evento <strong>actual</strong> puede aceptar inscripciones. Este evento no está marcado
              como actual, así que no puede quedar abierto — el sistema no permite tener dos eventos
              recibiendo registros al mismo tiempo.
            </p>
            <p className="mt-2 text-sm font-semibold text-ink/70">¿Qué quieres hacer?</p>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => { setForm((f) => ({ ...f, es_actual: true })); setNegacion(false); }}
                className="rounded-full border border-[#007334]/30 bg-[#007334]/10 px-4 py-2 text-sm font-semibold text-[#007334] hover:bg-[#007334]/20"
              >
                Marcarlo como evento actual y abrirlo
              </button>
              <button
                onClick={() => { setForm((f) => ({ ...f, abierto: false })); setNegacion(false); }}
                className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5"
              >
                Dejarlo cerrado
              </button>
            </div>

            <button
              onClick={() => setNegacion(false)}
              className="mt-4 w-full text-center text-xs font-semibold text-ink/40 hover:text-ink/60"
            >
              Cancelar y seguir editando
            </button>
          </div>
        </div>
      )}

      {bloqueoMes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xl">
                🔒
              </span>
              <h3 className="font-display text-lg font-bold text-ink">Esto está bloqueado</h3>
            </div>

            <p className="mt-3 text-sm text-ink/60">{bloqueoMes}</p>

            <button
              onClick={() => setBloqueoMes(null)}
              className="mt-6 w-full rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

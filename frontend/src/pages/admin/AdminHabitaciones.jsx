import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { mensajeError } from '../../api';

const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none';
const btnEditar = 'rounded-full bg-[#007334] px-3 py-1 text-xs font-semibold text-white hover:bg-[#005c29]';
const btnEliminar = 'rounded-full bg-ember px-3 py-1 text-xs font-semibold text-white hover:bg-ember-light';

const vacioHabitacion = { numero: '', capacidad: '', notas: '', modulo_id: '' };
const vacioModulo = { nombre: '', precio_por_persona: '', notas: '' };
const vacioOcupante = { tipo_ocupante: 'participante', seleccionado: null, monto: '', metodo_pago: '', banco_o_recibo: '', observaciones: '' };

export default function AdminHabitaciones() {
  const { rol, permisosPorModulo } = useOutletContext();
  // Solo el rol "admin" queda sujeto al nivel configurado en Usuarios —
  // super_admin y los demás roles fijos quedan exactamente como estaban.
  const puedeEditar = rol === 'admin' ? permisosPorModulo?.['habitaciones'] === 'edicion' : true;

  const [eventoActual, setEventoActual] = useState(null);
  const [vista, setVista] = useState('lista'); // 'lista' | 'formularioHabitacion' | 'formularioModulo' | 'detalle'
  const [modulos, setModulos] = useState([]);
  const [habitaciones, setHabitaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Bloqueado por defecto — evita clics accidentales en Editar/Eliminar
  // módulo u habitación. NO afecta Asignar/Gestionar ocupantes, que es
  // el uso normal del día a día.
  const [modoEdicion, setModoEdicion] = useState(false);

  // Cada módulo colapsado por defecto, para no tener una fila larguísima
  // según se van creando más — se expande individualmente al hacer clic
  // en su encabezado.
  const [expandidos, setExpandidos] = useState({}); // { [moduloId | 'sin-modulo']: boolean }
  function alternarExpandido(clave) {
    setExpandidos((e) => ({ ...e, [clave]: !e[clave] }));
  }

  const [editandoHabitacionId, setEditandoHabitacionId] = useState(null); // id o 'nueva'
  const [formHabitacion, setFormHabitacion] = useState(vacioHabitacion);
  const [editandoModuloId, setEditandoModuloId] = useState(null); // id o 'nuevo'
  const [formModulo, setFormModulo] = useState(vacioModulo);
  const [guardando, setGuardando] = useState(false);

  const [habitacionSeleccionada, setHabitacionSeleccionada] = useState(null);
  const [ocupantes, setOcupantes] = useState([]);
  const [cargandoOcupantes, setCargandoOcupantes] = useState(false);
  const [mostrarAgregarOcupante, setMostrarAgregarOcupante] = useState(false);
  const [formOcupante, setFormOcupante] = useState(vacioOcupante);
  const [busquedaOcupante, setBusquedaOcupante] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [buscandoOcupante, setBuscandoOcupante] = useState(false);
  const [guardandoOcupante, setGuardandoOcupante] = useState(false);

  const [confirmacion, setConfirmacion] = useState(null);
  function pedirConfirmacion({ mensaje, textoConfirmar = 'Eliminar', onConfirmar }) {
    setConfirmacion({ mensaje, textoConfirmar, onConfirmar });
  }

  const [bloqueando, setBloqueando] = useState(null); // { habitacion, mensaje } | null
  const [guardandoBloqueo, setGuardandoBloqueo] = useState(false);

  useEffect(() => {
    api.get('/eventos')
      .then(({ data }) => {
        const actual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
        setEventoActual(actual || null);
      })
      .catch(() => setError('No se pudo cargar la información del evento.'));
  }, []);

  async function cargarTodo() {
    if (!eventoActual) return;
    setCargando(true);
    setError('');
    try {
      const [rModulos, rHabitaciones] = await Promise.all([
        api.get('/admin/modulos'),
        api.get('/admin/habitaciones', { params: { evento_id: eventoActual.id } }),
      ]);
      setModulos(rModulos.data);
      setHabitaciones(rHabitaciones.data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarTodo(); }, [eventoActual]);

  // --- Módulos ---
  function abrirNuevoModulo() {
    setFormModulo(vacioModulo);
    setEditandoModuloId('nuevo');
    setVista('formularioModulo');
  }

  function abrirEditarModulo(m) {
    setFormModulo({ nombre: m.nombre, precio_por_persona: m.precio_por_persona ?? '', notas: m.notas || '' });
    setEditandoModuloId(m.id);
    setVista('formularioModulo');
  }

  async function guardarModulo() {
    if (!formModulo.nombre) {
      setError('El nombre del módulo es obligatorio.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const payload = { ...formModulo, precio_por_persona: formModulo.precio_por_persona || null };
      if (editandoModuloId === 'nuevo') {
        await api.post('/admin/modulos', payload);
      } else {
        await api.put(`/admin/modulos/${editandoModuloId}`, payload);
      }
      setVista('lista');
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  function eliminarModulo(m) {
    pedirConfirmacion({
      mensaje: `Se eliminará el módulo "${m.nombre}". Las habitaciones que estaban en él NO se borran — quedan sin módulo asignado.`,
      textoConfirmar: 'Sí, eliminar',
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/modulos/${m.id}`);
          cargarTodo();
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  // --- Habitaciones (catálogo) ---
  function abrirNuevaHabitacion(moduloId) {
    setFormHabitacion({ ...vacioHabitacion, modulo_id: moduloId || '' });
    setEditandoHabitacionId('nueva');
    setVista('formularioHabitacion');
  }

  function abrirEditarHabitacion(h) {
    setFormHabitacion({ numero: h.numero, capacidad: h.capacidad, notas: h.notas || '', modulo_id: h.modulo_id || '' });
    setEditandoHabitacionId(h.id);
    setVista('formularioHabitacion');
  }

  async function guardarHabitacion() {
    if (!formHabitacion.numero || !formHabitacion.capacidad || Number(formHabitacion.capacidad) < 1) {
      setError('El número y la capacidad (mínimo 1) son obligatorios.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const payload = { ...formHabitacion, capacidad: Number(formHabitacion.capacidad), modulo_id: formHabitacion.modulo_id || null };
      if (editandoHabitacionId === 'nueva') {
        await api.post('/admin/habitaciones', payload);
      } else {
        await api.put(`/admin/habitaciones/${editandoHabitacionId}`, payload);
      }
      setVista('lista');
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  function eliminarHabitacion(h) {
    pedirConfirmacion({
      mensaje: `Se eliminará la habitación "${h.numero}" del catálogo por completo, junto con su historial de ocupantes de TODOS los eventos. Esta acción no se puede deshacer.`,
      textoConfirmar: 'Sí, eliminar',
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/habitaciones/${h.id}`);
          cargarTodo();
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  // --- Bloqueo/reserva de una habitación (por evento) ---
  // No pasa por "modo edición" a propósito: es una acción del día a día
  // (apartar un cuarto para alguien antes de que llegue su depósito), no
  // un cambio estructural del catálogo.
  function abrirBloquear(h) {
    setBloqueando({ habitacion: h, nombre: '', numero_transferencia: '' });
  }

  async function confirmarBloqueo() {
    if (!bloqueando.nombre.trim() || !bloqueando.numero_transferencia.trim()) {
      setError('El nombre y el número de transferencia bancaria son obligatorios.');
      return;
    }
    setGuardandoBloqueo(true);
    setError('');
    try {
      await api.post(`/admin/habitaciones/${bloqueando.habitacion.id}/reservar`, {
        evento_id: eventoActual.id,
        nombre_reservado: bloqueando.nombre.trim(),
        numero_transferencia: bloqueando.numero_transferencia.trim(),
      });
      setBloqueando(null);
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoBloqueo(false);
    }
  }

  function desbloquearHabitacion(h) {
    pedirConfirmacion({
      mensaje: `Se desbloqueará la habitación "${h.numero}" y quedará disponible para el público en general.`,
      textoConfirmar: 'Sí, desbloquear',
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/habitaciones/${h.id}/reservar`, { params: { evento_id: eventoActual.id } });
          cargarTodo();
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  // --- Ocupantes de una habitación ---
  async function abrirDetalle(h) {
    setHabitacionSeleccionada(h);
    setVista('detalle');
    setMostrarAgregarOcupante(false);
    setCargandoOcupantes(true);
    setError('');
    try {
      const { data } = await api.get(`/admin/habitaciones/${h.id}/ocupantes`, { params: { evento_id: eventoActual.id } });
      setOcupantes(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargandoOcupantes(false);
    }
  }

  async function recargarOcupantes() {
    const { data } = await api.get(`/admin/habitaciones/${habitacionSeleccionada.id}/ocupantes`, { params: { evento_id: eventoActual.id } });
    setOcupantes(data);
    cargarTodo(); // refresca nombres/estado en la tabla de fondo
  }

  function abrirAgregarOcupante() {
    setFormOcupante(vacioOcupante);
    setBusquedaOcupante('');
    setResultadosBusqueda([]);
    setMostrarAgregarOcupante(true);
  }

  async function buscarOcupante(e) {
    e.preventDefault();
    if (!busquedaOcupante) return;
    setBuscandoOcupante(true);
    setError('');
    try {
      const ruta = formOcupante.tipo_ocupante === 'participante' ? '/admin/participantes' : '/admin/saelistas';
      const { data } = await api.get(ruta, { params: { buscar: busquedaOcupante } });
      const lista = formOcupante.tipo_ocupante === 'participante' ? data.participantes : data;
      setResultadosBusqueda(lista || []);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setBuscandoOcupante(false);
    }
  }

  async function guardarOcupante() {
    if (!formOcupante.seleccionado) {
      setError('Selecciona a la persona que vas a asignar a la habitación.');
      return;
    }
    setGuardandoOcupante(true);
    setError('');
    try {
      await api.post(`/admin/habitaciones/${habitacionSeleccionada.id}/ocupantes`, {
        evento_id: eventoActual.id,
        tipo_ocupante: formOcupante.tipo_ocupante,
        participante_id: formOcupante.tipo_ocupante === 'participante' ? formOcupante.seleccionado.id : null,
        saelista_id: formOcupante.tipo_ocupante === 'saelista' ? formOcupante.seleccionado.id : null,
        monto: formOcupante.monto || null,
        metodo_pago: formOcupante.metodo_pago || null,
        banco_o_recibo: formOcupante.banco_o_recibo,
        observaciones: formOcupante.observaciones,
      });
      setMostrarAgregarOcupante(false);
      recargarOcupantes();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoOcupante(false);
    }
  }

  function quitarOcupante(ocupante) {
    pedirConfirmacion({
      mensaje: `Se quitará a "${ocupante.nombre_completo}" de esta habitación para el evento actual. Esto no afecta su historial en eventos anteriores.`,
      textoConfirmar: 'Sí, quitar',
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/habitacion-ocupantes/${ocupante.id}`);
          recargarOcupantes();
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  // Agrupa habitaciones por módulo (las que no tienen módulo van al final, "Sin módulo")
  const gruposModulo = modulos.map((m) => ({
    modulo: m,
    habitaciones: habitaciones.filter((h) => h.modulo_id === m.id),
  }));
  const sinModulo = habitaciones.filter((h) => !h.modulo_id);

  return (
    <div>
      <div className="sticky top-16 z-10 -mx-6 bg-parchment px-6 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-bold text-ink">Habitaciones</h1>
          {vista === 'lista' && (
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
                onClick={abrirNuevoModulo}
                disabled={!modoEdicion}
                className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                + Nuevo módulo
              </button>
              <button
                onClick={() => abrirNuevaHabitacion(null)}
                disabled={!modoEdicion}
                className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:cursor-not-allowed disabled:opacity-40"
              >
                + Nueva habitación
              </button>
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-ink/50">
          Los módulos y habitaciones son fijos y se reutilizan en cada evento. Quién ocupa cada una se asigna por evento
          {eventoActual ? <> — mostrando <strong>{eventoActual.nombre}</strong></> : ''}.
          {!modoEdicion && <> Activa la edición arriba para crear, editar o eliminar módulos/habitaciones.</>}
        </p>
      </div>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {!eventoActual && !cargando && (
        <p className="mt-6 text-sm text-ink/40">No hay un evento SAEL marcado como actual/abierto en este momento.</p>
      )}

      {vista === 'lista' && eventoActual && (
        cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : (
          <div className="mt-4 space-y-6">
            {modulos.length === 0 && sinModulo.length === 0 && (
              <p className="text-sm text-ink/40">Sin módulos ni habitaciones todavía. Empieza creando un módulo.</p>
            )}

            {gruposModulo.map(({ modulo, habitaciones: habs }) => (
              <TablaModulo
                key={modulo.id}
                titulo={`${modulo.nombre}${modulo.precio_por_persona ? ` (L.${modulo.precio_por_persona})` : ''}`}
                habitaciones={habs}
                modoEdicion={modoEdicion}
                expandido={!!expandidos[modulo.id]}
                onToggleExpandido={() => alternarExpandido(modulo.id)}
                onEditarModulo={() => abrirEditarModulo(modulo)}
                onEliminarModulo={() => eliminarModulo(modulo)}
                onNuevaHabitacion={() => abrirNuevaHabitacion(modulo.id)}
                onVerHabitacion={abrirDetalle}
                onEditarHabitacion={abrirEditarHabitacion}
                onEliminarHabitacion={eliminarHabitacion}
                onBloquear={abrirBloquear}
                onDesbloquear={desbloquearHabitacion}
              />
            ))}

            {sinModulo.length > 0 && (
              <TablaModulo
                titulo="Sin módulo asignado"
                habitaciones={sinModulo}
                modoEdicion={modoEdicion}
                expandido={!!expandidos['sin-modulo']}
                onToggleExpandido={() => alternarExpandido('sin-modulo')}
                onNuevaHabitacion={() => abrirNuevaHabitacion(null)}
                onVerHabitacion={abrirDetalle}
                onEditarHabitacion={abrirEditarHabitacion}
                onEliminarHabitacion={eliminarHabitacion}
                onBloquear={abrirBloquear}
                onDesbloquear={desbloquearHabitacion}
              />
            )}
          </div>
        )
      )}

      {vista === 'formularioModulo' && (
        <div className="mx-auto mt-4 max-w-md rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold text-ink">{editandoModuloId === 'nuevo' ? 'Nuevo módulo' : 'Editar módulo'}</h2>
          <div className="mt-4 space-y-4">
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre del módulo *</span>
              <input type="text" value={formModulo.nombre} onChange={(e) => setFormModulo((f) => ({ ...f, nombre: e.target.value }))} className={claseInput} placeholder="Ej. Módulo 4: Planta Baja" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Precio por persona (L.)</span>
              <input type="number" min="0" step="0.01" value={formModulo.precio_por_persona} onChange={(e) => setFormModulo((f) => ({ ...f, precio_por_persona: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Notas (opcional)</span>
              <input type="text" value={formModulo.notas} onChange={(e) => setFormModulo((f) => ({ ...f, notas: e.target.value }))} className={claseInput} />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setVista('lista')} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
            <button onClick={guardarModulo} disabled={guardando} className="rounded-full bg-[#007334] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005c29] disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {vista === 'formularioHabitacion' && (
        <div className="mx-auto mt-4 max-w-md rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold text-ink">{editandoHabitacionId === 'nueva' ? 'Nueva habitación' : 'Editar habitación'}</h2>
          <div className="mt-4 space-y-4">
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Módulo</span>
              <select value={formHabitacion.modulo_id} onChange={(e) => setFormHabitacion((f) => ({ ...f, modulo_id: e.target.value }))} className={claseInput}>
                <option value="">Sin módulo</option>
                {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Número / nombre de la habitación *</span>
              <input type="text" value={formHabitacion.numero} onChange={(e) => setFormHabitacion((f) => ({ ...f, numero: e.target.value }))} className={claseInput} placeholder="Ej. 204" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Capacidad de camas *</span>
              <input type="number" min="1" value={formHabitacion.capacidad} onChange={(e) => setFormHabitacion((f) => ({ ...f, capacidad: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Notas (opcional)</span>
              <input type="text" value={formHabitacion.notas} onChange={(e) => setFormHabitacion((f) => ({ ...f, notas: e.target.value }))} className={claseInput} />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setVista('lista')} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
            <button onClick={guardarHabitacion} disabled={guardando} className="rounded-full bg-[#007334] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005c29] disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {vista === 'detalle' && habitacionSeleccionada && (
        <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Habitación {habitacionSeleccionada.numero}</h2>
              <p className="text-xs text-ink/50">Capacidad: {habitacionSeleccionada.capacidad} · Evento: {eventoActual.nombre}</p>
            </div>
            <button onClick={() => setVista('lista')} className="rounded-full bg-night px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90">Volver</button>
          </div>

          {cargandoOcupantes ? <p className="mt-6 text-ink/40">Cargando…</p> : (
            <div className="mt-4 space-y-2">
              {ocupantes.length === 0 && <p className="text-sm text-ink/40">Nadie asignado todavía a esta habitación en este evento.</p>}
              {ocupantes.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold text-ink">
                      {o.nombre_completo}
                      <span className="ml-2 rounded-full bg-night/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-night">{o.tipo_ocupante}</span>
                    </p>
                    <p className="text-xs text-ink/50">
                      {o.capitulo || 'Sin capítulo'} · {o.telefono || 'Sin teléfono'}
                      {o.monto ? ` · L. ${o.monto}` : ''}
                      {o.metodo_pago ? ` (${o.metodo_pago})` : ''}
                      {o.banco_o_recibo ? ` · ${o.banco_o_recibo}` : ''}
                      {o.observaciones ? ` · ${o.observaciones}` : ''}
                    </p>
                  </div>
                  <button onClick={() => quitarOcupante(o)} className={btnEliminar}>Quitar</button>
                </div>
              ))}
            </div>
          )}

          {!mostrarAgregarOcupante ? (
            ocupantes.length < habitacionSeleccionada.capacidad ? (
              <button onClick={abrirAgregarOcupante} className="mt-4 rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light">
                + Agregar ocupante
              </button>
            ) : (
              <p className="mt-4 text-xs text-ink/40">Esta habitación ya alcanzó su capacidad máxima para este evento.</p>
            )
          ) : (
            <div className="mt-4 rounded-2xl border border-ink/10 p-4">
              <div className="flex gap-2">
                <button
                  onClick={() => { setFormOcupante((f) => ({ ...f, tipo_ocupante: 'participante', seleccionado: null })); setResultadosBusqueda([]); }}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold ${formOcupante.tipo_ocupante === 'participante' ? 'bg-ink text-white' : 'border border-ink/20 text-ink/70'}`}
                >
                  Participante
                </button>
                <button
                  onClick={() => { setFormOcupante((f) => ({ ...f, tipo_ocupante: 'saelista', seleccionado: null })); setResultadosBusqueda([]); }}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold ${formOcupante.tipo_ocupante === 'saelista' ? 'bg-ink text-white' : 'border border-ink/20 text-ink/70'}`}
                >
                  Saelista
                </button>
              </div>

              {!formOcupante.seleccionado ? (
                <>
                  <form onSubmit={buscarOcupante} className="mt-3 flex gap-2">
                    <input
                      type="text" value={busquedaOcupante} onChange={(e) => setBusquedaOcupante(e.target.value)}
                      placeholder="Buscar por nombre o identificación" className={claseInput}
                    />
                    <button type="submit" className="shrink-0 rounded-full bg-[#007334] px-4 py-2 text-xs font-semibold text-white hover:bg-[#005c29]">
                      {buscandoOcupante ? '...' : 'Buscar'}
                    </button>
                  </form>
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {resultadosBusqueda.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setFormOcupante((f) => ({ ...f, seleccionado: p }))}
                        className="block w-full rounded-lg border border-ink/10 px-3 py-2 text-left text-sm hover:border-ember/40"
                      >
                        <span className="font-medium text-ink">{p.nombre_completo}</span>
                        <span className="ml-2 text-xs text-ink/50">{p.capitulo || p.dni || ''}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-ink/5 px-3 py-2 text-sm">
                    <span className="font-medium text-ink">{formOcupante.seleccionado.nombre_completo}</span>
                    <button onClick={() => setFormOcupante((f) => ({ ...f, seleccionado: null }))} className="text-xs text-ink/40 hover:text-ember hover:underline">Cambiar</button>
                  </div>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-ink/60">Monto (opcional)</span>
                    <input type="number" min="0" step="0.01" value={formOcupante.monto} onChange={(e) => setFormOcupante((f) => ({ ...f, monto: e.target.value }))} className={claseInput} />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-ink/60">Método de pago (opcional)</span>
                    <select value={formOcupante.metodo_pago} onChange={(e) => setFormOcupante((f) => ({ ...f, metodo_pago: e.target.value }))} className={claseInput}>
                      <option value="">Seleccionar…</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia Bancaria</option>
                      <option value="tarjeta">Tarjeta de Crédito/Débito</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-ink/60">Banco o # de recibo (opcional)</span>
                    <input type="text" value={formOcupante.banco_o_recibo} onChange={(e) => setFormOcupante((f) => ({ ...f, banco_o_recibo: e.target.value }))} className={claseInput} />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-ink/60">Observaciones (opcional)</span>
                    <input type="text" value={formOcupante.observaciones} onChange={(e) => setFormOcupante((f) => ({ ...f, observaciones: e.target.value }))} className={claseInput} />
                  </label>
                </div>
              )}

              <div className="mt-4 flex justify-end gap-3">
                <button onClick={() => setMostrarAgregarOcupante(false)} className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
                <button onClick={guardarOcupante} disabled={guardandoOcupante || !formOcupante.seleccionado} className="rounded-full bg-[#007334] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#005c29] disabled:opacity-50">
                  {guardandoOcupante ? 'Guardando…' : 'Asignar'}
                </button>
              </div>
            </div>
          )}
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

      {bloqueando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-night/10 text-xl">🔒</span>
              <h3 className="font-display text-lg font-bold text-ink">Bloquear habitación {bloqueando.habitacion.numero}</h3>
            </div>
            <p className="mt-2 text-xs text-ink/50">
              Para apartados con depósito/transferencia previa (persona que todavía no está registrada en el
              sistema). El monto se toma automático del precio de Hotel ya configurado para este módulo — no se
              escribe a mano.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre</span>
              <input
                type="text" autoFocus value={bloqueando.nombre}
                onChange={(e) => setBloqueando((b) => ({ ...b, nombre: e.target.value }))}
                className={claseInput}
                placeholder="A nombre de quién queda apartada"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Número de Transferencia Bancaria</span>
              <input
                type="text" value={bloqueando.numero_transferencia}
                onChange={(e) => setBloqueando((b) => ({ ...b, numero_transferencia: e.target.value }))}
                className={claseInput}
                placeholder="Comprobante del depósito"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setBloqueando(null)} className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
              <button
                onClick={confirmarBloqueo}
                disabled={guardandoBloqueo}
                className="rounded-full bg-night px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {guardandoBloqueo ? 'Bloqueando…' : 'Bloquear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tabla de un módulo con sus habitaciones — igual formato al mockup de Carlos:
// # Habitación | Capacidad | Asignado | Disponibilidad
// Colapsable (clic en el encabezado) y con los botones de gestión del
// catálogo bloqueados salvo que modoEdicion esté activado — Asignar/
// Gestionar ocupantes siempre queda disponible, sin bloquear.
function TablaModulo({
  titulo, habitaciones, modoEdicion, expandido, onToggleExpandido,
  onEditarModulo, onEliminarModulo, onNuevaHabitacion, onVerHabitacion, onEditarHabitacion, onEliminarHabitacion,
  onBloquear, onDesbloquear,
}) {
  const btnCatalogoDeshabilitado = 'disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 bg-ink/5 px-4 py-3">
        <button onClick={onToggleExpandido} className="flex items-center gap-2 text-left">
          <span className="text-ink/40">{expandido ? '▾' : '▸'}</span>
          <h3 className="font-display text-base font-bold text-ink">{titulo}</h3>
          <span className="text-xs text-ink/40">({habitaciones.length} habitación{habitaciones.length === 1 ? '' : 'es'})</span>
        </button>
        <div className="flex gap-2">
          {onEditarModulo && <button onClick={onEditarModulo} disabled={!modoEdicion} className={`${btnEditar} ${btnCatalogoDeshabilitado}`}>Editar módulo</button>}
          {onEliminarModulo && <button onClick={onEliminarModulo} disabled={!modoEdicion} className={`${btnEliminar} ${btnCatalogoDeshabilitado}`}>Eliminar módulo</button>}
          <button onClick={onNuevaHabitacion} disabled={!modoEdicion} className={`rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/5 ${btnCatalogoDeshabilitado}`}>
            + Habitación
          </button>
        </div>
      </div>
      {expandido && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-center text-xs uppercase tracking-wide text-ink/40">
              <th className="px-4 py-2">#Habitación</th>
              <th className="px-4 py-2">Capacidad</th>
              <th className="px-4 py-2">Asignado</th>
              <th className="px-4 py-2">Disponibilidad</th>
              <th className="px-4 py-2">Reserva</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {habitaciones.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-4 text-center text-ink/40">Sin habitaciones en este módulo todavía.</td></tr>
            )}
            {habitaciones.map((h) => {
              const bloqueada = h.estado === 'BLOQUEADA';
              return (
                <tr key={h.id} className="border-b border-ink/5 text-center last:border-0">
                  <td className="px-4 py-3 font-semibold text-ink">{h.numero}</td>
                  <td className="px-4 py-3 text-ink/60">{h.capacidad}</td>
                  <td className="px-4 py-3">
                    {bloqueada ? (
                      <button onClick={() => onVerHabitacion(h)} className="text-left text-sm text-ink/50 italic hover:underline">
                        🔒 {h.nombre_reservado} · Ref. {h.numero_transferencia}{h.reserva_monto ? ` · L. ${h.reserva_monto}` : ''}
                      </button>
                    ) : h.ocupantes === 0 ? (
                      <button onClick={() => onVerHabitacion(h)} className="text-sm font-semibold text-ember hover:underline">
                        + Asignar
                      </button>
                    ) : (
                      <button onClick={() => onVerHabitacion(h)} className="text-left text-sm text-ink hover:underline">
                        {h.ocupantes_detalle.map((o) => `${o.nombre} (${o.tipo === 'participante' ? 'Participante' : 'Saelista'})`).join(', ')}
                        <span className="ml-2 text-xs text-ember">Gestionar</span>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      h.estado === 'DISPONIBLE' ? 'bg-[#007334] text-white' : h.estado === 'BLOQUEADA' ? 'bg-night text-white' : 'bg-ember text-white'
                    }`}>
                      {h.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {bloqueada ? (
                      <button onClick={() => onDesbloquear(h)} className="rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/5">
                        Desbloquear
                      </button>
                    ) : (
                      <button onClick={() => onBloquear(h)} className="rounded-full bg-night px-3 py-1 text-xs font-semibold text-white hover:opacity-90">
                        Bloquear
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => onEditarHabitacion(h)} disabled={!modoEdicion} className={`${btnEditar} ${btnCatalogoDeshabilitado}`}>Editar</button>
                    <button onClick={() => onEliminarHabitacion(h)} disabled={!modoEdicion} className={`ml-2 ${btnEliminar} ${btnCatalogoDeshabilitado}`}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

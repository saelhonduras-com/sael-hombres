import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { mensajeError } from '../../api';

const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none';
const btnEditar = 'rounded-full bg-[#007334]/10 px-3 py-1 text-xs font-semibold text-[#007334] hover:bg-[#007334]/20';
const btnEliminar = 'rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember hover:bg-ember/20';

const POR_PAGINA = 10;

// Cuatro estados, ya sin "parcial" — colores y texto según lo aprobado
// en el mockup: Ocupada (rojo), Disponible (verde), Bloqueada (ámbar),
// Seguridad (azul/acento).
const ESTILO_ESTADO = {
  OCUPADA: { texto: 'Ocupada', badge: 'bg-ember/15 text-ember', borde: 'border-l-ember', fondo: 'bg-ember/10' },
  DISPONIBLE: { texto: 'Disponible', badge: 'bg-[#007334]/15 text-[#007334]', borde: 'border-l-[#007334]', fondo: 'bg-[#007334]/10' },
  BLOQUEADA: { texto: 'Bloqueada', badge: 'bg-amber-500/15 text-amber-600', borde: 'border-l-amber-500', fondo: 'bg-amber-500/10' },
  SEGURIDAD: { texto: 'Seguridad', badge: 'bg-[#0F7173]/15 text-[#0F7173]', borde: 'border-l-[#0F7173]', fondo: 'bg-[#0F7173]/10' },
};

const vacioHabitacion = { numero: '', capacidad: '', notas: '', modulo_id: '' };
const vacioModulo = { nombre: '', precio_por_persona: '', notas: '' };
const vacioTitular = { tipo_ocupante: 'participante', seleccionado: null, metodo_pago: '', numero_transferencia: '', observaciones: '' };
const vacioAdicional = { tipo_ocupante: 'participante', seleccionado: null };

export default function AdminHabitaciones() {
  const { rol, permisosPorModulo } = useOutletContext();
  const puedeEditar = rol === 'admin' ? permisosPorModulo?.['habitaciones'] === 'edicion' : true;

  const [eventoActual, setEventoActual] = useState(null);
  const [vista, setVista] = useState('lista'); // 'lista' | 'formularioHabitacion' | 'formularioModulo' | 'detalle'
  const [modulos, setModulos] = useState([]);
  const [habitaciones, setHabitaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState(null); // string | null — toast de confirmación

  const [modoEdicion, setModoEdicion] = useState(false);

  // --- Filtro, búsqueda y paginación de la lista de habitaciones ---
  const [filtroModulo, setFiltroModulo] = useState('todas'); // 'todas' | moduloId | 'seguridad'
  const [soloSinCobro, setSoloSinCobro] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const [editandoHabitacionId, setEditandoHabitacionId] = useState(null);
  const [formHabitacion, setFormHabitacion] = useState(vacioHabitacion);
  const [editandoModuloId, setEditandoModuloId] = useState(null);
  const [formModulo, setFormModulo] = useState(vacioModulo);
  const [guardando, setGuardando] = useState(false);

  const [habitacionSeleccionada, setHabitacionSeleccionada] = useState(null);
  const [ocupantes, setOcupantes] = useState([]);
  const [cargandoOcupantes, setCargandoOcupantes] = useState(false);
  const [precioHotelModulo, setPrecioHotelModulo] = useState(null);

  const [mostrarFormTitular, setMostrarFormTitular] = useState(false);
  const [formTitular, setFormTitular] = useState(vacioTitular);
  const [mostrarFormAdicional, setMostrarFormAdicional] = useState(false);
  const [formAdicional, setFormAdicional] = useState(vacioAdicional);
  const [busquedaOcupante, setBusquedaOcupante] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [buscandoOcupante, setBuscandoOcupante] = useState(false);
  const [guardandoOcupante, setGuardandoOcupante] = useState(false);

  const [confirmacion, setConfirmacion] = useState(null);
  const [avisoAsignacion, setAvisoAsignacion] = useState(null);
  function pedirConfirmacion({ mensaje, textoConfirmar = 'Eliminar', onConfirmar }) {
    setConfirmacion({ mensaje, textoConfirmar, onConfirmar });
  }

  const [bloqueando, setBloqueando] = useState(null);
  const [guardandoBloqueo, setGuardandoBloqueo] = useState(false);

  function mostrarAviso(texto) {
    setAviso(texto);
    setTimeout(() => setAviso(null), 3000);
  }

  useEffect(() => {
    api.get('/eventos')
      .then(({ data }) => {
        const actual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
        setEventoActual(actual || null);
      })
      .catch(() => setError('No se pudo cargar la información del evento.'));
  }, []);

  async function cargarTodo() {
    if (!eventoActual) return null;
    setCargando(true);
    setError('');
    try {
      const [rModulos, rHabitaciones] = await Promise.all([
        api.get('/admin/modulos'),
        api.get('/admin/habitaciones', { params: { evento_id: eventoActual.id } }),
      ]);
      setModulos(rModulos.data);
      setHabitaciones(rHabitaciones.data);
      return rHabitaciones.data;
    } catch (err) {
      setError(mensajeError(err));
      return null;
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarTodo(); }, [eventoActual]);

  // --- Módulos (catálogo, sin cambios de fondo respecto a antes) ---
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
    if (!formModulo.nombre) { setError('El nombre del módulo es obligatorio.'); return; }
    setGuardando(true);
    setError('');
    try {
      const payload = { ...formModulo, precio_por_persona: formModulo.precio_por_persona || null };
      if (editandoModuloId === 'nuevo') await api.post('/admin/modulos', payload);
      else await api.put(`/admin/modulos/${editandoModuloId}`, payload);
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
        try { await api.delete(`/admin/modulos/${m.id}`); cargarTodo(); }
        catch (err) { setError(mensajeError(err)); }
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
      if (editandoHabitacionId === 'nueva') await api.post('/admin/habitaciones', payload);
      else await api.put(`/admin/habitaciones/${editandoHabitacionId}`, payload);
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
        try { await api.delete(`/admin/habitaciones/${h.id}`); cargarTodo(); }
        catch (err) { setError(mensajeError(err)); }
      },
    });
  }

  // --- Bloqueo/reserva de una habitación ---
  function abrirBloquear(h) {
    setBloqueando({ habitacion: h, nombre: '', numero_transferencia: '', es_reserva_seguridad: false });
  }
  async function confirmarBloqueo() {
    if (!bloqueando.nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!bloqueando.es_reserva_seguridad && !bloqueando.numero_transferencia.trim()) {
      setError('El número de transferencia bancaria es obligatorio (o marca "Reservación de seguridad" si todavía no hay depósito).');
      return;
    }
    setGuardandoBloqueo(true);
    setError('');
    try {
      await api.post(`/admin/habitaciones/${bloqueando.habitacion.id}/reservar`, {
        evento_id: eventoActual.id,
        nombre_reservado: bloqueando.nombre.trim(),
        numero_transferencia: bloqueando.es_reserva_seguridad ? '' : bloqueando.numero_transferencia.trim(),
        es_reserva_seguridad: bloqueando.es_reserva_seguridad,
      });
      setBloqueando(null);
      setVista('lista');
      mostrarAviso(`Habitación ${bloqueando.habitacion.numero} bloqueada correctamente`);
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
          setVista('lista');
          mostrarAviso(`Habitación ${h.numero} desbloqueada`);
          cargarTodo();
        } catch (err) { setError(mensajeError(err)); }
      },
    });
  }

  // --- Detalle de una habitación (modal) ---
  async function abrirDetalle(h) {
    setHabitacionSeleccionada(h);
    setVista('detalle');
    setMostrarFormTitular(false);
    setMostrarFormAdicional(false);
    setCargandoOcupantes(true);
    setError('');
    try {
      const { data } = await api.get(`/admin/habitaciones/${h.id}/ocupantes`, { params: { evento_id: eventoActual.id } });
      setOcupantes(data);
      const { data: costos } = await api.get(`/admin/eventos/${eventoActual.id}/costos`);
      const costoModulo = costos.find((c) => c.concepto === 'Hotel' && c.modulo_id === h.modulo_id);
      setPrecioHotelModulo(costoModulo ? Number(costoModulo.monto) : null);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargandoOcupantes(false);
    }
  }
  async function recargarDetalle() {
    const { data } = await api.get(`/admin/habitaciones/${habitacionSeleccionada.id}/ocupantes`, { params: { evento_id: eventoActual.id } });
    setOcupantes(data);
    const frescas = await cargarTodo();
    if (frescas) {
      const actualizada = frescas.find((x) => x.id === habitacionSeleccionada.id);
      if (actualizada) setHabitacionSeleccionada(actualizada);
    }
  }

  function abrirFormTitular() {
    setBusquedaOcupante('');
    setResultadosBusqueda([]);
    setFormTitular({
      ...vacioTitular,
      metodo_pago: habitacionSeleccionada.es_reserva_seguridad ? 'efectivo' : '',
    });
    setMostrarFormTitular(true);
  }
  function abrirFormAdicional() {
    setBusquedaOcupante('');
    setResultadosBusqueda([]);
    setFormAdicional(vacioAdicional);
    setMostrarFormAdicional(true);
  }

  async function buscarOcupante(tipoOcupante, e) {
    e.preventDefault();
    if (!busquedaOcupante) return;
    setBuscandoOcupante(true);
    setError('');
    try {
      const ruta = tipoOcupante === 'participante' ? '/admin/participantes' : '/admin/saelistas';
      const { data } = await api.get(ruta, { params: { buscar: busquedaOcupante } });
      const lista = tipoOcupante === 'participante' ? data.participantes : data;
      setResultadosBusqueda(lista || []);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setBuscandoOcupante(false);
    }
  }

  async function guardarTitular() {
    if (!formTitular.seleccionado) { setError('Selecciona a la persona que va a ser el titular.'); return; }
    if (!formTitular.metodo_pago) { setError('Selecciona el método de pago.'); return; }
    if (formTitular.metodo_pago === 'transferencia' && !formTitular.numero_transferencia.trim()) {
      setError('La referencia bancaria es obligatoria cuando el pago es por transferencia.');
      return;
    }
    setGuardandoOcupante(true);
    setError('');
    try {
      await api.post(`/admin/habitaciones/${habitacionSeleccionada.id}/titular`, {
        evento_id: eventoActual.id,
        tipo_ocupante: formTitular.tipo_ocupante,
        participante_id: formTitular.tipo_ocupante === 'participante' ? formTitular.seleccionado.id : null,
        saelista_id: formTitular.tipo_ocupante === 'saelista' ? formTitular.seleccionado.id : null,
        nombre_titular: formTitular.seleccionado.nombre_completo,
        metodo_pago: formTitular.metodo_pago,
        numero_transferencia: formTitular.numero_transferencia,
        observaciones: formTitular.observaciones,
      });
      setMostrarFormTitular(false);
      mostrarAviso(`Habitación ${habitacionSeleccionada.numero} guardada correctamente`);
      await recargarDetalle();
    } catch (err) {
      setAvisoAsignacion(mensajeError(err));
    } finally {
      setGuardandoOcupante(false);
    }
  }

  async function guardarAdicional() {
    if (!formAdicional.seleccionado) { setError('Selecciona a la persona que vas a agregar.'); return; }
    setGuardandoOcupante(true);
    setError('');
    try {
      await api.post(`/admin/habitaciones/${habitacionSeleccionada.id}/ocupantes-adicionales`, {
        evento_id: eventoActual.id,
        tipo_ocupante: formAdicional.tipo_ocupante,
        participante_id: formAdicional.tipo_ocupante === 'participante' ? formAdicional.seleccionado.id : null,
        saelista_id: formAdicional.tipo_ocupante === 'saelista' ? formAdicional.seleccionado.id : null,
      });
      setMostrarFormAdicional(false);
      await recargarDetalle();
    } catch (err) {
      setAvisoAsignacion(mensajeError(err));
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
          await recargarDetalle();
        } catch (err) { setError(mensajeError(err)); }
      },
    });
  }

  // --- Indicadores, filtros, búsqueda y paginación ---
  const totalHabitaciones = habitaciones.length;
  // "Ocupadas" aquí significa "no disponible al público" — incluye
  // OCUPADA (con titular real), BLOQUEADA y SEGURIDAD, ya que ninguna
  // de las tres se le puede ofrecer a alguien nuevo en este momento.
  const ocupadas = habitaciones.filter((h) => h.estado !== 'DISPONIBLE').length;
  const bloqueadas = habitaciones.filter((h) => h.estado === 'BLOQUEADA').length;
  const seguridadActivas = habitaciones.filter((h) => h.estado === 'SEGURIDAD').length;
  const totalIngresado = habitaciones.reduce((suma, h) => suma + (h.reserva_monto ? Number(h.reserva_monto) : 0), 0);

  const disponibilidadPorModulo = modulos.map((m) => {
    const delModulo = habitaciones.filter((h) => h.modulo_id === m.id);
    const disponibles = delModulo.filter((h) => h.estado === 'DISPONIBLE').length;
    return { modulo: m, disponibles, total: delModulo.length };
  });

  const habitacionesFiltradas = useMemo(() => {
    let lista = habitaciones;
    if (soloSinCobro) lista = lista.filter((h) => h.sin_cobro);
    if (filtroModulo === 'seguridad') lista = lista.filter((h) => h.es_reserva_seguridad || h.estado === 'SEGURIDAD');
    else if (filtroModulo !== 'todas') lista = lista.filter((h) => String(h.modulo_id) === String(filtroModulo));
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      lista = lista.filter((h) => h.numero.toLowerCase().includes(q));
    }
    return lista;
  }, [habitaciones, filtroModulo, busqueda, soloSinCobro]);

  useEffect(() => { setPagina(1); }, [filtroModulo, busqueda, soloSinCobro]);

  const totalPaginas = Math.max(1, Math.ceil(habitacionesFiltradas.length / POR_PAGINA));
  const habitacionesPagina = habitacionesFiltradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  if (!eventoActual && !cargando) {
    return <p className="mt-6 text-sm text-ink/40">No hay un evento SAEL marcado como actual/abierto en este momento.</p>;
  }

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
                  !puedeEditar ? 'cursor-not-allowed bg-ink/5 text-ink/30'
                    : modoEdicion ? 'bg-[#007334] text-white hover:bg-[#005c29]' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
                }`}
              >
                {!puedeEditar ? '🔒 Solo consulta' : modoEdicion ? '🔓 Edición activada' : '🔒 Activar edición'}
              </button>
              <button onClick={abrirNuevoModulo} disabled={!modoEdicion} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40">
                + Nuevo módulo
              </button>
              <button onClick={() => abrirNuevaHabitacion(null)} disabled={!modoEdicion} className="rounded-full bg-ember/10 px-5 py-2 text-sm font-semibold text-ember hover:bg-ember/20 disabled:cursor-not-allowed disabled:opacity-40">
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

      {vista === 'lista' && eventoActual && (
        cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : (
          <div className="mt-4 space-y-6">

            {/* Leyenda de estados, centrada arriba */}
            <div className="flex flex-wrap justify-center gap-5 px-1 text-xs">
              <span className="text-amber-600">
                🔒 <strong>Bloqueada</strong> <span className="text-ink/50">— apartada con transferencia, cuenta en ingresos de inmediato</span>
              </span>
              <span className="text-[#0F7173]">
                🛡️ <strong>Seguridad</strong> <span className="text-ink/50">— apartada sin depósito, no cuenta hasta asignar a alguien real</span>
              </span>
            </div>

            {/* Disponibilidad por módulo + indicadores, lado a lado en pantallas grandes */}
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1.3fr_1fr]">
              {disponibilidadPorModulo.length > 0 && (
                <div className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm font-semibold text-ink">Disponibilidad por módulo</p>
                  <div className="space-y-2">
                    {disponibilidadPorModulo.map(({ modulo, disponibles, total }) => {
                      const color = disponibles <= 2 ? 'text-ember' : disponibles <= 4 ? 'text-amber-600' : 'text-[#007334]';
                      return (
                        <div key={modulo.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink/70">{modulo.nombre}{modulo.precio_por_persona ? ` · L.${modulo.precio_por_persona}` : ''}</span>
                          <span className={`font-semibold ${color}`}>{disponibles}/{total} disponibles</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col items-center justify-center rounded-xl border-t-2 border-[#0F7173] bg-white px-2 py-2 text-center shadow-sm">
                  <p className="text-sm">🚪</p>
                  <p className="text-[10px] leading-tight text-ink/50">Habitaciones ocupadas</p>
                  <p className="text-lg font-bold text-[#0F7173]">{ocupadas}/{totalHabitaciones}</p>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border-t-2 border-[#007334] bg-white px-2 py-2 text-center shadow-sm">
                  <p className="text-sm">💰</p>
                  <p className="text-[10px] leading-tight text-ink/50">Total ingresado</p>
                  <p className="text-lg font-bold text-[#007334]">L. {totalIngresado.toLocaleString('es-HN')}</p>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border-t-2 border-amber-500 bg-white px-2 py-2 text-center shadow-sm">
                  <p className="text-sm">🔒</p>
                  <p className="text-[10px] leading-tight text-ink/50">Habitaciones bloqueadas</p>
                  <p className="text-lg font-bold text-amber-600">{bloqueadas}</p>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border-t-2 border-[#0F7173] bg-white px-2 py-2 text-center shadow-sm">
                  <p className="text-sm">🛡️</p>
                  <p className="text-[10px] leading-tight text-ink/50">Reservadas por seguridad</p>
                  <p className="text-lg font-bold text-[#0F7173]">{seguridadActivas}</p>
                </div>
              </div>
            </div>

            {/* Filtros por módulo + seguridad */}
            <div>
              <p className="mb-3 text-sm font-semibold text-ink">Habitaciones</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <button onClick={() => setFiltroModulo('todas')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filtroModulo === 'todas' ? 'bg-[#0F7173] text-white' : 'border border-ink/15 text-ink/70 hover:bg-ink/5'}`}>Todas</button>
                {modulos.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setFiltroModulo(m.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${String(filtroModulo) === String(m.id) ? 'bg-[#0F7173] text-white' : 'border border-ink/15 text-ink/70 hover:bg-ink/5'}`}
                  >
                    {m.nombre}{m.precio_por_persona ? ` · L.${m.precio_por_persona}` : ''}
                  </button>
                ))}
                <button onClick={() => setFiltroModulo('seguridad')} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filtroModulo === 'seguridad' ? 'bg-[#0F7173] text-white' : 'border border-ink/15 text-ink/70 hover:bg-ink/5'}`}>
                  🛡️ Seguridad
                </button>
              </div>

              {/* Buscador + paginación */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar habitación" className={`${claseInput} sm:w-1/2`}
                />
                <div className="flex items-center gap-1">
                  <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1} className="rounded-full border border-ink/15 px-2 py-1 text-xs disabled:opacity-30">‹</button>
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n} onClick={() => setPagina(n)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${n === pagina ? 'bg-[#0F7173] text-white' : 'border border-ink/15 text-ink/70 hover:bg-ink/5'}`}
                    >
                      {n}
                    </button>
                  ))}
                  <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} className="rounded-full border border-ink/15 px-2 py-1 text-xs disabled:opacity-30">›</button>
                </div>
              </div>

              {/* Grid de tarjetas */}
              {habitacionesPagina.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink/40">Sin habitaciones que coincidan.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {habitacionesPagina.map((h) => {
                    const estilo = ESTILO_ESTADO[h.estado];
                    return (
                      <button
                        key={h.id}
                        onClick={() => abrirDetalle(h)}
                        className={`rounded-xl border border-ink/10 border-l-4 ${estilo.borde} ${estilo.fondo} p-3 text-left shadow-sm transition hover:shadow`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-lg">{h.estado === 'SEGURIDAD' ? '🛡️' : h.estado === 'BLOQUEADA' ? '🔒' : '🛏️'}</span>
                        </div>
                        <p className="mt-1.5 text-sm font-bold text-ink">N.° {h.numero}</p>
                        <p className="text-[11px] text-ink/50">
                          {h.modulo_nombre || 'Sin módulo'}{h.modulo_precio ? ` · L.${h.modulo_precio}` : ''}
                        </p>
                        <p className={`mt-1 text-xs ${h.titular || h.nombre_reservado ? 'font-semibold text-ink' : 'italic text-ink/40'}`}>
                          {h.titular || h.nombre_reservado || 'Sin ocupantes'}
                        </p>
                        <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${estilo.badge}`}>
                          {estilo.texto}{h.sin_cobro ? ' · sin cobro' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-3 text-xs text-ink/40">
                Mostrando {habitacionesFiltradas.length === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, habitacionesFiltradas.length)} de {habitacionesFiltradas.length} habitaciones
              </p>
            </div>
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
              <span className="mb-1 block text-xs font-semibold text-ink/60">Precio por habitación (L.)</span>
              <input type="number" min="0" step="0.01" value={formModulo.precio_por_persona} onChange={(e) => setFormModulo((f) => ({ ...f, precio_por_persona: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Notas (opcional)</span>
              <input type="text" value={formModulo.notas} onChange={(e) => setFormModulo((f) => ({ ...f, notas: e.target.value }))} className={claseInput} />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setVista('lista')} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
            <button onClick={guardarModulo} disabled={guardando} className="rounded-full bg-[#007334]/10 px-5 py-2 text-sm font-semibold text-[#007334] hover:bg-[#007334]/20 disabled:opacity-50">
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
            <button onClick={guardarHabitacion} disabled={guardando} className="rounded-full bg-[#007334]/10 px-5 py-2 text-sm font-semibold text-[#007334] hover:bg-[#007334]/20 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* --- Modal de detalle de habitación --- */}
      {vista === 'detalle' && habitacionSeleccionada && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-ink">Habitación {habitacionSeleccionada.numero}</h2>
              <button onClick={() => setVista('lista')} className="text-ink/40 hover:text-ink">✕</button>
            </div>
            {error && <p className="mt-2 rounded-lg bg-ember/10 p-2 text-xs text-ember">{error}</p>}
            <p className="text-xs text-ink/50">
              {habitacionSeleccionada.modulo_nombre || 'Sin módulo'}
              {habitacionSeleccionada.modulo_precio ? ` · L.${habitacionSeleccionada.modulo_precio} por habitación` : ''}
            </p>

            {!cargandoOcupantes && (
              <div className="mt-4 flex gap-2">
                <div className="flex-1 rounded-lg bg-ink/5 p-2 text-center">
                  <p className="text-[10px] text-ink/50">Capacidad</p>
                  <p className="text-sm font-bold text-ink">{habitacionSeleccionada.capacidad}</p>
                </div>
                <div className="flex-1 rounded-lg bg-ink/5 p-2 text-center">
                  <p className="text-[10px] text-ink/50">Ocupados</p>
                  <p className="text-sm font-bold text-ink">{ocupantes.length}</p>
                </div>
                <div className="flex-1 rounded-lg bg-ink/5 p-2 text-center">
                  <p className="text-[10px] text-ink/50">Estado</p>
                  <p className={`text-xs font-bold ${ESTILO_ESTADO[habitacionSeleccionada.estado]?.badge.split(' ')[1] || ''}`}>
                    {ESTILO_ESTADO[habitacionSeleccionada.estado]?.texto || habitacionSeleccionada.estado}
                  </p>
                </div>
              </div>
            )}

            {/* Bloqueo/reserva — solo tiene sentido mientras no hay ocupantes reales */}
            {!cargandoOcupantes && ocupantes.length === 0 && (
              <div className="mt-3">
                {habitacionSeleccionada.nombre_reservado ? (
                  <div className="rounded-lg bg-ink/5 p-3 text-xs">
                    <p className="text-ink/70">
                      {habitacionSeleccionada.es_reserva_seguridad ? '🛡️ Reserva de seguridad' : '🔒 Bloqueada'} a nombre de{' '}
                      <strong>{habitacionSeleccionada.nombre_reservado}</strong>
                      {habitacionSeleccionada.numero_transferencia ? ` · Ref. ${habitacionSeleccionada.numero_transferencia}` : ''}
                      {habitacionSeleccionada.reserva_monto ? ` · L. ${habitacionSeleccionada.reserva_monto}` : ''}
                    </p>
                    <button
                      onClick={() => desbloquearHabitacion(habitacionSeleccionada)}
                      className="mt-2 rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/5"
                    >
                      Desbloquear
                    </button>
                    <p className="mt-2 text-[11px] text-ink/40">
                      Para registrar el cobro real de esta habitación, asigna al titular abajo — reemplaza este bloqueo.
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => abrirBloquear(habitacionSeleccionada)}
                    className="rounded-full border border-ink/20 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5"
                  >
                    🔒 Bloquear / reservar esta habitación
                  </button>
                )}
              </div>
            )}

            {cargandoOcupantes ? <p className="mt-6 text-ink/40">Cargando…</p> : (
              <>
                <p className="mt-4 mb-2 text-sm font-semibold text-ink">Ocupantes</p>
                <div className="space-y-1.5">
                  {ocupantes.length === 0 && <p className="text-sm text-ink/40">Nadie asignado todavía a esta habitación en este evento.</p>}
                  {ocupantes.map((o) => (
                    <div key={o.id} className="flex items-center justify-between rounded-lg bg-ink/5 px-3 py-2 text-sm">
                      <span className="text-ink">
                        {o.nombre_completo}
                        {o.es_titular && <span className="ml-2 text-[10px] text-ink/40">· titular</span>}
                      </span>
                      <button onClick={() => quitarOcupante(o)} className="text-xs font-semibold text-ember hover:underline">Quitar</button>
                    </div>
                  ))}
                </div>

                {ocupantes.length === 0 ? (
                  !mostrarFormTitular ? (
                    <button onClick={abrirFormTitular} className={`mt-3 w-full ${btnEditar}`}>+ Asignar titular</button>
                  ) : (
                    <FormularioOcupante
                      titulo="Asignar titular"
                      form={formTitular} setForm={setFormTitular}
                      busqueda={busquedaOcupante} setBusqueda={setBusquedaOcupante}
                      resultados={resultadosBusqueda} buscando={buscandoOcupante}
                      onBuscar={(e) => buscarOcupante(formTitular.tipo_ocupante, e)}
                      onCancelar={() => setMostrarFormTitular(false)}
                      onGuardar={guardarTitular}
                      guardando={guardandoOcupante}
                      textoGuardar="Guardar"
                      conCobro
                      precioHotelModulo={precioHotelModulo}
                      esReservaSeguridad={habitacionSeleccionada.es_reserva_seguridad}
                    />
                  )
                ) : (
                  <>
                    <p className="mt-2 text-[11px] text-ink/40">
                      El titular es obligatorio. Agregar más ocupantes es opcional — puede hacerse ahora o después, sin costo adicional.
                    </p>
                    {!mostrarFormAdicional ? (
                      ocupantes.length < habitacionSeleccionada.capacidad && (
                        <button onClick={abrirFormAdicional} className={`mt-3 w-full ${btnEditar}`}>+ Agregar otro ocupante</button>
                      )
                    ) : (
                      <FormularioOcupante
                        titulo="Agregar ocupante"
                        form={formAdicional} setForm={setFormAdicional}
                        busqueda={busquedaOcupante} setBusqueda={setBusquedaOcupante}
                        resultados={resultadosBusqueda} buscando={buscandoOcupante}
                        onBuscar={(e) => buscarOcupante(formAdicional.tipo_ocupante, e)}
                        onCancelar={() => setMostrarFormAdicional(false)}
                        onGuardar={guardarAdicional}
                        guardando={guardandoOcupante}
                        textoGuardar="Agregar"
                        conCobro={false}
                      />
                    )}
                  </>
                )}
              </>
            )}
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
                className="rounded-full border border-ember/30 bg-ember/10 px-4 py-1.5 text-sm font-semibold text-ember hover:bg-ember/20"
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
            <label className="mt-4 flex items-start gap-2 rounded-lg bg-ink/5 p-3">
              <input
                type="checkbox" checked={bloqueando.es_reserva_seguridad}
                onChange={(e) => setBloqueando((b) => ({ ...b, es_reserva_seguridad: e.target.checked }))}
                className="mt-0.5"
              />
              <span className="text-xs text-ink/70">
                <span className="font-semibold">Reservación de seguridad</span> — para mantener la habitación
                disponible sí o sí, sin depósito todavía. No pide número de transferencia, y no se cuenta en
                Control de Ingresos hasta que se asigne a alguien real.
              </span>
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre</span>
              <input
                type="text" autoFocus value={bloqueando.nombre}
                onChange={(e) => setBloqueando((b) => ({ ...b, nombre: e.target.value }))}
                className={claseInput}
                placeholder="A nombre de quién queda apartada"
              />
            </label>
            {!bloqueando.es_reserva_seguridad && (
              <label className="mt-4 block">
                <span className="mb-1 block text-xs font-semibold text-ink/60">Número de Transferencia Bancaria</span>
                <input
                  type="text" value={bloqueando.numero_transferencia}
                  onChange={(e) => setBloqueando((b) => ({ ...b, numero_transferencia: e.target.value }))}
                  className={claseInput}
                  placeholder="Comprobante del depósito"
                />
              </label>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setBloqueando(null)} className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
              <button
                onClick={confirmarBloqueo}
                disabled={guardandoBloqueo}
                className="rounded-full bg-night/10 px-4 py-1.5 text-sm font-semibold text-night hover:bg-night/20 disabled:opacity-50"
              >
                {guardandoBloqueo ? 'Bloqueando…' : 'Bloquear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {avisoAsignacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/10 text-xl">🚫</span>
              <h3 className="font-display text-lg font-bold text-ink">No se pudo asignar</h3>
            </div>
            <p className="mt-3 text-sm text-ink/60">{avisoAsignacion}</p>
            <button
              onClick={() => setAvisoAsignacion(null)}
              className="mt-6 w-full rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Aviso (toast) de confirmación al guardar — mismo patrón usado en AdminSaelistas */}
      {aviso && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#007334]/90 px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          ✓ {aviso}
        </div>
      )}
    </div>
  );
}

// Formulario compartido para buscar/seleccionar a la persona (titular o
// adicional). conCobro=true agrega la sección de método de pago,
// referencia bancaria y observaciones (solo aplica al titular).
function FormularioOcupante({
  titulo, form, setForm, busqueda, setBusqueda, resultados, buscando, onBuscar,
  onCancelar, onGuardar, guardando, textoGuardar, conCobro, precioHotelModulo, esReservaSeguridad,
}) {
  return (
    <div className="mt-3 rounded-xl border border-ink/10 bg-ink/[0.02] p-3">
      <p className="mb-2 text-xs font-semibold text-ink/60">{titulo}</p>

      {!form.seleccionado ? (
        <>
          <div className="mb-2 flex gap-2 text-xs">
            <button
              onClick={() => setForm((f) => ({ ...f, tipo_ocupante: 'participante' }))}
              className={`rounded-full px-3 py-1 font-semibold ${form.tipo_ocupante === 'participante' ? 'bg-night/10 text-night' : 'text-ink/40'}`}
            >Participante</button>
            <button
              onClick={() => setForm((f) => ({ ...f, tipo_ocupante: 'saelista' }))}
              className={`rounded-full px-3 py-1 font-semibold ${form.tipo_ocupante === 'saelista' ? 'bg-night/10 text-night' : 'text-ink/40'}`}
            >Saelista</button>
          </div>
          <form onSubmit={onBuscar} className="flex gap-2">
            <input
              type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o identificación" className={claseInput}
            />
            <button type="submit" className="shrink-0 rounded-full bg-[#007334]/10 px-4 py-2 text-xs font-semibold text-[#007334] hover:bg-[#007334]/20">
              {buscando ? '...' : 'Buscar'}
            </button>
          </form>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {resultados.map((p) => (
              <button
                key={p.id}
                onClick={() => setForm((f) => ({ ...f, seleccionado: p }))}
                className="block w-full rounded-lg border border-ink/10 px-3 py-2 text-left text-sm hover:border-ember/40"
              >
                <span className="font-medium text-ink">{p.nombre_completo}</span>
                <span className="ml-2 text-xs text-ink/50">{p.capitulo || p.dni || ''}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-ink/5 px-3 py-2 text-sm">
            <span className="font-medium text-ink">{form.seleccionado.nombre_completo}</span>
            <button onClick={() => setForm((f) => ({ ...f, seleccionado: null }))} className="text-xs text-ink/40 hover:text-ember hover:underline">Cambiar</button>
          </div>

          {conCobro && (
            <>
              <div className="rounded-lg bg-ink/5 px-3 py-2 text-sm">
                <span className="text-ink/50">Monto de la habitación: </span>
                <span className="font-semibold text-ink">{precioHotelModulo !== null ? `L. ${precioHotelModulo}` : 'sin precio configurado'}</span>
              </div>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Método de pago</span>
                <select
                  value={form.metodo_pago}
                  disabled={esReservaSeguridad}
                  onChange={(e) => setForm((f) => ({ ...f, metodo_pago: e.target.value, numero_transferencia: e.target.value === 'efectivo' ? '' : f.numero_transferencia }))}
                  className={`${claseInput} disabled:border-transparent disabled:bg-ink/5 disabled:text-ink/50`}
                >
                  <option value="">Seleccionar…</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </select>
                {esReservaSeguridad && (
                  <span className="mt-1 block text-[11px] text-ink/40">
                    Esta habitación viene de una reservación de seguridad (sin depósito) — el cobro debe ser en efectivo.
                  </span>
                )}
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">
                  {form.metodo_pago === 'transferencia' ? 'Transferencia Bancaria o Recibo #' : 'Referencia bancaria'}
                </span>
                <input
                  type="text" value={form.numero_transferencia}
                  onChange={(e) => setForm((f) => ({ ...f, numero_transferencia: e.target.value }))}
                  disabled={form.metodo_pago !== 'transferencia'}
                  placeholder={form.metodo_pago === 'transferencia' ? 'Comprobante de transferencia o número de recibo' : 'Deshabilitado con pago en efectivo'}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
                    form.metodo_pago === 'transferencia'
                      ? 'border-ember/40 bg-ember/5 focus:border-ember'
                      : 'border-transparent bg-ink/5 text-ink/50'
                  }`}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Observaciones (opcional)</span>
                <textarea
                  rows={2} value={form.observaciones}
                  onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                  className={`${claseInput} resize-none`}
                />
              </label>
            </>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancelar} className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
        <button
          onClick={onGuardar} disabled={guardando || !form.seleccionado}
          className="rounded-full bg-[#007334]/10 px-4 py-1.5 text-xs font-semibold text-[#007334] hover:bg-[#007334]/20 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : textoGuardar}
        </button>
      </div>
    </div>
  );
}

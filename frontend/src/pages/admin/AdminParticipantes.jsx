import { useEffect, useState, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api, { mensajeError } from '../../api';
import {
  DEPARTAMENTOS_HONDURAS,
  MUNICIPIOS_POR_DEPARTAMENTO,
  ZONAS_FIHNEC,
  CARGOS_FIHNEC,
  ESTADOS_CIVILES,
} from '../../listas';

const TIPOS_PARTICIPANTE = [
  { value: '', label: 'Nacionalidad' },
  { value: 'nacional', label: 'Nacional' },
  { value: 'extranjero', label: 'Extranjero' },
];

const LIMITE = 30;

const filtrosVacios = { buscar: '', departamento: '', zona: '', tipo_participante: '' };

const vacioExtranjero = {
  numero_identificacion: '', nombre_completo: '', fecha_nacimiento: '', telefono_movil: '',
  departamento: '', municipio: '', capitulo: '', zona: '', cargo_fihnec: '', estado_civil: '',
  ha_recibido_saeles: false, veces_saeles_previas: '',
  contacto_emergencia_nombre: '', contacto_emergencia_telefono: '',
  evento_id: '',
};

const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none';
const claseFiltro = 'w-48 rounded-lg border border-ink/15 px-3 py-1.5 text-xs focus:border-ember focus:outline-none';

function claseTab(activa) {
  return `rounded-full px-4 py-2 text-sm font-semibold transition ${
    activa ? 'bg-ink text-white' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
  }`;
}

// Botones de acción en filas de tabla y en el detalle. Paleta a propósito:
// ver = neutral (blanco), editar = verde, eliminar = rojo (ember).
const btnVer = 'rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/5';
const btnEditar = 'rounded-full bg-[#007334] px-3 py-1 text-xs font-semibold text-white hover:bg-[#005c29]';
const btnEliminar = 'rounded-full bg-ember px-3 py-1 text-xs font-semibold text-white hover:bg-ember-light';

export default function AdminParticipantes() {
  const { refrescarResumen } = useOutletContext();

  // Modal de confirmación propio para acciones destructivas (Eliminar),
  // en vez del confirm() genérico del navegador.
  const [confirmacion, setConfirmacion] = useState(null); // { mensaje, textoConfirmar, onConfirmar } | null
  function pedirConfirmacion({ mensaje, textoConfirmar = 'Eliminar', onConfirmar }) {
    setConfirmacion({ mensaje, textoConfirmar, onConfirmar });
  }

  // --- "Todos los participantes" (tabla completa, scroll infinito) ---
  const [participantes, setParticipantes] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);

  const [filtros, setFiltros] = useState(filtrosVacios);
  const filtrosRef = useRef(filtros);
  useEffect(() => { filtrosRef.current = filtros; }, [filtros]);

  const sentinelRef = useRef(null);

  // --- "Inscribiéndose ahora" (evento actual, checkbox en línea) ---
  const [modoLista, setModoLista] = useState('actual'); // 'actual' | 'todos'
  const [inscripcionesActual, setInscripcionesActual] = useState([]);
  const [totalActual, setTotalActual] = useState(0);
  const [registradosActual, setRegistradosActual] = useState(0);
  const [cargandoActual, setCargandoActual] = useState(true);
  const [buscarActual, setBuscarActual] = useState('');
  const buscarActualRef = useRef(buscarActual);
  useEffect(() => { buscarActualRef.current = buscarActual; }, [buscarActual]);

  // --- Detalle / edición / extranjero (sin cambios de comportamiento) ---
  const [vista, setVista] = useState('lista'); // 'lista' | 'detalle' | 'editar' | 'extranjero'
  const [seleccionado, setSeleccionado] = useState(null);
  const [formEditar, setFormEditar] = useState(null);
  const [formExtranjero, setFormExtranjero] = useState(vacioExtranjero);
  const [eventosAbiertos, setEventosAbiertos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const [estadisticas, setEstadisticas] = useState(null);
  const [eventoActual, setEventoActual] = useState(null);

  // --- Módulo de cobro (se abre al marcar "Registrado" en Inscribiéndose ahora) ---
  const [cobrando, setCobrando] = useState(null); // { inscripcion, cuentaId, banco_o_recibo, observaciones_pago } | null
  const [opcionesInscripcion, setOpcionesInscripcion] = useState([]); // las 3 cuentas: boletos_evento, boletos_bancos, cortesia
  const [guardandoCobro, setGuardandoCobro] = useState(false);

  const [error, setError] = useState('');

  // --- Carga de "Todos los participantes" ---
  async function cargarParticipantes(filtrosActuales, paginaCarga, reemplazar) {
    if (reemplazar) setCargando(true); else setCargandoMas(true);
    setError('');
    try {
      const params = { pagina: paginaCarga, limite: LIMITE };
      if (filtrosActuales.buscar) params.buscar = filtrosActuales.buscar;
      if (filtrosActuales.departamento) params.departamento = filtrosActuales.departamento;
      if (filtrosActuales.zona) params.zona = filtrosActuales.zona;
      if (filtrosActuales.tipo_participante) params.tipo_participante = filtrosActuales.tipo_participante;
      const { data } = await api.get('/admin/participantes', { params });
      setParticipantes((prev) => (reemplazar ? data.participantes : [...prev, ...data.participantes]));
      setTotal(data.total);
      setPagina(paginaCarga);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
      setCargandoMas(false);
    }
  }

  useEffect(() => {
    cargarParticipantes(filtros, 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.departamento, filtros.zona, filtros.tipo_participante]);

  // Búsqueda en vivo mientras se escribe (con una pequeña pausa para no
  // disparar una consulta por cada tecla)
  useEffect(() => {
    const timer = setTimeout(() => {
      cargarParticipantes(filtrosRef.current, 1, true);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.buscar]);

  useEffect(() => {
    if (vista !== 'lista' || modoLista !== 'todos') return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !cargando && !cargandoMas && participantes.length < total) {
        cargarParticipantes(filtrosRef.current, pagina + 1, false);
      }
    }, { rootMargin: '250px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [vista, modoLista, cargando, cargandoMas, participantes.length, total, pagina]);

  function buscar(e) {
    e.preventDefault();
    cargarParticipantes(filtros, 1, true);
  }

  function limpiarFiltros() {
    setFiltros(filtrosVacios);
    cargarParticipantes(filtrosVacios, 1, true);
  }

  // Refresca la pestaña activa (manual, con el botón, o automático cada 30s)
  function refrescarListaActual() {
    if (modoLista === 'actual') {
      cargarInscripcionesEventoActual(buscarActualRef.current);
    } else {
      cargarParticipantes(filtrosRef.current, 1, true);
    }
    api.get('/admin/participantes/estadisticas').then(({ data }) => setEstadisticas(data)).catch(() => {});
  }

  useEffect(() => {
    if (vista !== 'lista') return;
    const interval = setInterval(refrescarListaActual, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, modoLista, eventoActual]);

  // --- Carga de "Inscribiéndose ahora" ---
  async function cargarInscripcionesEventoActual(texto) {
    if (!eventoActual) return;
    setCargandoActual(true);
    setError('');
    try {
      const params = {};
      if (texto) params.buscar = texto;
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/inscripciones`, { params });
      setInscripcionesActual(data.inscripciones);
      setTotalActual(data.total);
      setRegistradosActual(data.total_registrados);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargandoActual(false);
    }
  }

  function buscarEnEventoActual(e) {
    e.preventDefault();
    cargarInscripcionesEventoActual(buscarActual);
  }

  useEffect(() => {
    if (modoLista === 'actual' && eventoActual) {
      cargarInscripcionesEventoActual(buscarActual);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoLista, eventoActual]);

  // Búsqueda en vivo mientras se escribe, misma lógica que en Todos los participantes
  useEffect(() => {
    if (modoLista !== 'actual' || !eventoActual) return;
    const timer = setTimeout(() => {
      cargarInscripcionesEventoActual(buscarActualRef.current);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscarActual]);

  async function marcarPresencialEnEventoActual(inscripcionId, valor) {
    setError('');
    try {
      await api.put(`/admin/inscripciones/${inscripcionId}/presencial`, { registrado_presencial: valor });
      setInscripcionesActual((prev) => prev.map((i) =>
        i.inscripcion_id === inscripcionId ? { ...i, registrado_presencial: valor } : i
      ));
      setRegistradosActual((prev) => prev + (valor ? 1 : -1));
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  // Al DESMARCAR "Registrado" se pide confirmación con advertencia — un
  // clic accidental o rápido aquí puede afectar el dinero ya capturado
  // (monto, método de pago) y el boleto asignado. Al confirmar, se
  // actualiza la lista localmente (ya tienes el botón "↻ Refrescar"
  // aparte, si necesitas que el Resumen del sidebar también se ponga
  // al día).
  function pedirDesmarcar(inscripcion) {
    pedirConfirmacion({
      mensaje: `Vas a desmarcar "Registrado" para ${inscripcion.nombre_completo}. Si tenía boleto asignado, se intentará devolver al contador (solo si era el último entregado — si no, el número queda anulado). Su información de pago deja de contar en Control de Ingresos. ¿Confirmas?`,
      textoConfirmar: 'Sí, desmarcar',
      onConfirmar: async () => {
        setError('');
        try {
          await api.put(`/admin/inscripciones/${inscripcion.inscripcion_id}/presencial`, { registrado_presencial: false });
          setInscripcionesActual((prev) => prev.map((i) =>
            i.inscripcion_id === inscripcion.inscripcion_id ? { ...i, registrado_presencial: false } : i
          ));
          setRegistradosActual((prev) => prev - 1);
          refrescarResumen();
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  // Al MARCAR "Registrado" (false → true), en vez de guardar directo se
  // abre el módulo de cobro — es opcional (se puede guardar en blanco),
  // pero siempre se ofrece la oportunidad de capturarlo, para que no se
  // quede vacío por accidente. Al DESMARCAR se pide confirmación (ver
  // pedirDesmarcar arriba), ya no es una corrección silenciosa.
  async function abrirCobro(inscripcion) {
    setError('');
    setCobrando({
      inscripcion,
      cuentaId: '', // '' = sin seleccionar (opcional)
      banco_o_recibo: '',
      observaciones_pago: '',
    });
    try {
      // Las 4 opciones vienen directo del Catálogo de Cuentas, buscadas
      // por su clave interna (no por nombre/código, que son libres de
      // editar): boletos_evento (4.1.1), boletos_bancos (4.1.2),
      // cortesia (4.1.4), y boletos_tarjeta (4.1.5).
      const { data: cuentas } = await api.get(`/admin/eventos/${eventoActual.id}/valores-cuenta`, { params: { tipo: 'ingreso' } });
      const claves = ['boletos_evento', 'boletos_bancos', 'boletos_tarjeta', 'cortesia'];
      const opciones = claves
        .map((clave) => cuentas.find((c) => c.clave_sistema === clave))
        .filter(Boolean)
        .map((c) => ({
          cuenta_id: c.cuenta_id,
          nombre: c.nombre,
          monto: c.monto || 0,
          clave: c.clave_sistema,
          // Cada cuenta implica su propio método de pago y si pide banco/recibo:
          metodo_pago: c.clave_sistema === 'boletos_evento' ? 'efectivo'
            : c.clave_sistema === 'boletos_bancos' ? 'transferencia'
            : c.clave_sistema === 'boletos_tarjeta' ? 'tarjeta'
            : null,
          pideBanco: c.clave_sistema === 'boletos_bancos' || c.clave_sistema === 'boletos_tarjeta',
        }));
      setOpcionesInscripcion(opciones);
      if (opciones.length === 0) {
        setError('No hay cuentas de Aportación por Boletos ni Cortesía configuradas — ajústalas en Entradas de Efectivo.');
      }
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function guardarCobro() {
    if (!cobrando.cuentaId) {
      setError('"Inscripciones (Alimentación)" es obligatorio para guardar.');
      return;
    }
    const opcion = opcionesInscripcion.find((o) => String(o.cuenta_id) === String(cobrando.cuentaId));
    setGuardandoCobro(true);
    setError('');
    try {
      await api.put(`/admin/inscripciones/${cobrando.inscripcion.inscripcion_id}/pago`, {
        alimentacion_monto: opcion.monto,
        metodo_pago: opcion.metodo_pago,
        banco_o_recibo: opcion.pideBanco ? cobrando.banco_o_recibo : null,
        observaciones_pago: cobrando.observaciones_pago,
      });
      setCobrando(null);
      refrescarResumen();
      // Se limpia el filtro de búsqueda y se recarga la lista completa —
      // así el que se acaba de registrar ya aparece al final (los
      // registrados quedan siempre al fondo, ordenados por el backend).
      setBuscarActual('');
      cargarInscripcionesEventoActual('');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoCobro(false);
    }
  }

  function eliminarInscripcion(inscripcionId, registrado) {
    if (registrado) {
      setError('No se puede eliminar una inscripción con asistencia confirmada. Desmarca "Registrado" primero si fue un error.');
      return;
    }
    pedirConfirmacion({
      mensaje: 'Esta inscripción se eliminará. Si era el único registro que esta persona tuvo alguna vez en el sistema, también se eliminará su ficha de participante por completo. Esta acción no se puede deshacer.',
      textoConfirmar: 'Sí, eliminar',
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/inscripciones/${inscripcionId}`);
          setInscripcionesActual((prev) => prev.filter((i) => i.inscripcion_id !== inscripcionId));
          setTotalActual((prev) => Math.max(prev - 1, 0));
          api.get('/admin/participantes/estadisticas').then(({ data }) => setEstadisticas(data)).catch(() => {});
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  // --- Estadísticas + evento actual (una vez) ---
  useEffect(() => {
    api.get('/admin/participantes/estadisticas')
      .then(({ data }) => setEstadisticas(data))
      .catch(() => {});
    api.get('/eventos')
      .then(({ data }) => {
        const actual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
        setEventoActual(actual || null);
      })
      .catch(() => {});
  }, []);

  // --- Detalle ---
  async function abrirDetalle(id) {
    setError('');
    try {
      const { data } = await api.get(`/admin/participantes/${id}`);
      setSeleccionado(data);
      setVista('detalle');
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function recargarDetalle(id) {
    const { data } = await api.get(`/admin/participantes/${id}`);
    setSeleccionado(data);
  }

  function finalizarEventoActual() {
    if (!eventoActual) return;
    pedirConfirmacion({
      mensaje: `Se cerrará "${eventoActual.nombre}": ya no aparecerá como evento actual ni abierto. Las inscripciones que no tengan "Registrado" marcado simplemente dejarán de contar en el Resumen y no saldrán en Diplomas — no se borra ningún dato. Puedes volver a marcar este evento como actual/abierto desde Eventos si te equivocaste.`,
      textoConfirmar: 'Sí, finalizar evento',
      onConfirmar: async () => {
        setError('');
        try {
          await api.put(`/admin/eventos/${eventoActual.id}/finalizar`);
          const { data } = await api.get('/eventos');
          const nuevoActual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
          setEventoActual(nuevoActual || null);
          api.get('/admin/participantes/estadisticas').then(({ data }) => setEstadisticas(data)).catch(() => {});
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  function ocultarParticipante(id) {
    pedirConfirmacion({
      mensaje: 'Este participante dejará de aparecer en todos los listados y estadísticas del sistema. Su historial no se borra, pero desaparecerá por completo de la vista. Esta acción no se puede deshacer desde el panel.',
      textoConfirmar: 'Sí, eliminar',
      onConfirmar: async () => {
        setError('');
        try {
          await api.put(`/admin/participantes/${id}/ocultar`);
          setParticipantes((prev) => prev.filter((p) => p.id !== id));
          setTotal((prev) => Math.max(prev - 1, 0));
          api.get('/admin/participantes/estadisticas').then(({ data }) => setEstadisticas(data)).catch(() => {});
          if (seleccionado?.id === id) {
            setSeleccionado(null);
            setVista('lista');
          }
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  async function marcarPresencial(inscripcionId, valor) {
    setError('');
    try {
      await api.put(`/admin/inscripciones/${inscripcionId}/presencial`, { registrado_presencial: valor });
      await recargarDetalle(seleccionado.id);
      refrescarResumen();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  function abrirEditar() {
    setFormEditar({
      nombre_completo: seleccionado.nombre_completo || '',
      fecha_nacimiento: seleccionado.fecha_nacimiento ? seleccionado.fecha_nacimiento.slice(0, 10) : '',
      telefono_movil: seleccionado.telefono_movil || '',
      departamento: seleccionado.departamento || '',
      municipio: seleccionado.municipio || '',
      capitulo: seleccionado.capitulo || '',
      zona: seleccionado.zona || '',
      cargo_fihnec: seleccionado.cargo_fihnec || '',
      estado_civil: seleccionado.estado_civil || '',
      ha_recibido_saeles: seleccionado.ha_recibido_saeles || false,
      veces_saeles_previas: seleccionado.veces_saeles_previas || '',
      contacto_emergencia_nombre: seleccionado.contacto_emergencia_nombre || '',
      contacto_emergencia_telefono: seleccionado.contacto_emergencia_telefono || '',
    });
    setVista('editar');
  }

  async function guardarEdicion() {
    setGuardando(true);
    setError('');
    try {
      await api.put(`/admin/participantes/${seleccionado.id}`, formEditar);
      await recargarDetalle(seleccionado.id);
      setVista('detalle');
      cargarParticipantes(filtrosRef.current, 1, true);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  async function abrirExtranjero() {
    setError('');
    setFormExtranjero(vacioExtranjero);
    try {
      const { data } = await api.get('/eventos');
      setEventosAbiertos(data.filter((ev) => ev.abierto));
    } catch (err) {
      setError(mensajeError(err));
    }
    setVista('extranjero');
  }

  async function guardarExtranjero() {
    setGuardando(true);
    setError('');
    try {
      await api.post('/admin/participantes/extranjero', {
        ...formExtranjero,
        veces_saeles_previas: formExtranjero.ha_recibido_saeles ? (Number(formExtranjero.veces_saeles_previas) || 0) : null,
      });
      setVista('lista');
      cargarParticipantes(filtrosRef.current, 1, true);
      if (modoLista === 'actual' && eventoActual) cargarInscripcionesEventoActual(buscarActual);
      api.get('/admin/participantes/estadisticas').then(({ data }) => setEstadisticas(data)).catch(() => {});
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  const municipiosEditar = formEditar ? (MUNICIPIOS_POR_DEPARTAMENTO[formEditar.departamento] || []) : [];
  const municipiosExtranjero = MUNICIPIOS_POR_DEPARTAMENTO[formExtranjero.departamento] || [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Participantes</h1>
        {vista === 'lista' && (
          <button onClick={abrirExtranjero} className="rounded-full bg-[#007334] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005c29]">
            + Agregar extranjero
          </button>
        )}
      </div>

      {error && !cobrando && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {vista === 'lista' && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setModoLista('actual')} className={claseTab(modoLista === 'actual')}>
                  ★ Inscribiéndose ahora
                </button>
                <button onClick={() => setModoLista('todos')} className={claseTab(modoLista === 'todos')}>
                  Todos los participantes
                </button>
              </div>
              <button
                onClick={refrescarListaActual}
                title="Refrescar (también se actualiza solo cada 30 segundos)"
                className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5"
              >
                ↻ Refrescar
              </button>
            </div>

            {modoLista === 'actual' && (
              <div>
                {!eventoActual ? (
                  <p className="mt-4 text-sm text-ink/40">No hay un evento SAEL marcado como actual/abierto en este momento.</p>
                ) : (
                  <>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-night px-4 py-3 text-white shadow-sm">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-white/60">Evento actual</p>
                        <p className="font-display text-lg font-bold">{eventoActual.nombre}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-sm">
                          <span className="font-display text-2xl font-bold">{registradosActual}</span>
                          <span className="text-white/60"> / {totalActual} registrados</span>
                        </p>
                        <button
                          onClick={finalizarEventoActual}
                          className="rounded-full bg-ember px-4 py-1.5 text-xs font-semibold text-white hover:bg-ember-light"
                        >
                          Finalizar evento actual
                        </button>
                      </div>
                    </div>

                    <form onSubmit={buscarEnEventoActual} className="mt-4 flex flex-wrap gap-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
                      <input
                        type="text"
                        value={buscarActual}
                        onChange={(e) => setBuscarActual(e.target.value)}
                        placeholder="Buscar por nombre o identificación"
                        className={`${claseInput} flex-1 min-w-[200px]`}
                      />
                      <button type="submit" className="rounded-full bg-[#007334] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005c29]">
                        Buscar
                      </button>
                      <button
                        type="button"
                        onClick={() => { setBuscarActual(''); cargarInscripcionesEventoActual(''); }}
                        className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5"
                      >
                        Limpiar filtros
                      </button>
                    </form>

                    <p className="mt-2 text-xs text-ink/50">
                      Marca "Registrado" cuando la persona llegue físicamente al evento.
                    </p>

                    {cargandoActual ? <p className="mt-6 text-ink/40">Cargando…</p> : (
                      <div className="mt-2 overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-sm">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
                              <th className="px-4 py-3">Nombre</th>
                              <th className="px-4 py-3">Identificación</th>
                              <th className="px-4 py-3">Capítulo</th>
                              <th className="px-4 py-3">Zona</th>
                              <th className="px-4 py-3 text-center">Registrado</th>
                              <th className="px-4 py-3"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {inscripcionesActual.length === 0 && (
                              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink/40">Nadie se ha inscrito todavía a este evento.</td></tr>
                            )}
                            {inscripcionesActual.map((i) => (
                              <tr key={i.inscripcion_id} className="border-b border-ink/5 last:border-0">
                                <td className="px-4 py-3 font-medium text-ink">
                                  {i.nombre_completo}
                                  {i.tipo_participante === 'extranjero' && (
                                    <span className="ml-2 rounded-full bg-night/10 px-2 py-0.5 text-xs font-semibold text-night">Extranjero</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-ink/60">{i.tipo_identificacion}: {i.numero_identificacion}</td>
                                <td className="px-4 py-3 text-ink/60">{i.capitulo || '—'}</td>
                                <td className="px-4 py-3 text-ink/60">{i.zona}</td>
                                <td className="px-4 py-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={i.registrado_presencial}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        abrirCobro(i);
                                      } else {
                                        pedirDesmarcar(i);
                                      }
                                    }}
                                  />
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <button onClick={() => abrirDetalle(i.participante_id)} className={btnVer}>
                                    Ver detalle
                                  </button>
                                  <button
                                    onClick={() => eliminarInscripcion(i.inscripcion_id, i.registrado_presencial)}
                                    className={`ml-2 ${btnEliminar}`}
                                  >
                                    Eliminar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {modoLista === 'todos' && (
              <div>
                <form onSubmit={buscar} className="mt-4 rounded-2xl border border-ink/10 bg-white p-3 shadow-sm">
                  <input
                    type="text"
                    value={filtros.buscar}
                    onChange={(e) => setFiltros((f) => ({ ...f, buscar: e.target.value }))}
                    placeholder="Buscar por nombre o identificación"
                    className={`${claseInput} w-full py-1.5`}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select value={filtros.departamento} onChange={(e) => setFiltros((f) => ({ ...f, departamento: e.target.value }))} className={claseFiltro}>
                      <option value="">Todos los departamentos</option>
                      {DEPARTAMENTOS_HONDURAS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select value={filtros.zona} onChange={(e) => setFiltros((f) => ({ ...f, zona: e.target.value }))} className={claseFiltro}>
                      <option value="">Todas las zonas</option>
                      {ZONAS_FIHNEC.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                    <select value={filtros.tipo_participante} onChange={(e) => setFiltros((f) => ({ ...f, tipo_participante: e.target.value }))} className={claseFiltro}>
                      {TIPOS_PARTICIPANTE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <button type="submit" className="ml-auto rounded-full bg-[#007334] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#005c29]">
                      Buscar
                    </button>
                    <button type="button" onClick={limpiarFiltros} className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5">
                      Limpiar filtros
                    </button>
                  </div>
                </form>

                {cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : (
                  <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
                          <th className="px-4 py-3">Nombre</th>
                          <th className="px-4 py-3">Identificación</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3">Capítulo</th>
                          <th className="px-4 py-3">Zona</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {participantes.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-6 text-center text-ink/40">No se encontraron participantes con esos filtros.</td></tr>
                        )}
                        {participantes.map((p) => (
                          <tr key={p.id} className="border-b border-ink/5 last:border-0">
                            <td className="px-4 py-3 font-medium text-ink">
                              {p.nombre_completo}
                              {p.tipo_participante === 'extranjero' && (
                                <span className="ml-2 rounded-full bg-night/10 px-2 py-0.5 text-xs font-semibold text-night">Extranjero</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-ink/60">{p.tipo_identificacion}: {p.numero_identificacion}</td>
                            <td className="px-4 py-3 text-ink/60 capitalize">{p.tipo_participante}</td>
                            <td className="px-4 py-3 text-ink/60">{p.capitulo || '—'}</td>
                            <td className="px-4 py-3 text-ink/60">{p.zona}</td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <button onClick={() => abrirDetalle(p.id)} className={btnVer}>Ver detalle</button>
                              <button
                                onClick={() => ocultarParticipante(p.id)}
                                className={`ml-2 ${btnEliminar}`}
                              >
                                Eliminar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {participantes.length > 0 && (
                      <p className="px-4 py-2 text-center text-xs text-ink/30">
                        Mostrando {participantes.length} de {total}
                      </p>
                    )}
                    <div ref={sentinelRef} />
                    {cargandoMas && <p className="pb-2 text-center text-xs text-ink/40">Cargando más…</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
              <h3 className="font-display text-sm font-bold text-ink">Accesos rápidos</h3>
              <div className="mt-3 space-y-2">
                {eventoActual && (
                  <p className="text-xs text-ink/70">
                    Evento actual: <span className="font-semibold text-ink">{eventoActual.nombre}</span>
                  </p>
                )}
                <Link to="/admin/eventos" className="block w-full rounded-full border border-ink/20 px-4 py-2 text-center text-xs font-semibold text-ink/70 hover:bg-ink/5">
                  Ver eventos
                </Link>
                <Link to="/admin/diplomas" className="block w-full rounded-full border border-ink/20 px-4 py-2 text-center text-xs font-semibold text-ink/70 hover:bg-ink/5">
                  Ver diplomas
                </Link>
                <p className="pt-1 text-xs text-ink/30">Reportería: próximamente</p>
              </div>
            </div>
          </aside>
        </div>
      )}

      {vista === 'detalle' && seleccionado && (
        <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">{seleccionado.nombre_completo}</h2>
            <div className="flex gap-3">
              <button onClick={abrirEditar} className={btnEditar}>
                Editar
              </button>
              <button onClick={() => setVista('lista')} className="rounded-full bg-night px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90">
                Volver
              </button>
              <button onClick={() => ocultarParticipante(seleccionado.id)} className={btnEliminar}>
                Eliminar
              </button>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-ink/50">Identificación</dt><dd className="font-medium text-ink">{seleccionado.tipo_identificacion}: {seleccionado.numero_identificacion}</dd></div>
            <div><dt className="text-ink/50">Tipo</dt><dd className="font-medium text-ink capitalize">{seleccionado.tipo_participante}</dd></div>
            <div><dt className="text-ink/50">Fecha de nacimiento</dt><dd className="font-medium text-ink">{seleccionado.fecha_nacimiento ? seleccionado.fecha_nacimiento.slice(0, 10) : '—'}</dd></div>
            <div><dt className="text-ink/50">Teléfono</dt><dd className="font-medium text-ink">{seleccionado.telefono_movil || '—'}</dd></div>
            <div><dt className="text-ink/50">Departamento / Municipio</dt><dd className="font-medium text-ink">{seleccionado.departamento || '—'} / {seleccionado.municipio || '—'}</dd></div>
            <div><dt className="text-ink/50">Capítulo</dt><dd className="font-medium text-ink">{seleccionado.capitulo || '—'}</dd></div>
            <div><dt className="text-ink/50">Zona</dt><dd className="font-medium text-ink">{seleccionado.zona || '—'}</dd></div>
            <div><dt className="text-ink/50">Cargo FIHNEC</dt><dd className="font-medium text-ink">{seleccionado.cargo_fihnec || '—'}</dd></div>
            <div><dt className="text-ink/50">Estado civil</dt><dd className="font-medium text-ink">{seleccionado.estado_civil || '—'}</dd></div>
            <div><dt className="text-ink/50">Contacto de emergencia</dt><dd className="font-medium text-ink">{seleccionado.contacto_emergencia_nombre || '—'} {seleccionado.contacto_emergencia_telefono ? `(${seleccionado.contacto_emergencia_telefono})` : ''}</dd></div>
            <div><dt className="text-ink/50">Total de SAELES</dt><dd className="font-medium text-ink">{seleccionado.total_saeles} <span className="text-xs text-ink/40">(solo encuentros con presencia confirmada)</span></dd></div>
          </dl>

          <h3 className="mt-6 font-display text-sm font-bold text-ink">Historial de inscripciones</h3>
          {seleccionado.inscripciones.length === 0 ? (
            <p className="mt-2 text-sm text-ink/40">Sin inscripciones registradas todavía.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {seleccionado.inscripciones.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2 text-sm text-ink/70">
                  <span>{i.evento_nombre} — {i.fecha_inicio.slice(0, 10)}</span>
                  <label className="flex items-center gap-2 text-xs text-ink/60">
                    <input
                      type="checkbox"
                      checked={i.registrado_presencial}
                      onChange={(e) => marcarPresencial(i.id, e.target.checked)}
                    />
                    Registrado presencial
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {vista === 'editar' && formEditar && (
        <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold text-ink">Editar participante</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre completo</span>
              <input type="text" value={formEditar.nombre_completo} onChange={(e) => setFormEditar((f) => ({ ...f, nombre_completo: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha de nacimiento</span>
              <input type="date" value={formEditar.fecha_nacimiento} onChange={(e) => setFormEditar((f) => ({ ...f, fecha_nacimiento: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Teléfono móvil</span>
              <input type="text" value={formEditar.telefono_movil} onChange={(e) => setFormEditar((f) => ({ ...f, telefono_movil: e.target.value.replace(/\D/g, '').slice(0, 8) }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Departamento</span>
              <select value={formEditar.departamento} onChange={(e) => setFormEditar((f) => ({ ...f, departamento: e.target.value, municipio: '' }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {DEPARTAMENTOS_HONDURAS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Municipio</span>
              <select value={formEditar.municipio} onChange={(e) => setFormEditar((f) => ({ ...f, municipio: e.target.value }))} className={claseInput} disabled={!formEditar.departamento}>
                <option value="">Seleccionar…</option>
                {municipiosEditar.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Capítulo</span>
              <input type="text" value={formEditar.capitulo} onChange={(e) => setFormEditar((f) => ({ ...f, capitulo: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Zona</span>
              <select value={formEditar.zona} onChange={(e) => setFormEditar((f) => ({ ...f, zona: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {ZONAS_FIHNEC.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Cargo FIHNEC</span>
              <select value={formEditar.cargo_fihnec} onChange={(e) => setFormEditar((f) => ({ ...f, cargo_fihnec: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {CARGOS_FIHNEC.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Estado civil</span>
              <select value={formEditar.estado_civil} onChange={(e) => setFormEditar((f) => ({ ...f, estado_civil: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {ESTADOS_CIVILES.map((ec) => <option key={ec} value={ec}>{ec}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={formEditar.ha_recibido_saeles} onChange={(e) => setFormEditar((f) => ({ ...f, ha_recibido_saeles: e.target.checked }))} />
              <span className="text-sm text-ink/70">Recibió SAELES antes de este sistema</span>
            </label>
            {formEditar.ha_recibido_saeles && (
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Veces (histórico previo)</span>
                <input
                  type="number" min="0" max="99" value={formEditar.veces_saeles_previas}
                  onChange={(e) => {
                    const val = e.target.value.slice(0, 2);
                    setFormEditar((f) => ({ ...f, veces_saeles_previas: val === '' ? '' : String(Math.min(Number(val), 99)) }));
                  }}
                  className={claseInput}
                />
                <p className="mt-1 text-xs text-ink/40">Máximo 99</p>
              </label>
            )}
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Contacto de emergencia — nombre</span>
              <input type="text" value={formEditar.contacto_emergencia_nombre} onChange={(e) => setFormEditar((f) => ({ ...f, contacto_emergencia_nombre: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Contacto de emergencia — teléfono</span>
              <input type="text" value={formEditar.contacto_emergencia_telefono} onChange={(e) => setFormEditar((f) => ({ ...f, contacto_emergencia_telefono: e.target.value.replace(/\D/g, '').slice(0, 8) }))} className={claseInput} />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setVista('detalle')} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
            <button onClick={guardarEdicion} disabled={guardando} className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {vista === 'extranjero' && (
        <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold text-ink">Agregar participante extranjero</h2>
          <p className="mt-1 text-xs text-ink/50">
            Solo el nombre, el número de pasaporte y el evento son obligatorios. Este registro queda inscrito
            de una vez al evento seleccionado, pendiente de chequeo presencial el día del evento (igual que
            cualquier otra inscripción).
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre completo *</span>
              <input type="text" value={formExtranjero.nombre_completo} onChange={(e) => setFormExtranjero((f) => ({ ...f, nombre_completo: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Número de pasaporte *</span>
              <input type="text" value={formExtranjero.numero_identificacion} onChange={(e) => setFormExtranjero((f) => ({ ...f, numero_identificacion: e.target.value.toUpperCase() }))} className={claseInput} />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Evento SAEL al que se inscribe *</span>
              <select value={formExtranjero.evento_id} onChange={(e) => setFormExtranjero((f) => ({ ...f, evento_id: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {eventosAbiertos.map((ev) => <option key={ev.id} value={ev.id}>{ev.nombre}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha de nacimiento</span>
              <input type="date" value={formExtranjero.fecha_nacimiento} onChange={(e) => setFormExtranjero((f) => ({ ...f, fecha_nacimiento: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Teléfono móvil</span>
              <input type="text" value={formExtranjero.telefono_movil} onChange={(e) => setFormExtranjero((f) => ({ ...f, telefono_movil: e.target.value.replace(/\D/g, '').slice(0, 8) }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Departamento</span>
              <select value={formExtranjero.departamento} onChange={(e) => setFormExtranjero((f) => ({ ...f, departamento: e.target.value, municipio: '' }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {DEPARTAMENTOS_HONDURAS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Municipio</span>
              <select value={formExtranjero.municipio} onChange={(e) => setFormExtranjero((f) => ({ ...f, municipio: e.target.value }))} className={claseInput} disabled={!formExtranjero.departamento}>
                <option value="">Seleccionar…</option>
                {municipiosExtranjero.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Capítulo</span>
              <input type="text" value={formExtranjero.capitulo} onChange={(e) => setFormExtranjero((f) => ({ ...f, capitulo: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Zona</span>
              <select value={formExtranjero.zona} onChange={(e) => setFormExtranjero((f) => ({ ...f, zona: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {ZONAS_FIHNEC.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Cargo FIHNEC</span>
              <select value={formExtranjero.cargo_fihnec} onChange={(e) => setFormExtranjero((f) => ({ ...f, cargo_fihnec: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {CARGOS_FIHNEC.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Estado civil</span>
              <select value={formExtranjero.estado_civil} onChange={(e) => setFormExtranjero((f) => ({ ...f, estado_civil: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {ESTADOS_CIVILES.map((ec) => <option key={ec} value={ec}>{ec}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={formExtranjero.ha_recibido_saeles} onChange={(e) => setFormExtranjero((f) => ({ ...f, ha_recibido_saeles: e.target.checked }))} />
              <span className="text-sm text-ink/70">Recibió SAELES antes de este sistema</span>
            </label>
            {formExtranjero.ha_recibido_saeles && (
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Veces (histórico previo)</span>
                <input
                  type="number" min="0" max="99" value={formExtranjero.veces_saeles_previas}
                  onChange={(e) => {
                    const val = e.target.value.slice(0, 2);
                    setFormExtranjero((f) => ({ ...f, veces_saeles_previas: val === '' ? '' : String(Math.min(Number(val), 99)) }));
                  }}
                  className={claseInput}
                />
                <p className="mt-1 text-xs text-ink/40">Máximo 99</p>
              </label>
            )}
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Contacto de emergencia — nombre</span>
              <input type="text" value={formExtranjero.contacto_emergencia_nombre} onChange={(e) => setFormExtranjero((f) => ({ ...f, contacto_emergencia_nombre: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Contacto de emergencia — teléfono</span>
              <input type="text" value={formExtranjero.contacto_emergencia_telefono} onChange={(e) => setFormExtranjero((f) => ({ ...f, contacto_emergencia_telefono: e.target.value.replace(/\D/g, '').slice(0, 8) }))} className={claseInput} />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setVista('lista')} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancelar</button>
            <button onClick={guardarExtranjero} disabled={guardando} className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar e inscribir'}
            </button>
          </div>
        </div>
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

      {cobrando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lg">
            <h3 className="font-display text-lg font-bold text-ink">Módulo de cobro</h3>
            <p className="mt-1 text-sm text-ink/50">{cobrando.inscripcion.nombre_completo}</p>
            <p className="mt-1 text-xs text-ink/40">
              "Inscripciones (Alimentación)" es obligatorio. Banco/recibo y observaciones son opcionales.
            </p>
            {error && <p className="mt-3 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

            <div className="mt-4 space-y-4">
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Inscripciones (Alimentación)</span>
                <select
                  value={cobrando.cuentaId}
                  onChange={(e) => setCobrando((c) => ({ ...c, cuentaId: e.target.value }))}
                  className={claseInput}
                >
                  <option value="">Seleccionar…</option>
                  {opcionesInscripcion.map((o) => (
                    <option key={o.cuenta_id} value={o.cuenta_id}>{o.nombre} (L. {o.monto})</option>
                  ))}
                </select>
                {opcionesInscripcion.length === 0 && (
                  <p className="mt-1 text-xs text-ember">No hay cuentas de boletos ni Cortesía configuradas — ajústalas en Entradas de Efectivo.</p>
                )}
              </label>

              {(() => {
                const opcionElegida = opcionesInscripcion.find((o) => String(o.cuenta_id) === String(cobrando.cuentaId));
                const pideBanco = opcionElegida?.pideBanco;
                return (
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-ink/60">Banco ó # de recibo</span>
                    <input
                      type="text" value={pideBanco ? cobrando.banco_o_recibo : ''}
                      onChange={(e) => setCobrando((c) => ({ ...c, banco_o_recibo: e.target.value }))}
                      disabled={!pideBanco}
                      className={`${claseInput} disabled:bg-ink/5 disabled:text-ink/30`}
                      placeholder={pideBanco ? '' : 'No aplica para esta cuenta'}
                    />
                  </label>
                );
              })()}

              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Observaciones</span>
                <input type="text" value={cobrando.observaciones_pago} onChange={(e) => setCobrando((c) => ({ ...c, observaciones_pago: e.target.value }))} className={claseInput} />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setCobrando(null)} className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/5">
                Cancelar
              </button>
              <button onClick={guardarCobro} disabled={guardandoCobro} className="rounded-full bg-[#007334] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#005c29] disabled:opacity-50">
                {guardandoCobro ? 'Guardando…' : 'Guardar y confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

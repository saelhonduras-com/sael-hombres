import { useEffect, useState } from 'react';
import api, { mensajeError } from '../../api';

const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none';
const btnGuardar = 'rounded-full bg-[#007334] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#005c29] disabled:opacity-50';
const btnEliminar = 'rounded-full bg-ember px-3 py-1 text-xs font-semibold text-white hover:bg-ember-light';

export default function AdminControlCostos() {
  const [eventoActual, setEventoActual] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // --- Boletería ---
  const [resumenBoleteria, setResumenBoleteria] = useState(null);
  const [rangoFinImpreso, setRangoFinImpreso] = useState('');
  const [ubicacionBoleteria, setUbicacionBoleteria] = useState('');
  const [guardandoBoleteria, setGuardandoBoleteria] = useState(false);
  const [boletoSiguienteEvento, setBoletoSiguienteEvento] = useState(null); // progreso REAL en el servidor
  const [boletoInicioGuardado, setBoletoInicioGuardado] = useState(null); // por si aún no hay evento anterior capturado
  const [guardandoBoletoInicio, setGuardandoBoletoInicio] = useState(false);
  const [eventoAnteriorNombre, setEventoAnteriorNombre] = useState('');
  const [eventoAnteriorInicio, setEventoAnteriorInicio] = useState('');
  const [eventoAnteriorFin, setEventoAnteriorFin] = useState('');
  const [modoEdicionBoleteria, setModoEdicionBoleteria] = useState(false);

  // --- Costos genéricos (Alimentación, Ofrenda, Renta de espacio, otros) ---
  const [costosGenericos, setCostosGenericos] = useState([]);
  const [nuevoConcepto, setNuevoConcepto] = useState('');
  const [nuevoMonto, setNuevoMonto] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [editandoMontos, setEditandoMontos] = useState({}); // { [costoId]: '123.00' }
  const [editandoNombreIds, setEditandoNombreIds] = useState({}); // { [costoId]: true } — nombre en modo edición
  const [editandoNombres, setEditandoNombres] = useState({}); // { [costoId]: 'Nuevo nombre' }

  // --- Hotel por módulo ---
  const [modulos, setModulos] = useState([]);
  const [costosModulo, setCostosModulo] = useState({}); // { [moduloId]: monto actual }
  const [editandoHotel, setEditandoHotel] = useState({}); // { [moduloId]: '400.00' }
  const [guardandoHotelId, setGuardandoHotelId] = useState(null);

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
      const [rCostos, rModulos, rBoleteriaConfig, rBoleteriaResumen] = await Promise.all([
        api.get(`/admin/eventos/${eventoActual.id}/costos`),
        api.get('/admin/modulos'),
        api.get('/admin/boleteria/config'),
        api.get('/admin/boleteria/resumen', { params: { evento_actual_id: eventoActual.id } }),
      ]);

      setCostosGenericos(rCostos.data.filter((c) => !c.modulo_id));
      const porModulo = {};
      rCostos.data.filter((c) => c.modulo_id).forEach((c) => { porModulo[c.modulo_id] = c.monto; });
      setCostosModulo(porModulo);

      setModulos(rModulos.data);
      setRangoFinImpreso(rBoleteriaConfig.data.rango_fin_impreso ?? '');
      setUbicacionBoleteria(rBoleteriaConfig.data.ubicacion || '');
      setEventoAnteriorNombre(rBoleteriaConfig.data.evento_anterior_nombre || '');
      setEventoAnteriorInicio(rBoleteriaConfig.data.evento_anterior_inicio ?? '');
      setEventoAnteriorFin(rBoleteriaConfig.data.evento_anterior_fin ?? '');
      setResumenBoleteria(rBoleteriaResumen.data);
      setBoletoInicioGuardado(eventoActual.boleto_inicio ?? null);
      setBoletoSiguienteEvento(eventoActual.boleto_siguiente ?? null);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarTodo(); }, [eventoActual]);

  // --- Boletería ---
  async function guardarBoleteria() {
    setGuardandoBoleteria(true);
    setError('');
    try {
      await api.put('/admin/boleteria/config', {
        rango_fin_impreso: rangoFinImpreso ? Number(rangoFinImpreso) : null,
        ubicacion: ubicacionBoleteria,
        evento_anterior_nombre: eventoAnteriorNombre,
        evento_anterior_inicio: eventoAnteriorInicio ? Number(eventoAnteriorInicio) : null,
        evento_anterior_fin: eventoAnteriorFin ? Number(eventoAnteriorFin) : null,
      });
      const { data } = await api.get('/admin/boleteria/resumen', { params: { evento_actual_id: eventoActual.id } });
      setResumenBoleteria(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoBoleteria(false);
    }
  }

  // El "inventario inicial" de este evento se calcula solo: es el
  // "inventario final" del evento anterior + 1. Solo si el evento
  // anterior todavía no está capturado, se usa lo que ya hubiera
  // guardado antes como respaldo.
  const inicioActualCalculado = eventoAnteriorFin !== ''
    ? Number(eventoAnteriorFin) + 1
    : (boletoInicioGuardado || '');

  async function guardarBoletoInicio() {
    if (!inicioActualCalculado) {
      setError('Completa el "Inventario final" del evento anterior primero, para poder calcular dónde arranca este.');
      return;
    }
    setGuardandoBoletoInicio(true);
    setError('');
    try {
      await api.put(`/admin/eventos/${eventoActual.id}/boletos`, { boleto_inicio: Number(inicioActualCalculado) });
      const { data } = await api.get('/eventos');
      const actualizado = data.find((e) => e.id === eventoActual.id);
      setBoletoInicioGuardado(actualizado?.boleto_inicio ?? null);
      setBoletoSiguienteEvento(actualizado?.boleto_siguiente ?? null);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoBoletoInicio(false);
    }
  }

  // La Caja 2 (Boletos disponibles) tiene un solo botón "Guardar", pero
  // guarda dos cosas de origen distinto: el "Inventario inicial" (que es
  // eventos.boleto_inicio, calculado) y el "Inventario final" (que es
  // boleteria_config.rango_fin_impreso) — se guardan juntas para que se
  // sienta como una sola acción, aunque por debajo sean dos llamadas.
  async function guardarBoletoYTecho() {
    await guardarBoletoInicio();
    await guardarBoleteria();
  }

  // --- Costos genéricos ---
  async function agregarCosto() {
    if (!nuevoConcepto || nuevoMonto === '') {
      setError('Escribe el concepto y el monto.');
      return;
    }
    setGuardandoNuevo(true);
    setError('');
    try {
      await api.put(`/admin/eventos/${eventoActual.id}/costos`, { concepto: nuevoConcepto, monto: Number(nuevoMonto) });
      setNuevoConcepto('');
      setNuevoMonto('');
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoNuevo(false);
    }
  }

  function activarEdicionNombre(costo) {
    setEditandoNombreIds((e) => ({ ...e, [costo.id]: true }));
    setEditandoNombres((e) => ({ ...e, [costo.id]: costo.concepto }));
  }

  async function guardarEdicionCosto(costo) {
    const nombreNuevo = editandoNombres[costo.id] ?? costo.concepto;
    const montoNuevo = editandoMontos[costo.id] ?? costo.monto;
    if (!nombreNuevo || montoNuevo === '') {
      setError('El concepto y el monto no pueden quedar vacíos.');
      return;
    }
    setError('');
    try {
      await api.put(`/admin/eventos-costos/${costo.id}`, { concepto: nombreNuevo, monto: Number(montoNuevo) });
      setEditandoMontos((e) => { const copia = { ...e }; delete copia[costo.id]; return copia; });
      setEditandoNombres((e) => { const copia = { ...e }; delete copia[costo.id]; return copia; });
      setEditandoNombreIds((e) => { const copia = { ...e }; delete copia[costo.id]; return copia; });
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function marcarComoBoleto(costo) {
    setError('');
    try {
      await api.put(`/admin/eventos-costos/${costo.id}/marcar-boleto`);
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function eliminarCosto(costo) {
    setError('');
    try {
      await api.delete(`/admin/eventos-costos/${costo.id}`);
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  // --- Hotel por módulo ---
  async function guardarCostoModulo(modulo) {
    const monto = editandoHotel[modulo.id];
    if (monto === undefined || monto === '') return;
    setGuardandoHotelId(modulo.id);
    setError('');
    try {
      await api.put(`/admin/eventos/${eventoActual.id}/costos-modulo/${modulo.id}`, { monto: Number(monto) });
      setEditandoHotel((e) => { const copia = { ...e }; delete copia[modulo.id]; return copia; });
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoHotelId(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Control de Costos</h1>
      <p className="mt-1 text-sm text-ink/50">
        Aquí se parametrizan todos los conceptos financieros del evento — luego alimentan Ingresos y Egresos, y el
        Resumen Financiero{eventoActual ? <> — mostrando <strong>{eventoActual.nombre}</strong></> : ''}.
      </p>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {!eventoActual && !cargando && (
        <p className="mt-6 text-sm text-ink/40">No hay un evento SAEL marcado como actual/abierto en este momento.</p>
      )}

      {eventoActual && cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : eventoActual && (
        <div className="mt-4 space-y-6">
          {/* BOLETERÍA */}
          <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Boletería</h2>
                <p className="mt-1 text-xs text-ink/50">
                  Lo disponible para el evento actual se calcula solo, y avanza en vivo conforme se usan boletos en el módulo de cobro.
                </p>
              </div>
              <button
                onClick={() => setModoEdicionBoleteria((m) => !m)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  modoEdicionBoleteria ? 'bg-[#007334] text-white hover:bg-[#005c29]' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
                }`}
              >
                {modoEdicionBoleteria ? '🔓 Edición activada' : '🔒 Activar edición'}
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {/* Caja 1: Evento anterior */}
              <div className="overflow-hidden rounded-xl border border-ink/10">
                <div className="border-b border-ink/10 bg-ink/5 px-4 py-2">
                  <label className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Evento anterior —</span>
                    <input
                      type="text" value={eventoAnteriorNombre} onChange={(e) => setEventoAnteriorNombre(e.target.value)}
                      disabled={!modoEdicionBoleteria}
                      className="flex-1 border-b border-dashed border-ink/20 bg-transparent px-1 py-0.5 text-sm font-bold text-ink focus:border-ember focus:outline-none disabled:text-ink/60"
                      placeholder="Ej. SAEL Julio"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-3 divide-x divide-ink/10 text-center">
                  <div className="p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Inventario inicial</p>
                    <input
                      type="number" min="1" value={eventoAnteriorInicio} onChange={(e) => setEventoAnteriorInicio(e.target.value)}
                      disabled={!modoEdicionBoleteria}
                      className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1 text-center text-sm font-semibold text-ink disabled:border-transparent disabled:bg-transparent"
                      placeholder="75892"
                    />
                    <p className="mt-1 text-[10px] text-ink/40">Último boleto usado SAEL anterior</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Inventario final</p>
                    <input
                      type="number" min="1" value={eventoAnteriorFin} onChange={(e) => setEventoAnteriorFin(e.target.value)}
                      disabled={!modoEdicionBoleteria}
                      className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1 text-center text-sm font-semibold text-ink disabled:border-transparent disabled:bg-transparent"
                      placeholder="76215"
                    />
                  </div>
                  <div className="bg-ink/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Boletos usados</p>
                    <p className="mt-1 font-display text-lg font-bold text-[#007334]">
                      {eventoAnteriorInicio !== '' && eventoAnteriorFin !== ''
                        ? Number(eventoAnteriorFin) - Number(eventoAnteriorInicio)
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="border-t border-ink/10 p-3 text-right">
                  <button onClick={guardarBoleteria} disabled={guardandoBoleteria || !modoEdicionBoleteria} className={btnGuardar}>
                    {guardandoBoleteria ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>

              {/* Caja 2: Boletos disponibles para el evento actual */}
              <div className="overflow-hidden rounded-xl border border-ink/10">
                <div className="border-b border-ink/10 bg-ink/5 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                    Boletos disponibles — <span className="font-bold text-ink">{eventoActual.nombre}</span>
                  </p>
                </div>
                <div className="grid grid-cols-3 divide-x divide-ink/10 text-center">
                  <div className="p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Inventario inicial</p>
                    <p className="mt-1 rounded-lg bg-ink/5 px-2 py-1 text-sm font-semibold text-ink">
                      {inicioActualCalculado || '—'}
                    </p>
                    <p className="mt-1 text-[10px] text-ink/40">= Inventario final del evento anterior + 1</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Inventario final</p>
                    <input
                      type="number" min="1" value={rangoFinImpreso} onChange={(e) => setRangoFinImpreso(e.target.value)}
                      disabled={!modoEdicionBoleteria}
                      className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1 text-center text-sm font-semibold text-ink disabled:border-transparent disabled:bg-transparent"
                      placeholder="80701"
                    />
                  </div>
                  <div className="bg-ink/5 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Boletos en el CNC</p>
                    <p className="mt-1 font-display text-lg font-bold text-[#007334]">
                      {inicioActualCalculado && rangoFinImpreso !== ''
                        ? Number(rangoFinImpreso) - Number(boletoSiguienteEvento || inicioActualCalculado)
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="border-t border-ink/10 p-3 text-right">
                  <button onClick={guardarBoletoYTecho} disabled={guardandoBoleteria || guardandoBoletoInicio || !modoEdicionBoleteria} className={btnGuardar}>
                    {guardandoBoleteria || guardandoBoletoInicio ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* COSTOS GENÉRICOS */}
          <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-bold text-ink">Costos del evento</h2>
            <p className="mt-1 text-xs text-ink/50">
              Alimentación, Ofrenda, Renta de espacio, y cualquier otro concepto que necesites — agrega los que hagan falta.
            </p>

            <div className="mt-4 space-y-2">
              {costosGenericos.length === 0 && <p className="text-sm text-ink/40">Sin costos configurados todavía.</p>}
              {costosGenericos.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {editandoNombreIds[c.id] ? (
                      <input
                        type="text"
                        value={editandoNombres[c.id] ?? c.concepto}
                        onChange={(e) => setEditandoNombres((n) => ({ ...n, [c.id]: e.target.value }))}
                        className="w-48 rounded-lg border border-ink/15 px-2 py-1 text-sm font-medium text-ink"
                      />
                    ) : (
                      <span className="text-sm font-medium text-ink">{c.concepto}</span>
                    )}
                    {c.es_boleto && (
                      <span className="rounded-full bg-[#007334]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#007334]">
                        🎫 En módulo de cobro
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink/60">L.</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={editandoMontos[c.id] ?? c.monto}
                      onChange={(e) => setEditandoMontos((ed) => ({ ...ed, [c.id]: e.target.value }))}
                      className="w-28 rounded-lg border border-ink/15 px-2 py-1 text-sm"
                    />
                    {!editandoNombreIds[c.id] && (
                      <button onClick={() => activarEdicionNombre(c)} className="rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/5">
                        Editar
                      </button>
                    )}
                    {!c.es_boleto && (
                      <button onClick={() => marcarComoBoleto(c)} className="rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/5">
                        Usar en módulo de cobro
                      </button>
                    )}
                    <button onClick={() => guardarEdicionCosto(c)} className={btnGuardar}>Guardar</button>
                    <button onClick={() => eliminarCosto(c)} className={btnEliminar}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink/10 pt-4">
              <label className="flex-1 min-w-[220px]">
                <span className="mb-1 block text-xs font-semibold text-ink/60">Concepto nuevo</span>
                <input type="text" value={nuevoConcepto} onChange={(e) => setNuevoConcepto(e.target.value)} className={`${claseInput} w-full`} placeholder="Ej. Ofrenda" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Monto (L.)</span>
                <input type="number" min="0" step="0.01" value={nuevoMonto} onChange={(e) => setNuevoMonto(e.target.value)} className={`${claseInput} w-32`} />
              </label>
              <button onClick={agregarCosto} disabled={guardandoNuevo} className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-50">
                {guardandoNuevo ? 'Agregando…' : '+ Agregar concepto'}
              </button>
            </div>
          </div>

          {/* HOTEL POR MÓDULO */}
          <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-bold text-ink">Hotel (costo por módulo)</h2>
            <p className="mt-1 text-xs text-ink/50">
              El precio real que se cobra por cada módulo de habitaciones. El precio que ves en Módulos es solo de
              referencia — este es el que de verdad se usa en el módulo de cobro.
            </p>

            <div className="mt-4 space-y-2">
              {modulos.length === 0 && <p className="text-sm text-ink/40">No hay módulos creados todavía — créalos primero en Habitaciones.</p>}
              {modulos.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2">
                  <span className="text-sm font-medium text-ink">{m.nombre}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink/60">L.</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={editandoHotel[m.id] ?? costosModulo[m.id] ?? ''}
                      onChange={(e) => setEditandoHotel((ed) => ({ ...ed, [m.id]: e.target.value }))}
                      className="w-28 rounded-lg border border-ink/15 px-2 py-1 text-sm"
                      placeholder="Sin definir"
                    />
                    <button onClick={() => guardarCostoModulo(m)} disabled={guardandoHotelId === m.id} className={btnGuardar}>
                      {guardandoHotelId === m.id ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

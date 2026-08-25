import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { mensajeError } from '../../api';

const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none';
const btnGuardar = 'rounded-full bg-[#007334]/10 px-4 py-1.5 text-xs font-semibold text-[#007334] hover:bg-[#007334]/20 disabled:opacity-50';
const btnEliminar = 'rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember hover:bg-ember/20';

export default function AdminEntradasSalidas() {
  const { rol, permisosPorModulo } = useOutletContext();
  // Toda esta pantalla (Boletería, Entradas/Salidas de Efectivo, y Hotel
  // por módulo) vive bajo un solo candado: "entradas_salidas". Solo el
  // rol "admin" queda sujeto a esto — super_admin y los demás roles
  // fijos quedan exactamente como estaban.
  const puedeEditar = rol === 'admin' ? permisosPorModulo?.['entradas_salidas'] === 'edicion' : true;

  const [eventoActual, setEventoActual] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seccion, setSeccion] = useState('boleteria'); // boleteria | entradas | salidas | comida | habitaciones

  // --- Boletería ---
  const [resumenBoleteria, setResumenBoleteria] = useState(null);
  const [rangoFinImpreso, setRangoFinImpreso] = useState('');
  const [ubicacionBoleteria, setUbicacionBoleteria] = useState('');
  const [guardandoBoleteria, setGuardandoBoleteria] = useState(false);
  const [boletoSiguienteEvento, setBoletoSiguienteEvento] = useState(null);
  const [boletoInicioGuardado, setBoletoInicioGuardado] = useState(null);
  const [guardandoBoletoInicio, setGuardandoBoletoInicio] = useState(false);
  const [eventoAnteriorNombre, setEventoAnteriorNombre] = useState('');
  const [eventoAnteriorInicio, setEventoAnteriorInicio] = useState('');
  const [eventoAnteriorFin, setEventoAnteriorFin] = useState('');
  const [modoEdicionBoleteria, setModoEdicionBoleteria] = useState(false);

  // --- Hotel por módulo ---
  const [modulos, setModulos] = useState([]);
  const [costosModulo, setCostosModulo] = useState({});
  const [cuentasHotel, setCuentasHotel] = useState([]); // cuentas hijas de "Hotel" (4.2.x), para asociar por módulo
  const [editandoHotel, setEditandoHotel] = useState({});
  const [guardandoHotelId, setGuardandoHotelId] = useState(null);
  const [modoEdicionHotel, setModoEdicionHotel] = useState(false);

  // --- Precio por Comida (evento + Vigilia Saelistas) ---
  const [preciosComida, setPreciosComida] = useState([]);
  const [editandoPrecio, setEditandoPrecio] = useState({});
  const [modoEdicionComida, setModoEdicionComida] = useState(false);

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
      const [rHotelCostos, rModulos, rBoleteriaConfig, rBoleteriaResumen, rPreciosComida] = await Promise.all([
        api.get(`/admin/eventos/${eventoActual.id}/costos`),
        api.get('/admin/modulos'),
        api.get('/admin/boleteria/config'),
        api.get('/admin/boleteria/resumen', { params: { evento_actual_id: eventoActual.id } }),
        api.get(`/admin/eventos/${eventoActual.id}/precios-cuenta`),
      ]);

      const porModulo = {};
      rHotelCostos.data.filter((c) => c.modulo_id).forEach((c) => {
        porModulo[c.modulo_id] = { monto: c.monto, cuenta_efectivo_id: c.cuenta_efectivo_id, cuenta_bancos_id: c.cuenta_bancos_id };
      });
      setCostosModulo(porModulo);

      // Cuentas hijas de "Hotel" (4.2.x) — las que se pueden asociar a
      // cada módulo para Efectivo/Bancos. Se reutiliza el mismo endpoint
      // que ya usa "Entradas de Efectivo", filtrando por código.
      const rCuentasHotel = await api.get(`/admin/eventos/${eventoActual.id}/valores-cuenta`, { params: { tipo: 'ingreso' } });
      setCuentasHotel(rCuentasHotel.data.filter((c) => c.codigo?.startsWith('4.2.')));

      setPreciosComida(rPreciosComida.data);

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

  async function guardarBoletoYTecho() {
    await guardarBoletoInicio();
    await guardarBoleteria();
  }

  // --- Hotel por módulo ---
  function campoHotel(moduloId, campo) {
    if (editandoHotel[moduloId] && campo in editandoHotel[moduloId]) return editandoHotel[moduloId][campo];
    return costosModulo[moduloId]?.[campo] ?? '';
  }
  function cambiarCampoHotel(moduloId, campo, valor) {
    setEditandoHotel((e) => ({ ...e, [moduloId]: { ...e[moduloId], [campo]: valor } }));
  }

  async function guardarCostoModulo(modulo) {
    const monto = campoHotel(modulo.id, 'monto');
    if (monto === undefined || monto === '') return;
    setGuardandoHotelId(modulo.id);
    setError('');
    try {
      await api.put(`/admin/eventos/${eventoActual.id}/costos-modulo/${modulo.id}`, {
        monto: Number(monto),
        cuenta_efectivo_id: campoHotel(modulo.id, 'cuenta_efectivo_id') || null,
        cuenta_bancos_id: campoHotel(modulo.id, 'cuenta_bancos_id') || null,
      });
      setEditandoHotel((e) => { const copia = { ...e }; delete copia[modulo.id]; return copia; });
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoHotelId(null);
    }
  }

  const [guardandoGrupo, setGuardandoGrupo] = useState(null);

  // --- Precio por Comida ---
  async function guardarPreciosGrupo(grupo) {
    const cuentasDelGrupo = preciosComida.filter((c) => c.tipo_calculo === grupo);
    setGuardandoGrupo(grupo);
    setError('');
    try {
      await Promise.all(
        cuentasDelGrupo.map((c) => {
          const precio = editandoPrecio[c.cuenta_id] ?? c.precio;
          return api.put(`/admin/eventos/${eventoActual.id}/precios-cuenta/${c.cuenta_id}`, { precio: Number(precio) });
        })
      );
      setEditandoPrecio((e) => {
        const copia = { ...e };
        cuentasDelGrupo.forEach((c) => delete copia[c.cuenta_id]);
        return copia;
      });
      cargarTodo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoGrupo(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Entradas & Salidas</h1>
      <p className="mt-1 text-sm text-ink/50">
        Aquí se parametrizan todos los conceptos financieros del evento — luego alimentan Control de Ingresos,
        Control de Egresos, y el Resumen Financiero{eventoActual ? <> — mostrando <strong>{eventoActual.nombre}</strong></> : ''}.
      </p>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {eventoActual && (
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: 'boleteria', label: 'Boletería', color: '#FDC41F', textDark: true },
            { id: 'entradas', label: 'Entradas de Efectivo', color: '#007334' },
            { id: 'salidas', label: 'Salidas de Efectivo', color: '#E40521' },
            { id: 'comida', label: 'Precio por Comida', color: '#1F3464' },
            { id: 'habitaciones', label: 'Habitaciones', color: '#0F7173' },
          ].map((t) => {
            const activo = seccion === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSeccion(t.id)}
                style={activo ? { backgroundColor: t.color } : {}}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  activo ? (t.textDark ? 'text-night' : 'text-white') : 'border border-ink/15 text-ink/70 hover:bg-ink/5'
                }`}
              >
                {!activo && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: t.color }} />}
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {!eventoActual && !cargando && (
        <p className="mt-6 text-sm text-ink/40">No hay un evento SAEL marcado como actual/abierto en este momento.</p>
      )}

      {eventoActual && cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : eventoActual && (
        <div className="mt-4 space-y-6">
          {/* BOLETERÍA */}
          {seccion === 'boleteria' && (
          <div className="rounded-2xl border border-ink/10 border-l-4 border-l-[#FDC41F] bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Boletería</h2>
                <p className="mt-1 text-xs text-ink/50">
                  Lo disponible para el evento actual se calcula solo, y avanza en vivo conforme se usan boletos en el módulo de cobro.
                </p>
              </div>
              <button
                onClick={() => puedeEditar && setModoEdicionBoleteria((m) => !m)}
                disabled={!puedeEditar}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  !puedeEditar
                    ? 'cursor-not-allowed bg-ink/5 text-ink/30'
                    : modoEdicionBoleteria ? 'bg-[#007334] text-white hover:bg-[#005c29]' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
                }`}
              >
                {!puedeEditar ? '🔒 Solo consulta' : modoEdicionBoleteria ? '🔓 Edición activada' : '🔒 Activar edición'}
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-ink/10">
                <div className="border-b border-ink/10 bg-[#FDC41F]/12 px-4 py-2">
                  <label className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#92660A]">Evento anterior —</span>
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

              <div className="overflow-hidden rounded-xl border border-ink/10">
                <div className="border-b border-ink/10 bg-[#FDC41F]/12 px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#92660A]">
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
          )}

          {/* ENTRADAS DE EFECTIVO — cuentas de ingreso del Catálogo */}
          {seccion === 'entradas' && (
          <SeccionValoresCuenta
            titulo="Entradas de Efectivo"
            subtitulo="Alimentación, Ofrenda, Renta de espacio, y cualquier otro concepto que necesites — todo tomado del Catálogo de Cuentas (ingresos)."
            tipo="ingreso"
            eventoId={eventoActual.id}
            onError={setError}
            puedeEditar={puedeEditar}
            colorBorde="#007334"
          />
          )}

          {/* SALIDAS DE EFECTIVO — cuentas de egreso del Catálogo */}
          {seccion === 'salidas' && (
          <SeccionValoresCuenta
            titulo="Salidas de Efectivo"
            subtitulo="Alimentación que paga la organización, Vigilia Saelistas, Ofrendas entregadas, y demás egresos — tomado del Catálogo de Cuentas (egresos)."
            tipo="egreso"
            eventoId={eventoActual.id}
            onError={setError}
            puedeEditar={puedeEditar}
            colorBorde="#E40521"
          />
          )}

          {/* PRECIO POR COMIDA — cantidad calculada sola (participantes +
              Saelistas para el evento, o solo Saelistas para Vigilia),
              solo el precio unitario se escribe a mano. */}
          {seccion === 'comida' && (
          <div className="rounded-2xl border border-ink/10 border-l-4 border-l-[#1F3464] bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Precio por Comida</h2>
                <p className="mt-1 text-xs text-ink/50">
                  La cantidad se calcula sola (participantes Registrados + Saelistas con asistencia, o solo Saelistas
                  en Vigilia) — aquí solo se define el precio de cada comida.
                </p>
              </div>
              <button
                onClick={() => puedeEditar && setModoEdicionComida((m) => !m)}
                disabled={!puedeEditar}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  !puedeEditar
                    ? 'cursor-not-allowed bg-ink/5 text-ink/30'
                    : modoEdicionComida ? 'bg-[#007334] text-white hover:bg-[#005c29]' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
                }`}
              >
                {!puedeEditar ? '🔒 Solo consulta' : modoEdicionComida ? '🔓 Edición activada' : '🔒 Activar edición'}
              </button>
            </div>

            {['comida_evento', 'comida_vigilia'].map((grupo) => (
              <div key={grupo} className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                    {grupo === 'comida_evento' ? 'Comidas del evento (participantes + Saelistas)' : 'Comidas de Vigilia Saelistas'}
                  </p>
                  <button
                    onClick={() => guardarPreciosGrupo(grupo)}
                    disabled={guardandoGrupo === grupo || !modoEdicionComida}
                    className={`${btnGuardar} disabled:cursor-not-allowed`}
                  >
                    {guardandoGrupo === grupo ? 'Guardando…' : 'Guardar precios'}
                  </button>
                </div>
                <div className="space-y-2">
                  {preciosComida.filter((c) => c.tipo_calculo === grupo).map((c) => (
                    <div key={c.cuenta_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2">
                      <span className="text-sm font-medium text-ink">{c.nombre}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-ink/50">{c.cantidad} personas × </span>
                        <span className="text-sm text-ink/60">L.</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={editandoPrecio[c.cuenta_id] ?? c.precio ?? ''}
                          onChange={(e) => setEditandoPrecio((ed) => ({ ...ed, [c.cuenta_id]: e.target.value }))}
                          disabled={!modoEdicionComida}
                          className="w-24 rounded-lg border border-ink/15 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
                        />
                        <span className="w-24 text-right text-sm font-semibold text-ink">L. {c.monto.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}

          {/* INGRESO POR PERSONA DE HABITACIONES (antes "Hotel por módulo") */}
          {seccion === 'habitaciones' && (
          <div className="rounded-2xl border border-ink/10 border-l-4 border-l-[#0F7173] bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Aquí se controla el ingreso por persona de las habitaciones</h2>
                <p className="mt-1 text-xs text-ink/50">
                  El precio real que se cobra por cada módulo de habitaciones. El precio que ves en Módulos es solo de
                  referencia — este es el que de verdad se usa en el módulo de cobro.
                </p>
              </div>
              <button
                onClick={() => puedeEditar && setModoEdicionHotel((m) => !m)}
                disabled={!puedeEditar}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  !puedeEditar
                    ? 'cursor-not-allowed bg-ink/5 text-ink/30'
                    : modoEdicionHotel ? 'bg-[#007334] text-white hover:bg-[#005c29]' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
                }`}
              >
                {!puedeEditar ? '🔒 Solo consulta' : modoEdicionHotel ? '🔓 Edición activada' : '🔒 Activar edición'}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {modulos.length === 0 && <p className="text-sm text-ink/40">No hay módulos creados todavía — créalos primero en Habitaciones.</p>}
              {cuentasHotel.length === 0 && modulos.length > 0 && (
                <p className="text-xs text-ember">
                  No hay ninguna cuenta hija de "Hotel" (4.2.x) en el Catálogo todavía — agrégalas ahí primero para poder asociarlas aquí.
                </p>
              )}
              {modulos.map((m) => (
                <div key={m.id} className="rounded-lg bg-ink/5 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{m.nombre}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink/60">L.</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={campoHotel(m.id, 'monto')}
                        onChange={(e) => cambiarCampoHotel(m.id, 'monto', e.target.value)}
                        disabled={!modoEdicionHotel}
                        className="w-28 rounded-lg border border-ink/15 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
                        placeholder="Sin definir"
                      />
                      <button onClick={() => guardarCostoModulo(m)} disabled={guardandoHotelId === m.id || !modoEdicionHotel} className={btnGuardar}>
                        {guardandoHotelId === m.id ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-0.5 block text-[11px] text-ink/40">Cuenta para Efectivo</span>
                      <select
                        value={campoHotel(m.id, 'cuenta_efectivo_id')}
                        onChange={(e) => cambiarCampoHotel(m.id, 'cuenta_efectivo_id', e.target.value)}
                        disabled={!modoEdicionHotel}
                        className="w-full rounded-lg border border-ink/15 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
                      >
                        <option value="">Sin asociar</option>
                        {cuentasHotel.map((c) => (
                          <option key={c.cuenta_id} value={c.cuenta_id}>{c.codigo} — {c.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[11px] text-ink/40">Cuenta para Bancos (Transferencia)</span>
                      <select
                        value={campoHotel(m.id, 'cuenta_bancos_id')}
                        onChange={(e) => cambiarCampoHotel(m.id, 'cuenta_bancos_id', e.target.value)}
                        disabled={!modoEdicionHotel}
                        className="w-full rounded-lg border border-ink/15 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
                      >
                        <option value="">Sin asociar</option>
                        {cuentasHotel.map((c) => (
                          <option key={c.cuenta_id} value={c.cuenta_id}>{c.codigo} — {c.nombre}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sección reutilizable: lista PLANA de cuentas del Catálogo (de un solo
// tipo, ingreso o egreso), cada una con su valor configurado para este
// evento — reemplaza el viejo "Costos del evento" de texto libre.
function SeccionValoresCuenta({ titulo, subtitulo, tipo, eventoId, onError, puedeEditar, colorBorde }) {
  const [cuentasConValor, setCuentasConValor] = useState([]);
  const [cuentasSinValor, setCuentasSinValor] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editandoCampos, setEditandoCampos] = useState({});
  const [guardandoId, setGuardandoId] = useState(null);
  const [modoEdicion, setModoEdicion] = useState(false);

  const [cuentaSeleccionada, setCuentaSeleccionada] = useState('');
  const [cantidadNueva, setCantidadNueva] = useState('1');
  const [valorNuevo, setValorNuevo] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const [confirmacion, setConfirmacion] = useState(null);

  async function cargar() {
    setCargando(true);
    try {
      const { data } = await api.get(`/admin/eventos/${eventoId}/valores-cuenta`, { params: { tipo } });
      // Esta pantalla NUNCA crea ni borra cuentas del catálogo — solo
      // asigna o quita el VALOR de cuentas que ya existen (las creas tú,
      // a propósito, en Catálogo de Cuentas). Entran las manuales, MÁS
      // las dos cuentas de "Aportación por Boletos" (evento/bancos) —
      // esas sí necesitan un precio configurado aquí para ofrecerlo en
      // el módulo de cobro, aunque su TOTAL en Control de Ingresos se
      // siga calculando solo (sumando lo realmente pagado, sin importar
      // lo que se haya puesto aquí). Servidores y Aportaciones de
      // Espacios no entran — no necesitan un precio de referencia.
      const CLAVES_PERMITIDAS = ['boletos_evento', 'boletos_bancos', 'boletos_tarjeta'];
      const seleccionables = data.filter((c) => c.origen === 'manual' || CLAVES_PERMITIDAS.includes(c.clave_sistema));
      setCuentasConValor(seleccionables.filter((c) => c.monto !== null));
      setCuentasSinValor(seleccionables.filter((c) => c.monto === null));
    } catch (err) {
      onError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, [eventoId, tipo]);

  async function guardarValores(cuenta) {
    const cantidad = editandoCampos[cuenta.cuenta_id]?.cantidad ?? cuenta.cantidad ?? 1;
    const valor = editandoCampos[cuenta.cuenta_id]?.valor ?? cuenta.valor;
    if (cantidad === '' || cantidad === null || valor === '' || valor === null || valor === undefined) {
      onError('Escribe la cantidad y el valor.');
      return;
    }
    setGuardandoId(cuenta.cuenta_id);
    onError('');
    try {
      await api.put(`/admin/eventos/${eventoId}/valores-cuenta/${cuenta.cuenta_id}`, { cantidad: Number(cantidad), valor: Number(valor) });
      setEditandoCampos((e) => { const c = { ...e }; delete c[cuenta.cuenta_id]; return c; });
      cargar();
    } catch (err) {
      onError(mensajeError(err));
    } finally {
      setGuardandoId(null);
    }
  }

  function quitarValor(cuenta) {
    setConfirmacion({
      mensaje: `Se quitará el valor de "${cuenta.nombre}" para este evento. La cuenta sigue existiendo en el Catálogo de Cuentas — solo deja de tener un monto asignado aquí.`,
      textoConfirmar: 'Sí, quitar',
      onConfirmar: async () => {
        onError('');
        try {
          await api.delete(`/admin/eventos/${eventoId}/valores-cuenta/${cuenta.cuenta_id}`);
          cargar();
        } catch (err) {
          onError(mensajeError(err));
        }
      },
    });
  }

  async function agregarValor() {
    if (!cuentaSeleccionada || cantidadNueva === '' || valorNuevo === '') {
      onError('Selecciona una cuenta y escribe la cantidad y el valor.');
      return;
    }
    setGuardandoNuevo(true);
    onError('');
    try {
      await api.put(`/admin/eventos/${eventoId}/valores-cuenta/${cuentaSeleccionada}`, { cantidad: Number(cantidadNueva), valor: Number(valorNuevo) });
      setCuentaSeleccionada('');
      setCantidadNueva('1');
      setValorNuevo('');
      cargar();
    } catch (err) {
      onError(mensajeError(err));
    } finally {
      setGuardandoNuevo(false);
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10 border-l-4 bg-white p-6 shadow-sm" style={{ borderLeftColor: colorBorde }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">{titulo}</h2>
          <p className="mt-1 text-xs text-ink/50">{subtitulo}</p>
        </div>
        <button
          onClick={() => puedeEditar && setModoEdicion((m) => !m)}
          disabled={!puedeEditar}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
            !puedeEditar
              ? 'cursor-not-allowed bg-ink/5 text-ink/30'
              : modoEdicion ? 'bg-[#007334] text-white hover:bg-[#005c29]' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
          }`}
        >
          {!puedeEditar ? '🔒 Solo consulta' : modoEdicion ? '🔓 Edición activada' : '🔒 Activar edición'}
        </button>
      </div>

      {cargando ? <p className="mt-4 text-sm text-ink/40">Cargando…</p> : (
        <div className="mt-4 space-y-2">
          {cuentasConValor.length === 0 && <p className="text-sm text-ink/40">Sin valores asignados todavía — selecciona una cuenta abajo.</p>}
          {cuentasConValor.map((c) => {
            const cantidadActual = editandoCampos[c.cuenta_id]?.cantidad ?? c.cantidad ?? 1;
            const valorActual = editandoCampos[c.cuenta_id]?.valor ?? c.valor ?? 0;
            const montoCalculado = (Number(cantidadActual) || 0) * (Number(valorActual) || 0);
            return (
              <div key={c.cuenta_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2">
                <span className="text-sm font-medium text-ink">{c.nombre}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number" min="0" step="1"
                    value={cantidadActual}
                    onChange={(e) => setEditandoCampos((ed) => ({ ...ed, [c.cuenta_id]: { cantidad: e.target.value, valor: valorActual } }))}
                    disabled={!modoEdicion}
                    className="w-16 rounded-lg border border-ink/15 px-2 py-1 text-sm text-center disabled:bg-ink/5 disabled:text-ink/40"
                    title="Cantidad"
                  />
                  <span className="text-xs text-ink/40">×</span>
                  <span className="text-sm text-ink/60">L.</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={valorActual}
                    onChange={(e) => setEditandoCampos((ed) => ({ ...ed, [c.cuenta_id]: { cantidad: cantidadActual, valor: e.target.value } }))}
                    disabled={!modoEdicion}
                    className="w-28 rounded-lg border border-ink/15 px-2 py-1 text-sm disabled:bg-ink/5 disabled:text-ink/40"
                    title="Valor unitario"
                  />
                  <button onClick={() => guardarValores(c)} disabled={guardandoId === c.cuenta_id || !modoEdicion} className={`${btnGuardar} disabled:cursor-not-allowed`}>
                    {guardandoId === c.cuenta_id ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button onClick={() => quitarValor(c)} disabled={!modoEdicion} className={`${btnEliminar} disabled:cursor-not-allowed disabled:opacity-40`}>Quitar</button>
                  <span className="w-24 text-right text-sm font-semibold text-ink">L. {montoCalculado.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink/10 pt-4">
        <label className="flex-1 min-w-[220px]">
          <span className="mb-1 block text-xs font-semibold text-ink/60">Cuenta</span>
          <select
            value={cuentaSeleccionada} onChange={(e) => setCuentaSeleccionada(e.target.value)}
            disabled={!modoEdicion}
            className={`${claseInput} w-full disabled:bg-ink/5 disabled:text-ink/40`}
          >
            <option value="">Selecciona una cuenta del catálogo…</option>
            {cuentasSinValor.map((c) => (
              <option key={c.cuenta_id} value={c.cuenta_id}>{c.codigo} — {c.nombre}</option>
            ))}
          </select>
          {cuentasSinValor.length === 0 && (
            <p className="mt-1 text-xs text-ink/40">
              No hay cuentas manuales de {tipo === 'ingreso' ? 'ingreso' : 'egreso'} sin asignar — créalas primero en Catálogo de Cuentas.
            </p>
          )}
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-ink/60">Cantidad</span>
          <input
            type="number" min="0" step="1" value={cantidadNueva} onChange={(e) => setCantidadNueva(e.target.value)}
            disabled={!modoEdicion}
            className={`${claseInput} w-20 disabled:bg-ink/5 disabled:text-ink/40`}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-ink/60">Valor unitario (L.)</span>
          <input
            type="number" min="0" step="0.01" value={valorNuevo} onChange={(e) => setValorNuevo(e.target.value)}
            disabled={!modoEdicion}
            className={`${claseInput} w-32 disabled:bg-ink/5 disabled:text-ink/40`}
          />
        </label>
        <button
          onClick={agregarValor} disabled={guardandoNuevo || !cuentaSeleccionada || !modoEdicion}
          className="rounded-full bg-ember/10 px-5 py-2 text-sm font-semibold text-ember hover:bg-ember/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {guardandoNuevo ? 'Agregando…' : '+ Agregar'}
        </button>
      </div>

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
    </div>
  );
}

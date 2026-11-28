import { useEffect, useState } from 'react';
import api, { mensajeError } from '../../api';
import { nombreZona } from '../../listas';

export default function AdminDiplomas() {
  const [eventoActual, setEventoActual] = useState(null);
  const [datos, setDatos] = useState(null); // { evento_nombre, filas, total, total_primera_vez }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState('');
  const [mayusculas, setMayusculas] = useState(false); // opción para PDF/Imprimir/Excel; por defecto apagada
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const POR_PAGINA = porPagina;
  const totalPaginas = Math.max(1, Math.ceil((datos?.filas?.length || 0) / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);

  // --- Inventario de diplomas (standalone, captura manual) ---
  const [modoEdicionInventario, setModoEdicionInventario] = useState(false);
  const [inventarioUsado, setInventarioUsado] = useState('');
  const [inventarioExistentes, setInventarioExistentes] = useState('');
  const [guardandoInventario, setGuardandoInventario] = useState(false);

  useEffect(() => {
    api.get('/admin/diplomas/inventario')
      .then(({ data }) => {
        setInventarioUsado(data.inventario_usado ?? '');
        setInventarioExistentes(data.inventario_existentes ?? '');
      })
      .catch(() => {});
  }, []);

  async function guardarInventario() {
    setGuardandoInventario(true);
    setError('');
    try {
      await api.put('/admin/diplomas/inventario', {
        inventario_usado: inventarioUsado === '' ? null : Number(inventarioUsado),
        inventario_existentes: inventarioExistentes === '' ? null : Number(inventarioExistentes),
      });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardandoInventario(false);
    }
  }

  useEffect(() => {
    api.get('/eventos')
      .then(({ data }) => {
        const actual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
        setEventoActual(actual || null);
      })
      .catch(() => setError('No se pudo cargar la información del evento.'));
  }, []);

  useEffect(() => {
    if (!eventoActual) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError('');
    setPagina(1);
    api.get(`/admin/eventos/${eventoActual.id}/diplomas`)
      .then(({ data }) => setDatos(data))
      .catch((err) => setError(mensajeError(err)))
      .finally(() => setCargando(false));
  }, [eventoActual]);

  async function descargar(tipo) {
    if (!eventoActual) return;
    setDescargando(tipo);
    setError('');
    try {
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/diplomas/${tipo}`, {
        responseType: 'blob',
        params: mayusculas ? { mayusculas: 1 } : undefined,
      });
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `diplomas_${eventoActual.nombre.replace(/\s+/g, '_')}.${tipo === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('No se pudo descargar el archivo.');
    } finally {
      setDescargando('');
    }
  }

  // "Imprimir" abre el PDF real (mismo logo, colores y columnas centradas)
  // en una pestaña nueva, para imprimir desde el visor de PDF del
  // navegador — así se ve idéntico al PDF descargado, en vez de imprimir
  // la página web con otro diseño.
  async function imprimir() {
    if (!eventoActual) return;
    // Se abre la pestaña ANTES de la llamada async, porque si se abre
    // después de un await, la mayoría de navegadores lo bloquea como pop-up.
    const ventana = window.open('', '_blank');
    setDescargando('imprimir');
    setError('');
    try {
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/diplomas/pdf`, {
        responseType: 'blob',
        params: mayusculas ? { mayusculas: 1 } : undefined,
      });
      const url = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      if (ventana) {
        ventana.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err) {
      setError('No se pudo generar la vista de impresión.');
      if (ventana) ventana.close();
    } finally {
      setDescargando('');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Diplomas</h1>
          <p className="mt-1 text-sm text-ink/50">
            Participantes con asistencia confirmada en el evento actual, listos para exportar y preparar diplomas.
          </p>
        </div>
        {eventoActual && (
          <div className="flex shrink-0 items-center gap-2 print:hidden">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink/70">
              <input
                type="checkbox"
                checked={mayusculas}
                onChange={(e) => setMayusculas(e.target.checked)}
                className="h-4 w-4 accent-[#007334]"
              />
              Todo en mayúsculas
            </label>
            <button
              onClick={() => descargar('excel')}
              disabled={!!descargando || !datos || datos.total === 0}
              className="rounded-full bg-[#007334]/10 px-4 py-1.5 text-xs font-semibold text-[#007334] hover:bg-[#007334]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {descargando === 'excel' ? 'Descargando…' : '↓ Excel'}
            </button>
            <button
              onClick={() => descargar('pdf')}
              disabled={!!descargando || !datos || datos.total === 0}
              className="rounded-full bg-ember/10 px-4 py-1.5 text-xs font-semibold text-ember hover:bg-ember/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {descargando === 'pdf' ? 'Descargando…' : '↓ PDF'}
            </button>
            <button
              onClick={imprimir}
              disabled={!!descargando || !datos || datos.total === 0}
              className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {descargando === 'imprimir' ? 'Preparando…' : 'Imprimir'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {/* INVENTARIO DE DIPLOMAS — standalone, no depende del evento actual */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-ink/10 bg-white px-4 py-2.5 shadow-sm print:hidden">
        <h2 className="font-display text-base font-bold text-[#007334]">Inventario de Diplomas</h2>
        <label className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase leading-tight tracking-wide text-ink/40">Inicial<span className="block text-[10px] font-normal normal-case tracking-normal">ya usados</span></span>
          <input
            type="number" min="0" value={inventarioUsado} onChange={(e) => setInventarioUsado(e.target.value)}
            disabled={!modoEdicionInventario}
            className="w-20 rounded-lg border border-ink/15 px-2 py-1 text-center text-sm font-semibold text-ink disabled:border-transparent disabled:bg-transparent"
            placeholder="330"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase leading-tight tracking-wide text-ink/40">Final<span className="block text-[10px] font-normal normal-case tracking-normal">total existentes</span></span>
          <input
            type="number" min="0" value={inventarioExistentes} onChange={(e) => setInventarioExistentes(e.target.value)}
            disabled={!modoEdicionInventario}
            className="w-20 rounded-lg border border-ink/15 px-2 py-1 text-center text-sm font-semibold text-ink disabled:border-transparent disabled:bg-transparent"
            placeholder="1000"
          />
        </label>
        <div className="flex items-center gap-2 rounded-xl bg-ink/5 px-3 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">Disponibles</span>
          <span className="font-display text-lg font-bold text-[#007334]">
            {inventarioUsado !== '' && inventarioExistentes !== ''
              ? Number(inventarioExistentes) - Number(inventarioUsado)
              : '—'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setModoEdicionInventario((m) => !m)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              modoEdicionInventario ? 'bg-[#007334] text-white hover:bg-[#005c29]' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
            }`}
          >
            {modoEdicionInventario ? '🔓 Edición activada' : '🔒 Activar edición'}
          </button>
          <button onClick={guardarInventario} disabled={guardandoInventario || !modoEdicionInventario} className="rounded-full bg-[#007334] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#005c29] disabled:opacity-50">
            {guardandoInventario ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {!eventoActual && !cargando && (
        <p className="mt-6 text-sm text-ink/40">No hay un evento SAEL marcado como actual/abierto en este momento.</p>
      )}

      {eventoActual && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-[#007334]/10 px-4 py-3 shadow-sm print:hidden">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#007334]">Evento actual</p>
              <p className="font-display text-lg font-bold text-[#007334]">{eventoActual.nombre}</p>
            </div>
            {datos && (
              <p className="text-sm text-[#007334]">
                <span className="font-display text-2xl font-bold">{datos.total}</span>
                <span className="font-semibold"> confirmados · </span>
                <span className="font-display text-2xl font-bold">{datos.total_primera_vez}</span>
                <span className="font-semibold"> primera vez</span>
              </p>
            )}
          </div>

          {cargando ? (
            <p className="mt-6 text-ink/40">Cargando…</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-sm max-md:overflow-visible max-md:border-0 max-md:bg-transparent max-md:shadow-none">
              {/* Celular: tarjetas en lugar de tabla (la tabla se ve desde md:) */}
              <div className="space-y-2 md:hidden print:hidden">
                {(!datos || datos.filas.length === 0) && (
                  <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-ink/40 shadow-sm">Todavía no hay participantes con asistencia confirmada en este evento.</p>
                )}
                {datos?.filas.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA).map((f) => {
                  const monto = Number(f.alimentacion_monto) > 0 ? `L. ${f.alimentacion_monto}` : '';
                  const metodo = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' }[f.metodo_pago];
                  return (
                    <div key={f.numero} className="rounded-2xl bg-white p-3.5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-ink"><span className="mr-1.5 text-ink/40">{f.numero}.</span>{f.nombre_completo}</p>
                        <div className="flex shrink-0 gap-1">
                          {f.primera_vez && <span className="rounded-full bg-gold/30 px-2 py-0.5 text-[10px] font-bold text-night">1er SAEL</span>}
                          {f.cortesia && <span className="rounded-full bg-night/10 px-2 py-0.5 text-[10px] font-bold text-night">Cortesía</span>}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-ink/60">{[nombreZona(f.zona), f.capitulo, f.procedencia].filter(Boolean).join(' · ') || '—'}</p>
                      {monto && metodo && (
                        <p className="mt-1.5 text-xs font-semibold text-[#007334]">{metodo} · {monto}</p>
                      )}
                    </div>
                  );
                })}
                {datos && datos.total > 0 && (
                  <div className="rounded-2xl bg-[#007334]/10 p-3.5 text-xs font-semibold text-ink">
                    <p>Total: {datos.total} · 1ra vez: {datos.total_primera_vez} · Cortesías: {datos.total_cortesia ?? 0}</p>
                    <p className="mt-1">Efectivo L. {datos.totalesPago?.efectivo?.toFixed(2) ?? '0.00'} · Transf. L. {datos.totalesPago?.transferencia?.toFixed(2) ?? '0.00'} · Tarjeta L. {datos.totalesPago?.tarjeta?.toFixed(2) ?? '0.00'}</p>
                  </div>
                )}
              </div>
              <table className="hidden w-full text-sm md:table print:table">
                <thead>
                  <tr className="border-b border-ink/10 bg-[#007334]/10 text-left text-xs uppercase tracking-wide text-[#007334]">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Zona</th>
                    <th className="px-4 py-3">Capítulo</th>
                    <th className="px-4 py-3">Procedencia</th>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">1er SAEL</th>
                    <th className="px-4 py-3">Efectivo</th>
                    <th className="px-4 py-3" title="Transferencia bancaria">Transf.</th>
                    <th className="px-4 py-3" title="Tarjeta de crédito / débito">Tarjeta C/D</th>
                    <th className="px-4 py-3" title="Inscripción sin costo">Cortesía</th>
                  </tr>
                </thead>
                <tbody>
                  {(!datos || datos.filas.length === 0) && (
                    <tr><td colSpan={10} className="px-4 py-6 text-center text-ink/40">Todavía no hay participantes con asistencia confirmada en este evento.</td></tr>
                  )}
                  {datos?.filas.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA).map((f) => (
                    <tr key={f.numero} className="border-b border-ink/5 text-left last:border-0">
                      <td className="px-4 py-3 text-ink/60">{f.numero}</td>
                      <td className="px-4 py-3 font-medium text-ink">{f.zona}</td>
                      <td className="px-4 py-3 text-ink/60">{f.capitulo || '—'}</td>
                      <td className="px-4 py-3 text-ink/60">{f.procedencia || '—'}</td>
                      <td className="px-4 py-3 text-ink/60">{f.nombre_completo}</td>
                      <td className="px-4 py-3 text-ink/60">{f.primera_vez ? '1' : ''}</td>
                      <td className="px-4 py-3 text-ink/60">{f.metodo_pago === 'efectivo' && Number(f.alimentacion_monto) > 0 ? `L. ${f.alimentacion_monto}` : ''}</td>
                      <td className="px-4 py-3 text-ink/60">{f.metodo_pago === 'transferencia' && Number(f.alimentacion_monto) > 0 ? `L. ${f.alimentacion_monto}` : ''}</td>
                      <td className="px-4 py-3 text-ink/60">{f.metodo_pago === 'tarjeta' && Number(f.alimentacion_monto) > 0 ? `L. ${f.alimentacion_monto}` : ''}</td>
                      <td className="px-4 py-3 text-ink/60">{f.cortesia ? '1' : ''}</td>
                    </tr>
                  ))}
                </tbody>
                {datos && datos.total > 0 && (
                  <tfoot>
                    <tr className="border-t border-ink/10 text-left font-semibold text-ink">
                      <td className="px-4 py-3" colSpan={4}></td>
                      <td className="px-4 py-3">Total: {datos.total}</td>
                      <td className="px-4 py-3">1ra vez: {datos.total_primera_vez}</td>
                      <td className="px-4 py-3">L. {datos.totalesPago?.efectivo?.toFixed(2) ?? '0.00'}</td>
                      <td className="px-4 py-3">L. {datos.totalesPago?.transferencia?.toFixed(2) ?? '0.00'}</td>
                      <td className="px-4 py-3">L. {datos.totalesPago?.tarjeta?.toFixed(2) ?? '0.00'}</td>
                      <td className="px-4 py-3">{datos.total_cortesia ?? 0}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {datos && datos.filas.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-4 py-3 text-sm text-ink/70 print:hidden">
                  <p>
                    Mostrando {(paginaSegura - 1) * porPagina + 1}–{Math.min(paginaSegura * porPagina, datos.filas.length)} de {datos.filas.length}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      Por página
                      <select
                        value={porPagina}
                        onChange={(e) => { setPorPagina(Number(e.target.value)); setPagina(1); }}
                        className="rounded-lg border border-ink/20 bg-white px-2 py-1 text-sm"
                      >
                        {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <button
                      onClick={() => setPagina(Math.max(1, paginaSegura - 1))}
                      disabled={paginaSegura <= 1}
                      className="rounded-full border border-ink/20 px-3 py-1 font-semibold hover:bg-ink/5 disabled:opacity-40"
                    >
                      ← Anterior
                    </button>
                    <span className="text-xs">Página {paginaSegura} de {totalPaginas}</span>
                    <button
                      onClick={() => setPagina(Math.min(totalPaginas, paginaSegura + 1))}
                      disabled={paginaSegura >= totalPaginas}
                      className="rounded-full border border-ink/20 px-3 py-1 font-semibold hover:bg-ink/5 disabled:opacity-40"
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import api, { mensajeError } from '../../api';

export default function AdminDiplomas() {
  const [eventoActual, setEventoActual] = useState(null);
  const [datos, setDatos] = useState(null); // { evento_nombre, filas, total, total_primera_vez }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState('');

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
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/diplomas/${tipo}`, { responseType: 'blob' });
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
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/diplomas/pdf`, { responseType: 'blob' });
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
      <h1 className="font-display text-2xl font-bold text-ink">Diplomas</h1>
      <p className="mt-1 text-sm text-ink/50">
        Participantes con asistencia confirmada en el evento actual, listos para exportar y preparar diplomas.
      </p>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {/* INVENTARIO DE DIPLOMAS — standalone, no depende del evento actual */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 bg-ink/5 px-4 py-3">
          <h2 className="font-display text-base font-bold text-ink">Inventario de Diplomas</h2>
          <button
            onClick={() => setModoEdicionInventario((m) => !m)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              modoEdicionInventario ? 'bg-[#007334] text-white hover:bg-[#005c29]' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'
            }`}
          >
            {modoEdicionInventario ? '🔓 Edición activada' : '🔒 Activar edición'}
          </button>
        </div>
        <div className="grid grid-cols-3 divide-x divide-ink/10 text-center">
          <div className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Inventario Inicial</p>
            <p className="text-[10px] text-ink/40">Diplomas ya usados</p>
            <input
              type="number" min="0" value={inventarioUsado} onChange={(e) => setInventarioUsado(e.target.value)}
              disabled={!modoEdicionInventario}
              className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1 text-center text-sm font-semibold text-ink disabled:border-transparent disabled:bg-transparent"
              placeholder="330"
            />
          </div>
          <div className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Inventario Final</p>
            <p className="text-[10px] text-ink/40">Total existentes</p>
            <input
              type="number" min="0" value={inventarioExistentes} onChange={(e) => setInventarioExistentes(e.target.value)}
              disabled={!modoEdicionInventario}
              className="mt-1 w-full rounded-lg border border-ink/15 px-2 py-1 text-center text-sm font-semibold text-ink disabled:border-transparent disabled:bg-transparent"
              placeholder="1000"
            />
          </div>
          <div className="bg-ink/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Disponibles</p>
            <p className="mt-1 font-display text-lg font-bold text-[#007334]">
              {inventarioUsado !== '' && inventarioExistentes !== ''
                ? Number(inventarioExistentes) - Number(inventarioUsado)
                : '—'}
            </p>
          </div>
        </div>
        <div className="border-t border-ink/10 p-3 text-right">
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-night px-4 py-3 text-white shadow-sm print:hidden">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/60">Evento actual</p>
              <p className="font-display text-lg font-bold">{eventoActual.nombre}</p>
            </div>
            {datos && (
              <p className="text-sm">
                <span className="font-display text-2xl font-bold">{datos.total}</span>
                <span className="text-white/60"> confirmados · </span>
                <span className="font-display text-2xl font-bold">{datos.total_primera_vez}</span>
                <span className="text-white/60"> primera vez</span>
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <button
              onClick={() => descargar('excel')}
              disabled={!!descargando || !datos || datos.total === 0}
              className="rounded-full bg-[#007334] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005c29] disabled:opacity-50"
            >
              {descargando === 'excel' ? 'Descargando…' : '↓ Descargar Excel'}
            </button>
            <button
              onClick={() => descargar('pdf')}
              disabled={!!descargando || !datos || datos.total === 0}
              className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-50"
            >
              {descargando === 'pdf' ? 'Descargando…' : '↓ Descargar PDF'}
            </button>
            <button
              onClick={imprimir}
              disabled={!!descargando || !datos || datos.total === 0}
              className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5 disabled:opacity-50"
            >
              {descargando === 'imprimir' ? 'Preparando…' : 'Imprimir'}
            </button>
          </div>

          {cargando ? (
            <p className="mt-6 text-ink/40">Cargando…</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Zona</th>
                    <th className="px-4 py-3">Capítulo</th>
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">1er SAEL</th>
                    <th className="px-4 py-3">Efectivo</th>
                    <th className="px-4 py-3">Transferencia Bancaria</th>
                    <th className="px-4 py-3">Tarjeta crédito/débito</th>
                  </tr>
                </thead>
                <tbody>
                  {(!datos || datos.filas.length === 0) && (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-ink/40">Todavía no hay participantes con asistencia confirmada en este evento.</td></tr>
                  )}
                  {datos?.filas.map((f) => (
                    <tr key={f.numero} className="border-b border-ink/5 text-left last:border-0">
                      <td className="px-4 py-3 text-ink/60">{f.numero}</td>
                      <td className="px-4 py-3 font-medium text-ink">{f.zona}</td>
                      <td className="px-4 py-3 text-ink/60">{f.capitulo || '—'}</td>
                      <td className="px-4 py-3 text-ink/60">{f.nombre_completo}</td>
                      <td className="px-4 py-3 text-ink/60">{f.primera_vez ? '1' : ''}</td>
                      <td className="px-4 py-3 text-ink/60">{f.metodo_pago === 'efectivo' && f.alimentacion_monto ? `L. ${f.alimentacion_monto}` : ''}</td>
                      <td className="px-4 py-3 text-ink/60">{f.metodo_pago === 'transferencia' && f.alimentacion_monto ? `L. ${f.alimentacion_monto}` : ''}</td>
                      <td className="px-4 py-3 text-ink/60">{f.metodo_pago === 'tarjeta' && f.alimentacion_monto ? `L. ${f.alimentacion_monto}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
                {datos && datos.total > 0 && (
                  <tfoot>
                    <tr className="border-t border-ink/10 text-left font-semibold text-ink">
                      <td className="px-4 py-3" colSpan={3}></td>
                      <td className="px-4 py-3">Total: {datos.total}</td>
                      <td className="px-4 py-3">1ra vez: {datos.total_primera_vez}</td>
                      <td className="px-4 py-3">L. {datos.totalesPago?.efectivo?.toFixed(2) ?? '0.00'}</td>
                      <td className="px-4 py-3">L. {datos.totalesPago?.transferencia?.toFixed(2) ?? '0.00'}</td>
                      <td className="px-4 py-3">L. {datos.totalesPago?.tarjeta?.toFixed(2) ?? '0.00'}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

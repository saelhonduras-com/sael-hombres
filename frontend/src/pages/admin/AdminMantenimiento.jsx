import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import api, { mensajeError } from '../../api';

function formatoFecha(iso) {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminMantenimiento() {
  const { rol, refrescarResumen } = useOutletContext();

  const [papelera, setPapelera] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [restaurandoId, setRestaurandoId] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null); // { item, onConfirmar } | null
  const [aviso, setAviso] = useState('');

  // --- Bitácora de cambios de identificación ---
  const [tab, setTab] = useState('sistema'); // 'sistema' | 'bitacora'
  const [bitacora, setBitacora] = useState([]);
  const [cargandoBit, setCargandoBit] = useState(false);
  const [filtroBit, setFiltroBit] = useState({ desde: '', hasta: '', usuario: '', q: '' });

  useEffect(() => {
    if (tab !== 'bitacora' || rol !== 'super_admin') return undefined;
    setCargandoBit(true);
    const t = setTimeout(() => {
      const params = Object.fromEntries(Object.entries(filtroBit).filter(([, v]) => v));
      api.get('/admin/bitacora-identificacion', { params })
        .then(({ data }) => setBitacora(data))
        .catch((err) => setError(mensajeError(err)))
        .finally(() => setCargandoBit(false));
    }, 300);
    return () => clearTimeout(t);
  }, [tab, filtroBit, rol]);

  // --- Respaldo completo del sistema ---
  const [generandoRespaldo, setGenerandoRespaldo] = useState(false);
  const [archivoRespaldo, setArchivoRespaldo] = useState(null); // { nombre, contenido, resumen } | null
  const [palabraConfirmacion, setPalabraConfirmacion] = useState('');
  const [restaurandoRespaldo, setRestaurandoRespaldo] = useState(false);
  const [confirmandoRespaldo, setConfirmandoRespaldo] = useState(false);
  const [segundosRestaurando, setSegundosRestaurando] = useState(0);

  function mostrarAviso(mensaje) {
    setAviso(mensaje);
    setTimeout(() => setAviso(''), 2000);
  }

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const { data } = await api.get('/admin/papelera');
      setPapelera(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (!restaurandoRespaldo) return;
    setSegundosRestaurando(0);
    const intervalo = setInterval(() => setSegundosRestaurando((s) => s + 1), 1000);
    return () => clearInterval(intervalo);
  }, [restaurandoRespaldo]);

  async function restaurar(item) {
    setRestaurandoId(item.id);
    setError('');
    try {
      await api.post(`/admin/papelera/${item.id}/restaurar`);
      setPapelera((prev) => prev.filter((p) => p.id !== item.id));
      mostrarAviso(`✓ "${item.descripcion}" restaurado`);
      refrescarResumen();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setRestaurandoId(null);
    }
  }

  function pedirEliminarDefinitivo(item) {
    setConfirmacion({
      item,
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/papelera/${item.id}`);
          setPapelera((prev) => prev.filter((p) => p.id !== item.id));
          mostrarAviso('✓ Eliminado definitivamente');
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  // --- Respaldo completo del sistema ---

  async function generarRespaldo() {
    setGenerandoRespaldo(true);
    setError('');
    try {
      const { data } = await api.get('/admin/respaldo', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `respaldo-sael-hombres-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      mostrarAviso('✓ Respaldo descargado');
    } catch (err) {
      setError('No se pudo generar el respaldo.');
    } finally {
      setGenerandoRespaldo(false);
    }
  }

  function seleccionarArchivoRespaldo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setPalabraConfirmacion('');
    const lector = new FileReader();
    lector.onload = (ev) => {
      try {
        const contenido = JSON.parse(ev.target.result);
        if (!contenido.tablas || typeof contenido.tablas !== 'object') {
          setError('Ese archivo no parece ser un respaldo válido de este sistema.');
          setArchivoRespaldo(null);
          return;
        }
        const resumen = Object.entries(contenido.tablas)
          .map(([tabla, filas]) => ({ tabla, cantidad: Array.isArray(filas) ? filas.length : 0 }))
          .sort((a, b) => b.cantidad - a.cantidad);
        setArchivoRespaldo({ nombre: file.name, contenido, resumen, generadoEn: contenido.generado_en });
      } catch (err) {
        setError('Ese archivo no se pudo leer — asegúrate de que sea el archivo .json del respaldo, sin modificar.');
        setArchivoRespaldo(null);
      }
    };
    lector.readAsText(file);
  }

  async function confirmarRestauracion() {
    setRestaurandoRespaldo(true);
    setError('');
    try {
      await api.post('/admin/respaldo/restaurar', { respaldo: archivoRespaldo.contenido });
      mostrarAviso('✓ Sistema restaurado desde el respaldo');
      setArchivoRespaldo(null);
      setPalabraConfirmacion('');
      setConfirmandoRespaldo(false);
      cargar();
      refrescarResumen();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setRestaurandoRespaldo(false);
    }
  }

  // Candado extra del lado del frontend, por si alguien entra por URL
  // directa sin ser Super Admin — el backend ya lo bloquea de todas
  // formas, esto es solo para no mostrarle la pantalla a nadie más.
  if (rol !== 'super_admin') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-sm">
        <p className="text-4xl">🔒</p>
        <h1 className="mt-3 font-display text-lg font-bold text-ink">Solo Super Admin</h1>
        <p className="mt-2 text-sm text-ink/60">Este módulo es exclusivo del rol Super Admin.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Mantenimiento</h1>
      <p className="mt-1 text-sm text-ink/50">Solo visible para Super Admin.</p>

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      <div className="mt-4 inline-flex gap-0.5 rounded-xl border border-night/15 bg-white p-1">
        {[['sistema', 'Papelera y respaldos'], ['bitacora', 'Bitácora']].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === k ? 'bg-night text-white' : 'text-ink/60 hover:bg-ink/5'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'bitacora' && (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-white shadow-sm">
          <div className="border-b border-ink/10 px-5 py-4">
            <h2 className="font-display text-lg font-bold text-ink">🧾 Bitácora de identificación</h2>
            <p className="mt-1 text-sm text-ink/50">Cada cambio de DNI, pasaporte o código hecho desde Participantes › Editar: quién, cuándo y qué cambió.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <label className="text-xs font-semibold text-ink/60">Desde
                <input type="date" value={filtroBit.desde} onChange={(e) => setFiltroBit((f) => ({ ...f, desde: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-normal" />
              </label>
              <label className="text-xs font-semibold text-ink/60">Hasta
                <input type="date" value={filtroBit.hasta} onChange={(e) => setFiltroBit((f) => ({ ...f, hasta: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-normal" />
              </label>
              <label className="text-xs font-semibold text-ink/60">Usuario
                <input type="text" placeholder="Quién lo cambió" value={filtroBit.usuario} onChange={(e) => setFiltroBit((f) => ({ ...f, usuario: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-normal" />
              </label>
              <label className="text-xs font-semibold text-ink/60">Participante o DNI
                <input type="text" placeholder="Nombre o número" value={filtroBit.q} onChange={(e) => setFiltroBit((f) => ({ ...f, q: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-normal" />
              </label>
            </div>
          </div>
          {cargandoBit ? (
            <p className="p-5 text-sm text-ink/40">Cargando…</p>
          ) : bitacora.length === 0 ? (
            <p className="p-5 text-sm text-ink/40">No hay cambios de identificación registrados con esos filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-ink/5 text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="px-5 py-3">Fecha</th>
                    <th className="px-5 py-3">Usuario</th>
                    <th className="px-5 py-3">Participante</th>
                    <th className="px-5 py-3">Antes</th>
                    <th className="px-5 py-3">Después</th>
                  </tr>
                </thead>
                <tbody>
                  {bitacora.map((b) => (
                    <tr key={b.id} className="border-b border-ink/5 last:border-0">
                      <td className="whitespace-nowrap px-5 py-3 text-ink/60">{formatoFecha(b.creado_en)}</td>
                      <td className="px-5 py-3">{b.usuario_nombre}</td>
                      <td className="px-5 py-3 font-medium text-ink">{b.participante_nombre}</td>
                      <td className="px-5 py-3 font-mono text-ink/50 line-through">{b.identificacion_anterior}</td>
                      <td className="px-5 py-3 font-mono font-semibold text-ink">{b.identificacion_nueva}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'sistema' && (<>
      <div className="mt-4 rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="border-b border-ink/10 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">🗑️ Papelera</h2>
          <p className="mt-1 text-sm text-ink/50">
            Todo lo que se elimine en el sistema queda guardado aquí — puedes restaurarlo si fue un error, o
            borrarlo para siempre.
          </p>
        </div>

        {cargando ? (
          <p className="p-5 text-sm text-ink/40">Cargando…</p>
        ) : papelera.length === 0 ? (
          <p className="p-5 text-sm text-ink/40">La Papelera está vacía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/5 text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Descripción</th>
                <th className="px-5 py-3">Eliminado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {papelera.map((item) => (
                <tr key={item.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-night/10 px-2.5 py-1 text-xs font-semibold text-night">{item.tipo}</span>
                  </td>
                  <td className="px-5 py-3 font-medium text-ink">{item.descripcion}</td>
                  <td className="px-5 py-3 text-ink/50">
                    {formatoFecha(item.eliminado_en)}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => restaurar(item)}
                      disabled={restaurandoId === item.id}
                      className="rounded-full bg-[#007334]/10 px-3 py-1 text-xs font-semibold text-[#007334] hover:bg-[#007334]/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {restaurandoId === item.id ? 'Restaurando…' : 'Restaurar'}
                    </button>
                    <button
                      onClick={() => pedirEliminarDefinitivo(item)}
                      className="ml-2 rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember hover:bg-ember/20"
                    >
                      Eliminar definitivamente
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-ink">📦 Respaldos completos</h2>
        <p className="mt-1 text-sm text-ink/50">Descarga o restaura toda la base de datos — solo Super Admin.</p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={generarRespaldo}
            disabled={generandoRespaldo}
            className="rounded-full bg-[#007334] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#005c29] disabled:opacity-50"
          >
            {generandoRespaldo ? 'Generando…' : '⬇ Descargar respaldo completo'}
          </button>

          <label className="inline-block cursor-pointer rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold text-ink/70 hover:bg-ink/5">
            📁 Elegir archivo de respaldo…
            <input type="file" accept="application/json,.json" className="hidden" onChange={seleccionarArchivoRespaldo} />
          </label>
        </div>

        {archivoRespaldo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xl">📁</span>
                <h3 className="font-display text-lg font-bold text-ink">Archivo de respaldo cargado</h3>
              </div>

              <p className="mt-4 text-sm font-semibold text-ink">{archivoRespaldo.nombre}</p>
              {archivoRespaldo.generadoEn && (
                <p className="mt-0.5 text-xs text-ink/50">Generado el {formatoFecha(archivoRespaldo.generadoEn)}</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink/60 sm:grid-cols-3">
                {archivoRespaldo.resumen.slice(0, 9).map((r) => (
                  <p key={r.tabla}>{r.tabla}: <span className="font-semibold text-ink">{r.cantidad}</span></p>
                ))}
              </div>

              <div className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">
                ⚠️ Restaurar <strong>borra TODO lo que hay ahora mismo</strong> en el sistema y lo reemplaza con este
                archivo. No se puede deshacer. Genera un respaldo del estado actual primero si no estás seguro.
              </div>

              {!confirmandoRespaldo ? (
                <div className="mt-5 flex justify-end gap-3">
                  <button onClick={() => setArchivoRespaldo(null)} className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/5">
                    Cancelar
                  </button>
                  <button onClick={() => setConfirmandoRespaldo(true)} className="rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-white hover:bg-ember-light">
                    Continuar con la restauración
                  </button>
                </div>
              ) : (
                <div className="mt-5">
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-ink/60">
                      Escribe <span className="font-mono font-bold text-ember">RESTAURAR</span> para confirmar:
                    </span>
                    <input
                      type="text"
                      value={palabraConfirmacion}
                      onChange={(e) => setPalabraConfirmacion(e.target.value)}
                      disabled={restaurandoRespaldo}
                      className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none disabled:bg-ink/5"
                      placeholder="RESTAURAR"
                    />
                  </label>
                  {restaurandoRespaldo && (
                    <p className="mt-2 text-center text-xs text-ink/50">
                      ⏱️ Restaurando desde hace {segundosRestaurando}s — puede tardar varios minutos, no cierres esta ventana.
                    </p>
                  )}
                  <div className="mt-3 flex justify-end gap-3">
                    <button
                      onClick={() => { setConfirmandoRespaldo(false); setPalabraConfirmacion(''); }}
                      disabled={restaurandoRespaldo}
                      className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/60 hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmarRestauracion}
                      disabled={palabraConfirmacion !== 'RESTAURAR' || restaurandoRespaldo}
                      className="rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-white hover:bg-ember-light disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {restaurandoRespaldo ? `Restaurando… (${segundosRestaurando}s)` : 'Restaurar sistema completo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      </>)}

      {confirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember/10 text-xl">⚠️</span>
              <h3 className="font-display text-lg font-bold text-ink">¿Eliminar para siempre?</h3>
            </div>
            <p className="mt-3 text-sm text-ink/60">
              "{confirmacion.item.descripcion}" se borrará por completo de la Papelera. A diferencia de "Restaurar",
              esto ya no se puede deshacer de ninguna forma.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmacion(null)} className="rounded-full border border-ink/20 px-4 py-1.5 text-sm font-semibold text-ink/70 hover:bg-ink/5">
                Cancelar
              </button>
              <button
                onClick={() => { const accion = confirmacion.onConfirmar; setConfirmacion(null); accion(); }}
                className="rounded-full border border-ember/30 bg-ember/10 px-4 py-1.5 text-sm font-semibold text-ember hover:bg-ember/20"
              >
                Sí, eliminar para siempre
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && (
        <div className="fixed bottom-24 left-1/2 z-50 md:bottom-6 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          {aviso}
        </div>
      )}
    </div>
  );
}

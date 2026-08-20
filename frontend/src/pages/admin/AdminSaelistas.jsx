import { useEffect, useState } from 'react';
import api, { mensajeError } from '../../api';
import {
  DEPARTAMENTOS_HONDURAS, MUNICIPIOS_POR_DEPARTAMENTO, ZONAS_FIHNEC,
  CARGOS_FIHNEC, CARGOS_HISTORICO, ESTADOS_CIVILES,
  TIPOS_TESTIMONIO, FORMACION_OFICIAL, OTRAS_PARTICIPACIONES,
} from '../../listas';

const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-ember focus:outline-none';
const claseFiltro = 'w-48 rounded-lg border border-ink/15 px-3 py-1.5 text-xs focus:border-ember focus:outline-none';
const btnVer = 'rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/5';
const btnEditar = 'rounded-full bg-[#007334] px-3 py-1 text-xs font-semibold text-white hover:bg-[#005c29]';
const btnEliminar = 'rounded-full bg-ember px-3 py-1 text-xs font-semibold text-white hover:bg-ember-light';

const vacio = {
  nombre_completo: '', dni: '', celular: '', email: '', estado_civil: '',
  hijos_cantidad: '', nietos_cantidad: '', fecha_nacimiento: '', nombre_esposa: '', profesion: '',
  contacto_emergencia_telefono: '', foto: '',
  capitulo: '', zona: '', departamento: '', municipio: '',
  fecha_inscripcion_capitulo: '', tiempo_fihnec: '', cargo_actual: '', cargos_desempenados: [],
  tipo_testimonio: [], formacion_oficial: [], otras_participaciones: [],
  es_aspirante: false,
};

// Redimensiona/comprime la foto en el navegador ANTES de mandarla al
// servidor (máx. 350px de lado, JPEG calidad 0.8) — así el base64 que se
// guarda en la base de datos nunca pesa de más.
function comprimirImagen(file, maxLado = 350, calidad = 0.8) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxLado) {
          height = Math.round((height * maxLado) / width);
          width = maxLado;
        } else if (height >= width && height > maxLado) {
          width = Math.round((width * maxLado) / height);
          height = maxLado;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    lector.onerror = reject;
    lector.readAsDataURL(file);
  });
}

function GrupoCheckbox({ opciones, seleccionadas, onChange, clases = 'sm:grid-cols-3' }) {
  function alternar(opcion) {
    if (seleccionadas.includes(opcion)) {
      onChange(seleccionadas.filter((o) => o !== opcion));
    } else {
      onChange([...seleccionadas, opcion]);
    }
  }
  return (
    <div className={`grid gap-2 rounded-lg border border-ink/10 p-3 ${clases}`}>
      {opciones.map((op) => (
        <label key={op} className="flex items-start gap-2 text-sm text-ink/70">
          <input type="checkbox" className="mt-0.5" checked={seleccionadas.includes(op)} onChange={() => alternar(op)} />
          <span>{op}</span>
        </label>
      ))}
    </div>
  );
}

export default function AdminSaelistas() {
  const [vista, setVista] = useState('lista'); // 'lista' | 'detalle' | 'formulario'
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [zonaFiltro, setZonaFiltro] = useState('');
  const [aspiranteFiltro, setAspiranteFiltro] = useState('');
  const [descargando, setDescargando] = useState('');

  const [seleccionado, setSeleccionado] = useState(null); // detalle completo
  const [editandoId, setEditandoId] = useState(null); // id o 'nuevo'
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const [confirmacion, setConfirmacion] = useState(null);
  function pedirConfirmacion({ mensaje, textoConfirmar = 'Eliminar', onConfirmar }) {
    setConfirmacion({ mensaje, textoConfirmar, onConfirmar });
  }

  // --- Asistencia al evento (sin módulo de cobro, no pagan) ---
  const [eventoActual, setEventoActual] = useState(null);
  const [asistencia, setAsistencia] = useState([]);
  const [cargandoAsistencia, setCargandoAsistencia] = useState(false);
  const [buscarAsistencia, setBuscarAsistencia] = useState('');
  const [totalesAsistencia, setTotalesAsistencia] = useState({ total: 0, total_registrados: 0 });

  useEffect(() => {
    api.get('/eventos')
      .then(({ data }) => {
        const actual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
        setEventoActual(actual || null);
      })
      .catch(() => {});
  }, []);

  async function cargarAsistencia(texto) {
    if (!eventoActual) return;
    setCargandoAsistencia(true);
    setError('');
    try {
      const params = {};
      if (texto) params.buscar = texto;
      const { data } = await api.get(`/admin/eventos/${eventoActual.id}/saelistas-asistencia`, { params });
      setAsistencia(data.saelistas);
      setTotalesAsistencia({ total: data.total, total_registrados: data.total_registrados });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargandoAsistencia(false);
    }
  }

  useEffect(() => { if (vista === 'asistencia') cargarAsistencia(''); }, [vista, eventoActual]);

  async function marcarAsistencia(saelistaId, valor) {
    setError('');
    try {
      await api.put(`/admin/saelista-asistencias/${saelistaId}/presencial`, {
        evento_id: eventoActual.id,
        registrado_presencial: valor,
      });
      setAsistencia((prev) => prev.map((s) =>
        s.saelista_id === saelistaId ? { ...s, registrado_presencial: valor } : s
      ));
      setTotalesAsistencia((prev) => ({ ...prev, total_registrados: prev.total_registrados + (valor ? 1 : -1) }));
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  async function cargarLista(textoActual, zona, aspirante) {
    setCargando(true);
    setError('');
    try {
      const params = {};
      if (textoActual) params.buscar = textoActual;
      if (zona) params.zona = zona;
      if (aspirante) params.es_aspirante = aspirante;
      const { data } = await api.get('/admin/saelistas', { params });
      setLista(data);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarLista('', '', ''); }, []);

  function buscarSubmit(e) {
    e.preventDefault();
    cargarLista(buscar, zonaFiltro, aspiranteFiltro);
  }

  function limpiarFiltros() {
    setBuscar('');
    setZonaFiltro('');
    setAspiranteFiltro('');
    cargarLista('', '', '');
  }

  function parametrosDescarga() {
    const params = {};
    if (buscar) params.buscar = buscar;
    if (zonaFiltro) params.zona = zonaFiltro;
    if (aspiranteFiltro) params.es_aspirante = aspiranteFiltro;
    return params;
  }

  async function descargar(tipo) {
    setDescargando(tipo);
    setError('');
    try {
      const { data } = await api.get(`/admin/saelistas/${tipo}`, { params: parametrosDescarga(), responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `saelistas.${tipo === 'excel' ? 'xlsx' : 'pdf'}`;
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

  async function abrirDetalle(id) {
    setError('');
    try {
      const { data } = await api.get(`/admin/saelistas/${id}`);
      setSeleccionado(data);
      setVista('detalle');
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  function abrirNuevo() {
    setForm(vacio);
    setEditandoId('nuevo');
    setVista('formulario');
  }

  function abrirEditar(saelista) {
    setForm({
      nombre_completo: saelista.nombre_completo || '',
      dni: saelista.dni || '',
      celular: saelista.celular || '',
      email: saelista.email || '',
      estado_civil: saelista.estado_civil || '',
      hijos_cantidad: saelista.hijos_cantidad ?? '',
      nietos_cantidad: saelista.nietos_cantidad ?? '',
      fecha_nacimiento: saelista.fecha_nacimiento ? saelista.fecha_nacimiento.slice(0, 10) : '',
      nombre_esposa: saelista.nombre_esposa || '',
      profesion: saelista.profesion || '',
      contacto_emergencia_telefono: saelista.contacto_emergencia_telefono || '',
      foto: saelista.foto || '',
      capitulo: saelista.capitulo || '',
      zona: saelista.zona || '',
      departamento: saelista.departamento || '',
      municipio: saelista.municipio || '',
      fecha_inscripcion_capitulo: saelista.fecha_inscripcion_capitulo ? saelista.fecha_inscripcion_capitulo.slice(0, 10) : '',
      tiempo_fihnec: saelista.tiempo_fihnec || '',
      cargo_actual: saelista.cargo_actual || '',
      cargos_desempenados: saelista.cargos_desempenados || [],
      tipo_testimonio: saelista.tipo_testimonio || [],
      formacion_oficial: saelista.formacion_oficial || [],
      otras_participaciones: saelista.otras_participaciones || [],
      es_aspirante: saelista.es_aspirante || false,
    });
    setEditandoId(saelista.id);
    setVista('formulario');
  }

  async function subirFoto(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendoFoto(true);
    try {
      const base64 = await comprimirImagen(archivo);
      setForm((f) => ({ ...f, foto: base64 }));
    } catch (err) {
      setError('No se pudo procesar la imagen.');
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function guardar() {
    if (!form.nombre_completo) {
      setError('El nombre completo es obligatorio.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      if (editandoId === 'nuevo') {
        await api.post('/admin/saelistas', form);
      } else {
        await api.put(`/admin/saelistas/${editandoId}`, form);
      }
      setVista('lista');
      cargarLista(buscar, zonaFiltro, aspiranteFiltro);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  function eliminar(id, nombre) {
    pedirConfirmacion({
      mensaje: `Se eliminará por completo la ficha de "${nombre}". Esta acción no se puede deshacer.`,
      textoConfirmar: 'Sí, eliminar',
      onConfirmar: async () => {
        setError('');
        try {
          await api.delete(`/admin/saelistas/${id}`);
          if (seleccionado?.id === id) {
            setSeleccionado(null);
            setVista('lista');
          }
          cargarLista(buscar, zonaFiltro, aspiranteFiltro);
        } catch (err) {
          setError(mensajeError(err));
        }
      },
    });
  }

  const municipiosDisponibles = form.departamento ? (MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] || []) : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-ink">Saelistas</h1>
        {vista === 'lista' && (
          <button onClick={abrirNuevo} className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light">
            + Nuevo Saelista
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-ink/50">Servidores voluntarios de SAEL Hombres. Administrado solo desde el panel — sin login propio.</p>

      {(vista === 'lista' || vista === 'asistencia') && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setVista('lista')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${vista === 'lista' ? 'bg-ink text-white' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'}`}
          >
            Catálogo
          </button>
          <button
            onClick={() => setVista('asistencia')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${vista === 'asistencia' ? 'bg-ink text-white' : 'border border-ink/20 text-ink/70 hover:bg-ink/5'}`}
          >
            ★ Asistencia al evento
          </button>
        </div>
      )}

      {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

      {vista === 'asistencia' && (
        <div className="mt-4">
          {!eventoActual && <p className="text-sm text-ink/40">No hay un evento SAEL marcado como actual/abierto en este momento.</p>}
          {eventoActual && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-night px-4 py-3 text-white shadow-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/60">Evento actual</p>
                  <p className="font-display text-lg font-bold">{eventoActual.nombre}</p>
                </div>
                <p className="text-sm">
                  <span className="font-display text-2xl font-bold">{totalesAsistencia.total_registrados}</span>
                  <span className="text-white/60"> / {totalesAsistencia.total} asistieron</span>
                </p>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); cargarAsistencia(buscarAsistencia); }}
                className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm"
              >
                <input
                  type="text" value={buscarAsistencia} onChange={(e) => setBuscarAsistencia(e.target.value)}
                  placeholder="Buscar por nombre o DNI" className={`${claseInput} flex-1 min-w-[200px]`}
                />
                <button type="submit" className="rounded-full bg-[#007334] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005c29]">Buscar</button>
                <button
                  type="button"
                  onClick={() => { setBuscarAsistencia(''); cargarAsistencia(''); }}
                  className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5"
                >
                  Limpiar filtros
                </button>
              </form>

              {cargandoAsistencia ? <p className="mt-6 text-ink/40">Cargando…</p> : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Capítulo</th>
                        <th className="px-4 py-3">Zona</th>
                        <th className="px-4 py-3 text-center">Asistió</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asistencia.length === 0 && (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-ink/40">Sin saelistas en el catálogo todavía.</td></tr>
                      )}
                      {asistencia.map((s) => (
                        <tr key={s.saelista_id} className="border-b border-ink/5 last:border-0">
                          <td className="px-4 py-3 font-medium text-ink">{s.nombre_completo}</td>
                          <td className="px-4 py-3 text-ink/60">{s.capitulo || '—'}</td>
                          <td className="px-4 py-3 text-ink/60">{s.zona || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox" checked={s.registrado_presencial}
                              onChange={(e) => marcarAsistencia(s.saelista_id, e.target.checked)}
                            />
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

      {vista === 'lista' && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => descargar('excel')}
              disabled={!!descargando || lista.length === 0}
              className="rounded-full bg-[#007334] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005c29] disabled:opacity-50"
            >
              {descargando === 'excel' ? 'Descargando…' : '↓ Descargar Excel'}
            </button>
            <button
              onClick={() => descargar('pdf')}
              disabled={!!descargando || lista.length === 0}
              className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-50"
            >
              {descargando === 'pdf' ? 'Descargando…' : '↓ Descargar PDF'}
            </button>
          </div>

          <form onSubmit={buscarSubmit} className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-ink/10 bg-white p-3 shadow-sm">
            <input
              type="text" value={buscar} onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar por nombre o DNI"
              className={`${claseInput} flex-1 min-w-[160px] py-1.5`}
            />
            <select value={zonaFiltro} onChange={(e) => setZonaFiltro(e.target.value)} className={claseFiltro}>
              <option value="">Todas las zonas</option>
              {ZONAS_FIHNEC.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <select value={aspiranteFiltro} onChange={(e) => setAspiranteFiltro(e.target.value)} className={claseFiltro}>
              <option value="">Todos</option>
              <option value="true">Aspirantes</option>
            </select>
            <button type="submit" className="rounded-full bg-[#007334] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#005c29]">Buscar</button>
            <button type="button" onClick={limpiarFiltros} className="rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5">Limpiar filtros</button>
          </form>

          {cargando ? <p className="mt-6 text-ink/40">Cargando…</p> : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/40">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">DNI</th>
                    <th className="px-4 py-3">Capítulo</th>
                    <th className="px-4 py-3">Zona</th>
                    <th className="px-4 py-3">Cargo actual</th>
                    <th className="px-4 py-3">Aspirante</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-ink/40">No se encontraron Saelistas con esos filtros.</td></tr>
                  )}
                  {lista.map((s) => (
                    <tr key={s.id} className="border-b border-ink/5 last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{s.nombre_completo}</td>
                      <td className="px-4 py-3 text-ink/60">{s.dni || '—'}</td>
                      <td className="px-4 py-3 text-ink/60">{s.capitulo || '—'}</td>
                      <td className="px-4 py-3 text-ink/60">{s.zona || '—'}</td>
                      <td className="px-4 py-3 text-ink/60">{s.cargo_actual || '—'}</td>
                      <td className="px-4 py-3 text-ink/60">{s.es_aspirante ? 'Sí' : ''}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => abrirDetalle(s.id)} className={btnVer}>Ver detalle</button>
                        <button onClick={() => eliminar(s.id, s.nombre_completo)} className={`ml-2 ${btnEliminar}`}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {vista === 'detalle' && seleccionado && (
        <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {seleccionado.foto ? (
                <img src={seleccionado.foto} alt={seleccionado.nombre_completo} className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink/5 text-2xl text-ink/30">👤</div>
              )}
              <div>
                <h2 className="font-display text-lg font-bold text-ink">{seleccionado.nombre_completo}</h2>
                {seleccionado.es_aspirante && <span className="mt-1 inline-block rounded-full bg-flame/15 px-2 py-0.5 text-xs font-semibold text-flame">Aspirante</span>}
              </div>
            </div>
            <div className="flex shrink-0 gap-3">
              <button onClick={() => abrirEditar(seleccionado)} className={btnEditar}>Editar</button>
              <button onClick={() => setVista('lista')} className="rounded-full bg-night px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90">Volver</button>
              <button onClick={() => eliminar(seleccionado.id, seleccionado.nombre_completo)} className={btnEliminar}>Eliminar</button>
            </div>
          </div>

          <h3 className="mt-6 font-display text-sm font-bold text-ink">Datos personales</h3>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-ink/50">DNI</dt><dd className="font-medium text-ink">{seleccionado.dni || '—'}</dd></div>
            <div><dt className="text-ink/50">Fecha de nacimiento</dt><dd className="font-medium text-ink">{seleccionado.fecha_nacimiento ? seleccionado.fecha_nacimiento.slice(0, 10) : '—'}</dd></div>
            <div><dt className="text-ink/50">Celular</dt><dd className="font-medium text-ink">{seleccionado.celular || '—'}</dd></div>
            <div><dt className="text-ink/50">Email</dt><dd className="font-medium text-ink">{seleccionado.email || '—'}</dd></div>
            <div><dt className="text-ink/50">Estado civil</dt><dd className="font-medium text-ink">{seleccionado.estado_civil || '—'}</dd></div>
            <div><dt className="text-ink/50">Nombre de esposa</dt><dd className="font-medium text-ink">{seleccionado.nombre_esposa || '—'}</dd></div>
            <div><dt className="text-ink/50">Hijos / Nietos</dt><dd className="font-medium text-ink">{seleccionado.hijos_cantidad ?? '—'} / {seleccionado.nietos_cantidad ?? '—'}</dd></div>
            <div><dt className="text-ink/50">Profesión</dt><dd className="font-medium text-ink">{seleccionado.profesion || '—'}</dd></div>
            <div><dt className="text-ink/50">Contacto de emergencia</dt><dd className="font-medium text-ink">{seleccionado.contacto_emergencia_telefono || '—'}</dd></div>
          </dl>

          <h3 className="mt-6 font-display text-sm font-bold text-ink">Ubicación</h3>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-ink/50">Capítulo</dt><dd className="font-medium text-ink">{seleccionado.capitulo || '—'}</dd></div>
            <div><dt className="text-ink/50">Zona</dt><dd className="font-medium text-ink">{seleccionado.zona || '—'}</dd></div>
            <div><dt className="text-ink/50">Departamento / Municipio</dt><dd className="font-medium text-ink">{seleccionado.departamento || '—'} / {seleccionado.municipio || '—'}</dd></div>
          </dl>

          <h3 className="mt-6 font-display text-sm font-bold text-ink">Organizacional / FIHNEC</h3>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-ink/50">Fecha inscripción capítulo</dt><dd className="font-medium text-ink">{seleccionado.fecha_inscripcion_capitulo ? seleccionado.fecha_inscripcion_capitulo.slice(0, 10) : '—'}</dd></div>
            <div><dt className="text-ink/50">Tiempo en FIHNEC</dt><dd className="font-medium text-ink">{seleccionado.tiempo_fihnec || '—'}</dd></div>
            <div><dt className="text-ink/50">Cargo actual</dt><dd className="font-medium text-ink">{seleccionado.cargo_actual || '—'}</dd></div>
          </dl>
          <div className="mt-3 text-sm">
            <p className="text-ink/50">Cargos desempeñados (histórico)</p>
            <p className="mt-1 text-ink">{seleccionado.cargos_desempenados?.length ? seleccionado.cargos_desempenados.join(', ') : '—'}</p>
          </div>

          <h3 className="mt-6 font-display text-sm font-bold text-ink">Testimonio y formación</h3>
          <div className="mt-2 space-y-2 text-sm">
            <p><span className="text-ink/50">Tipo de testimonio:</span> <span className="text-ink">{seleccionado.tipo_testimonio?.length ? seleccionado.tipo_testimonio.join(', ') : '—'}</span></p>
            <p><span className="text-ink/50">Formación oficial:</span> <span className="text-ink">{seleccionado.formacion_oficial?.length ? seleccionado.formacion_oficial.join(', ') : '—'}</span></p>
            <p><span className="text-ink/50">Otras participaciones:</span> <span className="text-ink">{seleccionado.otras_participaciones?.length ? seleccionado.otras_participaciones.join(', ') : '—'}</span></p>
          </div>
        </div>
      )}

      {vista === 'formulario' && (
        <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-bold text-ink">{editandoId === 'nuevo' ? 'Nuevo Saelista' : 'Editar Saelista'}</h2>

          <div className="mt-4 flex items-center gap-4">
            {form.foto ? (
              <img src={form.foto} alt="Vista previa" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink/5 text-2xl text-ink/30">👤</div>
            )}
            <label className="cursor-pointer rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5">
              {subiendoFoto ? 'Procesando…' : 'Subir foto'}
              <input type="file" accept="image/*" className="hidden" onChange={subirFoto} disabled={subiendoFoto} />
            </label>
            {form.foto && (
              <button type="button" onClick={() => setForm((f) => ({ ...f, foto: '' }))} className="text-xs text-ink/40 hover:text-ember hover:underline">
                Quitar
              </button>
            )}
          </div>

          <h3 className="mt-6 font-display text-sm font-bold text-ink">Datos personales</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre completo *</span>
              <input type="text" value={form.nombre_completo} onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">DNI</span>
              <input type="text" value={form.dni} onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha de nacimiento</span>
              <input type="date" value={form.fecha_nacimiento} onChange={(e) => setForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Celular</span>
              <input type="text" value={form.celular} onChange={(e) => setForm((f) => ({ ...f, celular: e.target.value.replace(/\D/g, '').slice(0, 8) }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Email</span>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Estado civil</span>
              <select value={form.estado_civil} onChange={(e) => setForm((f) => ({ ...f, estado_civil: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {ESTADOS_CIVILES.map((ec) => <option key={ec} value={ec}>{ec}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre de esposa</span>
              <input type="text" value={form.nombre_esposa} onChange={(e) => setForm((f) => ({ ...f, nombre_esposa: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Cantidad de hijos</span>
              <input type="number" min="0" value={form.hijos_cantidad} onChange={(e) => setForm((f) => ({ ...f, hijos_cantidad: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Cantidad de nietos</span>
              <input type="number" min="0" value={form.nietos_cantidad} onChange={(e) => setForm((f) => ({ ...f, nietos_cantidad: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Profesión</span>
              <input type="text" value={form.profesion} onChange={(e) => setForm((f) => ({ ...f, profesion: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Contacto de emergencia — teléfono</span>
              <input type="text" value={form.contacto_emergencia_telefono} onChange={(e) => setForm((f) => ({ ...f, contacto_emergencia_telefono: e.target.value.replace(/\D/g, '').slice(0, 8) }))} className={claseInput} />
            </label>
          </div>

          <h3 className="mt-6 font-display text-sm font-bold text-ink">Ubicación</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Capítulo</span>
              <input type="text" value={form.capitulo} onChange={(e) => setForm((f) => ({ ...f, capitulo: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Zona</span>
              <select value={form.zona} onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {ZONAS_FIHNEC.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Departamento</span>
              <select value={form.departamento} onChange={(e) => setForm((f) => ({ ...f, departamento: e.target.value, municipio: '' }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {DEPARTAMENTOS_HONDURAS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Municipio</span>
              <select value={form.municipio} onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))} disabled={!form.departamento} className={`${claseInput} disabled:bg-ink/5`}>
                <option value="">{form.departamento ? 'Seleccionar…' : 'Primero elige un departamento'}</option>
                {municipiosDisponibles.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>

          <h3 className="mt-6 font-display text-sm font-bold text-ink">Organizacional / FIHNEC</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Fecha inscripción capítulo</span>
              <input type="date" value={form.fecha_inscripcion_capitulo} onChange={(e) => setForm((f) => ({ ...f, fecha_inscripcion_capitulo: e.target.value }))} className={claseInput} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Tiempo en FIHNEC</span>
              <input type="text" value={form.tiempo_fihnec} onChange={(e) => setForm((f) => ({ ...f, tiempo_fihnec: e.target.value }))} className={claseInput} placeholder="Ej. 5 años" />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Cargo actual</span>
              <select value={form.cargo_actual} onChange={(e) => setForm((f) => ({ ...f, cargo_actual: e.target.value }))} className={claseInput}>
                <option value="">Seleccionar…</option>
                {CARGOS_FIHNEC.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={form.es_aspirante} onChange={(e) => setForm((f) => ({ ...f, es_aspirante: e.target.checked }))} />
              <span className="text-sm text-ink/70">Es aspirante</span>
            </label>
          </div>
          <div className="mt-3">
            <span className="mb-1 block text-xs font-semibold text-ink/60">Cargos desempeñados (histórico)</span>
            <GrupoCheckbox opciones={CARGOS_HISTORICO} seleccionadas={form.cargos_desempenados} onChange={(v) => setForm((f) => ({ ...f, cargos_desempenados: v }))} clases="sm:grid-cols-3" />
          </div>

          <h3 className="mt-6 font-display text-sm font-bold text-ink">Testimonio y formación</h3>
          <div className="mt-3 space-y-4">
            <div>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Tipo de testimonio</span>
              <GrupoCheckbox opciones={TIPOS_TESTIMONIO} seleccionadas={form.tipo_testimonio} onChange={(v) => setForm((f) => ({ ...f, tipo_testimonio: v }))} clases="sm:grid-cols-3" />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Formación oficial</span>
              <GrupoCheckbox opciones={FORMACION_OFICIAL} seleccionadas={form.formacion_oficial} onChange={(v) => setForm((f) => ({ ...f, formacion_oficial: v }))} clases="sm:grid-cols-3" />
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-ink/60">Otras participaciones</span>
              <GrupoCheckbox opciones={OTRAS_PARTICIPACIONES} seleccionadas={form.otras_participaciones} onChange={(v) => setForm((f) => ({ ...f, otras_participaciones: v }))} clases="sm:grid-cols-3" />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setVista(editandoId === 'nuevo' ? 'lista' : 'detalle')} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando} className="rounded-full bg-[#007334] px-5 py-2 text-sm font-semibold text-white hover:bg-[#005c29] disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
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

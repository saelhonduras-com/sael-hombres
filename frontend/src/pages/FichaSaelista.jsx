import { useEffect, useState } from 'react';
import api, { mensajeError } from '../api';
import {
  DEPARTAMENTOS_HONDURAS, MUNICIPIOS_POR_DEPARTAMENTO, ZONAS_FIHNEC, nombreZona,
  CARGOS_FIHNEC, CARGOS_HISTORICO, ESTADOS_CIVILES,
  TIPOS_TESTIMONIO, FORMACION_OFICIAL, OTRAS_PARTICIPACIONES,
} from '../listas';

const claseInput = 'w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink transition focus:border-ember focus:outline-none focus:ring-4 focus:ring-ember/10';

const vacio = {
  nombre_completo: '', celular: '', email: '', estado_civil: '',
  hijos_cantidad: '', nietos_cantidad: '', fecha_nacimiento: '', nombre_esposa: '', profesion: '',
  contacto_emergencia_telefono: '', foto: '',
  capitulo: '', zona: '', departamento: '', municipio: '',
  fecha_inscripcion_capitulo: '', tiempo_fihnec: '', cargo_actual: '', cargos_desempenados: [],
  tipo_testimonio: [], formacion_oficial: [], otras_participaciones: [],
};

// Redimensiona/comprime la foto en el navegador ANTES de mandarla al
// servidor (máx. 350x350 px, JPEG calidad 0.8) — mismo criterio exacto
// que ya usa el panel de admin, para que ambos caminos guarden fotos
// del mismo tamaño.
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

// Mismo componente exacto que ya usa Registro.jsx — franja tricolor arriba
// (#E40521/#FDC41F/#007334), tarjeta blanca redondeada.
function TarjetaMarca({ children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm ${className}`}>
      <div className="flex h-1.5">
        <span className="flex-1 bg-[#E40521]" />
        <span className="flex-1 bg-[#FDC41F]" />
        <span className="flex-1 bg-[#007334]" />
      </div>
      <div className="p-8">{children}</div>
    </div>
  );
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

export default function FichaSaelista() {
  const [verificandoEnlace, setVerificandoEnlace] = useState(true);
  const [enlaceActivo, setEnlaceActivo] = useState(false);

  const [dni, setDni] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [dniConfirmado, setDniConfirmado] = useState('');
  const [esNuevo, setEsNuevo] = useState(false);
  const [form, setForm] = useState(vacio);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    api.get('/saelistas/enlace-activo')
      .then(({ data }) => setEnlaceActivo(data.activo))
      .catch(() => setEnlaceActivo(false))
      .finally(() => setVerificandoEnlace(false));
  }, []);

  const municipiosDisponibles = form.departamento ? (MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] || []) : [];

  async function subirFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendoFoto(true);
    setError('');
    try {
      const dataUrl = await comprimirImagen(file);
      setForm((f) => ({ ...f, foto: dataUrl }));
    } catch (err) {
      setError('No se pudo procesar la foto. Intenta con otra imagen.');
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function buscarDni(e) {
    e.preventDefault();
    setError('');
    if (!/^\d{13}$/.test(dni)) {
      setError('El DNI debe tener 13 dígitos.');
      return;
    }
    setBuscando(true);
    try {
      const { data } = await api.get(`/saelistas/dni/${dni.trim()}`);
      if (data.existe) {
        const s = data.saelista;
        setForm({
          nombre_completo: s.nombre_completo || '',
          celular: s.celular || '',
          email: s.email || '',
          estado_civil: s.estado_civil || '',
          hijos_cantidad: s.hijos_cantidad ?? '',
          nietos_cantidad: s.nietos_cantidad ?? '',
          fecha_nacimiento: s.fecha_nacimiento ? s.fecha_nacimiento.slice(0, 10) : '',
          nombre_esposa: s.nombre_esposa || '',
          profesion: s.profesion || '',
          contacto_emergencia_telefono: s.contacto_emergencia_telefono || '',
          foto: s.foto || '',
          capitulo: s.capitulo || '',
          zona: s.zona || '',
          departamento: s.departamento || '',
          municipio: s.municipio || '',
          fecha_inscripcion_capitulo: s.fecha_inscripcion_capitulo ? s.fecha_inscripcion_capitulo.slice(0, 10) : '',
          tiempo_fihnec: s.tiempo_fihnec || '',
          cargo_actual: s.cargo_actual || '',
          cargos_desempenados: s.cargos_desempenados || [],
          tipo_testimonio: s.tipo_testimonio || [],
          formacion_oficial: s.formacion_oficial || [],
          otras_participaciones: s.otras_participaciones || [],
        });
        setEsNuevo(false);
      } else {
        setForm(vacio);
        setEsNuevo(true);
      }
      setDniConfirmado(dni.trim());
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setBuscando(false);
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
      if (esNuevo) {
        await api.post('/saelistas', { ...form, dni: dniConfirmado });
      } else {
        await api.put(`/saelistas/dni/${dniConfirmado}`, form);
      }
      setGuardado(true);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  if (verificandoEnlace) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink/15 border-t-ember" />
      </div>
    );
  }

  if (!enlaceActivo) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5">
        <TarjetaMarca className="w-full max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
              <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">Enlace no disponible</h1>
          <p className="mt-2 text-ink/50">Este enlace ya venció o todavía no ha sido generado. Contacta al administrador para conseguir uno nuevo.</p>
        </TarjetaMarca>
      </div>
    );
  }

  if (guardado) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5">
        <TarjetaMarca className="w-full max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#007334]/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#007334]">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">¡Gracias!</h1>
          <p className="mt-2 text-ink/50">Tu información quedó guardada correctamente.</p>
        </TarjetaMarca>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment px-5 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-center font-display text-2xl font-bold text-ink">Ficha de Servidor · SAEL Hombres</h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-ink/50">
          Completa o corrige tu información. Este enlace es temporal y solo estará disponible por un tiempo limitado.
        </p>

        {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-center text-sm text-ember">{error}</p>}

        {!dniConfirmado ? (
          <form onSubmit={buscarDni} className="mx-auto mt-8 max-w-sm">
            <TarjetaMarca>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Tu número de identificación (DNI)</span>
                <input
                  type="text" inputMode="numeric" maxLength={13} value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-3 text-center font-display text-2xl tracking-widest text-ink transition focus:border-ember focus:outline-none focus:ring-4 focus:ring-ember/10"
                  placeholder="0801199012345"
                />
                <span className="mt-2 block text-center text-xs text-ink/40">{dni.length}/13 dígitos</span>
              </label>
              <button type="submit" disabled={buscando} className="mt-4 w-full rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-light disabled:opacity-50">
                {buscando ? 'Verificando…' : 'Continuar'}
              </button>
            </TarjetaMarca>
          </form>
        ) : (
          <TarjetaMarca className="mx-auto mt-8 max-w-2xl">
            {esNuevo ? (
              <p className="mb-4 rounded-lg bg-gold/10 p-3 text-sm text-ink/70">
                No encontramos tu DNI en el sistema — vamos a crear tu ficha desde cero.
              </p>
            ) : (
              <p className="mb-4 rounded-lg bg-[#007334]/10 p-3 text-sm text-[#007334]">
                ✅ Te encontramos en el sistema. Revisa que tu información esté correcta y actualízala si hace falta.
              </p>
            )}

            <div className="flex items-center gap-4">
              {form.foto ? (
                <img src={form.foto} alt="Vista previa" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink/5 text-2xl text-ink/30">👤</div>
              )}
              <div>
                <label className="inline-block cursor-pointer rounded-full border border-ink/20 px-4 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5">
                  {subiendoFoto ? 'Procesando…' : 'Subir foto'}
                  <input type="file" accept="image/*" className="hidden" onChange={subirFoto} disabled={subiendoFoto} />
                </label>
                {form.foto && (
                  <button type="button" onClick={() => setForm((f) => ({ ...f, foto: '' }))} className="ml-3 text-xs text-ink/40 hover:text-ember hover:underline">
                    Quitar
                  </button>
                )}
                <p className="mt-1.5 text-[11px] text-ink/40">Se ajusta automáticamente a 350×350 píxeles — cualquier foto sirve.</p>
              </div>
            </div>

            <h3 className="mt-6 font-display text-sm font-bold text-ink">Datos personales</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-ink/60">Nombre completo *</span>
                <input type="text" value={form.nombre_completo} onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))} className={claseInput} />
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
                  {ZONAS_FIHNEC.map((z) => <option key={z} value={z}>{nombreZona(z)}</option>)}
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
            </div>
            <div className="mt-3">
              <span className="mb-1 block text-xs font-semibold text-ink/60">Cargos desempeñados (histórico)</span>
              <GrupoCheckbox opciones={CARGOS_HISTORICO} seleccionadas={form.cargos_desempenados} onChange={(v) => setForm((f) => ({ ...f, cargos_desempenados: v }))} clases="sm:grid-cols-3" />
            </div>

            <h3 className="mt-6 font-display text-sm font-bold text-ink">Testimonio y formación</h3>
            <div className="mt-3 space-y-4">
              <div>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Tipo de testimonio</span>
                <GrupoCheckbox opciones={TIPOS_TESTIMONIO} seleccionadas={form.tipo_testimonio} onChange={(v) => setForm((f) => ({ ...f, tipo_testimonio: v }))} />
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Formación oficial</span>
                <GrupoCheckbox opciones={FORMACION_OFICIAL} seleccionadas={form.formacion_oficial} onChange={(v) => setForm((f) => ({ ...f, formacion_oficial: v }))} />
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold text-ink/60">Otras participaciones</span>
                <GrupoCheckbox opciones={OTRAS_PARTICIPACIONES} seleccionadas={form.otras_participaciones} onChange={(v) => setForm((f) => ({ ...f, otras_participaciones: v }))} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setDniConfirmado(''); setForm(vacio); }} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando} className="rounded-full bg-ember px-6 py-2 text-sm font-semibold text-white hover:bg-ember-light disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar mi información'}
              </button>
            </div>
          </TarjetaMarca>
        )}
      </div>
    </div>
  );
}

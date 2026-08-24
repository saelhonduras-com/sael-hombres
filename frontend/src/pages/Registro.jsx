import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { mensajeError } from '../api';
import {
  DEPARTAMENTOS_HONDURAS, MUNICIPIOS_POR_DEPARTAMENTO,
  ZONAS_FIHNEC, CARGOS_FIHNEC, ESTADOS_CIVILES,
} from '../listas';

const TOTAL_PASOS = 6;
const NOMBRES_PASOS = ['DNI', 'Datos personales', 'Ubicación', 'Datos FIHNEC', 'Contacto de emergencia', 'Revisión'];

const vacio = {
  dni: '',
  nombre_completo: '',
  fecha_nacimiento: '',
  telefono_movil: '',
  estado_civil: '',
  departamento: '',
  municipio: '',
  capitulo: '',
  zona: '',
  cargo_fihnec: '',
  ha_recibido_saeles: null,
  veces_saeles_previas: '',
  contacto_emergencia_nombre: '',
  contacto_emergencia_telefono: '',
};

function Boton({ children, variant = 'red', className = '', ...props }) {
  const colores = {
    red: 'bg-ember hover:bg-ember-light shadow-sm shadow-ember/20',
    green: 'bg-[#007334] hover:bg-[#005c29] shadow-sm shadow-[#007334]/20',
    blue: 'bg-[#1F3464] hover:opacity-90 shadow-sm shadow-[#1F3464]/20',
  };
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${colores[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function BotonSecundario({ children, className = '', ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full border border-ink/20 px-6 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40 ${className}`}
    >
      {children}
    </button>
  );
}

function Encabezado({ etiqueta }) {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-night">
        <svg width="18" height="18" viewBox="0 0 24 24" className="text-[#FDC41F]" fill="currentColor">
          <path d="M12 3c-3 3.6-5 6.2-5 9.4a5 5 0 0 0 10 0c0-2.1-.9-3.6-1.9-5 .2 1.5-.4 2.6-1.3 2.6-1 0-1.5-.9-1.2-2 .4-1.9-.2-3.4-.6-5z" />
        </svg>
      </div>
      <p className="mt-3 font-sans text-base font-bold uppercase tracking-[0.2em] text-night">{etiqueta}</p>
    </div>
  );
}

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

function Campo({ etiqueta, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink/70">{etiqueta}</span>
      {children}
    </label>
  );
}

// Igual que Campo, pero sin <label>. Un <label> que envuelve más de un
// elemento activable (ej. dos botones) hace que el navegador intente
// además activar automáticamente el primero al hacer clic en cualquiera
// de los dos — eso es lo que causaba que "No" no se quedara seleccionado.
function CampoGrupo({ etiqueta, children }) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink/70">{etiqueta}</span>
      {children}
    </div>
  );
}

const claseInput = 'w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink transition focus:border-ember focus:outline-none focus:ring-4 focus:ring-ember/10';

export default function Registro() {
  const navigate = useNavigate();
  const hoy = new Date().toISOString().slice(0, 10);
  const [eventos, setEventos] = useState(null);
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState(vacio);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [participanteExistente, setParticipanteExistente] = useState(null); // { id, nombre_completo, ... } | null
  const [editando, setEditando] = useState(false);
  const [formEdicion, setFormEdicion] = useState(null);
  const [inscripcionCompleta, setInscripcionCompleta] = useState(false);
  const [nombreInscrito, setNombreInscrito] = useState('');
  const [mensajeExito, setMensajeExito] = useState('¡Inscripción completada!');
  const [segundosCargando, setSegundosCargando] = useState(0);

  useEffect(() => {
    api.get('/eventos').then((r) => setEventos(r.data)).catch(() => setError('No se pudo cargar la información del evento.'));
  }, []);

  // Cuenta cuánto lleva cargando la página, para poder explicar la espera si
  // el servidor está despertando tras un período de inactividad.
  useEffect(() => {
    if (eventos !== null || error) return;
    const intervalo = setInterval(() => setSegundosCargando((s) => s + 1), 1000);
    return () => clearInterval(intervalo);
  }, [eventos, error]);

  // Una vez completada la inscripción, regresa solo al inicio después de
  // unos segundos (con opción de irse antes con el botón manual).
  useEffect(() => {
    if (!inscripcionCompleta) return;
    const temporizador = setTimeout(() => navigate('/'), 4000);
    return () => clearTimeout(temporizador);
  }, [inscripcionCompleta, navigate]);

  // El evento marcado como "actual" solo sirve para inscribirse si TAMBIÉN
  // está abierto — antes esto se pasaba por alto y dejaba pasar al DNI
  // aunque el evento actual estuviera cerrado.
  const eventoActual = eventos?.find((ev) => ev.es_actual && ev.abierto) || eventos?.find((ev) => ev.abierto) || null;

  const municipiosDisponibles = form.departamento ? (MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] || []) : [];
  const municipiosEdicion = formEdicion?.departamento ? (MUNICIPIOS_POR_DEPARTAMENTO[formEdicion.departamento] || []) : [];

  function actualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function verificarDni() {
    setError('');
    if (!/^\d{13}$/.test(form.dni)) {
      setError('El DNI debe tener 13 dígitos.');
      return;
    }
    setCargando(true);
    try {
      const { data } = await api.get(`/participantes/dni/${form.dni}`);
      if (data.existe) {
        setParticipanteExistente(data.participante);
      } else {
        setParticipanteExistente(null);
        setPaso(2);
      }
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  // Inscribe al participante al evento actual. Si el backend responde que
  // ya estaba inscrito (409), NO lo tratamos como error — el objetivo
  // (estar inscrito, con los datos al día) ya se cumple igual. Sin esto,
  // alguien que solo viene a actualizar sus datos y ya estaba inscrito se
  // quedaba atorado viendo "Ya estás inscrito a este evento." en vez de
  // llegar a la pantalla de éxito.
  async function inscribirSiHaceFalta(participante_id) {
    try {
      await api.post('/inscripciones', { participante_id, evento_id: eventoActual.id });
    } catch (err) {
      if (err?.response?.status !== 409) {
        throw err;
      }
    }
  }

  async function confirmarInscripcionExistente() {
    setCargando(true);
    setError('');
    try {
      await inscribirSiHaceFalta(participanteExistente.id);
      setNombreInscrito(participanteExistente.nombre_completo);
      setMensajeExito('¡Inscripción completada!');
      setInscripcionCompleta(true);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  function abrirEdicion() {
    setFormEdicion({
      nombre_completo: participanteExistente.nombre_completo || '',
      fecha_nacimiento: participanteExistente.fecha_nacimiento ? participanteExistente.fecha_nacimiento.slice(0, 10) : '',
      telefono_movil: participanteExistente.telefono_movil || '',
      estado_civil: participanteExistente.estado_civil || '',
      departamento: participanteExistente.departamento || '',
      municipio: participanteExistente.municipio || '',
      capitulo: participanteExistente.capitulo || '',
      zona: participanteExistente.zona || '',
      cargo_fihnec: participanteExistente.cargo_fihnec || '',
      contacto_emergencia_nombre: participanteExistente.contacto_emergencia_nombre || '',
      contacto_emergencia_telefono: participanteExistente.contacto_emergencia_telefono || '',
    });
    setError('');
    setEditando(true);
  }

  function validarEdicion() {
    if (!formEdicion.nombre_completo || !formEdicion.fecha_nacimiento || !formEdicion.estado_civil) return false;
    if (!/^\d{8}$/.test(formEdicion.telefono_movil)) return false;
    if (!formEdicion.departamento || !formEdicion.municipio || !formEdicion.zona || !formEdicion.cargo_fihnec) return false;
    if (!formEdicion.contacto_emergencia_nombre || !/^\d{8}$/.test(formEdicion.contacto_emergencia_telefono)) return false;
    return true;
  }

  async function guardarEdicionYConfirmar() {
    if (!validarEdicion()) {
      setError('Completa todos los campos. Los teléfonos deben tener exactamente 8 dígitos.');
      return;
    }
    setCargando(true);
    setError('');
    try {
      const { data: actualizado } = await api.put(`/participantes/${participanteExistente.id}`, {
        numero_identificacion: form.dni,
        ...formEdicion,
      });
      await inscribirSiHaceFalta(participanteExistente.id);
      setNombreInscrito(actualizado.nombre_completo || formEdicion.nombre_completo);
      setMensajeExito('¡Cambios realizados!');
      setInscripcionCompleta(true);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  function validarPaso2() {
    if (!form.nombre_completo || !form.fecha_nacimiento || !form.estado_civil) return false;
    if (!/^\d{8}$/.test(form.telefono_movil)) return false;
    return true;
  }
  function validarPaso3() {
    return form.departamento && form.municipio && form.zona;
  }
  function validarPaso4() {
    if (!form.cargo_fihnec || form.ha_recibido_saeles === null) return false;
    if (form.ha_recibido_saeles && form.veces_saeles_previas === '') return false;
    return true;
  }
  function validarPaso5() {
    return form.contacto_emergencia_nombre && /^\d{8}$/.test(form.contacto_emergencia_telefono);
  }

  async function enviarRegistroCompleto() {
    setCargando(true);
    setError('');
    try {
      const { data: nuevo } = await api.post('/participantes', {
        numero_identificacion: form.dni,
        nombre_completo: form.nombre_completo,
        fecha_nacimiento: form.fecha_nacimiento,
        telefono_movil: form.telefono_movil,
        departamento: form.departamento,
        municipio: form.municipio,
        capitulo: form.capitulo,
        zona: form.zona,
        cargo_fihnec: form.cargo_fihnec,
        estado_civil: form.estado_civil,
        ha_recibido_saeles: form.ha_recibido_saeles,
        veces_saeles_previas: form.veces_saeles_previas || 0,
        contacto_emergencia_nombre: form.contacto_emergencia_nombre,
        contacto_emergencia_telefono: form.contacto_emergencia_telefono,
      });
      await inscribirSiHaceFalta(nuevo.id);
      setNombreInscrito(nuevo.nombre_completo || form.nombre_completo);
      setMensajeExito('¡Inscripción completada!');
      setInscripcionCompleta(true);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  // --- Estados especiales ---

  if (eventos === null && !error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-ink/50">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/15 border-t-ember" />
            Cargando…
          </div>
          <p className="mt-3 text-sm text-ink/40">En breve te mostraremos los pasos para tu inscripción.</p>
          {segundosCargando >= 5 && (
            <p className="mt-3 max-w-xs text-xs text-ink/30">
              El servidor puede estar despertando tras un período de inactividad — esto puede tardar hasta 50 segundos. Gracias por tu paciencia.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!eventoActual) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5">
        <div className="w-full max-w-md">
          <TarjetaMarca className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink/5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink/30">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-ink">No hay registro abierto</h1>
            <p className="mt-2 text-ink/50">Todavía no hay un encuentro SAEL con inscripción activa. Vuelve pronto.</p>
          </TarjetaMarca>
        </div>
      </div>
    );
  }

  if (inscripcionCompleta) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5">
        <div className="w-full max-w-md">
          <TarjetaMarca className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#007334]/10">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#007334" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-ink">{mensajeExito}</h1>
            <p className="mt-2 text-lg font-semibold text-ink">{nombreInscrito}</p>
            <p className="mt-2 text-ink/60">Quedaste registrado en <strong>{eventoActual.nombre}</strong>. Nos vemos ahí.</p>
            <p className="mt-6 text-xs text-ink/40">Te llevaremos al inicio en unos segundos…</p>
            <button onClick={() => navigate('/')} className="mt-2 text-sm font-semibold text-ember hover:underline">
              Ir al inicio ahora
            </button>
          </TarjetaMarca>
        </div>
      </div>
    );
  }

  if (participanteExistente && !editando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5">
        <div className="w-full max-w-md">
          <TarjetaMarca className="text-center">
            <p className="text-sm text-ink/50">Ya tenemos tus datos registrados</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-ink">{participanteExistente.nombre_completo}</h1>
            <p className="mt-4 text-sm text-ink/60">
              ¿Confirmamos tu inscripción a <strong>{eventoActual.nombre}</strong>?
            </p>
            {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
            <div className="mt-6 flex flex-col gap-3">
              <Boton onClick={confirmarInscripcionExistente} disabled={cargando} variant="green" className="w-full">
                {cargando ? 'Confirmando…' : 'Confirmar inscripción'}
              </Boton>
              <BotonSecundario onClick={abrirEdicion} className="w-full">
                Actualizar información
              </BotonSecundario>
              <button
                onClick={() => { setParticipanteExistente(null); setForm(vacio); }}
                className="text-sm font-semibold text-ink/50 transition hover:text-ember"
              >
                Cancelar e ingresar otro DNI
              </button>
            </div>
          </TarjetaMarca>
        </div>
      </div>
    );
  }

  if (participanteExistente && editando && formEdicion) {
    return (
      <div className="min-h-[70vh] bg-parchment px-5 py-14">
        <div className="mx-auto max-w-xl">
          <Encabezado etiqueta={`Actualiza tus datos · ${eventoActual.nombre}`} />
          <TarjetaMarca>
            {error && <p className="mb-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-ink">Tus datos</h2>
              <p className="text-xs text-ink/40">
                Revisa y corrige lo que haya cambiado. No es necesario que vuelvas a contestar si has recibido SAELES antes — eso ya lo tenemos.
              </p>
              <Campo etiqueta="Nombre completo">
                <input type="text" value={formEdicion.nombre_completo} onChange={(e) => setFormEdicion((f) => ({ ...f, nombre_completo: e.target.value }))} className={claseInput} />
              </Campo>
              <Campo etiqueta="Fecha de nacimiento">
                <input type="date" min="1920-01-01" max={hoy} value={formEdicion.fecha_nacimiento} onChange={(e) => setFormEdicion((f) => ({ ...f, fecha_nacimiento: e.target.value }))} className={claseInput} />
              </Campo>
              <Campo etiqueta="Teléfono móvil (8 dígitos)">
                <input
                  type="tel" inputMode="numeric" maxLength={8} value={formEdicion.telefono_movil}
                  onChange={(e) => setFormEdicion((f) => ({ ...f, telefono_movil: e.target.value.replace(/\D/g, '') }))}
                  className={claseInput} placeholder="99999999"
                />
              </Campo>
              <Campo etiqueta="Estado civil">
                <select value={formEdicion.estado_civil} onChange={(e) => setFormEdicion((f) => ({ ...f, estado_civil: e.target.value }))} className={claseInput}>
                  <option value="">Selecciona…</option>
                  {ESTADOS_CIVILES.map((e) => <option key={e}>{e}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Departamento">
                <select
                  value={formEdicion.departamento}
                  onChange={(e) => setFormEdicion((f) => ({ ...f, departamento: e.target.value, municipio: '' }))}
                  className={claseInput}
                >
                  <option value="">Selecciona…</option>
                  {DEPARTAMENTOS_HONDURAS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Municipio">
                <select value={formEdicion.municipio} onChange={(e) => setFormEdicion((f) => ({ ...f, municipio: e.target.value }))} disabled={!formEdicion.departamento} className={`${claseInput} disabled:bg-ink/5`}>
                  <option value="">{formEdicion.departamento ? 'Selecciona…' : 'Primero elige un departamento'}</option>
                  {municipiosEdicion.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Capítulo">
                <input type="text" value={formEdicion.capitulo} onChange={(e) => setFormEdicion((f) => ({ ...f, capitulo: e.target.value }))} className={claseInput} placeholder="Nombre de tu capítulo" />
              </Campo>
              <Campo etiqueta="Zona">
                <select value={formEdicion.zona} onChange={(e) => setFormEdicion((f) => ({ ...f, zona: e.target.value }))} className={claseInput}>
                  <option value="">Selecciona…</option>
                  {ZONAS_FIHNEC.map((z) => <option key={z}>{z}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Cargo en FIHNEC">
                <select value={formEdicion.cargo_fihnec} onChange={(e) => setFormEdicion((f) => ({ ...f, cargo_fihnec: e.target.value }))} className={claseInput}>
                  <option value="">Selecciona…</option>
                  {CARGOS_FIHNEC.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Contacto de emergencia — nombre">
                <input type="text" value={formEdicion.contacto_emergencia_nombre} onChange={(e) => setFormEdicion((f) => ({ ...f, contacto_emergencia_nombre: e.target.value }))} className={claseInput} />
              </Campo>
              <Campo etiqueta="Contacto de emergencia — teléfono (8 dígitos)">
                <input
                  type="tel" inputMode="numeric" maxLength={8} value={formEdicion.contacto_emergencia_telefono}
                  onChange={(e) => setFormEdicion((f) => ({ ...f, contacto_emergencia_telefono: e.target.value.replace(/\D/g, '') }))}
                  className={claseInput} placeholder="99999999"
                />
              </Campo>
              <div className="flex justify-between pt-2">
                <BotonSecundario onClick={() => setEditando(false)}>Cancelar</BotonSecundario>
                <Boton onClick={guardarEdicionYConfirmar} disabled={cargando} variant="green">
                  {cargando ? 'Guardando…' : 'Guardar y confirmar inscripción'}
                </Boton>
              </div>
            </div>
          </TarjetaMarca>
        </div>
      </div>
    );
  }

  // --- Wizard normal ---

  return (
    <div className="min-h-[70vh] bg-parchment px-5 py-14">
      <div className="mx-auto max-w-xl">
        <Encabezado etiqueta={`Inscripción · ${eventoActual.nombre}`} />

        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-ink/40">
          <span>Paso {paso} de {TOTAL_PASOS}</span>
          <span>{NOMBRES_PASOS[paso - 1]}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-ember transition-all duration-300"
            style={{ width: `${(paso / TOTAL_PASOS) * 100}%` }}
          />
        </div>

        <TarjetaMarca className="mt-8">
          {error && <p className="mb-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

          {paso === 1 && (
            <div className="space-y-4 text-center">
              <h2 className="font-display text-xl font-bold text-ink">Empecemos con tu DNI</h2>
              <label className="block">
                <input
                  type="text" inputMode="numeric" maxLength={13} value={form.dni}
                  onChange={(e) => actualizar('dni', e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && form.dni.length === 13 && !cargando) verificarDni();
                  }}
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-3 text-center font-display text-2xl tracking-widest text-ink transition focus:border-ember focus:outline-none focus:ring-4 focus:ring-ember/10"
                  placeholder="0801199012345"
                />
                <span className="mt-2 block text-center text-base font-semibold text-ink/50">
                  {form.dni.length}/13 dígitos
                </span>
              </label>
              <div className="flex justify-center pt-2">
                <Boton onClick={verificarDni} disabled={cargando}>{cargando ? 'Verificando…' : 'Continuar'}</Boton>
              </div>
              <p className="rounded-lg bg-[#1F3464]/5 px-3 py-2 text-xs text-ink/50">
                ¿Eres extranjero? Tu inscripción a este evento es de forma presencial.
              </p>
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-ink">Tus datos personales</h2>
              <Campo etiqueta="Nombre completo">
                <input type="text" value={form.nombre_completo} onChange={(e) => actualizar('nombre_completo', e.target.value)} className={claseInput} />
              </Campo>
              <Campo etiqueta="Fecha de nacimiento">
                <input type="date" min="1920-01-01" max={hoy} value={form.fecha_nacimiento} onChange={(e) => actualizar('fecha_nacimiento', e.target.value)} className={claseInput} />
              </Campo>
              <Campo etiqueta="Teléfono móvil (8 dígitos)">
                <input
                  type="tel" inputMode="numeric" maxLength={8} value={form.telefono_movil}
                  onChange={(e) => actualizar('telefono_movil', e.target.value.replace(/\D/g, ''))}
                  className={claseInput} placeholder="99999999"
                />
                <span className="mt-1 block text-xs text-ink/40">{form.telefono_movil.length}/8 dígitos</span>
              </Campo>
              <Campo etiqueta="Estado civil">
                <select value={form.estado_civil} onChange={(e) => actualizar('estado_civil', e.target.value)} className={claseInput}>
                  <option value="">Selecciona…</option>
                  {ESTADOS_CIVILES.map((e) => <option key={e}>{e}</option>)}
                </select>
              </Campo>
              <div className="flex justify-between pt-2">
                <BotonSecundario onClick={() => setPaso(1)}>Atrás</BotonSecundario>
                <Boton onClick={() => validarPaso2() ? setPaso(3) : setError('Completa todos los campos. El teléfono debe tener exactamente 8 dígitos.')}>Continuar</Boton>
              </div>
            </div>
          )}

          {paso === 3 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-ink">Ubicación</h2>
              <Campo etiqueta="Departamento">
                <select
                  value={form.departamento}
                  onChange={(e) => setForm((f) => ({ ...f, departamento: e.target.value, municipio: '' }))}
                  className={claseInput}
                >
                  <option value="">Selecciona…</option>
                  {DEPARTAMENTOS_HONDURAS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Municipio">
                <select value={form.municipio} onChange={(e) => actualizar('municipio', e.target.value)} disabled={!form.departamento} className={`${claseInput} disabled:bg-ink/5`}>
                  <option value="">{form.departamento ? 'Selecciona…' : 'Primero elige un departamento'}</option>
                  {municipiosDisponibles.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Capítulo">
                <input type="text" value={form.capitulo} onChange={(e) => actualizar('capitulo', e.target.value)} className={claseInput} placeholder="Nombre de tu capítulo" />
              </Campo>
              <Campo etiqueta="Zona">
                <select value={form.zona} onChange={(e) => actualizar('zona', e.target.value)} className={claseInput}>
                  <option value="">Selecciona…</option>
                  {ZONAS_FIHNEC.map((z) => <option key={z}>{z}</option>)}
                </select>
              </Campo>
              <div className="flex justify-between pt-2">
                <BotonSecundario onClick={() => setPaso(2)}>Atrás</BotonSecundario>
                <Boton onClick={() => validarPaso3() ? setPaso(4) : setError('Completa todos los campos.')}>Continuar</Boton>
              </div>
            </div>
          )}

          {paso === 4 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-ink">Datos FIHNEC</h2>
              <Campo etiqueta="Cargo en FIHNEC">
                <select value={form.cargo_fihnec} onChange={(e) => actualizar('cargo_fihnec', e.target.value)} className={claseInput}>
                  <option value="">Selecciona…</option>
                  {CARGOS_FIHNEC.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Campo>
              <CampoGrupo etiqueta="¿Ha recibido SAELES anteriormente?">
                <div className="flex gap-3">
                  <BotonSecundario
                    onClick={() => setForm((f) => ({ ...f, ha_recibido_saeles: true }))}
                    className={form.ha_recibido_saeles === true ? '!border-ember !text-ember' : ''}
                  >
                    Sí
                  </BotonSecundario>
                  <BotonSecundario
                    onClick={() => setForm((f) => ({ ...f, ha_recibido_saeles: false, veces_saeles_previas: '' }))}
                    className={form.ha_recibido_saeles === false ? '!border-ember !text-ember' : ''}
                  >
                    No
                  </BotonSecundario>
                </div>
              </CampoGrupo>
              {form.ha_recibido_saeles === true && (
                <Campo etiqueta="¿Cuántos, sin contar el de hoy?">
                  <input
                    type="number" min="0" max="99" value={form.veces_saeles_previas}
                    onChange={(e) => {
                      const val = e.target.value.slice(0, 2);
                      actualizar('veces_saeles_previas', val === '' ? '' : String(Math.min(Number(val), 99)));
                    }}
                    className={claseInput}
                  />
                  <p className="mt-1 text-xs text-ink/40">Máximo 99</p>
                </Campo>
              )}
              <div className="flex justify-between pt-2">
                <BotonSecundario onClick={() => setPaso(3)}>Atrás</BotonSecundario>
                <Boton onClick={() => validarPaso4() ? setPaso(5) : setError('Completa todos los campos.')}>Continuar</Boton>
              </div>
            </div>
          )}

          {paso === 5 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-ink">Contacto de emergencia</h2>
              <Campo etiqueta="Nombre completo">
                <input type="text" value={form.contacto_emergencia_nombre} onChange={(e) => actualizar('contacto_emergencia_nombre', e.target.value)} className={claseInput} />
              </Campo>
              <Campo etiqueta="Número de teléfono (8 dígitos)">
                <input
                  type="tel" inputMode="numeric" maxLength={8} value={form.contacto_emergencia_telefono}
                  onChange={(e) => actualizar('contacto_emergencia_telefono', e.target.value.replace(/\D/g, ''))}
                  className={claseInput} placeholder="99999999"
                />
                <span className="mt-1 block text-xs text-ink/40">{form.contacto_emergencia_telefono.length}/8 dígitos</span>
              </Campo>
              <div className="flex justify-between pt-2">
                <BotonSecundario onClick={() => setPaso(4)}>Atrás</BotonSecundario>
                <Boton onClick={() => validarPaso5() ? setPaso(6) : setError('Completa todos los campos. El teléfono debe tener exactamente 8 dígitos.')}>Continuar</Boton>
              </div>
            </div>
          )}

          {paso === 6 && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-ink">Revisa tus datos</h2>
              <dl className="divide-y divide-ink/10 text-sm">
                {[
                  ['DNI', form.dni],
                  ['Nombre', form.nombre_completo],
                  ['Fecha de nacimiento', form.fecha_nacimiento],
                  ['Teléfono', form.telefono_movil],
                  ['Estado civil', form.estado_civil],
                  ['Departamento / Municipio', `${form.departamento} / ${form.municipio}`],
                  ['Capítulo', form.capitulo || '—'],
                  ['Zona', form.zona],
                  ['Cargo en FIHNEC', form.cargo_fihnec],
                  ['¿Ha recibido SAELES?', form.ha_recibido_saeles ? `Sí (${form.veces_saeles_previas})` : 'No'],
                  ['Contacto de emergencia', `${form.contacto_emergencia_nombre} · ${form.contacto_emergencia_telefono}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2">
                    <dt className="text-ink/50">{k}</dt>
                    <dd className="text-right font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex justify-between pt-2">
                <BotonSecundario onClick={() => setPaso(5)}>Atrás</BotonSecundario>
                <Boton onClick={enviarRegistroCompleto} disabled={cargando}>
                  {cargando ? 'Enviando…' : 'Confirmar inscripción'}
                </Boton>
              </div>
            </div>
          )}
        </TarjetaMarca>
      </div>
    </div>
  );
}

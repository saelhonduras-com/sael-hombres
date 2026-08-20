import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { mensajeError } from '../api';
import {
  DEPARTAMENTOS_HONDURAS, MUNICIPIOS_POR_DEPARTAMENTO,
  ZONAS_FIHNEC, CARGOS_FIHNEC, ESTADOS_CIVILES,
} from '../listas';

const TOTAL_PASOS = 6;

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
    red: 'bg-ember hover:bg-ember-light',
    green: 'bg-[#007334] hover:bg-[#005c29]',
    blue: 'bg-[#1F3464] hover:opacity-90',
  };
  return (
    <button
      {...props}
      className={`rounded-full px-6 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${colores[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function BotonSecundario({ children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`rounded-full border border-ink/20 px-6 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-ink/5 ${className}`}
    >
      {children}
    </button>
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

const claseInput = 'w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm focus:border-ember focus:outline-none';

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

  useEffect(() => {
    api.get('/eventos').then((r) => setEventos(r.data)).catch(() => setError('No se pudo cargar la información del evento.'));
  }, []);

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
    return <div className="flex min-h-[60vh] items-center justify-center bg-parchment"><p className="text-ink/40">Cargando…</p></div>;
  }

  if (!eventoActual) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">No hay registro abierto</h1>
          <p className="mt-2 text-ink/50">Todavía no hay un encuentro SAEL con inscripción activa. Vuelve pronto.</p>
        </div>
      </div>
    );
  }

  if (inscripcionCompleta) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5 text-center">
        <div>
          <span className="text-5xl">✅</span>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">{mensajeExito}</h1>
          <p className="mt-2 text-lg font-semibold text-ink">{nombreInscrito}</p>
          <p className="mt-2 text-ink/60">Quedaste registrado en <strong>{eventoActual.nombre}</strong>. Nos vemos ahí.</p>
          <p className="mt-6 text-xs text-ink/40">Te llevaremos al inicio en unos segundos…</p>
          <button onClick={() => navigate('/')} className="mt-2 text-sm font-semibold text-ember hover:underline">
            Ir al inicio ahora
          </button>
        </div>
      </div>
    );
  }

  if (participanteExistente && !editando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5 text-center">
        <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
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
            <Boton onClick={abrirEdicion} variant="blue" className="w-full">
              Actualizar información
            </Boton>
            <Boton onClick={() => { setParticipanteExistente(null); setForm(vacio); }} variant="red" className="w-full">
              Cancelar
            </Boton>
          </div>
        </div>
      </div>
    );
  }

  if (participanteExistente && editando && formEdicion) {
    return (
      <div className="min-h-[70vh] bg-parchment px-5 py-14">
        <div className="mx-auto max-w-xl">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-ember">
            Actualiza tus datos · {eventoActual.nombre}
          </p>
          <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
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
                <Boton onClick={() => setEditando(false)} variant="red">Cancelar</Boton>
                <Boton onClick={guardarEdicionYConfirmar} disabled={cargando} variant="green">
                  {cargando ? 'Guardando…' : 'Guardar y confirmar inscripción'}
                </Boton>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Wizard normal ---

  return (
    <div className="min-h-[70vh] bg-parchment px-5 py-14">
      <div className="mx-auto max-w-xl">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-ember">
          Inscripción · {eventoActual.nombre}
        </p>
        <div className="mt-3 flex justify-center gap-1.5">
          {Array.from({ length: TOTAL_PASOS }).map((_, i) => (
            <span key={i} className={`h-1.5 w-8 rounded-full ${i + 1 <= paso ? 'bg-ember' : 'bg-ink/10'}`} />
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
          {error && <p className="mb-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

          {paso === 1 && (
            <div className="space-y-4 text-center">
              <h2 className="font-display text-xl font-bold text-ink">Empecemos con tu DNI</h2>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink/70">Número de DNI (13 dígitos)</span>
                <input
                  type="text" inputMode="numeric" maxLength={13} value={form.dni}
                  onChange={(e) => actualizar('dni', e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && form.dni.length === 13 && !cargando) verificarDni();
                  }}
                  className="w-full rounded-lg border border-ink/15 px-3 py-3 text-center font-display text-2xl tracking-widest focus:border-ember focus:outline-none"
                  placeholder="0801199012345"
                />
                <span className="mt-1 block text-center text-xs text-ink/40">
                  {form.dni.length}/13 dígitos
                </span>
              </label>
              <div className="flex justify-center pt-2">
                <Boton onClick={verificarDni} disabled={cargando}>{cargando ? 'Verificando…' : 'Continuar'}</Boton>
              </div>
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
              <Campo etiqueta="¿Ha recibido SAELES anteriormente?">
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
              </Campo>
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
        </div>
      </div>
    </div>
  );
}

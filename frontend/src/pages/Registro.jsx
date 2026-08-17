import { useEffect, useState } from 'react';
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

function Boton({ children, ...props }) {
  return (
    <button
      {...props}
      className="rounded-full bg-ember px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-light disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function BotonSecundario({ children, ...props }) {
  return (
    <button
      {...props}
      className="rounded-full border border-ink/20 px-6 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
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
  const [eventos, setEventos] = useState(null);
  const [paso, setPaso] = useState(1);
  const [form, setForm] = useState(vacio);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [participanteExistente, setParticipanteExistente] = useState(null); // { id, nombre_completo } | null
  const [inscripcionCompleta, setInscripcionCompleta] = useState(false);

  useEffect(() => {
    api.get('/eventos').then((r) => setEventos(r.data)).catch(() => setError('No se pudo cargar la información del evento.'));
  }, []);

  const eventoActual = eventos?.find((ev) => ev.es_actual) || eventos?.find((ev) => ev.abierto) || null;

  const municipiosDisponibles = form.departamento ? (MUNICIPIOS_POR_DEPARTAMENTO[form.departamento] || []) : [];

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

  async function confirmarInscripcionExistente() {
    setCargando(true);
    setError('');
    try {
      await api.post('/inscripciones', { participante_id: participanteExistente.id, evento_id: eventoActual.id });
      setInscripcionCompleta(true);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  function validarPaso2() {
    return form.nombre_completo && form.fecha_nacimiento && form.telefono_movil && form.estado_civil;
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
    return form.contacto_emergencia_nombre && form.contacto_emergencia_telefono;
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
      await api.post('/inscripciones', { participante_id: nuevo.id, evento_id: eventoActual.id });
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
          <h1 className="mt-4 font-display text-2xl font-bold text-ink">¡Inscripción completada!</h1>
          <p className="mt-2 text-ink/60">Quedaste registrado en <strong>{eventoActual.nombre}</strong>. Nos vemos ahí.</p>
        </div>
      </div>
    );
  }

  if (participanteExistente) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5 text-center">
        <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
          <p className="text-sm text-ink/50">Ya tenemos tus datos registrados</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">{participanteExistente.nombre_completo}</h1>
          <p className="mt-4 text-sm text-ink/60">
            ¿Confirmamos tu inscripción a <strong>{eventoActual.nombre}</strong>?
          </p>
          {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}
          <div className="mt-6 flex justify-center gap-3">
            <BotonSecundario onClick={() => { setParticipanteExistente(null); setForm(vacio); }}>
              No soy yo
            </BotonSecundario>
            <Boton onClick={confirmarInscripcionExistente} disabled={cargando}>
              {cargando ? 'Confirmando…' : 'Confirmar inscripción'}
            </Boton>
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
            <div className="space-y-4">
              <h2 className="font-display text-xl font-bold text-ink">Empecemos con tu DNI</h2>
              <Campo etiqueta="Número de DNI (13 dígitos)">
                <input
                  type="text" inputMode="numeric" maxLength={13} value={form.dni}
                  onChange={(e) => actualizar('dni', e.target.value.replace(/\D/g, ''))}
                  className={claseInput} placeholder="0801199012345"
                />
              </Campo>
              <div className="flex justify-end">
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
                <input type="date" value={form.fecha_nacimiento} onChange={(e) => actualizar('fecha_nacimiento', e.target.value)} className={claseInput} />
              </Campo>
              <Campo etiqueta="Teléfono móvil">
                <input type="tel" value={form.telefono_movil} onChange={(e) => actualizar('telefono_movil', e.target.value)} className={claseInput} placeholder="9999-9999" />
              </Campo>
              <Campo etiqueta="Estado civil">
                <select value={form.estado_civil} onChange={(e) => actualizar('estado_civil', e.target.value)} className={claseInput}>
                  <option value="">Selecciona…</option>
                  {ESTADOS_CIVILES.map((e) => <option key={e}>{e}</option>)}
                </select>
              </Campo>
              <div className="flex justify-between pt-2">
                <BotonSecundario onClick={() => setPaso(1)}>Atrás</BotonSecundario>
                <Boton onClick={() => validarPaso2() ? setPaso(3) : setError('Completa todos los campos.')}>Continuar</Boton>
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
                    type="number" min="0" value={form.veces_saeles_previas}
                    onChange={(e) => actualizar('veces_saeles_previas', e.target.value)}
                    className={claseInput}
                  />
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
              <Campo etiqueta="Número de teléfono">
                <input type="tel" value={form.contacto_emergencia_telefono} onChange={(e) => actualizar('contacto_emergencia_telefono', e.target.value)} className={claseInput} placeholder="9999-9999" />
              </Campo>
              <div className="flex justify-between pt-2">
                <BotonSecundario onClick={() => setPaso(4)}>Atrás</BotonSecundario>
                <Boton onClick={() => validarPaso5() ? setPaso(6) : setError('Completa todos los campos.')}>Continuar</Boton>
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

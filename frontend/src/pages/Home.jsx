import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import Contador from '../components/Contador';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatearRango(inicio, fin) {
  const fi = new Date(inicio);
  const ff = new Date(fin);
  const mismomes = fi.getMonth() === ff.getMonth();
  const diaIni = fi.getDate();
  const diaFin = ff.getDate();
  const mesFin = MESES[ff.getMonth()];
  const anio = ff.getFullYear();
  return mismomes
    ? `${diaIni} al ${diaFin} de ${mesFin}, ${anio}`
    : `${diaIni} de ${MESES[fi.getMonth()]} al ${diaFin} de ${mesFin}, ${anio}`;
}

export default function Home() {
  const [eventos, setEventos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/eventos')
      .then((r) => setEventos(r.data))
      .catch(() => setError('No se pudo cargar la información de los encuentros. Intenta recargar la página.'));
  }, []);

  const eventoActual = eventos?.find((ev) => ev.es_actual) || eventos?.find((ev) => ev.abierto) || null;
  const hayEventos = eventos && eventos.length > 0;

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-night grain-overlay">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-flame/25 blur-3xl" />
        <div className="mx-auto max-w-5xl px-5 pb-20 pt-16 text-center">
          <p className="mb-4 inline-block rounded-full border border-gold/30 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-flame">
            FIHNEC · Fraternidad Internacional de Hombres de Negocios del Evangelio Completo
          </p>
          <h1 className="font-display text-4xl font-bold text-parchment sm:text-6xl">
            Seminario Avanzado de <span className="text-gold-light">Entrenamiento de Líderes</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-parchment/70">
            Un encuentro personal, mes a mes, donde hombres, mujeres y jóvenes se acercan al propósito
            que Dios tiene para sus vidas. Once encuentros al año, tres días cada uno.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/registro"
              className="rounded-full bg-gold px-7 py-3 font-semibold text-night shadow-lg shadow-gold/20 transition hover:bg-gold-light"
            >
              Inscríbete aquí
            </Link>
          </div>

          {eventoActual?.fecha_limite_registro && (
            <Contador
              fechaObjetivo={eventoActual.fecha_limite_registro}
              etiqueta={`Cierre de inscripción · ${eventoActual.nombre}`}
            />
          )}
        </div>
      </section>

      {/* PRÓXIMO ENCUENTRO */}
      <section className="mx-auto max-w-2xl px-5 py-16">
        <h2 className="text-center font-display text-3xl font-bold text-ink sm:text-4xl">Próximo encuentro SAEL</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-ink/60">
          Cada mes es una puerta nueva. No necesitas haber asistido antes para inscribirte.
        </p>

        {error && <p className="mt-8 rounded-lg bg-ember/10 p-4 text-center text-ember">{error}</p>}

        {eventos === null && !error && (
          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-ink/50">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/15 border-t-ember" />
            Cargando…
          </div>
        )}

        {eventos !== null && !hayEventos && (
          <div className="mt-10 rounded-2xl border border-dashed border-ink/15 bg-parchment-2 p-10 text-center">
            <p className="font-semibold text-ink">Todavía no hay ningún encuentro programado.</p>
            <p className="mt-1 text-sm text-ink/50">Vuelve pronto — el próximo SAEL se anunciará aquí.</p>
          </div>
        )}

        {eventoActual && (
          <div className="mt-10 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
            <div className="flex h-1.5">
              <span className="flex-1 bg-ember" />
              <span className="flex-1 bg-gold" />
              <span className="flex-1 bg-[#007334]" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 p-8">
              <div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${eventoActual.abierto ? 'bg-flame/10 text-flame' : 'bg-ink/5 text-ink/40'}`}>
                  {eventoActual.abierto ? 'Registro abierto' : 'Registro cerrado'}
                </span>
                <h3 className="mt-2 font-display text-2xl font-bold text-ink">{eventoActual.nombre}</h3>
                <p className="mt-1 text-ink/60">{formatearRango(eventoActual.fecha_inicio, eventoActual.fecha_fin)}</p>
                {eventoActual.abierto && eventoActual.fecha_limite_registro && (
                  <p className="mt-2 text-xs text-ink/40">
                    Inscripción cierra el {new Date(eventoActual.fecha_limite_registro).toLocaleDateString('es-HN', { day: 'numeric', month: 'long' })}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 text-sm text-ink/50 sm:border-l sm:border-ink/10 sm:pl-6">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ember">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <p>
                  Te esperamos en el<br />
                  <span className="font-semibold text-ink">CNC de Siguatepeque</span><br />
                  Honduras C.A.
                </p>
              </div>

              <Link
                to="/registro"
                className={`rounded-full px-6 py-2.5 text-sm font-semibold transition ${
                  eventoActual.abierto
                    ? 'bg-ember text-white shadow-sm shadow-ember/20 hover:bg-ember-light hover:-translate-y-0.5'
                    : 'cursor-not-allowed bg-ink/10 text-ink/40 pointer-events-none'
                }`}
              >
                Inscribirme
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="bg-parchment-2 py-16">
        <div className="mx-auto max-w-4xl px-5">
          <h2 className="text-center font-display text-2xl font-bold text-ink sm:text-3xl">¿Cómo funciona el registro?</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            <div>
              <p className="font-display text-3xl font-bold text-flame">1</p>
              <p className="mt-2 font-semibold text-ink">Completa tu registro</p>
              <p className="mt-1 text-sm text-ink/60">Ingresa tu DNI y tus datos personales. Solo lo haces una vez.</p>
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-flame">2</p>
              <p className="mt-2 font-semibold text-ink">¿Ya te registraste antes?</p>
              <p className="mt-1 text-sm text-ink/60">Con solo tu DNI, el sistema reconoce tus datos automáticamente.</p>
            </div>
            <div>
              <p className="font-display text-3xl font-bold text-flame">3</p>
              <p className="mt-2 font-semibold text-ink">Preséntate el fin de semana</p>
              <p className="mt-1 text-sm text-ink/60">El encuentro inicia el viernes y concluye el domingo.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../api';
import Contador from '../components/Contador';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Trabaja directo con el texto "YYYY-MM-DD" (o el inicio de un ISO más
// largo) — nunca crea un objeto Date a partir de una fecha-sin-hora,
// porque eso la interpreta como medianoche UTC y, al mostrarla en hora
// Honduras (UTC-6), la corre un día hacia atrás.
function partesFecha(fechaISO) {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number);
  return { anio, mes, dia };
}

function formatearRango(inicio, fin) {
  const fi = partesFecha(inicio);
  const ff = partesFecha(fin);
  const mismomes = fi.mes === ff.mes && fi.anio === ff.anio;
  return mismomes
    ? `${fi.dia} al ${ff.dia} de ${MESES[ff.mes - 1]}, ${ff.anio}`
    : `${fi.dia} de ${MESES[fi.mes - 1]} al ${ff.dia} de ${MESES[ff.mes - 1]}, ${ff.anio}`;
}

// Igual criterio para fechas sueltas, ej. la de cierre de inscripción.
function formatearFechaLarga(fechaISO) {
  const { anio, mes, dia } = partesFecha(fechaISO);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

// "18:00" (24h, como se guarda) → "6:00 p. m." (12h, estilo RAE — igual
// al que ya usa el SFL en su formulario de inscripción público).
function formatearHoraEs(horaHHMM) {
  if (!horaHHMM) return null;
  const [h, m] = horaHHMM.split(':').map(Number);
  const meridiano = h >= 12 ? 'p. m.' : 'a. m.';
  let hora12 = h % 12;
  if (hora12 === 0) hora12 = 12;
  return `${hora12}:${String(m).padStart(2, '0')} ${meridiano}`;
}

// Íconos en línea (mismo estilo trazo que ya usa el pin de ubicación en
// este archivo) — sin depender de ninguna librería nueva.
const ICONOS_PASOS = {
  registro: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c0-1.7 1.3-3 3-3s3 1.3 3 3" />
      <path d="M14 9h4M14 13h4" />
    </svg>
  ),
  buscar: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </svg>
  ),
  equipaje: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M4 13h16" />
    </svg>
  ),
};

const ICONOS_CHECKLIST = {
  id: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c0-1.7 1.3-3 3-3s3 1.3 3 3" />
      <path d="M14 9h4M14 13h4" />
    </svg>
  ),
  gota: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12Z" />
    </svg>
  ),
  cama: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6" />
      <path d="M3 18v2M21 18v2" />
      <path d="M3 12V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  ropa: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4 12 6 15 4l4 3-2 3-2-1v10H9V9l-2 1-2-3 4-3Z" />
    </svg>
  ),
  salud: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M12 10v6M9 13h6" />
    </svg>
  ),
  extras: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  ),
};

const CHECKLIST = [
  { titulo: 'Esenciales', detalle: 'Identificación (DNI).', color: 'ember', icono: 'id' },
  { titulo: 'Higiene personal', detalle: 'Jabón, cepillo, pasta de dientes, desodorante, champú y toalla.', color: 'gold', icono: 'gota' },
  { titulo: 'Dormitorio', detalle: 'Ropa de cama, colcha/cobija, almohada y lo que necesites para dormir cómodo.', color: 'verde', icono: 'cama' },
  { titulo: 'Ropa y calzado', detalle: 'Ropa suficiente para los 3 días, abrigo (para la noche/frío) y calzado cómodo.', color: 'ember', icono: 'ropa' },
  { titulo: 'Salud y cuidado', detalle: 'Medicamentos personales, botiquín básico y repelente de insectos.', color: 'gold', icono: 'salud' },
  { titulo: 'Extras', detalle: 'Cualquier otro artículo personal que consideres necesario para tu comodidad.', color: 'verde', icono: 'extras' },
];

const CLASE_BORDE = { ember: 'border-t-ember', gold: 'border-t-gold', verde: 'border-t-[#007334]' };
const CLASE_TEXTO = { ember: 'text-ember', gold: 'text-gold-light', verde: 'text-[#007334]' };

export default function Home() {
  const [eventos, setEventos] = useState(null);
  const [error, setError] = useState('');
  const location = useLocation();

  useEffect(() => {
    api.get('/eventos')
      .then((r) => setEventos(r.data))
      .catch(() => setError('No se pudo cargar la información de los encuentros. Intenta recargar la página.'));
  }, []);

  // React Router no hace scroll automático al llegar con un hash en la
  // URL (ej. viniendo de Registro.jsx con Link to="/#reserva-habitaciones").
  // Se espera a que el contenido (y la sección con eventoActual) ya esté
  // en el DOM antes de buscar el elemento, si no el scroll llega tarde.
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const intentar = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      const temporizador = setTimeout(intentar, 300);
      return () => clearTimeout(temporizador);
    }
  }, [location, eventos]);

  const eventoActual = eventos?.find((ev) => ev.es_actual) || eventos?.find((ev) => ev.abierto) || null;
  const hayEventos = eventos && eventos.length > 0;

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-night grain-overlay">
        {/* Foto de fondo, usada como marca de agua — duotono navy/dorado
            (foto en escala de grises + degradado con mix-blend-mode) en
            vez de un color plano encima, más moderno y fiel a la marca.
            Archivo: frontend/public/images/hero-manos.jpg */}
        <img
          src="/images/hero-manos.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[center_38%] grayscale"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-night to-gold mix-blend-color" />
        <div className="absolute inset-0 bg-night/60" />
        {/* Resplandor sobre el sol de la foto — la luz que sobresale del
            resto, con intención (Jesucristo como la luz). Va encima de la
            capa oscura, con mix-blend-screen, para que sí se note brillar. */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,theme(colors.gold-light)_0%,transparent_32%)] opacity-70 mix-blend-screen" />

        <div className="relative mx-auto max-w-5xl px-5 pb-20 pt-16 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-gold-light [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
            FIHNEC
          </p>
          <p className="mb-4 mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-parchment/70 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
            Fraternidad Internacional de Hombres de Negocios del Evangelio Completo
          </p>
          <h1 className="font-display text-4xl font-bold text-parchment [text-shadow:0_2px_16px_rgba(0,0,0,0.65)] sm:text-6xl">
            Seminario Avanzado de <span className="text-gold-light">Entrenamiento de Líderes</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-parchment/70 [text-shadow:0_1px_10px_rgba(0,0,0,0.5)]">
            Un encuentro personal, mes a mes, donde hombres, mujeres y jóvenes se acercan al propósito
            que Dios tiene para sus vidas. Once encuentros al año, tres días cada uno.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/registro"
              className="rounded-full bg-ember px-7 py-3 font-semibold text-white shadow-lg shadow-ember/30 transition hover:bg-ember-light hover:-translate-y-0.5"
            >
              Inscríbete aquí
            </Link>
          </div>

          {eventoActual?.fecha_limite_registro && (
            <Contador
              fechaObjetivo={eventoActual.fecha_limite_registro}
              horaObjetivo={eventoActual.hora_limite_registro}
              etiqueta={`Cierre de inscripción · ${eventoActual.nombre}`}
            />
          )}

          <div className="mt-4">
            <a
              href="#reserva-habitaciones"
              className="text-sm font-semibold text-gold-light underline decoration-gold-light/40 underline-offset-4 transition hover:decoration-gold-light [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]"
            >
              Reserva de Habitaciones
            </a>
          </div>
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
            <div className="flex flex-wrap items-center justify-center gap-8 p-8 text-center">
              <div className="text-center">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${eventoActual.abierto ? 'bg-flame/10 text-flame' : 'bg-ink/5 text-ink/40'}`}>
                  {eventoActual.abierto ? 'Registro abierto' : 'Registro cerrado'}
                </span>
                <h3 className="mt-2 font-display text-2xl font-bold text-ink">{eventoActual.nombre}</h3>
                <p className="mt-1 text-ink/60">{formatearRango(eventoActual.fecha_inicio, eventoActual.fecha_fin)}</p>
                {eventoActual.abierto && eventoActual.fecha_limite_registro && (
                  <p className="mt-2 text-sm font-semibold text-ink/70">
                    ⏰ Inscripciones hasta el {formatearFechaLarga(eventoActual.fecha_limite_registro)}
                    {eventoActual.hora_limite_registro && `, ${formatearHoraEs(eventoActual.hora_limite_registro)}`}
                  </p>
                )}
              </div>

              <a
                href="https://share.google/cObiGEoP7GCJc6u2n"
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-xl px-2 py-1 text-sm text-ink/50 transition hover:bg-ember/5"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ember">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <p className="text-left">
                  Te esperamos en el<br />
                  <span className="font-semibold text-ink underline decoration-ember/0 decoration-2 underline-offset-2 transition group-hover:decoration-ember/60">CNC de Siguatepeque</span><br />
                  Honduras C.A.
                </p>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ember opacity-0 transition group-hover:opacity-100">
                  <path d="M7 17 17 7M8 7h9v9" />
                </svg>
              </a>

              <div className="self-stretch sm:border-l sm:border-ink/10 sm:pl-8">
                <div className="flex h-full items-center">
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
              <div className="text-flame">{ICONOS_PASOS.registro}</div>
              <p className="mt-3 font-semibold text-ink">Completa tu registro</p>
              <p className="mt-1 text-sm text-ink/60">Ingresa tu DNI y tus datos personales. Solo lo haces una vez.</p>
            </div>
            <div>
              <div className="text-flame">{ICONOS_PASOS.buscar}</div>
              <p className="mt-3 font-semibold text-ink">¿Ya te registraste antes?</p>
              <p className="mt-1 text-sm text-ink/60">Con solo tu DNI, el sistema reconoce tus datos automáticamente.</p>
            </div>
            <div>
              <div className="text-flame">{ICONOS_PASOS.equipaje}</div>
              <p className="mt-3 font-semibold text-ink">Prepara tu equipaje</p>
              <p className="mt-1 text-sm text-ink/60">Revisa el checklist antes de venir para que estés 100% preparado.</p>
            </div>
          </div>

          {/* Franja tricolor, mismo patrón que ya usa la tarjeta de "Próximo encuentro" */}
          <div className="mx-auto mt-12 flex h-1.5 max-w-md overflow-hidden rounded-full">
            <span className="flex-1 bg-ember" />
            <span className="flex-1 bg-gold" />
            <span className="flex-1 bg-[#007334]" />
          </div>

          <p className="mt-8 text-center font-display text-xl font-bold text-ink">📢 Recordatorio importante</p>
          <p className="mx-auto mt-1 max-w-md text-center text-sm text-ink/60">
            Se vienen 3 días increíbles del SAEL. Debe traer consigo su equipaje completo y artículos de
            uso personal para su estancia; queremos que esté 100% preparado y cómodo.
          </p>

          <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
            {CHECKLIST.map((item) => (
              <div key={item.titulo} className={`rounded-xl border-t-[3px] bg-white p-4 shadow-sm ${CLASE_BORDE[item.color]}`}>
                <div className={CLASE_TEXTO[item.color]}>{ICONOS_CHECKLIST[item.icono]}</div>
                <p className={`mt-2 text-sm font-semibold ${CLASE_TEXTO[item.color]}`}>{item.titulo}</p>
                <p className="mt-1 text-sm text-ink/60">{item.detalle}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-base font-bold text-ink">¡Revisa tu equipaje antes de salir y nos vemos pronto! 🚀🔥</p>
        </div>
      </section>

      {/* RESERVA DE HABITACIONES — mismo patrón que la tarjeta de "Próximo
          encuentro": franja tricolor, bloques centrados con divisor, botón. */}
      <section id="reserva-habitaciones" className="mx-auto max-w-2xl px-5 py-16">
        <h2 className="text-center font-display text-3xl font-bold text-ink sm:text-4xl">Reserva de Habitaciones</h2>

        <div className="mt-10 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <div className="flex h-1.5">
            <span className="flex-1 bg-ember" />
            <span className="flex-1 bg-gold" />
            <span className="flex-1 bg-[#007334]" />
          </div>
          <div className="p-8 text-center">
            <h3 className="font-display text-2xl font-bold text-ink">Pregunta por la Disponibilidad</h3>

            <div className="mx-auto mt-4 max-w-md space-y-3 text-left">
              <div className="flex items-start gap-2 text-sm text-ink/70">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-ember">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
                <div className="grid grid-cols-[max-content_1fr] gap-x-1">
                  <span className="font-semibold text-ink">Fechas de reserva:</span>
                  <span>Únicamente el primer lunes de cada mes (posterior al SAEL recién finalizado).</span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-sm text-ink/70">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-gold-light">
                  <circle cx="12" cy="12" r="9" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <div className="grid grid-cols-[max-content_1fr] gap-x-1">
                  <span className="font-semibold text-ink">Disponibilidad:</span>
                  <span>Todas las reservas están sujetas a previa confirmación de disponibilidad.</span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-sm text-ink/70">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-[#007334]">
                  <rect x="2" y="6" width="20" height="13" rx="2" />
                  <path d="M2 10h20" />
                </svg>
                <div className="grid grid-cols-[max-content_1fr] gap-x-1">
                  <span className="font-semibold text-ink">Método de pago:</span>
                  <span>Una vez confirmada tu disponibilidad, realiza la transferencia a cualquiera de nuestras cuentas:</span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-sm text-ink/70">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-ink/40">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
                <div className="grid grid-cols-[max-content_1fr] gap-x-1">
                  <span className="font-semibold text-ink">BAC:</span>
                  <span>Cuenta de Cheques #100 36 4301</span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-sm text-ink/70">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-ink/40">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
                <div className="grid grid-cols-[max-content_1fr] gap-x-1">
                  <span className="font-semibold text-ink">Banco de Occidente:</span>
                  <span>FIHNEC Proyecto Especial, Cuenta de Cheques #11-402-013195-6</span>
                </div>
              </div>
            </div>

            <a
              href="https://wa.me/50495725163?text=Hola%2C%20quisiera%20consultar%20sobre%20reservaci%C3%B3n%20de%20habitaci%C3%B3n%20para%20SAEL"
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-block rounded-full bg-[#25D366] px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#25D366]/30 transition hover:bg-[#20bd5a] hover:-translate-y-0.5"
            >
              Escríbenos por WhatsApp
            </a>
            <p className="mt-2 text-sm font-semibold text-ember/75">No se reciben llamadas, ni audios, solo mensajes escritos.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

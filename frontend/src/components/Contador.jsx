import { useEffect, useState } from 'react';

// Igual criterio que ya usa el backend (POST /inscripciones): hora
// Honduras real, vía offset -06:00 explícito. Se lee el texto de la
// fecha directo, SIN pasar por new Date(fechaObjetivo) primero — ese
// paso de más es justo lo que causaba que se corriera un día (mismo bug
// ya corregido en Home.jsx y Registro.jsx).
function calcularRestante(fechaObjetivo, horaObjetivo) {
  const fechaStr = fechaObjetivo.slice(0, 10);
  const horaStr = horaObjetivo || '23:59';
  const limite = new Date(`${fechaStr}T${horaStr}:00.000-06:00`);
  const diff = limite.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    dias: Math.floor(diff / (1000 * 60 * 60 * 24)),
    horas: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutos: Math.floor((diff / (1000 * 60)) % 60),
  };
}

export default function Contador({ fechaObjetivo, horaObjetivo, etiqueta }) {
  const [restante, setRestante] = useState(() => calcularRestante(fechaObjetivo, horaObjetivo));

  useEffect(() => {
    const intervalo = setInterval(() => setRestante(calcularRestante(fechaObjetivo, horaObjetivo)), 60000);
    return () => clearInterval(intervalo);
  }, [fechaObjetivo, horaObjetivo]);

  if (!restante) return null;

  return (
    <div className="mt-10 inline-flex flex-col items-center gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-parchment/60 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">{etiqueta}</p>
      <div className="flex gap-4">
        {[
          { valor: restante.dias, texto: 'días' },
          { valor: restante.horas, texto: 'horas' },
          { valor: restante.minutos, texto: 'min' },
        ].map((u) => (
          <div key={u.texto} className="flex flex-col items-center rounded-xl border border-gold/25 bg-night-2/70 px-4 py-2 shadow-sm backdrop-blur-sm">
            <span className="font-display text-2xl font-bold text-gold-light [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">{String(u.valor).padStart(2, '0')}</span>
            <span className="text-[10px] uppercase tracking-wide text-parchment/50">{u.texto}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

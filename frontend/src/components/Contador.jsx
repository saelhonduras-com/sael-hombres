import { useEffect, useState } from 'react';

function calcularRestante(fechaObjetivo) {
  const diff = new Date(fechaObjetivo).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    dias: Math.floor(diff / (1000 * 60 * 60 * 24)),
    horas: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutos: Math.floor((diff / (1000 * 60)) % 60),
  };
}

export default function Contador({ fechaObjetivo, etiqueta }) {
  const [restante, setRestante] = useState(() => calcularRestante(fechaObjetivo));

  useEffect(() => {
    const intervalo = setInterval(() => setRestante(calcularRestante(fechaObjetivo)), 60000);
    return () => clearInterval(intervalo);
  }, [fechaObjetivo]);

  if (!restante) return null;

  return (
    <div className="mt-10 inline-flex flex-col items-center gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-parchment/60">{etiqueta}</p>
      <div className="flex gap-4">
        {[
          { valor: restante.dias, texto: 'días' },
          { valor: restante.horas, texto: 'horas' },
          { valor: restante.minutos, texto: 'min' },
        ].map((u) => (
          <div key={u.texto} className="flex flex-col items-center rounded-xl border border-flame/30 bg-night-2 px-4 py-2">
            <span className="font-display text-2xl font-bold text-gold-light">{String(u.valor).padStart(2, '0')}</span>
            <span className="text-[10px] uppercase tracking-wide text-parchment/50">{u.texto}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

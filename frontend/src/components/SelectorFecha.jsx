import { useEffect, useState } from 'react';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function diasDelMes(mes, anio) {
  // Con mes 1-12; si todavía no hay año se asume uno bisiesto para no
  // bloquear el 29 de febrero antes de que elijan el año.
  return new Date(anio || 2000, mes, 0).getDate();
}

function partes(valor) {
  if (!valor) return { dia: '', mes: '', anio: '' };
  const [a, m, d] = valor.slice(0, 10).split('-');
  return { dia: String(Number(d)), mes: String(Number(m)), anio: a };
}

// Selector de fecha con tres listas (día / mes / año) — pensado para el
// celular, donde el calendario nativo (<input type="date">) confunde y
// termina cambiando las fechas. Entrega "YYYY-MM-DD", o '' mientras la
// fecha esté incompleta o no exista (ej. 31 de febrero).
// Los años van del actual hacia atrás `aniosAtras` años.
export default function SelectorFecha({ value, onChange, className = '', aniosAtras = 100 }) {
  const [sel, setSel] = useState(() => partes(value));

  // Si desde afuera cambian la fecha (ej. se abre otro participante), se
  // re-sincroniza — pero sin pisar una selección a medias.
  useEffect(() => {
    if (value && value.slice(0, 10) !== emitida(sel)) setSel(partes(value));
    if (!value && emitida(sel)) setSel({ dia: '', mes: '', anio: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emitida(s) {
    if (!s.dia || !s.mes || !s.anio) return '';
    if (Number(s.dia) > diasDelMes(Number(s.mes), Number(s.anio))) return '';
    return `${s.anio}-${String(s.mes).padStart(2, '0')}-${String(s.dia).padStart(2, '0')}`;
  }

  function cambiar(campo, valorNuevo) {
    const siguiente = { ...sel, [campo]: valorNuevo };
    setSel(siguiente);
    onChange(emitida(siguiente));
  }

  const anioActual = new Date().getFullYear();
  const anios = [];
  for (let a = anioActual; a >= anioActual - aniosAtras; a -= 1) anios.push(a);
  // Si la fecha ya guardada cae fuera del rango, se conserva como opción
  // para no perderla al editar.
  if (sel.anio && !anios.includes(Number(sel.anio))) anios.push(Number(sel.anio));

  const maxDias = sel.mes ? diasDelMes(Number(sel.mes), Number(sel.anio)) : 31;
  const fechaInexistente = sel.dia && sel.mes && sel.anio && Number(sel.dia) > diasDelMes(Number(sel.mes), Number(sel.anio));

  return (
    <div>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <select aria-label="Día" value={sel.dia} onChange={(e) => cambiar('dia', e.target.value)} className={className}>
          <option value="">Día</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d} disabled={d > maxDias}>{d}</option>
          ))}
        </select>
        <select aria-label="Mes" value={sel.mes} onChange={(e) => cambiar('mes', e.target.value)} className={className}>
          <option value="">Mes</option>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select aria-label="Año" value={sel.anio} onChange={(e) => cambiar('anio', e.target.value)} className={className}>
          <option value="">Año</option>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {fechaInexistente && (
        <p className="mt-1 text-xs font-semibold text-ember">Esa fecha no existe. Revisa el día y el mes.</p>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { mensajeError } from '../../api';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    if (!cargando) return;
    setSegundos(0);
    const intervalo = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(intervalo);
  }, [cargando]);

  async function enviar(e) {
    e.preventDefault();
    setCargando(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('sael_token', data.token);
      localStorage.setItem('sael_user', JSON.stringify(data.usuario));
      navigate('/admin/eventos');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-parchment px-5">
      <form onSubmit={enviar} className="w-full max-w-sm rounded-2xl border border-ink/10 bg-white p-8 shadow-sm">
        <h1 className="text-center font-display text-2xl font-bold text-ink">Panel administrativo</h1>
        <p className="mt-1 text-center text-sm text-ink/50">SAEL Hombres · FIHNEC</p>

        {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-semibold text-ink/70">Correo</span>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm focus:border-ember focus:outline-none"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-semibold text-ink/70">Contraseña</span>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-ink/15 px-3 py-2.5 text-sm focus:border-ember focus:outline-none"
          />
        </label>

        <button
          type="submit" disabled={cargando}
          className="mt-6 w-full rounded-full bg-ember py-2.5 text-sm font-semibold text-white transition hover:bg-ember-light disabled:opacity-50"
        >
          {cargando ? `Ingresando… (${segundos}s)` : 'Ingresar'}
        </button>

        {cargando && segundos >= 5 && (
          <p className="mt-3 text-center text-xs text-ink/40">
            El servidor puede estar despertando tras un período de inactividad — esto puede tardar hasta 50 segundos. Gracias por tu paciencia.
          </p>
        )}

        <p className="mt-6 text-center text-xs text-ink/40">
          ¿Problemas para ingresar? Contacta al administrador del sistema.
        </p>
      </form>
    </div>
  );
}


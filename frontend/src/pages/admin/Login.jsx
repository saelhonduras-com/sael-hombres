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

  const claseInput = 'w-full rounded-lg border border-ink/15 bg-white py-2.5 pl-10 pr-3 text-sm text-ink transition focus:border-ember focus:outline-none focus:ring-4 focus:ring-ember/10';

  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-parchment px-5">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-md">
        <div className="flex h-1.5">
          <span className="flex-1 bg-[#E40521]" />
          <span className="flex-1 bg-[#FDC41F]" />
          <span className="flex-1 bg-[#007334]" />
        </div>

        <form onSubmit={enviar} className="p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-night">
            <svg width="20" height="20" viewBox="0 0 24 24" className="text-[#FDC41F]" fill="currentColor">
              <path d="M12 3c-3 3.6-5 6.2-5 9.4a5 5 0 0 0 10 0c0-2.1-.9-3.6-1.9-5 .2 1.5-.4 2.6-1.3 2.6-1 0-1.5-.9-1.2-2 .4-1.9-.2-3.4-.6-5z" />
            </svg>
          </div>

          <h1 className="mt-4 text-center font-display text-2xl font-bold text-ink">Panel administrativo</h1>
          <p className="mt-1 text-center text-sm text-ink/50">SAEL Hombres · FIHNEC</p>

          {error && <p className="mt-4 rounded-lg bg-ember/10 p-3 text-sm text-ember">{error}</p>}

          <label className="mt-6 block">
            <span className="mb-1.5 block text-sm font-semibold text-ink/70">Correo</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink/30">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              </span>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className={claseInput}
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-ink/70">Contraseña</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink/30">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
              <input
                type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className={claseInput}
              />
            </div>
          </label>

          <button
            type="submit" disabled={cargando}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ember py-2.5 text-sm font-semibold text-white transition hover:bg-ember-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cargando && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
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
    </div>
  );
}

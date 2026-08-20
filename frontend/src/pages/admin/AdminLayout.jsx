import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import logoFihnec from '../../assets/logo-fihnec.png';
import api from '../../api';

// Cada opción del menú declara a qué "modulo" técnico corresponde (el
// mismo nombre que usa requireModulo en el backend). Los roles fijos
// (super_admin y los demás) ven todo el menú, igual que siempre — el
// filtro de abajo solo aplica cuando el rol es 'admin'.
const OPCIONES_MENU = [
  { ruta: '/admin/eventos', etiqueta: 'Eventos', modulo: 'eventos' },
  { ruta: '/admin/participantes', etiqueta: 'Participantes', modulo: 'participantes' },
  { ruta: '/admin/diplomas', etiqueta: 'Diplomas', modulo: 'diplomas' },
  { ruta: '/admin/saelistas', etiqueta: 'Saelistas', modulo: 'saelistas' },
  { ruta: '/admin/habitaciones', etiqueta: 'Habitaciones', modulo: 'habitaciones' },
  { ruta: '/admin/entradas-y-salidas', etiqueta: 'Entradas & Salidas', modulo: 'entradas_salidas' },
  { ruta: '/admin/control-de-ingresos-egresos', etiqueta: 'Control de Ingresos & Egresos', modulo: 'entradas_salidas' },
  { ruta: '/admin/catalogo-de-cuentas', etiqueta: 'Catálogo de Cuentas', modulo: 'catalogo_cuentas' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const usuario = JSON.parse(localStorage.getItem('sael_user') || 'null');

  // --- Permisos reales del usuario, solo relevantes si rol === 'admin'.
  // Se guarda como { modulo: nivel } — null mientras carga, para no
  // destellar opciones del menú que luego se ocultan.
  const [permisosPorModulo, setPermisosPorModulo] = useState(null);

  useEffect(() => {
    if (usuario?.rol === 'admin') {
      api.get('/auth/yo')
        .then(({ data }) => {
          const mapa = {};
          (data.usuario.permisos || []).forEach((p) => { mapa[p.modulo] = p.nivel; });
          setPermisosPorModulo(mapa);
        })
        .catch(() => setPermisosPorModulo({}));
    }
  }, [usuario?.rol]);

  function puedeVer(modulo) {
    if (usuario?.rol !== 'admin') return true; // super_admin y demás roles fijos: sin cambios
    if (permisosPorModulo === null) return false; // todavía cargando
    return modulo in permisosPorModulo;
  }

  // --- Resumen del evento actual, arriba del menú (igual que en SFL) ---
  const [eventoActual, setEventoActual] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);

  function cargarResumen() {
    api.get('/eventos')
      .then(({ data }) => {
        const actual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
        setEventoActual(actual || null);
      })
      .catch(() => {});
    api.get('/admin/participantes/estadisticas')
      .then(({ data }) => setEstadisticas(data))
      .catch(() => {});
  }

  useEffect(() => {
    cargarResumen();
    // Respaldo automático: si alguna pantalla no llama a refrescarResumen()
    // directamente (por ejemplo, mientras conectamos las pantallas una por
    // una), el resumen igual se pone al día solo cada 15 segundos.
    const intervalo = setInterval(cargarResumen, 15000);
    return () => clearInterval(intervalo);
  }, []);

  function cerrarSesion() {
    localStorage.removeItem('sael_token');
    localStorage.removeItem('sael_user');
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-parchment">
      <div className="sticky top-0 z-20 grid grid-cols-3 items-center border-b border-ink/10 bg-white px-6 py-3">
        <div>
          <p className="font-display text-lg font-bold text-ink">Panel administrativo</p>
          <p className="text-xs text-ink/50">{usuario?.nombre_completo} · {usuario?.rol}</p>
        </div>
        <div className="flex justify-center">
          <img src={logoFihnec} alt="FIHNEC" className="h-11 w-auto" />
        </div>
        <div className="flex justify-end">
          <button onClick={cerrarSesion} className="rounded-full bg-[#1F3464] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90">
            Cerrar sesión
          </button>
        </div>
      </div>
      <div className="flex">
        <nav className="w-56 shrink-0 border-r border-ink/10 bg-white p-4">
          {estadisticas && (
            <div className="mb-4 rounded-xl border border-ink/10 bg-ink/5 p-3">
              {eventoActual && <p className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide text-ink/40">{eventoActual.nombre}</p>}
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-ink/50">Inscritos</dt><dd className="font-bold text-ink">{estadisticas.inscritos_total}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50">Confirmados</dt><dd className="font-bold text-ink">{estadisticas.total}</dd></div>
                <div className="flex justify-between border-t border-ink/10 pt-1"><dt className="text-ink/50">Nacionales</dt><dd className="font-bold text-ink">{estadisticas.nacional}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50">Extranjeros</dt><dd className="font-bold text-ink">{estadisticas.extranjero}</dd></div>
                <div className="flex justify-between border-t border-ink/10 pt-1"><dt className="text-ink/50">Boletos entregados</dt><dd className="font-bold text-ink">{estadisticas.total}</dd></div>
              </dl>
            </div>
          )}
          {OPCIONES_MENU.map((op) => puedeVer(op.modulo) && (
            <Link key={op.ruta} to={op.ruta} className="block rounded-lg px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">
              {op.etiqueta}
            </Link>
          ))}
          {usuario?.rol === 'super_admin' && (
            <Link to="/admin/usuarios" className="block rounded-lg px-3 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">
              Usuarios
            </Link>
          )}
        </nav>
        <main className="flex-1 p-6">
          <Outlet context={{ rol: usuario?.rol, permisosPorModulo, refrescarResumen: cargarResumen }} />
        </main>
      </div>
    </div>
  );
}

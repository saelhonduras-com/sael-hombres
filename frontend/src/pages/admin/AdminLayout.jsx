import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import logoFihnec from '../../assets/logo-fihnec.png';
import api from '../../api';

// Menú agrupado por tipo de tarea, con los 3 colores oficiales de
// FIHNEC (uno por grupo) más un derivado más oscuro del dorado para
// que el texto tenga suficiente contraste sobre blanco.
const GRUPOS_MENU = [
  {
    titulo: 'Operación',
    color: '#1F3464', // navy
    items: [
      { ruta: '/admin/eventos', etiqueta: 'Eventos', modulo: 'eventos', icono: '📅' },
      { ruta: '/admin/participantes', etiqueta: 'Participantes', modulo: 'participantes', icono: '👥' },
      { ruta: '/admin/diplomas', etiqueta: 'Diplomas', modulo: 'diplomas', icono: '🎓' },
      { ruta: '/admin/saelistas', etiqueta: 'Saelistas', modulo: 'saelistas', icono: '🙋' },
      { ruta: '/admin/habitaciones', etiqueta: 'Habitaciones', modulo: 'habitaciones', icono: '🛏️' },
    ],
  },
  {
    titulo: 'Finanzas',
    color: '#007334', // verde
    items: [
      { ruta: '/admin/entradas-y-salidas', etiqueta: 'Entradas & Salidas', modulo: 'entradas_salidas', icono: '💵' },
      { ruta: '/admin/control-de-ingresos-egresos', etiqueta: 'Control de Ingresos & Egresos', modulo: 'entradas_salidas', icono: '📊' },
      { ruta: '/admin/catalogo-de-cuentas', etiqueta: 'Catálogo de Cuentas', modulo: 'catalogo_cuentas', icono: '📚' },
    ],
  },
  {
    titulo: 'Administración',
    color: '#92660A', // derivado más oscuro del dorado FIHNEC, para que el texto se lea bien
    soloSuperAdmin: true,
    items: [
      { ruta: '/admin/usuarios', etiqueta: 'Usuarios', modulo: null, icono: '🔑' },
      { ruta: '/admin/mantenimiento', etiqueta: 'Mantenimiento', modulo: null, icono: '🛠️' },
    ],
  },
];

function iniciales(nombreCompleto) {
  if (!nombreCompleto) return '?';
  const partes = nombreCompleto.trim().split(/\s+/);
  const primera = partes[0]?.[0] || '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primera + ultima).toUpperCase();
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
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
        return api.get('/admin/participantes/estadisticas', actual ? { params: { evento_id: actual.id } } : undefined);
      })
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
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1F3464] text-sm font-bold text-white">
            {iniciales(usuario?.nombre_completo)}
          </div>
          <div>
            <p className="font-display text-lg font-bold text-ink">Panel administrativo</p>
            <p className="flex items-center gap-1.5 text-xs text-ink/60">
              {usuario?.nombre_completo}
              <span className="rounded-full bg-[#1F3464]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1F3464]">
                {usuario?.rol}
              </span>
            </p>
          </div>
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
            <div className="mb-4 rounded-xl border border-[#1F3464]/15 bg-[#1F3464]/8 p-3">
              {eventoActual && <p className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide text-ink/40">{eventoActual.nombre}</p>}
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-ink/50">Inscritos</dt><dd className="font-bold text-ink">{estadisticas.inscritos_total}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50">Confirmados</dt><dd className="font-bold text-ink">{estadisticas.total}</dd></div>
                <div className="flex justify-between border-t border-[#1F3464]/15 pt-1"><dt className="text-ink/50">Nacionales</dt><dd className="font-bold text-ink">{estadisticas.nacional}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50">Extranjeros</dt><dd className="font-bold text-ink">{estadisticas.extranjero}</dd></div>
                <div className="flex justify-between border-t border-[#1F3464]/15 pt-1"><dt className="text-ink/50">Boletos entregados</dt><dd className="font-bold text-ink">{estadisticas.total}</dd></div>
                <div className="flex justify-between border-t border-[#1F3464]/15 pt-1"><dt className="text-ink/50">Saelistas asistiendo</dt><dd className="font-bold text-ink">{estadisticas.saelistas_asistencia ?? 0}</dd></div>
              </dl>
            </div>
          )}
          {GRUPOS_MENU.map((grupo) => {
            if (grupo.soloSuperAdmin && usuario?.rol !== 'super_admin') return null;
            const itemsVisibles = grupo.items.filter((op) => !op.modulo || puedeVer(op.modulo));
            if (itemsVisibles.length === 0) return null;
            return (
              <div key={grupo.titulo} className="mb-4">
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: grupo.color }}>
                  {grupo.titulo}
                </p>
                <div
                  className="mb-2 h-[2px] rounded-full"
                  style={{ background: `linear-gradient(to right, ${grupo.color}66, transparent)` }}
                />
                {itemsVisibles.map((op) => {
                  const activo = location.pathname === op.ruta;
                  return (
                    <Link
                      key={op.ruta}
                      to={op.ruta}
                      className={`mb-0.5 flex items-center gap-2 rounded-lg border-l-[3px] px-2.5 py-2 text-sm font-semibold transition ${!activo ? 'hover:bg-ink/5' : ''}`}
                      style={activo
                        ? { borderLeftColor: grupo.color, backgroundColor: `${grupo.color}15`, color: grupo.color }
                        : { borderLeftColor: 'transparent', color: '#4A4A4A' }}
                    >
                      <span aria-hidden="true">{op.icono}</span>
                      {op.etiqueta}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <main className="flex-1 p-6">
          <Outlet context={{ rol: usuario?.rol, permisosPorModulo, refrescarResumen: cargarResumen }} />
        </main>
      </div>
    </div>
  );
}

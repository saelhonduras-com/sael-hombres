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
  const [menuMas, setMenuMas] = useState(false); // hoja "Más" del menú inferior (celular)

  function cargarResumen() {
    api.get('/eventos')
      .then(({ data }) => {
        const actual = data.find((e) => e.es_actual) || data.find((e) => e.abierto);
        setEventoActual(actual || null);
        // Sin evento actual/abierto, el resumen va en cero (no el conteo de
        // todos los eventos de siempre, que confundía al terminar un evento).
        if (!actual) {
          return { data: { total: 0, nacional: 0, extranjero: 0, menor: 0, inscritos_total: 0, saelistas_asistencia: 0 } };
        }
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

  useEffect(() => { setMenuMas(false); }, [location.pathname]);

  function cerrarSesion() {
    localStorage.removeItem('sael_token');
    localStorage.removeItem('sael_user');
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-parchment">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-ink/10 bg-white px-3 py-2 md:grid md:grid-cols-3 md:px-6 md:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1F3464] text-sm font-bold text-white">
            {iniciales(usuario?.nombre_completo)}
          </div>
          <div>
            <p className="font-display text-base font-bold text-ink md:text-lg"><span className="md:hidden">SAEL Hombres · Admin</span><span className="hidden md:inline">Panel administrativo</span></p>
            <p className="flex items-center gap-1.5 text-xs text-ink/60">
              {usuario?.nombre_completo}
              <span className="rounded-full bg-[#1F3464]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1F3464]">
                {usuario?.rol}
              </span>
            </p>
          </div>
        </div>
        <div className="hidden justify-center md:flex">
          <img src={logoFihnec} alt="FIHNEC" className="h-11 w-auto" />
        </div>
        <div className="flex justify-end">
          <button onClick={cerrarSesion} className="hidden rounded-full md:block bg-[#1F3464] px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90">
            Cerrar sesión
          </button>
        </div>
      </div>
      <div className="flex">
        <nav className="hidden w-56 shrink-0 border-r md:block border-ink/10 bg-white p-4">
          {estadisticas && (
            <div className="mb-4 rounded-xl border border-[#1F3464]/15 bg-[#1F3464]/8 p-3">
              {eventoActual && <p className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide text-ink/40">{eventoActual.nombre}</p>}
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-ink/50">Inscritos</dt><dd className="font-bold text-ink">{estadisticas.inscritos_total}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50">Confirmados</dt><dd className="font-bold text-ink">{estadisticas.total}</dd></div>
                <div className="flex justify-between border-t border-[#1F3464]/15 pt-1"><dt className="text-ink/50">Nacionales</dt><dd className="font-bold text-ink">{estadisticas.nacional}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50">Extranjeros</dt><dd className="font-bold text-ink">{estadisticas.extranjero}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50">Menores</dt><dd className="font-bold text-ink">{estadisticas.menor ?? 0}</dd></div>
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
        <main className="min-w-0 flex-1 p-3 pb-24 md:p-6 md:pb-6">
          {/* Resumen compacto del evento (solo celular; en PC va en el menú lateral) */}
          {estadisticas && (
            <div className="mb-3 flex items-center justify-between rounded-xl bg-[#1F3464] px-4 py-2.5 text-white md:hidden">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-white/60">{eventoActual ? 'Evento actual' : 'Sin evento actual'}</p>
                <p className="truncate text-sm font-semibold">{eventoActual?.nombre || '—'}</p>
              </div>
              <p className="shrink-0 text-right">
                <span className="text-2xl font-bold">{estadisticas.total}</span>
                <span className="text-sm text-white/70"> / {estadisticas.inscritos_total}</span>
              </p>
            </div>
          )}
          <Outlet context={{ rol: usuario?.rol, permisosPorModulo, refrescarResumen: cargarResumen }} />
        </main>
      </div>

      {/* ===== Menú inferior (solo celular) ===== */}
      {(() => {
        const visibles = GRUPOS_MENU.flatMap((g) => (g.soloSuperAdmin && usuario?.rol !== 'super_admin' ? [] : g.items.filter((op) => !op.modulo || puedeVer(op.modulo)).map((op) => ({ ...op, color: g.color }))));
        const FIJOS = [
          ['/admin/eventos', 'Eventos'],
          ['/admin/participantes', 'Particip.'],
          ['/admin/saelistas', 'Asistencia'],
          ['/admin/entradas-y-salidas', 'E & S'],
        ];
        const barra = FIJOS.map(([ruta, corto]) => ({ op: visibles.find((v) => v.ruta === ruta), corto })).filter((x) => x.op);
        const rutasBarra = new Set(barra.map((b) => b.op.ruta));
        const enMas = !rutasBarra.has(location.pathname);
        return (
          <>
            <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink/10 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:hidden">
              {barra.map(({ op, corto }) => {
                const activo = location.pathname === op.ruta;
                return (
                  <Link key={op.ruta} to={op.ruta} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold" style={{ color: activo ? '#1F3464' : '#6B6B6B' }}>
                    <span className={`flex h-8 w-12 items-center justify-center rounded-full text-lg ${activo ? 'bg-[#1F3464]/12' : ''}`} aria-hidden="true">{op.icono}</span>
                    {corto}
                  </Link>
                );
              })}
              <button type="button" onClick={() => setMenuMas(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold" style={{ color: enMas ? '#1F3464' : '#6B6B6B' }}>
                <span className={`flex h-8 w-12 items-center justify-center rounded-full text-lg ${enMas ? 'bg-[#1F3464]/12' : ''}`} aria-hidden="true">☰</span>
                Más
              </button>
            </nav>

            {menuMas && (
              <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMenuMas(false)}>
                <div className="absolute inset-0 bg-ink/40" />
                <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20" />
                  {GRUPOS_MENU.map((grupo) => {
                    if (grupo.soloSuperAdmin && usuario?.rol !== 'super_admin') return null;
                    const items = grupo.items.filter((op) => !op.modulo || puedeVer(op.modulo));
                    if (items.length === 0) return null;
                    return (
                      <div key={grupo.titulo} className="mb-3">
                        <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: grupo.color }}>{grupo.titulo}</p>
                        {items.map((op) => {
                          const activo = location.pathname === op.ruta;
                          return (
                            <Link key={op.ruta} to={op.ruta} className="mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold"
                              style={activo ? { backgroundColor: `${grupo.color}15`, color: grupo.color } : { color: '#333' }}>
                              <span aria-hidden="true">{op.icono}</span>{op.etiqueta}
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })}
                  <button type="button" onClick={cerrarSesion} className="mt-2 w-full rounded-xl bg-[#1F3464] py-3 text-base font-semibold text-white">Cerrar sesión</button>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

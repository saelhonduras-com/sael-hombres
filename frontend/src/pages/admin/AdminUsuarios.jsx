import { useEffect, useState } from 'react';
import api from '../../api';

const ROLES = [
  { valor: 'super_admin', etiqueta: 'Super Admin (acceso total)' },
  { valor: 'admin', etiqueta: 'Admin (módulos personalizados)' },
  { valor: 'consulta', etiqueta: 'Consulta' },
  { valor: 'estandar', etiqueta: 'Estándar' },
  { valor: 'registro', etiqueta: 'Registro' },
  { valor: 'cocina', etiqueta: 'Cocina' },
];

const FORM_VACIO = { id: null, nombre_completo: '', email: '', password: '', rol: 'consulta', permisos: [] };

export default function AdminUsuarios() {
  const usuarioActual = JSON.parse(localStorage.getItem('sael_user') || 'null');

  const [usuarios, setUsuarios] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [edicionActiva, setEdicionActiva] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const [confirmacion, setConfirmacion] = useState(null); // { usuario, nuevoEstado }

  async function cargarTodo() {
    setCargando(true);
    setError('');
    try {
      const [resUsuarios, resModulos] = await Promise.all([
        api.get('/admin/usuarios'),
        api.get('/admin/usuarios/modulos-disponibles'),
      ]);
      setUsuarios(resUsuarios.data);
      setModulos(resModulos.data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los usuarios.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarTodo(); }, []);

  function abrirCrear() {
    setForm(FORM_VACIO);
    setErrorForm('');
    setModalAbierto(true);
  }

  function abrirEditar(u) {
    setForm({
      id: u.id,
      nombre_completo: u.nombre_completo,
      email: u.email,
      password: '',
      rol: u.rol,
      permisos: u.permisos || [],
    });
    setErrorForm('');
    setModalAbierto(true);
  }

  function togglePermiso(modulo, marcado) {
    setForm((f) => {
      if (marcado) {
        return { ...f, permisos: [...f.permisos, { modulo, nivel: 'consulta' }] };
      }
      return { ...f, permisos: f.permisos.filter((p) => p.modulo !== modulo) };
    });
  }

  function cambiarNivelPermiso(modulo, nivel) {
    setForm((f) => ({
      ...f,
      permisos: f.permisos.map((p) => (p.modulo === modulo ? { ...p, nivel } : p)),
    }));
  }

  async function guardar(e) {
    e.preventDefault();
    setErrorForm('');
    if (!form.nombre_completo.trim() || !form.email.trim()) {
      setErrorForm('Nombre y correo son obligatorios.');
      return;
    }
    if (!form.id && !form.password) {
      setErrorForm('La contraseña es obligatoria para un usuario nuevo.');
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        nombre_completo: form.nombre_completo.trim(),
        email: form.email.trim(),
        rol: form.rol,
        permisos: form.rol === 'admin' ? form.permisos : [],
      };
      if (form.password) payload.password = form.password;

      if (form.id) {
        await api.put(`/admin/usuarios/${form.id}`, payload);
      } else {
        await api.post('/admin/usuarios', payload);
      }
      setModalAbierto(false);
      await cargarTodo();
    } catch (err) {
      setErrorForm(err.response?.data?.error || 'No se pudo guardar el usuario.');
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarCambioEstado() {
    if (!confirmacion) return;
    const { usuario, nuevoEstado } = confirmacion;
    try {
      await api.put(`/admin/usuarios/${usuario.id}/activo`, { activo: nuevoEstado });
      setConfirmacion(null);
      await cargarTodo();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el estado del usuario.');
      setConfirmacion(null);
    }
  }

  function etiquetaModulo(valor) {
    return modulos.find((m) => m.valor === valor)?.etiqueta || valor;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Usuarios</h1>
          <p className="text-sm text-ink/50">Solo visible para Super Admin.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEdicionActiva((v) => !v)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              edicionActiva ? 'bg-[#007334] text-white' : 'bg-ink/10 text-ink/70'
            }`}
          >
            {edicionActiva ? '🔓 Edición activada' : '🔒 Activar edición'}
          </button>
          {edicionActiva && (
            <button
              onClick={abrirCrear}
              className="rounded-full bg-[#E40521] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              + Nuevo usuario
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#E40521]/30 bg-[#E40521]/5 px-4 py-2 text-sm text-[#E40521]">
          {error}
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-ink/50">Cargando…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink/5 text-left text-xs font-semibold uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Módulos</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-ink/10">
                  <td className="px-4 py-3 font-semibold text-ink">{u.nombre_completo}</td>
                  <td className="px-4 py-3 text-ink/70">{u.email}</td>
                  <td className="px-4 py-3 text-ink/70">{ROLES.find((r) => r.valor === u.rol)?.etiqueta || u.rol}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {u.rol === 'admin'
                      ? u.permisos.length > 0
                        ? u.permisos.map((p) => `${etiquetaModulo(p.modulo)} (${p.nivel === 'edicion' ? 'edición' : 'consulta'})`).join(', ')
                        : '— sin módulos asignados —'
                      : <span className="text-ink/30">acceso fijo por rol</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${u.activo ? 'bg-[#007334]/10 text-[#007334]' : 'bg-ink/10 text-ink/50'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {edicionActiva && (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => abrirEditar(u)} className="rounded-full bg-[#1F3464] px-3 py-1 text-xs font-semibold text-white hover:opacity-90">
                          Editar
                        </button>
                        {u.id !== usuarioActual?.id && (
                          <button
                            onClick={() => setConfirmacion({ usuario: u, nuevoEstado: !u.activo })}
                            className="rounded-full bg-ink/10 px-3 py-1 text-xs font-semibold text-ink/70 hover:bg-ink/20"
                          >
                            {u.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal crear/editar */}
      {modalAbierto && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6">
            <h2 className="mb-4 font-display text-lg font-bold text-ink">
              {form.id ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>
            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">Nombre completo</label>
                <input
                  type="text"
                  value={form.nombre_completo}
                  onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))}
                  className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">Correo</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">
                  {form.id ? 'Nueva contraseña (dejar en blanco para no cambiarla)' : 'Contraseña'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink/50">Rol</label>
                <select
                  value={form.rol}
                  onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
                  className="w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                  ))}
                </select>
              </div>

              {form.rol === 'admin' && (
                <div className="rounded-lg border border-ink/10 bg-ink/5 p-3">
                  <p className="mb-2 text-xs font-semibold text-ink/50">Módulos permitidos</p>
                  <div className="space-y-2">
                    {modulos.map((m) => {
                      const permiso = form.permisos.find((p) => p.modulo === m.valor);
                      return (
                        <div key={m.valor} className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={!!permiso}
                              onChange={(e) => togglePermiso(m.valor, e.target.checked)}
                            />
                            {m.etiqueta}
                          </label>
                          {permiso && (
                            <select
                              value={permiso.nivel}
                              onChange={(e) => cambiarNivelPermiso(m.valor, e.target.value)}
                              className="rounded-lg border border-ink/20 px-2 py-1 text-xs"
                            >
                              <option value="consulta">Consulta</option>
                              <option value="edicion">Edición</option>
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {errorForm && <p className="text-sm text-[#E40521]">{errorForm}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalAbierto(false)} className="rounded-full bg-ink/10 px-4 py-2 text-sm font-semibold text-ink/70">
                  Cancelar
                </button>
                <button type="submit" disabled={guardando} className="rounded-full bg-[#007334] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmación (no usa confirm() del navegador) */}
      {confirmacion && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6">
            <h2 className="mb-2 font-display text-lg font-bold text-ink">
              {confirmacion.nuevoEstado ? 'Activar usuario' : 'Desactivar usuario'}
            </h2>
            <p className="mb-4 text-sm text-ink/70">
              {confirmacion.nuevoEstado
                ? `${confirmacion.usuario.nombre_completo} podrá volver a iniciar sesión.`
                : `${confirmacion.usuario.nombre_completo} no podrá iniciar sesión hasta que lo vuelvas a activar.`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmacion(null)} className="rounded-full bg-ink/10 px-4 py-2 text-sm font-semibold text-ink/70">
                Cancelar
              </button>
              <button
                onClick={confirmarCambioEstado}
                className="rounded-full bg-[#E40521] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                {confirmacion.nuevoEstado ? 'Activar' : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

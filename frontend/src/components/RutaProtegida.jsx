import { Navigate } from 'react-router-dom';

// rolesPermitidos es opcional: si no se pasa, el comportamiento es
// idéntico al de antes (solo exige que exista sesión). Si se pasa,
// además exige que el rol del usuario esté en la lista.
export default function RutaProtegida({ children, rolesPermitidos }) {
  const token = localStorage.getItem('sael_token');
  if (!token) return <Navigate to="/admin/login" replace />;

  if (rolesPermitidos) {
    const usuario = JSON.parse(localStorage.getItem('sael_user') || 'null');
    if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
      return <Navigate to="/admin/eventos" replace />;
    }
  }

  return children;
}

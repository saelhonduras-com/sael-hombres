import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sael_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout: si el backend responde 401 (sesión inválida o expirada),
// limpiamos la sesión guardada y mandamos directo al login, en vez de
// dejar la pantalla con el mensaje de error genérico. No aplica si el
// 401 viene de la propia pantalla de login (contraseña incorrecta) —
// ahí debe manejarlo Login.jsx con su propio mensaje.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && window.location.pathname !== '/admin/login') {
      localStorage.removeItem('sael_token');
      localStorage.removeItem('sael_user');
      // Bandera para que Login.jsx pueda mostrar "Tu sesión expiró" si la
      // lee al montarse (opcional — si no la lee, simplemente no se usa).
      sessionStorage.setItem('sael_sesion_expirada', '1');
      window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  }
);

export function mensajeError(err) {
  return err?.response?.data?.error || 'Ocurrió un error inesperado. Intenta de nuevo.';
}

export default api;

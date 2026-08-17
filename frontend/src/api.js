import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

export function mensajeError(err) {
  return err?.response?.data?.error || 'Ocurrió un error inesperado. Intenta de nuevo.';
}

export default api;

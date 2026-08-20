import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import RutaProtegida from './components/RutaProtegida.jsx';
import Home from './pages/Home.jsx';
import Registro from './pages/Registro.jsx';
import Login from './pages/admin/Login.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminEventos from './pages/admin/AdminEventos.jsx';
import AdminParticipantes from './pages/admin/AdminParticipantes.jsx';
import AdminDiplomas from './pages/admin/AdminDiplomas.jsx';
import AdminSaelistas from './pages/admin/AdminSaelistas.jsx';
import AdminHabitaciones from './pages/admin/AdminHabitaciones.jsx';
import AdminEntradasSalidas from './pages/admin/AdminEntradasSalidas.jsx';
import AdminControlIngresosEgresos from './pages/admin/AdminControlIngresosEgresos.jsx';
import AdminCatalogoCuentas from './pages/admin/AdminCatalogoCuentas.jsx';
import AdminUsuarios from './pages/admin/AdminUsuarios.jsx';

function PaginaPublica({ children }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PaginaPublica><Home /></PaginaPublica>} />
        <Route path="/registro" element={<PaginaPublica><Registro /></PaginaPublica>} />
        <Route path="/admin/login" element={<><Navbar /><Login /></>} />
        <Route
          path="/admin"
          element={
            <RutaProtegida>
              <AdminLayout />
            </RutaProtegida>
          }
        >
          <Route index element={<Navigate to="/admin/eventos" replace />} />
          <Route path="eventos" element={<AdminEventos />} />
          <Route path="participantes" element={<AdminParticipantes />} />
          <Route path="diplomas" element={<AdminDiplomas />} />
          <Route path="saelistas" element={<AdminSaelistas />} />
          <Route path="habitaciones" element={<AdminHabitaciones />} />
          <Route path="entradas-y-salidas" element={<AdminEntradasSalidas />} />
          <Route path="control-de-ingresos-egresos" element={<AdminControlIngresosEgresos />} />
          <Route path="catalogo-de-cuentas" element={<AdminCatalogoCuentas />} />
          <Route
            path="usuarios"
            element={
              <RutaProtegida rolesPermitidos={['super_admin']}>
                <AdminUsuarios />
              </RutaProtegida>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

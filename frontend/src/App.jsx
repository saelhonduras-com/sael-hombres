import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';

function Proximamente({ titulo }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-parchment px-5 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{titulo}</h1>
        <p className="mt-2 text-ink/50">Próximamente — este módulo está en construcción.</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/registro" element={<Proximamente titulo="Formulario de inscripción" />} />
        <Route path="/autoconsulta" element={<Proximamente titulo="Consulta tu información" />} />
        <Route path="/admin" element={<Proximamente titulo="Panel administrativo" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

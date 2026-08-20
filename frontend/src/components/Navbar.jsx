import { Link } from 'react-router-dom';
import logoFihnec from '../assets/logo-fihnec.png';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-gold/40 bg-parchment">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-3">
          <img src={logoFihnec} alt="Logotipo FIHNEC" className="h-10 w-auto" />
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-night">SAEL Hombres · FIHNEC</p>
          </div>
        </Link>
        <Link
          to="/admin/login"
          className="rounded-full border border-night/20 px-4 py-1.5 text-xs font-semibold text-night transition hover:bg-night/5"
        >
          Panel administrativo
        </Link>
      </div>
    </header>
  );
}

import { Link } from 'react-router-dom';
import logoFihnec from '../assets/logo-fihnec.png';

export default function Navbar() {
  return (
    <header className="border-b border-gold/20 bg-night">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-3">
          <img src={logoFihnec} alt="Logotipo FIHNEC" className="h-10 w-auto" />
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-parchment">SAEL Hombres · FIHNEC</p>
          </div>
        </Link>
        <Link
          to="/admin"
          className="rounded-full border border-parchment/30 px-4 py-1.5 text-xs font-semibold text-parchment transition hover:bg-parchment/10"
        >
          Panel administrativo
        </Link>
      </div>
    </header>
  );
}

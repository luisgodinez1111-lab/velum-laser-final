import React, { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Instagram, Facebook, LogOut, User, ChevronDown, Settings } from 'lucide-react';
import { VelumLogo } from './VelumLogo';
import { useAuth } from '../context/AuthContext';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout, hasRole } = useAuth();
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = hasRole(['admin', 'staff', 'system']);

  const navLinks = [
    { name: 'Inicio', path: '/' },
    { name: 'Membresías', path: '/memberships' },
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    setIsMenuOpen(false);
    await logout();
    navigate('/');
  };

  // Iniciales del usuario para el avatar
  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <div className="min-h-screen flex flex-col bg-velum-50 text-velum-900 selection:bg-velum-200 selection:text-velum-900">
      <nav className="fixed top-0 w-full z-50 bg-velum-50/95 backdrop-blur-md border-b border-velum-200 transition-all duration-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-28">

            {/* Logo */}
            <Link to="/" className="flex-shrink-0 flex items-center h-full py-2">
              <VelumLogo className="h-24 w-auto text-velum-900" />
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-10">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`text-xs uppercase tracking-widest transition-colors duration-300 ${
                    isActive(link.path)
                      ? 'text-velum-900 font-bold border-b border-velum-900 pb-1'
                      : 'text-velum-600 hover:text-velum-900'
                  }`}
                >
                  {link.name}
                </Link>
              ))}

              {isAuthenticated ? (
                /* ── Usuario autenticado ── */
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setIsUserMenuOpen((v) => !v)}
                    className="flex items-center gap-2.5 rounded-full border border-velum-200 bg-white pl-1.5 pr-3 py-1.5 shadow-sm transition hover:border-velum-400 hover:shadow"
                    aria-haspopup="true"
                    aria-expanded={isUserMenuOpen}
                  >
                    {/* Avatar */}
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-velum-900 text-[11px] font-bold text-white">
                      {initials}
                    </span>
                    <span className="max-w-[120px] truncate text-xs font-semibold text-velum-900">
                      {user?.name || user?.email}
                    </span>
                    <ChevronDown
                      size={13}
                      className={`text-velum-500 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Dropdown */}
                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-52 origin-top-right rounded-2xl border border-velum-200 bg-white py-1 shadow-xl ring-1 ring-black/5 animate-fade-in">
                      <div className="border-b border-velum-100 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-velum-500">Cuenta</p>
                        <p className="mt-0.5 truncate text-sm font-medium text-velum-900">{user?.email}</p>
                      </div>

                      <Link
                        to="/agenda"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-velum-700 transition hover:bg-velum-50 hover:text-velum-900"
                      >
                        <User size={15} />
                        Mi cuenta
                      </Link>

                      {isAdmin && (
                        <Link
                          to="/admin"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-velum-700 transition hover:bg-velum-50 hover:text-velum-900"
                        >
                          <Settings size={15} />
                          Panel administrativo
                        </Link>
                      )}

                      <div className="border-t border-velum-100 mt-1">
                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
                        >
                          <LogOut size={15} />
                          Cerrar sesión
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Usuario no autenticado ── */
                <Link to="/agenda">
                  <button className="bg-velum-900 text-velum-50 px-6 py-2 text-xs uppercase tracking-widest hover:bg-velum-800 transition-colors">
                    Reservar
                  </button>
                </Link>
              )}
            </div>

            {/* Mobile button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-velum-900 p-2"
                aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-velum-50 border-b border-velum-200 animate-fade-in-down">
            <div className="px-4 pt-2 pb-4 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`block px-3 py-3 text-center text-sm uppercase tracking-widest rounded-xl ${
                    isActive(link.path) ? 'bg-velum-100 text-velum-900 font-bold' : 'text-velum-600'
                  }`}
                >
                  {link.name}
                </Link>
              ))}

              {isAuthenticated ? (
                <>
                  <Link
                    to="/agenda"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-velum-700 rounded-xl hover:bg-velum-100"
                  >
                    <User size={15} />
                    Mi cuenta
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-velum-700 rounded-xl hover:bg-velum-100"
                    >
                      <Settings size={15} />
                      Panel administrativo
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-2 px-3 py-3 text-sm text-red-600 rounded-xl hover:bg-red-50"
                  >
                    <LogOut size={15} />
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <Link
                  to="/agenda"
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-3 py-3 text-center text-sm uppercase tracking-widest bg-velum-900 text-velum-50 rounded-xl"
                >
                  Reservar
                </Link>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Cerrar dropdown al hacer click fuera */}
      {isUserMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsUserMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="flex-grow pt-28">
        {children}
      </main>

      <footer className="bg-velum-900 text-velum-300 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <VelumLogo className="h-20 w-auto text-velum-50 mb-4" />
            <p className="mt-4 text-sm font-light leading-relaxed max-w-xs text-velum-400">
              Redefiniendo el cuidado personal a través de la tecnología láser.
              Tu piel, nuestra obra maestra.
            </p>
          </div>

          <div className="text-center md:text-left">
            <h3 className="text-velum-50 text-sm uppercase tracking-widest mb-6">Contacto</h3>
            <p className="text-sm mb-2">Av. Masaryk 400, Polanco</p>
            <p className="text-sm mb-2">Ciudad de México, CDMX</p>
            <p className="text-sm mt-4">+52 55 1234 5678</p>
            <p className="text-sm">concierge@velumlaser.com</p>
          </div>

          <div className="flex flex-col items-center md:items-end">
            <h3 className="text-velum-50 text-sm uppercase tracking-widest mb-6">Síguenos</h3>
            <div className="flex space-x-6">
              <a href="#" aria-label="Instagram" className="hover:text-velum-50 transition-colors">
                <Instagram size={20} />
              </a>
              <a href="#" aria-label="Facebook" className="hover:text-velum-50 transition-colors">
                <Facebook size={20} />
              </a>
            </div>
            <div className="mt-8 flex flex-col items-end gap-3">
              <p className="text-xs text-velum-500">
                © 2025 Velum Laser. Todos los derechos reservados.
              </p>
              {/* Acceso administrativo — visible para staff/admin que no estén en el panel */}
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 text-xs text-velum-400 hover:text-velum-50 uppercase tracking-widest transition-colors border border-velum-700 hover:border-velum-400 rounded px-3 py-1"
              >
                <Settings size={11} />
                Acceso Administrativo
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

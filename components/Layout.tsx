import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Instagram, Facebook } from 'lucide-react';
import { VelumLogo } from './VelumLogo';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { name: 'Inicio', path: '/' },
    { name: 'Membresías', path: '/memberships' },
    { name: 'Mi Cuenta', path: '/dashboard' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen flex flex-col bg-velum-50 text-velum-900 selection:bg-velum-200 selection:text-velum-900">
      {/* Header increased height to h-28 to accommodate logo with 'laserterapia' text */}
      <nav className="fixed top-0 w-full z-50 bg-velum-50/95 backdrop-blur-md border-b border-velum-200 transition-all duration-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-28">
            {/* Logo Image */}
            <Link to="/" className="flex-shrink-0 flex items-center h-full py-2">
              {/* Increased size to h-24 for maximum visibility within h-28 header */}
              <VelumLogo className="h-24 w-auto text-velum-900" />
            </Link>

            {/* Desktop Menu */}
            <div className="hidden md:flex space-x-12 items-center">
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
              <Link to="/agenda">
                 <button className="bg-velum-900 text-velum-50 px-6 py-2 text-xs uppercase tracking-widest hover:bg-velum-800 transition-colors">
                  Reservar
                 </button>
              </Link>
            </div>

            {/* Mobile Button */}
            <div className="md:hidden flex items-center">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-velum-900 p-2">
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-velum-50 border-b border-velum-200 animate-fade-in-down">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsMenuOpen(false)}
                  className={`block px-3 py-4 text-center text-sm uppercase tracking-widest ${
                    isActive(link.path) ? 'bg-velum-100 text-velum-900 font-bold' : 'text-velum-600'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content - Added padding top to match new header height */}
      <main className="flex-grow pt-28">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-velum-900 text-velum-300 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            {/* White Logo for Dark Footer - Increased size */}
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
              <a href="#" className="hover:text-velum-50 transition-colors"><Instagram size={20} /></a>
              <a href="#" className="hover:text-velum-50 transition-colors"><Facebook size={20} /></a>
            </div>
            <div className="mt-8 flex flex-col items-end gap-2">
              <p className="text-xs text-velum-600">
                © 2024 Velum Laser. Todos los derechos reservados.
              </p>
              <Link to="/admin" className="text-[10px] text-velum-700 hover:text-velum-50 uppercase tracking-widest transition-colors">
                Acceso Administrativo
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => (
  <div className="min-h-[70vh] flex items-center justify-center px-4">
    <div className="text-center space-y-6 max-w-sm">
      <p className="text-[80px] font-serif text-velum-100 leading-none select-none">404</p>
      <div>
        <h1 className="font-serif text-2xl text-velum-900 mb-2">Página no encontrada</h1>
        <p className="text-sm text-velum-500 leading-relaxed">
          La dirección que buscas no existe o fue movida.
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-6 py-3 bg-velum-900 text-white text-sm font-medium rounded-xl hover:bg-velum-800 transition-colors"
      >
        <ArrowLeft size={15} />
        Volver al inicio
      </Link>
    </div>
  </div>
);

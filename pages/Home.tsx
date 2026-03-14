import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Sparkles, ShieldCheck, Clock, Heart, Zap, User } from 'lucide-react';

export const Home: React.FC = () => {
  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative h-[90vh] w-full overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          {/* TODO producción: reemplazar con asset propio en /public/hero-velum.jpg */}
          {/* Fondo degradado como placeholder — misma paleta crema/dorada de la marca */}
          <div className="w-full h-full bg-gradient-to-br from-stone-100 via-amber-50 to-stone-200" />
          {/* Degradado para legibilidad del texto oscuro (Lujo Silencioso) */}
          {/* Se usa un degradado radial desde el centro (blanco crema) hacia afuera para que el texto resalte */}
          <div className="absolute inset-0 bg-gradient-to-b from-velum-50/90 via-velum-50/60 to-transparent"></div>
          <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px]"></div>
        </div>
        
        <div className="relative z-10 text-center px-4 animate-fade-in-up max-w-5xl mx-auto mt-10">
          <h2 className="text-velum-900 font-bold text-xs sm:text-sm uppercase tracking-[0.3em] mb-6 border border-velum-900/20 bg-velum-50/50 inline-block px-6 py-2 backdrop-blur-md rounded-sm">
            Lujo Silencioso aplicado a la piel
          </h2>
          <h1 className="text-5xl sm:text-7xl md:text-8xl font-serif text-velum-900 mb-8 italic leading-tight drop-shadow-sm">
            Aquí vienes a <br/> verte bien.
          </h1>
          <p className="text-velum-800 text-xl font-light mb-10 max-w-xl mx-auto leading-relaxed drop-shadow-sm font-sans">
            Y a sentirte aún mejor. <br/>
            <span className="text-sm mt-3 block font-bold tracking-widest uppercase opacity-80">VELUM no grita lujo. VELUM lo transmite.</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
             <Link to="/memberships">
                <Button size="lg" className="min-w-[220px] shadow-2xl bg-velum-900 text-velum-50 hover:bg-velum-800 border-none">
                  Ver Membresías
                </Button>
             </Link>
          </div>
        </div>
      </section>

      {/* Identity Principles Section */}
      <section className="py-24 px-4 bg-velum-50">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
          <div className="space-y-10">
            <div>
               <h3 className="text-sm font-bold text-velum-500 uppercase tracking-widest mb-2">Identidad Fundamental</h3>
               <h2 className="text-4xl font-serif text-velum-900 italic leading-snug">El Esteta Minimalista.</h2>
            </div>
            
            <p className="text-velum-600 leading-loose font-light text-justify text-lg">
              Nos alejamos del modelo tradicional de "spa económico" o "clínica ruidosa". 
              VELUM es una cabina boutique privada, donde la depilación se convierte en una 
              experiencia estética recurrente, elegante y predecible.
            </p>

            <ul className="space-y-4 pt-4">
              <li className="flex items-center text-velum-800 font-light">
                <span className="w-2 h-2 bg-velum-400 rounded-full mr-4"></span>
                Pulcritud clínica y silencio visual.
              </li>
              <li className="flex items-center text-velum-800 font-light">
                <span className="w-2 h-2 bg-velum-400 rounded-full mr-4"></span>
                Tecnología médica sin exageración.
              </li>
              <li className="flex items-center text-velum-800 font-light">
                <span className="w-2 h-2 bg-velum-400 rounded-full mr-4"></span>
                Atención estética profesional.
              </li>
            </ul>

            <div className="pt-6 border-t border-velum-200 grid grid-cols-2 gap-8">
               <div>
                 <p className="font-serif text-3xl text-velum-900">10 Meses</p>
                 <p className="text-xs text-velum-500 uppercase mt-1">Programa Estándar</p>
               </div>
               <div>
                 <p className="font-serif text-3xl text-velum-900">Alta Potencia</p>
                 <p className="text-xs text-velum-500 uppercase mt-1">Tecnología Real</p>
               </div>
            </div>
          </div>

          <div className="relative h-[600px] w-full overflow-hidden shadow-2xl rounded-sm group">
             {/* TODO producción: reemplazar con asset propio en /public/velum-closeup.jpg */}
             <div className="w-full h-full bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 transition-transform duration-[2s] ease-out group-hover:scale-105" />
             {/* Overlay sutil para unificar tono */}
             <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-500"></div>
             
             <div className="absolute bottom-0 left-0 bg-white/95 p-8 max-w-xs backdrop-blur-md border-t border-r border-velum-100">
                <p className="font-serif italic text-velum-900 text-xl leading-relaxed">"La piel habla por sí sola."</p>
                <div className="w-10 h-0.5 bg-velum-400 mt-4"></div>
             </div>
          </div>
        </div>
      </section>

      {/* Sensory Experience / Value Prop */}
      <section className="bg-velum-100 py-24 relative">
         {/* Background pattern subtil */}
         <div className="absolute inset-0 opacity-30 bg-[radial-gradient(#ccb999_1px,transparent_1px)] [background-size:20px_20px]"></div>
         
         <div className="max-w-7xl mx-auto px-4 relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-serif text-velum-900 mb-6">Experiencia Sensorial VELUM</h2>
              <p className="text-velum-600 font-light text-lg">
                No compras sesiones. Compras pertenencia. Creamos un entorno visualmente calmado 
                y emocionalmente seguro.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-8 text-center border border-transparent hover:border-velum-300 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1">
                   <User className="mx-auto text-velum-400 mb-4" size={28} />
                   <h4 className="font-bold text-sm uppercase tracking-widest text-velum-900 mb-2">Privacidad</h4>
                   <p className="text-xs text-velum-500 leading-relaxed">Cabina privada tipo boutique. Sin ruido ni saturación.</p>
                </div>
                <div className="bg-white p-8 text-center border border-transparent hover:border-velum-300 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1">
                   <Zap className="mx-auto text-velum-400 mb-4" size={28} />
                   <h4 className="font-bold text-sm uppercase tracking-widest text-velum-900 mb-2">Eficacia</h4>
                   <p className="text-xs text-velum-500 leading-relaxed">Resultados visibles desde las primeras sesiones.</p>
                </div>
                <div className="bg-white p-8 text-center border border-transparent hover:border-velum-300 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1">
                   <Heart className="mx-auto text-velum-400 mb-4" size={28} />
                   <h4 className="font-bold text-sm uppercase tracking-widest text-velum-900 mb-2">Hábito</h4>
                   <p className="text-xs text-velum-500 leading-relaxed">Generamos una rutina de cuidado personal predecible.</p>
                </div>
                <div className="bg-white p-8 text-center border border-transparent hover:border-velum-300 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1">
                   <Clock className="mx-auto text-velum-400 mb-4" size={28} />
                   <h4 className="font-bold text-sm uppercase tracking-widest text-velum-900 mb-2">Claridad</h4>
                   <p className="text-xs text-velum-500 leading-relaxed">Precios claros. Membresías inteligentes. Sin complicaciones.</p>
                </div>
            </div>
         </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-velum-900 text-velum-50 py-24 relative overflow-hidden">
         {/* TODO producción: reemplazar con asset propio en /public/velum-texture-dark.jpg */}
         <div className="absolute inset-0 opacity-20">
            <div className="w-full h-full bg-gradient-to-br from-stone-800 via-stone-700 to-stone-900" />
         </div>
         <div className="absolute inset-0 bg-velum-900/80"></div>
         
         <div className="relative max-w-4xl mx-auto px-4 text-center">
            <h3 className="text-2xl md:text-4xl font-serif italic mb-6 leading-tight">
              "Menos opciones = decisiones más rápidas."
            </h3>
            <p className="text-velum-200 mb-12 font-light max-w-lg mx-auto text-lg">
              El cuerpo se divide en 4 zonas: Identidad, Presencia, Equilibrio y Función.
              Elige tu nivel de cuidado.
            </p>
            <Link to="/memberships">
              <Button variant="secondary" size="lg" className="min-w-[240px] border-none shadow-lg transform hover:scale-105 transition-transform">
                Elegir Membresía
              </Button>
            </Link>
         </div>
      </section>
    </div>
  );
};
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MEMBERSHIPS, ZONES } from '../constants';
import { MembershipTier, ZoneId } from '../types';
import { Button } from '../components/Button';
import { Check, Info, Star, ArrowDown, Sparkles, ShieldCheck } from 'lucide-react';
import { createSubscriptionCheckout } from '../services/stripeService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const Memberships: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedTier, setSelectedTier] = useState<MembershipTier | null>(null);
  const [selectedZones, setSelectedZones] = useState<ZoneId[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleTierSelect = (tier: MembershipTier) => {
    setSelectedTier(tier);
    setSelectedZones([]);
    setStep(tier.isFullBody ? 3 : 2); // Skip zone selection if full body
    
    // Smooth scroll to next step area
    setTimeout(() => {
      document.getElementById('zone-selector')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const toggleZone = (zoneId: ZoneId) => {
    if (!selectedTier) return;
    
    const isSelected = selectedZones.includes(zoneId);
    
    if (isSelected) {
      setSelectedZones(prev => prev.filter(id => id !== zoneId));
    } else {
      if (selectedZones.length < selectedTier.maxZones) {
        setSelectedZones(prev => [...prev, zoneId]);
      }
    }
  };

  const canProceed = () => {
    if (!selectedTier) return false;
    if (selectedTier.isFullBody) return true;
    return selectedZones.length === selectedTier.maxZones;
  };

  const scrollToSelection = () => {
    document.getElementById('selection-tool')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCheckout = async () => {
    if (!selectedTier) return;
    if (!isAuthenticated) {
      toast.info("Inicia sesión para continuar con el pago.");
      navigate('/agenda?mode=login');
      return;
    }
    setIsCheckingOut(true);
    try {
      await createSubscriptionCheckout(selectedTier);
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo iniciar el pago. Intenta de nuevo.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="w-full">
      
      {/* --- HERO SECTION: PHILOSOPHY --- */}
      <section className="relative py-24 px-4 bg-velum-50 overflow-hidden">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-velum-500 mb-4">Filosofía Velum</h2>
          <h1 className="text-5xl md:text-7xl font-serif text-velum-900 italic mb-8 leading-tight">
            El cuerpo no es una lista.<br/> Es un sistema.
          </h1>
          <p className="text-lg text-velum-600 font-light leading-relaxed max-w-2xl mx-auto mb-10">
            Hemos redefinido la depilación láser abandonando el cobro por "parches" aislados. 
            Dividimos la anatomía en <strong>4 Zonas Maestras</strong> basadas en la función estética y emocional de cada área.
          </p>
          <button 
            onClick={scrollToSelection}
            className="flex items-center gap-2 mx-auto text-xs uppercase tracking-widest border-b border-velum-900 pb-1 text-velum-900 hover:text-velum-600 hover:border-velum-600 transition-all"
          >
            Saltar explicación y diseñar mi plan <ArrowDown size={14} />
          </button>
        </div>
        {/* Background Element */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-velum-100 rounded-full blur-[100px] -z-0 opacity-50"></div>
      </section>

      {/* --- VISUAL GUIDE TO ZONES --- */}
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto space-y-24">
          
          {/* ZONA I */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1 relative h-[500px] overflow-hidden group">
              <img 
                src="https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=1974" 
                alt="Zona I Identidad" 
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 grayscale hover:grayscale-0"
              />
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 text-[10px] uppercase font-bold tracking-widest">Zona I</div>
            </div>
            <div className="order-1 md:order-2 space-y-6">
              <h3 className="text-4xl font-serif text-velum-900 italic">Identidad</h3>
              <p className="text-velum-500 text-sm uppercase tracking-widest font-bold">Rostro • Cuello • Expresión</p>
              <div className="w-12 h-px bg-velum-300"></div>
              <p className="text-velum-700 font-light leading-loose">
                Es tu carta de presentación al mundo. La Zona I comprende las áreas de mayor visibilidad social. 
                Una piel despejada en el rostro y cuello transmite pulcritud inmediata y eleva la percepción de cuidado personal.
              </p>
              <ul className="text-sm text-velum-600 space-y-2">
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Rostro Completo</li>
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Cuello Anterior</li>
              </ul>
            </div>
          </div>

          {/* ZONA II */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h3 className="text-4xl font-serif text-velum-900 italic">Presencia</h3>
              <p className="text-velum-500 text-sm uppercase tracking-widest font-bold">Espalda Alta • Nuca • Porte</p>
              <div className="w-12 h-px bg-velum-300"></div>
              <p className="text-velum-700 font-light leading-loose">
                La elegancia entra por la postura. La Zona II se enfoca en la parte superior del torso posterior. 
                Es fundamental para quienes usan cabello recogido o prendas de corte bajo en la espalda.
              </p>
              <ul className="text-sm text-velum-600 space-y-2">
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Nuca y Cuello Posterior</li>
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Espalda Alta y Dorsales</li>
              </ul>
            </div>
            <div className="relative h-[500px] overflow-hidden group">
              <img 
                src="https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1974" 
                alt="Zona II Presencia" 
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 grayscale hover:grayscale-0"
              />
              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 text-[10px] uppercase font-bold tracking-widest">Zona II</div>
            </div>
          </div>

          {/* ZONA III */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1 relative h-[500px] overflow-hidden group">
              <img 
                src="https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=2070" 
                alt="Zona III Equilibrio" 
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 grayscale hover:grayscale-0"
              />
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 text-[10px] uppercase font-bold tracking-widest">Zona III</div>
            </div>
            <div className="order-1 md:order-2 space-y-6">
              <h3 className="text-4xl font-serif text-velum-900 italic">Equilibrio</h3>
              <p className="text-velum-500 text-sm uppercase tracking-widest font-bold">Torso • Abdomen • Centro</p>
              <div className="w-12 h-px bg-velum-300"></div>
              <p className="text-velum-700 font-light leading-loose">
                El núcleo del cuerpo. La Zona III abarca el abdomen y la espalda baja. 
                Es una zona de intimidad y fuerza, donde la textura suave de la piel resalta la definición natural del cuerpo.
              </p>
              <ul className="text-sm text-velum-600 space-y-2">
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Abdomen y Línea Alba</li>
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Lumbar Baja</li>
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Muslos Superiores</li>
              </ul>
            </div>
          </div>

          {/* ZONA IV */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h3 className="text-4xl font-serif text-velum-900 italic">Función</h3>
              <p className="text-velum-500 text-sm uppercase tracking-widest font-bold">Extremidades • Movimiento • Libertad</p>
              <div className="w-12 h-px bg-velum-300"></div>
              <p className="text-velum-700 font-light leading-loose">
                Diseñada para la vida en movimiento. La Zona IV cubre las áreas que más fricción generan en el día a día: 
                axilas, brazos y piernas. Es la zona más solicitada por su impacto directo en la comodidad diaria y el deporte.
              </p>
              <ul className="text-sm text-velum-600 space-y-2">
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Axilas y Brazos</li>
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Piernas Completas</li>
                <li className="flex items-center"><Check size={14} className="mr-2 text-velum-400"/> Bikini y Glúteos</li>
              </ul>
            </div>
            <div className="relative h-[500px] overflow-hidden group">
              <img 
                src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1961" 
                alt="Zona IV Función" 
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105 grayscale hover:grayscale-0"
              />
              <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 text-[10px] uppercase font-bold tracking-widest">Zona IV</div>
            </div>
          </div>

        </div>
      </section>

      {/* --- SELECTION TOOL (WIZARD) --- */}
      <div id="selection-tool" className="bg-velum-100 py-20 px-4 mt-12 border-t border-velum-200">
        <div className="max-w-7xl mx-auto">
          
          <div className="text-center mb-16">
            <span className="bg-velum-900 text-velum-50 px-3 py-1 text-[10px] uppercase font-bold tracking-widest rounded-sm mb-4 inline-block">
              Diseña tu plan
            </span>
            <h2 className="text-4xl md:text-5xl font-serif text-velum-900 italic mb-4">Selecciona tu Membresía</h2>
            <p className="text-velum-600 max-w-lg mx-auto font-light">
              Elige cuántas zonas quieres tratar simultáneamente. <br/>
              Puedes combinar zonas de diferentes grupos (Ej: Axilas de Zona IV + Rostro de Zona I).
            </p>
          </div>

          {/* Progress Indicators */}
          <div className="flex justify-center mb-12">
            <div className="flex items-center space-x-4 text-xs tracking-widest uppercase">
              <span className={`pb-1 border-b-2 transition-colors ${step >= 1 ? 'border-velum-900 text-velum-900 font-bold' : 'border-transparent text-velum-400'}`}>1. Nivel</span>
              <span className="text-velum-300">/</span>
              <span className={`pb-1 border-b-2 transition-colors ${step >= 2 ? 'border-velum-900 text-velum-900 font-bold' : 'border-transparent text-velum-400'}`}>2. Zonas</span>
              <span className="text-velum-300">/</span>
              <span className={`pb-1 border-b-2 transition-colors ${step >= 3 ? 'border-velum-900 text-velum-900 font-bold' : 'border-transparent text-velum-400'}`}>3. Activar</span>
            </div>
          </div>

          {/* Step 1: Membership Tiers */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in-up">
              {MEMBERSHIPS.map((tier) => (
                <div 
                  key={tier.id}
                  onClick={() => handleTierSelect(tier)}
                  className={`
                    relative p-6 border flex flex-col cursor-pointer transition-all duration-300 hover:-translate-y-2 group
                    ${selectedTier?.id === tier.id 
                      ? 'border-velum-900 bg-white shadow-2xl ring-1 ring-velum-900 z-10' 
                      : 'border-white bg-white/50 hover:bg-white hover:shadow-lg'}
                  `}
                >
                  {tier.isFullBody && (
                    <div className="absolute top-0 inset-x-0 bg-velum-900 text-velum-50 text-[10px] uppercase font-bold py-1 text-center tracking-widest">
                      <Sparkles size={10} className="inline mr-1"/> Best Seller
                    </div>
                  )}
                  
                  <div className={`mt-2 ${tier.isFullBody ? 'pt-4' : ''}`}>
                     <h3 className="font-serif text-lg text-velum-900 mb-1 group-hover:text-velum-600 transition-colors">{tier.name}</h3>
                     <div className="flex items-baseline mb-4">
                       <span className="text-xl font-bold font-sans text-velum-900">${tier.price}</span>
                       <span className="text-[10px] text-velum-500 ml-1">/mes</span>
                     </div>
                  </div>

                  <p className="text-xs text-velum-600 mb-6 font-light flex-grow leading-relaxed">
                    {tier.description}
                  </p>
                  
                  <div className="space-y-3 mb-6 border-t border-velum-100 pt-4">
                     <div className="flex items-center text-xs text-velum-700">
                        <div className="w-5 flex justify-center"><Check size={12} className="text-velum-900" /></div>
                        {tier.isFullBody ? <strong>Todas las Zonas</strong> : <span>Hasta <strong>{tier.maxZones} Zonas</strong></span>}
                     </div>
                     <div className="flex items-center text-xs text-velum-700">
                        <div className="w-5 flex justify-center"><Check size={12} className="text-velum-900" /></div>
                        Sesión Mensual
                     </div>
                  </div>

                  <Button 
                    variant={selectedTier?.id === tier.id ? 'primary' : 'outline'} 
                    className="w-full mt-auto"
                    size="sm"
                  >
                    {selectedTier?.id === tier.id ? 'Seleccionado' : 'Elegir'}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Step 2: Zone Selection */}
          {step === 2 && selectedTier && (
            <div id="zone-selector" className="animate-fade-in">
              <div className="max-w-5xl mx-auto">
                 <div className="bg-white p-8 mb-8 text-center border border-velum-200 shadow-sm">
                   <p className="font-serif text-2xl text-velum-900 mb-2">
                     Personalizando: <span className="italic">{selectedTier.name}</span>
                   </p>
                   <p className="text-sm text-velum-600">
                     Tienes <strong>{selectedTier.maxZones} crédito(s) de zona</strong>. <br/>
                     Has seleccionado: <span className="font-bold text-velum-900">{selectedZones.length} / {selectedTier.maxZones}</span>
                   </p>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {ZONES.map((zone) => {
                      const isSelected = selectedZones.includes(zone.id);
                      const isDisabled = !isSelected && selectedZones.length >= selectedTier.maxZones;

                      return (
                        <div 
                          key={zone.id}
                          onClick={() => !isDisabled && toggleZone(zone.id)}
                          className={`
                            flex flex-col p-5 border transition-all duration-300 cursor-pointer
                            ${isSelected 
                              ? 'border-velum-900 bg-velum-900 text-white shadow-lg transform -translate-y-1' 
                              : 'border-white bg-white hover:border-velum-300 text-velum-900'}
                            ${isDisabled ? 'opacity-40 grayscale cursor-not-allowed' : ''}
                          `}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <h4 className={`font-bold text-xs uppercase tracking-wider ${isSelected ? 'text-white' : 'text-velum-900'}`}>
                              {zone.name}
                            </h4>
                            {isSelected && <Check size={14} className="text-velum-200" />}
                          </div>
                          <p className={`text-[10px] mt-auto ${isSelected ? 'text-velum-200' : 'text-velum-500'}`}>
                            {zone.description}
                          </p>
                        </div>
                      )
                    })}
                 </div>

                 <div className="mt-12 flex justify-between items-center border-t border-velum-200 pt-8">
                    <button onClick={() => setStep(1)} className="text-xs uppercase font-bold tracking-widest text-velum-500 hover:text-velum-900 transition-colors">
                      ← Volver a Niveles
                    </button>
                    <Button 
                      disabled={!canProceed()} 
                      onClick={() => setStep(3)}
                      className="min-w-[200px]"
                    >
                      Continuar al Resumen
                    </Button>
                 </div>
              </div>
            </div>
          )}

          {/* Step 3: Checkout Stripe Integration */}
          {step === 3 && selectedTier && (
            <div className="animate-fade-in max-w-2xl mx-auto bg-white p-12 border border-velum-200 shadow-2xl relative">
               {/* Decorative Element */}
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-velum-200 via-velum-500 to-velum-200"></div>

               <div className="text-center mb-10">
                 <span className="text-[10px] uppercase tracking-[0.2em] text-velum-400">Confirmación</span>
                 <h3 className="font-serif text-4xl text-velum-900 mt-2 italic">Tu Membresía Velum</h3>
               </div>
               
               <div className="space-y-6 mb-10">
                 <div className="flex justify-between items-center pb-4 border-b border-velum-100">
                   <span className="text-xs text-velum-500 uppercase tracking-widest">Nivel Seleccionado</span>
                   <span className="font-bold text-velum-900 font-serif text-xl">{selectedTier.name}</span>
                 </div>
                 
                 <div className="pb-4 border-b border-velum-100">
                   <span className="text-xs text-velum-500 uppercase tracking-widest block mb-3">Zonas a Tratar</span>
                   <div className="bg-velum-50 p-4 rounded-sm space-y-2">
                     {selectedTier.isFullBody ? (
                       <div className="flex items-center text-velum-900 font-bold">
                         <Sparkles size={14} className="mr-2 text-velum-500"/> Experiencia Signature (Cuerpo Completo)
                       </div>
                     ) : (
                       selectedZones.map(z => {
                          const zName = ZONES.find(zone => zone.id === z)?.name;
                          return (
                            <div key={z} className="flex items-center text-sm text-velum-800">
                              <div className="w-1.5 h-1.5 bg-velum-400 rounded-full mr-3"></div>
                              {zName}
                            </div>
                          )
                       })
                     )}
                   </div>
                 </div>

                 <div className="flex justify-between items-center pt-2">
                   <span className="text-xs text-velum-500 uppercase tracking-widest">Cargo Mensual Recurrente</span>
                   <span className="font-serif text-3xl font-bold text-velum-900">${selectedTier.price}</span>
                 </div>
               </div>

               <div className="bg-velum-50 p-6 border border-velum-100 mb-10 flex gap-4 items-start">
                 <ShieldCheck size={20} className="text-green-700 flex-shrink-0 mt-0.5" />
                 <div className="text-xs text-velum-600 leading-relaxed space-y-2">
                   <p className="font-bold text-velum-800">Pago Seguro vía Stripe:</p>
                   <p>Serás redirigido a una pasarela bancaria encriptada (SSL). Velum Laser no almacena los datos de tu tarjeta directamente.</p>
                   <p>La suscripción se renovará automáticamente cada mes. Puedes cancelarla desde tu perfil.</p>
                 </div>
               </div>

               <div className="flex flex-col gap-4">
                  <Button
                    className="w-full py-4 text-sm shadow-xl hover:shadow-2xl transition-shadow"
                    onClick={handleCheckout}
                    isLoading={isCheckingOut}
                    loadingLabel="Redirigiendo a Stripe..."
                  >
                    Pagar y Activar Suscripción (Stripe)
                  </Button>
                  <button 
                    onClick={() => setStep(selectedTier.isFullBody ? 1 : 2)}
                    className="text-xs text-velum-500 hover:text-velum-900 underline text-center"
                    disabled={isCheckingOut}
                  >
                    Modificar selección
                  </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

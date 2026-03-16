import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MEMBERSHIPS, ZONES } from '../constants';
import { MembershipTier, ZoneId } from '../types';
import { Button } from '../components/Button';
import { Check, ArrowDown, Sparkles, ShieldCheck, UserPlus, FileText, CreditCard, ArrowRight } from 'lucide-react';
import { createSubscriptionCheckout } from '../services/stripeService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../services/apiClient';

const PENDING_PLAN_KEY = 'velum_pending_plan';

export const Memberships: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedTier, setSelectedTier] = useState<MembershipTier | null>(null);
  const [selectedZones, setSelectedZones] = useState<ZoneId[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Recuperar plan pendiente de localStorage (regreso desde registro/intake)
  useEffect(() => {
    const raw = localStorage.getItem(PENDING_PLAN_KEY);
    if (!raw) return;
    try {
      const { tierId, zones } = JSON.parse(raw);
      const tier = MEMBERSHIPS.find((t) => t.id === tierId);
      if (tier && !selectedTier) {
        setSelectedTier(tier);
        setSelectedZones(zones ?? []);
        setStep(3);
        // Solo limpiar localStorage cuando el usuario es autenticado y está en pago
        if (isAuthenticated) localStorage.removeItem(PENDING_PLAN_KEY);
      }
    } catch { /* ignore */ }
  }, [isAuthenticated]);

  // Pre-select plan from appointment deposit if available
  useEffect(() => {
    if (!isAuthenticated) return;
    apiFetch<any>("/membership/status").then((data) => {
      const code = data?.interestedPlanCode;
      if (!code) return;
      const tier = MEMBERSHIPS.find((t) => t.stripePriceId === code);
      if (tier && !selectedTier) {
        setSelectedTier(tier);
        setStep(tier.isFullBody ? 3 : 2);
      }
    }).catch(() => {});
  }, [isAuthenticated]);

  const handleTierSelect = (tier: MembershipTier) => {
    setSelectedTier(tier);
    setSelectedZones([]);
    if (tier.isFullBody) {
      localStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ tierId: tier.id, zones: [] }));
      setStep(3);
    } else {
      setStep(2);
      setTimeout(() => {
        document.getElementById('zone-selector')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
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

  const handleProceedToSummary = () => {
    if (!selectedTier) return;
    // Persist selection so it survives the registration flow
    localStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({
      tierId: selectedTier.id,
      zones: selectedZones,
    }));
    setStep(3);
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
      <section className="relative py-40 px-6 overflow-hidden flex items-center justify-center">
        {/* Imagen de fondo oscura y de lujo */}
        <img
          src="https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=1920&q=90&auto=format&fit=crop&crop=center"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-velum-900/70 via-velum-900/80 to-velum-900/95" />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* Tech badge */}
          <div className="inline-flex items-center gap-2 border border-white/20 bg-white/10 backdrop-blur-sm px-5 py-2 mb-8 rounded-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-velum-300 inline-block" />
            <span className="text-white/70 text-xs font-bold uppercase tracking-[0.25em]">Cuatriodo Láser · 755 · 808 · 980 · 1064 nm</span>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.25em] text-velum-300 mb-4">Filosofía VELUM</p>
          <h1 className="text-5xl md:text-7xl font-serif text-white italic mb-8 leading-tight">
            El cuerpo no es<br/>una lista.
          </h1>
          <p className="text-lg text-white/60 font-light leading-relaxed max-w-2xl mx-auto mb-12">
            Hemos redefinido la depilación láser abandonando el cobro por "parches" aislados.
            Dividimos la anatomía en <span className="text-white font-normal">4 Zonas Maestras</span> basadas
            en la función estética y emocional de cada área.
          </p>
          <button
            onClick={scrollToSelection}
            className="inline-flex items-center gap-2 text-white/60 hover:text-white text-xs uppercase tracking-widest border-b border-white/20 hover:border-white/60 pb-1 transition-all duration-200"
          >
            Diseñar mi plan ahora <ArrowDown size={14} />
          </button>
        </div>
      </section>

      {/* --- VISUAL GUIDE TO ZONES --- */}
      <section className="py-24 px-6 bg-velum-50">
        <div className="text-center mb-20">
          <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">Las 4 Zonas Maestras</p>
          <h2 className="text-4xl md:text-5xl font-serif text-velum-900 italic">Es un sistema.</h2>
        </div>
        <div className="max-w-6xl mx-auto space-y-28">
          
          {/* ZONA I */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="order-2 md:order-1 relative h-[560px] overflow-hidden group shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=90&w=1974&auto=format&fit=crop"
                alt="Zona I Identidad"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-700" />
              <div className="absolute top-5 left-5 bg-white/95 backdrop-blur-sm px-4 py-2">
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-velum-900">Zona I · Identidad</span>
              </div>
            </div>
            <div className="order-1 md:order-2 space-y-7">
              <div>
                <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">01</p>
                <h3 className="text-5xl font-serif text-velum-900 italic leading-none mb-2">Identidad</h3>
                <p className="text-velum-400 text-xs uppercase tracking-widest font-bold">Rostro · Cuello · Expresión</p>
              </div>
              <div className="w-10 h-px bg-velum-300" />
              <p className="text-velum-600 font-light leading-relaxed text-lg">
                Es tu carta de presentación al mundo. La Zona I comprende las áreas de mayor
                visibilidad social. Una piel despejada en rostro y cuello transmite pulcritud
                inmediata y eleva la percepción de cuidado personal.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Rostro Completo
                </li>
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Cuello Anterior
                </li>
              </ul>
              <div className="border-t border-velum-100 pt-5">
                <p className="text-[10px] text-velum-400 uppercase tracking-widest">Tecnología aplicada</p>
                <p className="text-sm font-bold text-velum-900 mt-1">755 nm · 808 nm · 980 nm · 1064 nm</p>
              </div>
            </div>
          </div>

          {/* ZONA II */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-7">
              <div>
                <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">02</p>
                <h3 className="text-5xl font-serif text-velum-900 italic leading-none mb-2">Presencia</h3>
                <p className="text-velum-400 text-xs uppercase tracking-widest font-bold">Espalda Alta · Nuca · Porte</p>
              </div>
              <div className="w-10 h-px bg-velum-300" />
              <p className="text-velum-600 font-light leading-relaxed text-lg">
                La elegancia entra por la postura. La Zona II se enfoca en la parte superior del
                torso posterior. Fundamental para quienes usan cabello recogido o prendas de
                escote bajo en la espalda.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Nuca y Cuello Posterior
                </li>
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Espalda Alta y Dorsales
                </li>
              </ul>
              <div className="border-t border-velum-100 pt-5">
                <p className="text-[10px] text-velum-400 uppercase tracking-widest">Tecnología aplicada</p>
                <p className="text-sm font-bold text-velum-900 mt-1">755 nm · 808 nm · 980 nm · 1064 nm</p>
              </div>
            </div>
            <div className="relative h-[560px] overflow-hidden group shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1519681393784-d120267933ba?q=90&w=1974&auto=format&fit=crop"
                alt="Zona II Presencia"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-700" />
              <div className="absolute top-5 right-5 bg-white/95 backdrop-blur-sm px-4 py-2">
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-velum-900">Zona II · Presencia</span>
              </div>
            </div>
          </div>

          {/* ZONA III */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="order-2 md:order-1 relative h-[560px] overflow-hidden group shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=90&w=2070&auto=format&fit=crop"
                alt="Zona III Equilibrio"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-700" />
              <div className="absolute top-5 left-5 bg-white/95 backdrop-blur-sm px-4 py-2">
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-velum-900">Zona III · Equilibrio</span>
              </div>
            </div>
            <div className="order-1 md:order-2 space-y-7">
              <div>
                <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">03</p>
                <h3 className="text-5xl font-serif text-velum-900 italic leading-none mb-2">Equilibrio</h3>
                <p className="text-velum-400 text-xs uppercase tracking-widest font-bold">Torso · Abdomen · Centro</p>
              </div>
              <div className="w-10 h-px bg-velum-300" />
              <p className="text-velum-600 font-light leading-relaxed text-lg">
                El núcleo del cuerpo. La Zona III abarca el abdomen y la espalda baja. Zona de
                intimidad y fuerza, donde la textura suave resalta la definición natural del cuerpo.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Abdomen y Línea Alba
                </li>
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Lumbar Baja
                </li>
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Muslos Superiores
                </li>
              </ul>
              <div className="border-t border-velum-100 pt-5">
                <p className="text-[10px] text-velum-400 uppercase tracking-widest">Tecnología aplicada</p>
                <p className="text-sm font-bold text-velum-900 mt-1">755 nm · 808 nm · 980 nm · 1064 nm</p>
              </div>
            </div>
          </div>

          {/* ZONA IV */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-7">
              <div>
                <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">04</p>
                <h3 className="text-5xl font-serif text-velum-900 italic leading-none mb-2">Función</h3>
                <p className="text-velum-400 text-xs uppercase tracking-widest font-bold">Extremidades · Movimiento · Libertad</p>
              </div>
              <div className="w-10 h-px bg-velum-300" />
              <p className="text-velum-600 font-light leading-relaxed text-lg">
                Diseñada para la vida en movimiento. La Zona IV cubre las áreas que más fricción
                generan en el día a día: axilas, brazos y piernas. La zona más solicitada por su
                impacto directo en comodidad y deporte.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Axilas y Brazos
                </li>
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Piernas Completas
                </li>
                <li className="flex items-center gap-3 text-sm text-velum-700 font-light">
                  <Check size={14} className="text-velum-400 flex-shrink-0" /> Bikini y Glúteos
                </li>
              </ul>
              <div className="border-t border-velum-100 pt-5">
                <p className="text-[10px] text-velum-400 uppercase tracking-widest">Tecnología aplicada</p>
                <p className="text-sm font-bold text-velum-900 mt-1">755 nm · 808 nm · 980 nm · 1064 nm</p>
              </div>
            </div>
            <div className="relative h-[560px] overflow-hidden group shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=90&w=1961&auto=format&fit=crop"
                alt="Zona IV Función"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-700" />
              <div className="absolute top-5 right-5 bg-white/95 backdrop-blur-sm px-4 py-2">
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-velum-900">Zona IV · Función</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* --- SELECTION TOOL (WIZARD) --- */}
      <div id="selection-tool" className="bg-velum-900 py-24 px-6 border-t border-velum-800">
        <div className="max-w-7xl mx-auto">

          <div className="text-center mb-16">
            <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">Diseña tu plan</p>
            <h2 className="text-4xl md:text-5xl font-serif text-velum-50 italic mb-5">Selecciona tu Membresía</h2>
            <p className="text-velum-400 max-w-lg mx-auto font-light leading-relaxed">
              Elige cuántas zonas quieres tratar simultáneamente.
              Puedes combinar zonas de diferentes grupos — total flexibilidad.
            </p>
          </div>

          {/* Progress Indicators */}
          <div className="flex justify-center mb-12">
            <div className="flex items-center gap-3 text-xs tracking-widest uppercase">
              <span className={`pb-1 border-b-2 transition-colors ${step >= 1 ? 'border-velum-300 text-velum-50 font-bold' : 'border-transparent text-velum-600'}`}>1. Plan</span>
              <span className="text-velum-700">/</span>
              <span className={`pb-1 border-b-2 transition-colors ${step >= 2 ? 'border-velum-300 text-velum-50 font-bold' : 'border-transparent text-velum-600'}`}>2. Zonas</span>
              <span className="text-velum-700">/</span>
              <span className={`pb-1 border-b-2 transition-colors ${step >= 3 ? 'border-velum-300 text-velum-50 font-bold' : 'border-transparent text-velum-600'}`}>3. Cuenta</span>
              <span className="text-velum-700">/</span>
              <span className={`pb-1 border-b-2 transition-colors ${step >= 3 && isAuthenticated ? 'border-velum-300 text-velum-50 font-bold' : 'border-transparent text-velum-600'}`}>4. Pagar</span>
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
                      ? 'border-velum-200 bg-white shadow-2xl ring-1 ring-velum-200 z-10'
                      : 'border-velum-700 bg-velum-800/50 hover:bg-velum-800 hover:border-velum-500 hover:shadow-lg'}
                  `}
                >
                  {tier.isFullBody && (
                    <div className="absolute top-0 inset-x-0 bg-velum-900 text-velum-50 text-[10px] uppercase font-bold py-1 text-center tracking-widest">
                      <Sparkles size={10} className="inline mr-1"/> Best Seller
                    </div>
                  )}
                  
                  <div className={`mt-2 ${tier.isFullBody ? 'pt-4' : ''}`}>
                     <h3 className={`font-serif text-lg mb-1 transition-colors ${selectedTier?.id === tier.id ? 'text-velum-900' : 'text-velum-50'}`}>{tier.name}</h3>
                     <div className="flex items-baseline mb-4">
                       <span className={`text-xl font-bold font-sans ${selectedTier?.id === tier.id ? 'text-velum-900' : 'text-velum-50'}`}>${tier.price}</span>
                       <span className={`text-[10px] ml-1 ${selectedTier?.id === tier.id ? 'text-velum-500' : 'text-velum-400'}`}>/mes</span>
                     </div>
                  </div>

                  <p className={`text-xs mb-6 font-light flex-grow leading-relaxed ${selectedTier?.id === tier.id ? 'text-velum-600' : 'text-velum-400'}`}>
                    {tier.description}
                  </p>

                  <div className={`space-y-3 mb-6 border-t pt-4 ${selectedTier?.id === tier.id ? 'border-velum-100' : 'border-velum-700'}`}>
                     <div className={`flex items-center text-xs ${selectedTier?.id === tier.id ? 'text-velum-700' : 'text-velum-300'}`}>
                        <div className="w-5 flex justify-center"><Check size={12} className={selectedTier?.id === tier.id ? 'text-velum-900' : 'text-velum-400'} /></div>
                        {tier.isFullBody ? <strong>Todas las Zonas</strong> : <span>Hasta <strong>{tier.maxZones} Zonas</strong></span>}
                     </div>
                     <div className={`flex items-center text-xs ${selectedTier?.id === tier.id ? 'text-velum-700' : 'text-velum-300'}`}>
                        <div className="w-5 flex justify-center"><Check size={12} className={selectedTier?.id === tier.id ? 'text-velum-900' : 'text-velum-400'} /></div>
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

          {/* Step 2: Zone Selection — agrupado por Zona Maestra */}
          {step === 2 && selectedTier && (
            <div id="zone-selector" className="animate-fade-in">
              <div className="max-w-3xl mx-auto">

                {/* Contador de créditos */}
                <div className="bg-velum-800 border border-velum-700 rounded-sm p-6 mb-8 flex items-center justify-between">
                  <div>
                    <p className="text-velum-50 font-semibold text-sm">
                      Plan <span className="font-serif italic">{selectedTier.name}</span>
                    </p>
                    <p className="text-velum-400 text-xs mt-0.5">
                      Elige {selectedTier.maxZones === 1 ? '1 área' : `${selectedTier.maxZones} áreas`} del cuerpo para tratar
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex gap-2 justify-end mb-1">
                      {Array.from({ length: selectedTier.maxZones }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${i < selectedZones.length ? 'bg-velum-300 border-velum-300' : 'border-velum-600'}`}
                        />
                      ))}
                    </div>
                    <p className="text-velum-400 text-xs">
                      {selectedZones.length} de {selectedTier.maxZones} seleccionadas
                    </p>
                  </div>
                </div>

                {/* Zonas agrupadas por Zona Maestra */}
                {[
                  {
                    label: 'Zona I · Identidad',
                    sub: 'Rostro y cuello — lo que el mundo ve primero',
                    ids: ['FACE_FULL', 'NECK'] as ZoneId[],
                  },
                  {
                    label: 'Zona II · Presencia',
                    sub: 'Nuca y espalda alta — elegancia en el porte',
                    ids: ['NAPE', 'UPPER_BACK'] as ZoneId[],
                  },
                  {
                    label: 'Zona III · Equilibrio',
                    sub: 'Torso y muslos — el núcleo del cuerpo',
                    ids: ['ABDOMEN', 'LOWER_BACK', 'THIGHS'] as ZoneId[],
                  },
                  {
                    label: 'Zona IV · Función',
                    sub: 'Extremidades — comodidad en movimiento',
                    ids: ['UNDERARMS', 'ARMS_FULL', 'BIKINI', 'GLUTEUS', 'LOWER_LEGS'] as ZoneId[],
                  },
                ].map((group) => (
                  <div key={group.label} className="mb-4">
                    {/* Header de grupo */}
                    <div className="flex items-center gap-3 px-1 mb-3">
                      <p className="text-velum-50 text-xs font-bold uppercase tracking-widest">{group.label}</p>
                      <div className="flex-1 h-px bg-velum-800" />
                      <p className="text-velum-600 text-xs">{group.sub}</p>
                    </div>

                    {/* Áreas dentro del grupo */}
                    <div className="flex flex-wrap gap-3">
                      {group.ids.map((id) => {
                        const zone = ZONES.find(z => z.id === id)!;
                        const isSelected = selectedZones.includes(id);
                        const isDisabled = !isSelected && selectedZones.length >= selectedTier.maxZones;

                        return (
                          <button
                            key={id}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => !isDisabled && toggleZone(id)}
                            className={`
                              flex items-center gap-2 px-4 py-2.5 rounded-sm border text-sm font-medium transition-all duration-200
                              ${isSelected
                                ? 'bg-white text-velum-900 border-white shadow-md'
                                : 'bg-transparent text-velum-300 border-velum-700 hover:border-velum-400 hover:text-velum-100'}
                              ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                          >
                            {isSelected && <Check size={13} className="text-velum-500 flex-shrink-0" />}
                            {zone.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Mensaje cuando cupo lleno */}
                {selectedZones.length >= selectedTier.maxZones && (
                  <p className="text-velum-400 text-xs text-center mt-4 animate-fade-in">
                    Llegaste al límite de tu plan. Deselecciona un área para cambiar tu elección.
                  </p>
                )}

                <div className="mt-10 flex justify-between items-center border-t border-velum-800 pt-8">
                  <button onClick={() => setStep(1)} className="text-xs uppercase font-bold tracking-widest text-velum-500 hover:text-velum-200 transition-colors">
                    ← Volver
                  </button>
                  <Button
                    disabled={!canProceed()}
                    onClick={handleProceedToSummary}
                    className="min-w-[200px]"
                  >
                    Continuar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Registro o Checkout */}
          {step === 3 && selectedTier && (
            <div className="animate-fade-in max-w-2xl mx-auto">

              {/* ── NO autenticado: mostrar roadmap y redirigir a registro ── */}
              {!isAuthenticated && (
                <div className="bg-white border border-velum-100 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-velum-200 via-velum-500 to-velum-200" />

                  {/* Resumen del plan elegido */}
                  <div className="bg-velum-50 border-b border-velum-100 px-10 py-7 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-velum-400 mb-1">Plan seleccionado</p>
                      <p className="font-serif text-2xl text-velum-900 italic">{selectedTier.name}</p>
                      {!selectedTier.isFullBody && selectedZones.length > 0 && (
                        <p className="text-xs text-velum-500 mt-1">
                          {selectedZones.map(z => ZONES.find(zone => zone.id === z)?.name).join(' · ')}
                        </p>
                      )}
                    </div>
                    <p className="font-serif text-3xl text-velum-900">${selectedTier.price}<span className="text-sm text-velum-400">/mes</span></p>
                  </div>

                  <div className="px-10 py-10">
                    <h3 className="font-serif text-3xl text-velum-900 italic mb-2">Antes de activar tu plan</h3>
                    <p className="text-velum-500 font-light text-sm mb-10 leading-relaxed">
                      Por tu seguridad y la calidad del tratamiento, necesitamos conocerte primero.
                      El proceso toma menos de 5 minutos.
                    </p>

                    {/* Roadmap de pasos */}
                    <div className="space-y-0 mb-10">
                      {[
                        {
                          num: '✓', done: true,
                          icon: <Check size={16} />,
                          label: 'Plan y zonas elegidas',
                          desc: `${selectedTier.name}${!selectedTier.isFullBody && selectedZones.length > 0 ? ' · ' + selectedZones.map(z => ZONES.find(zone => zone.id === z)?.name).join(', ') : ''}`,
                        },
                        {
                          num: '2', done: false,
                          icon: <UserPlus size={16} />,
                          label: 'Crear tu cuenta',
                          desc: 'Nombre, teléfono, email y contraseña',
                        },
                        {
                          num: '3', done: false,
                          icon: <FileText size={16} />,
                          label: 'Ficha clínica',
                          desc: 'Historial médico, fototipo de piel y consentimiento informado',
                        },
                        {
                          num: '4', done: false,
                          icon: <CreditCard size={16} />,
                          label: 'Pago y activación',
                          desc: 'Pago seguro vía Stripe. Sin guardar datos de tarjeta.',
                        },
                      ].map((item, i) => (
                        <div key={i} className="flex gap-4 items-start">
                          <div className="flex flex-col items-center">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${item.done ? 'bg-velum-900 text-white' : 'bg-velum-100 text-velum-400'}`}>
                              {item.done ? <Check size={14} /> : item.num}
                            </div>
                            {i < 3 && <div className="w-px h-8 bg-velum-100 mt-1" />}
                          </div>
                          <div className="pb-6">
                            <p className={`text-sm font-bold ${item.done ? 'text-velum-900' : 'text-velum-400'}`}>{item.label}</p>
                            <p className="text-xs text-velum-400 font-light mt-0.5">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-3">
                      <Button
                        className="w-full py-4"
                        onClick={() => navigate('/agenda?mode=register')}
                      >
                        Continuar — Crear mi cuenta
                        <ArrowRight size={14} className="ml-2" />
                      </Button>
                      <button
                        onClick={() => navigate('/agenda?mode=login')}
                        className="text-xs text-velum-500 hover:text-velum-900 transition-colors text-center py-2"
                      >
                        Ya tengo cuenta — Iniciar sesión
                      </button>
                      <button
                        onClick={() => setStep(selectedTier.isFullBody ? 1 : 2)}
                        className="text-xs text-velum-400 hover:text-velum-600 transition-colors text-center"
                      >
                        ← Cambiar plan
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Autenticado: mostrar checkout ── */}
              {isAuthenticated && (
                <div className="bg-white p-12 border border-velum-100 shadow-2xl relative">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-velum-200 via-velum-500 to-velum-200" />

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
                            <Sparkles size={14} className="mr-2 text-velum-500" /> Experiencia Signature (Cuerpo Completo)
                          </div>
                        ) : (
                          selectedZones.map(z => {
                            const zName = ZONES.find(zone => zone.id === z)?.name;
                            return (
                              <div key={z} className="flex items-center text-sm text-velum-800">
                                <div className="w-1.5 h-1.5 bg-velum-400 rounded-full mr-3" />
                                {zName}
                              </div>
                            );
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
          )}
        </div>
      </div>
    </div>
  );
};

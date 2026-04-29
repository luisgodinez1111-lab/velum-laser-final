import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MEMBERSHIPS, ZONES, MASTER_ZONES, SMALL_ZONE_IDS, MEDIUM_ZONE_IDS, SELECT_MAX_SMALL, SELECT_MAX_MEDIUM } from '../constants';
import { MembershipTier, ZoneId } from '../types';
import { PillButton } from '../components/ui';
import { Check, ArrowDown, Sparkles, ShieldCheck, ChevronRight } from 'lucide-react';
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
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

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
      if (!mountedRef.current) return;
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
      if (!isAuthenticated) {
        navigate('/agenda?mode=register');
      } else {
        setStep(3);
      }
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
      return;
    }
    if (selectedTier.selectionMode === 'custom') {
      const isSmall = SMALL_ZONE_IDS.includes(zoneId);
      const isMedium = MEDIUM_ZONE_IDS.includes(zoneId);
      const currentSmall = selectedZones.filter(z => SMALL_ZONE_IDS.includes(z)).length;
      const currentMedium = selectedZones.filter(z => MEDIUM_ZONE_IDS.includes(z)).length;
      if (isSmall && currentSmall >= SELECT_MAX_SMALL) return;
      if (isMedium && currentMedium >= SELECT_MAX_MEDIUM) return;
    } else {
      if (selectedZones.length >= selectedTier.maxZones) return;
    }
    setSelectedZones(prev => [...prev, zoneId]);
  };

  const canProceed = () => {
    if (!selectedTier) return false;
    if (selectedTier.isFullBody) return true;
    if (selectedTier.selectionMode === 'custom') {
      const small = selectedZones.filter(z => SMALL_ZONE_IDS.includes(z)).length;
      const medium = selectedZones.filter(z => MEDIUM_ZONE_IDS.includes(z)).length;
      return small === SELECT_MAX_SMALL && medium === SELECT_MAX_MEDIUM;
    }
    return selectedZones.length === selectedTier.maxZones;
  };

  const scrollToSelection = () => {
    document.getElementById('selection-tool')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleProceedToSummary = () => {
    if (!selectedTier) return;
    // Guardar selección para recuperarla después del registro
    localStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({
      tierId: selectedTier.id,
      zones: selectedZones,
    }));
    if (!isAuthenticated) {
      // Ir directo a registro — sin pantalla intermedia
      navigate('/agenda?mode=register');
    } else {
      setStep(3);
    }
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
      
      {/* --- HERO SECTION: PHILOSOPHY (Apple híbrido) --- */}
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
          {/* Tech badge — pill sin uppercase extremo */}
          <div className="inline-flex items-center gap-2 border border-white/20 bg-white/10 backdrop-blur-md px-4 py-1.5 mb-10 rounded-full animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-velum-300" />
            <span className="text-white/90 text-[12px] font-medium tracking-wide">Cuatriodo Láser · 755 · 808 · 980 · 1064 nm</span>
          </div>

          <p className="text-[13px] font-semibold text-velum-300 mb-6 animate-fade-in-up" style={{ animationDelay: '60ms' }}>Filosofía VELUM</p>
          <h1
            className="font-sans font-bold text-white text-5xl sm:text-6xl md:text-7xl lg:text-[88px] leading-[0.95] tracking-[-0.035em] mb-10 animate-fade-in-up"
            style={{ animationDelay: '120ms' }}
          >
            El cuerpo no es<br/>una lista.
          </h1>
          <p className="text-lg text-white/70 leading-relaxed max-w-2xl mx-auto mb-12 animate-fade-in-up" style={{ animationDelay: '240ms' }}>
            Hemos redefinido la depilación láser abandonando el cobro por "parches" aislados.
            Dividimos la anatomía en <span className="text-white font-medium">4 Zonas Maestras</span> basadas
            en la función estética y emocional de cada área.
          </p>
          <div className="animate-fade-in-up" style={{ animationDelay: '360ms' }}>
            <PillButton
              variant="outlineDark"
              size="lg"
              onClick={scrollToSelection}
              rightIcon={<ArrowDown size={16} className="transition-transform duration-base ease-standard group-hover:translate-y-0.5" aria-hidden="true" />}
            >
              Diseñar mi plan
            </PillButton>
          </div>
        </div>
      </section>

      {/* --- VISUAL GUIDE TO ZONES (Apple híbrido) --- */}
      <section className="py-24 px-6 bg-velum-50">
        <div className="text-center mb-20">
          <p className="text-[13px] font-semibold text-velum-500 mb-3">Las 4 Zonas Maestras</p>
          <h2 className="font-sans font-bold text-velum-900 text-4xl md:text-5xl lg:text-6xl tracking-[-0.025em]">Es un sistema.</h2>
        </div>
        <div className="max-w-6xl mx-auto space-y-28">
          
          {/* ZONA I */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="order-2 md:order-1 relative h-[560px] overflow-hidden group rounded-3xl">
              <img
                src="https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=90&w=1974&auto=format&fit=crop"
                alt="Zona I Identidad"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-slower ease-decelerate group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-slower ease-standard" />
              <div className="absolute top-5 left-5 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full">
                <span className="text-[12px] font-semibold text-velum-900">Zona I · Identidad</span>
              </div>
            </div>
            <div className="order-1 md:order-2 space-y-7">
              <div>
                <p className="text-[13px] font-semibold text-velum-500 mb-3">01</p>
                <h3 className="font-sans font-bold text-velum-900 text-5xl md:text-6xl tracking-[-0.025em] leading-none mb-3">Identidad</h3>
                <p className="text-velum-500 text-[13px] font-medium">Rostro · Cuello · Expresión</p>
              </div>
              <div className="w-10 h-px bg-velum-300" />
              <p className="text-velum-700 leading-relaxed text-lg">
                Es tu carta de presentación al mundo. La Zona I comprende las áreas de mayor
                visibilidad social. Una piel despejada en rostro y cuello transmite pulcritud
                inmediata y eleva la percepción de cuidado personal.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Rostro Completo
                </li>
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Cuello Anterior
                </li>
              </ul>
              <div className="border-t border-velum-200 pt-5">
                <p className="text-[13px] font-semibold text-velum-500">Tecnología aplicada</p>
                <p className="text-[15px] font-semibold text-velum-900 mt-1 tabular-nums">755 nm · 808 nm · 980 nm · 1064 nm</p>
              </div>
            </div>
          </div>

          {/* ZONA II */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-7">
              <div>
                <p className="text-[13px] font-semibold text-velum-500 mb-3">02</p>
                <h3 className="font-sans font-bold text-velum-900 text-5xl md:text-6xl tracking-[-0.025em] leading-none mb-3">Presencia</h3>
                <p className="text-velum-500 text-[13px] font-medium">Espalda Alta · Nuca · Porte</p>
              </div>
              <div className="w-10 h-px bg-velum-300" />
              <p className="text-velum-700 leading-relaxed text-lg">
                La elegancia entra por la postura. La Zona II se enfoca en la parte superior del
                torso posterior. Fundamental para quienes usan cabello recogido o prendas de
                escote bajo en la espalda.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Nuca y Cuello Posterior
                </li>
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Espalda Alta y Dorsales
                </li>
              </ul>
              <div className="border-t border-velum-200 pt-5">
                <p className="text-[13px] font-semibold text-velum-500">Tecnología aplicada</p>
                <p className="text-[15px] font-semibold text-velum-900 mt-1 tabular-nums">755 nm · 808 nm · 980 nm · 1064 nm</p>
              </div>
            </div>
            <div className="relative h-[560px] overflow-hidden group rounded-3xl">
              <img
                src="https://images.unsplash.com/photo-1519681393784-d120267933ba?q=90&w=1974&auto=format&fit=crop"
                alt="Zona II Presencia"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-slower ease-decelerate group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-slower ease-standard" />
              <div className="absolute top-5 right-5 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full">
                <span className="text-[12px] font-semibold text-velum-900">Zona II · Presencia</span>
              </div>
            </div>
          </div>

          {/* ZONA III */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="order-2 md:order-1 relative h-[560px] overflow-hidden group rounded-3xl">
              <img
                src="https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=90&w=2070&auto=format&fit=crop"
                alt="Zona III Equilibrio"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-slower ease-decelerate group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-slower ease-standard" />
              <div className="absolute top-5 left-5 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full">
                <span className="text-[12px] font-semibold text-velum-900">Zona III · Equilibrio</span>
              </div>
            </div>
            <div className="order-1 md:order-2 space-y-7">
              <div>
                <p className="text-[13px] font-semibold text-velum-500 mb-3">03</p>
                <h3 className="font-sans font-bold text-velum-900 text-5xl md:text-6xl tracking-[-0.025em] leading-none mb-3">Equilibrio</h3>
                <p className="text-velum-500 text-[13px] font-medium">Torso · Abdomen · Centro</p>
              </div>
              <div className="w-10 h-px bg-velum-300" />
              <p className="text-velum-700 leading-relaxed text-lg">
                El núcleo del cuerpo. La Zona III abarca el abdomen y la espalda baja. Zona de
                intimidad y fuerza, donde la textura suave resalta la definición natural del cuerpo.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Abdomen y Línea Alba
                </li>
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Lumbar Baja
                </li>
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Muslos Superiores
                </li>
              </ul>
              <div className="border-t border-velum-200 pt-5">
                <p className="text-[13px] font-semibold text-velum-500">Tecnología aplicada</p>
                <p className="text-[15px] font-semibold text-velum-900 mt-1 tabular-nums">755 nm · 808 nm · 980 nm · 1064 nm</p>
              </div>
            </div>
          </div>

          {/* ZONA IV */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-7">
              <div>
                <p className="text-[13px] font-semibold text-velum-500 mb-3">04</p>
                <h3 className="font-sans font-bold text-velum-900 text-5xl md:text-6xl tracking-[-0.025em] leading-none mb-3">Función</h3>
                <p className="text-velum-500 text-[13px] font-medium">Extremidades · Movimiento · Libertad</p>
              </div>
              <div className="w-10 h-px bg-velum-300" />
              <p className="text-velum-700 leading-relaxed text-lg">
                Diseñada para la vida en movimiento. La Zona IV cubre las áreas que más fricción
                generan en el día a día: axilas, brazos y piernas. La zona más solicitada por su
                impacto directo en comodidad y deporte.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Axilas y Brazos
                </li>
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Piernas Completas
                </li>
                <li className="flex items-center gap-3 text-[15px] text-velum-700">
                  <Check size={14} className="text-velum-500 flex-shrink-0" /> Bikini y Glúteos
                </li>
              </ul>
              <div className="border-t border-velum-200 pt-5">
                <p className="text-[13px] font-semibold text-velum-500">Tecnología aplicada</p>
                <p className="text-[15px] font-semibold text-velum-900 mt-1 tabular-nums">755 nm · 808 nm · 980 nm · 1064 nm</p>
              </div>
            </div>
            <div className="relative h-[560px] overflow-hidden group rounded-3xl">
              <img
                src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=90&w=1961&auto=format&fit=crop"
                alt="Zona IV Función"
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-slower ease-decelerate group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-slower ease-standard" />
              <div className="absolute top-5 right-5 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full">
                <span className="text-[12px] font-semibold text-velum-900">Zona IV · Función</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* --- SELECTION TOOL (WIZARD) --- */}
      <div id="selection-tool" className="bg-velum-900 py-24 px-6 border-t border-velum-800">
        <div className="max-w-7xl mx-auto">

          <div className="text-center mb-16">
            <p className="text-[13px] font-semibold text-velum-300 mb-4">Diseña tu plan</p>
            <h2 className="font-sans font-bold text-velum-50 text-4xl md:text-5xl lg:text-6xl tracking-[-0.025em] mb-5">Selecciona tu membresía</h2>
            <p className="text-velum-300 max-w-lg mx-auto leading-relaxed text-[15px]">
              Elige cuántas zonas quieres tratar simultáneamente.
              Puedes combinar zonas de diferentes grupos — total flexibilidad.
            </p>
          </div>

          {/* Progress Indicators — Apple híbrido sin uppercase tracking-widest */}
          <div className="flex justify-center mb-12">
            <div className="flex items-center gap-3 text-[13px]">
              <span className={`pb-1 border-b-2 transition-colors duration-base ease-standard ${step >= 1 ? 'border-velum-300 text-velum-50 font-semibold' : 'border-transparent text-velum-500'}`}>1. Plan</span>
              <span className="text-velum-700">/</span>
              <span className={`pb-1 border-b-2 transition-colors duration-base ease-standard ${step >= 2 ? 'border-velum-300 text-velum-50 font-semibold' : 'border-transparent text-velum-500'}`}>2. Zonas</span>
              {isAuthenticated && (
                <>
                  <span className="text-velum-700">/</span>
                  <span className={`pb-1 border-b-2 transition-colors duration-base ease-standard ${step >= 3 ? 'border-velum-300 text-velum-50 font-semibold' : 'border-transparent text-velum-500'}`}>3. Pagar</span>
                </>
              )}
            </div>
          </div>

          {/* Step 1: Membership Tiers — Apple híbrido */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in-up">
              {MEMBERSHIPS.map((tier) => {
                const isSelected = selectedTier?.id === tier.id;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => handleTierSelect(tier)}
                    aria-pressed={isSelected}
                    className={[
                      'group relative p-7 border flex flex-col text-left cursor-pointer overflow-hidden',
                      'rounded-3xl transition-all duration-base ease-standard',
                      'focus:outline-none focus-visible:shadow-focus',
                      'hover:-translate-y-0.5',
                      isSelected
                        ? 'border-white bg-white shadow-lg ring-2 ring-velum-300 z-10'
                        : 'border-velum-700 bg-velum-800/40 hover:bg-velum-800 hover:border-velum-400',
                    ].join(' ')}
                  >
                    {/* Best seller pill — sutil, sin gradient ni pulse */}
                    {tier.isFullBody && (
                      <div className={[
                        'absolute top-4 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border',
                        isSelected
                          ? 'border-velum-300 bg-velum-50 text-velum-900'
                          : 'border-white/20 bg-white/10 text-white',
                      ].join(' ')}>
                        <Sparkles size={11} aria-hidden="true" />
                        <span className="text-[11px] font-semibold">Best seller</span>
                      </div>
                    )}

                    {/* Check seleccionado — circular icon, no emoji */}
                    {isSelected && !tier.isFullBody && (
                      <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-velum-900 flex items-center justify-center" aria-hidden="true">
                        <Check size={13} className="text-white" />
                      </div>
                    )}

                    <div className="mt-1">
                      <h3 className={`font-sans font-bold text-2xl tracking-tight mb-4 transition-colors duration-base ease-standard ${isSelected ? 'text-velum-900' : 'text-velum-50 group-hover:text-white'}`}>
                        {tier.name}
                      </h3>
                      {/* Precio escala extrema */}
                      <div className="flex items-baseline gap-1 mb-5">
                        <span className={`font-sans font-bold tabular-nums text-[56px] leading-none tracking-[-0.035em] transition-colors duration-base ease-standard ${isSelected ? 'text-velum-900' : 'text-velum-50'}`}>
                          ${tier.price}
                        </span>
                        <span className={`text-[14px] font-medium ${isSelected ? 'text-velum-500' : 'text-velum-400'}`}>/mes</span>
                      </div>
                    </div>

                    <p className={`text-[13px] mb-6 flex-grow leading-relaxed ${isSelected ? 'text-velum-600' : 'text-velum-300'}`}>
                      {tier.description}
                    </p>

                    <div className={`space-y-2.5 border-t pt-4 ${isSelected ? 'border-velum-100' : 'border-velum-700'}`}>
                      <div className={`flex items-center gap-2 text-[13px] ${isSelected ? 'text-velum-700' : 'text-velum-200'}`}>
                        <Check size={13} className={`flex-shrink-0 ${isSelected ? 'text-velum-900' : 'text-velum-400'}`} />
                        {tier.isFullBody ? <strong className="font-semibold">Todas las zonas</strong> : <span>Hasta <strong className="font-semibold">{tier.maxZones} zonas</strong></span>}
                      </div>
                      <div className={`flex items-center gap-2 text-[13px] ${isSelected ? 'text-velum-700' : 'text-velum-200'}`}>
                        <Check size={13} className={`flex-shrink-0 ${isSelected ? 'text-velum-900' : 'text-velum-400'}`} />
                        Sesión mensual
                      </div>
                    </div>

                    {/* Indicador de affordance — chevron que aparece en hover/select */}
                    <div className={`mt-5 flex items-center gap-1 text-[13px] font-semibold transition-all duration-base ease-standard ${isSelected ? 'text-velum-900' : 'text-velum-300 opacity-0 group-hover:opacity-100'}`}>
                      {isSelected ? 'Seleccionado' : 'Elegir plan'}
                      <ChevronRight size={14} className="transition-transform duration-base ease-standard group-hover:translate-x-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Zone Selection */}
          {step === 2 && selectedTier && (
            <div id="zone-selector" className="animate-fade-in">
              <div className="max-w-3xl mx-auto">

                {/* ── MODO MASTER: elige N de las 4 Zonas VELUM (Apple híbrido) ── */}
                {selectedTier.selectionMode === 'master' && (
                  <>
                    <div className="text-center mb-10">
                      <p className="text-velum-100 text-[15px] mb-3">
                        Plan <span className="font-semibold text-white">{selectedTier.name}</span>
                        {' — '}elige{' '}
                        <span className="font-semibold text-velum-200">
                          {selectedTier.maxZones} {selectedTier.maxZones === 1 ? 'zona VELUM' : 'zonas VELUM'}
                        </span>
                      </p>
                      {/* Dots indicadores */}
                      <div className="flex gap-2 justify-center mt-3">
                        {Array.from({ length: selectedTier.maxZones }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-3 h-3 rounded-full border-2 transition-all duration-base ease-standard ${i < selectedZones.length ? 'bg-velum-300 border-velum-300' : 'border-velum-600'}`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {MASTER_ZONES.map((zone) => {
                        const isSelected = selectedZones.includes(zone.id);
                        const isDisabled = !isSelected && selectedZones.length >= selectedTier.maxZones;
                        return (
                          <button
                            key={zone.id}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => !isDisabled && toggleZone(zone.id)}
                            className={`
                              text-left p-7 border rounded-3xl transition-all duration-base ease-standard relative
                              focus:outline-none focus-visible:shadow-focus
                              ${isSelected
                                ? 'bg-white border-white shadow-lg'
                                : 'bg-velum-800/40 border-velum-700 hover:border-velum-400 hover:bg-velum-800'}
                              ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                          >
                            {isSelected && (
                              <div className="absolute top-5 right-5 w-7 h-7 rounded-full bg-velum-900 flex items-center justify-center" aria-hidden="true">
                                <Check size={14} className="text-white" />
                              </div>
                            )}
                            <p className={`text-[13px] font-semibold mb-2 ${isSelected ? 'text-velum-500' : 'text-velum-400'}`}>
                              {zone.name}
                            </p>
                            <p className={`font-sans font-bold text-3xl tracking-tight mb-2 ${isSelected ? 'text-velum-900' : 'text-velum-50'}`}>
                              {zone.label}
                            </p>
                            <p className={`text-[14px] mb-5 ${isSelected ? 'text-velum-600' : 'text-velum-300'}`}>
                              {zone.tagline}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {zone.areas.map(area => (
                                <span
                                  key={area}
                                  className={`text-[12px] font-medium px-2.5 py-1 rounded-full ${isSelected ? 'bg-velum-100 text-velum-700' : 'bg-velum-700/50 text-velum-300'}`}
                                >
                                  {area}
                                </span>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedZones.length >= selectedTier.maxZones && !canProceed() === false && (
                      <p className="text-velum-400 text-[13px] text-center mt-5 animate-fade-in">
                        Selección completa. Toca una zona para cambiarla.
                      </p>
                    )}
                  </>
                )}

                {/* ── MODO CUSTOM (Select): 3 pequeñas + 2 medianas (Apple híbrido) ── */}
                {selectedTier.selectionMode === 'custom' && (
                  <>
                    {/* Contadores */}
                    <div className="grid grid-cols-2 gap-4 mb-8">
                      {[
                        {
                          label: 'Zonas pequeñas',
                          current: selectedZones.filter(z => SMALL_ZONE_IDS.includes(z)).length,
                          max: SELECT_MAX_SMALL,
                        },
                        {
                          label: 'Zonas medianas',
                          current: selectedZones.filter(z => MEDIUM_ZONE_IDS.includes(z)).length,
                          max: SELECT_MAX_MEDIUM,
                        },
                      ].map(counter => (
                        <div key={counter.label} className="bg-velum-800 border border-velum-700 rounded-2xl p-6 text-center">
                          <div className="flex gap-2 justify-center mb-3">
                            {Array.from({ length: counter.max }).map((_, i) => (
                              <div
                                key={i}
                                className={`w-3 h-3 rounded-full border-2 transition-all duration-base ease-standard ${i < counter.current ? 'bg-velum-300 border-velum-300' : 'border-velum-600'}`}
                              />
                            ))}
                          </div>
                          <p className={`font-sans font-bold tabular-nums text-2xl tracking-tight ${counter.current === counter.max ? 'text-velum-100' : 'text-velum-300'}`}>
                            {counter.current} <span className="text-velum-500">/ {counter.max}</span>
                          </p>
                          <p className="text-[13px] text-velum-400 mt-1">{counter.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Zonas pequeñas */}
                    <div className="mb-8">
                      <div className="flex items-center gap-3 mb-4">
                        <p className="text-velum-100 text-[15px] font-semibold tracking-tight">Zonas pequeñas</p>
                        <div className="flex-1 h-px bg-velum-800" />
                        <p className="text-velum-400 text-[13px]">Elige {SELECT_MAX_SMALL}</p>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {SMALL_ZONE_IDS.map(id => {
                          const zone = ZONES.find(z => z.id === id)!;
                          if (!zone) return null;
                          const isSelected = selectedZones.includes(id);
                          const currentSmall = selectedZones.filter(z => SMALL_ZONE_IDS.includes(z)).length;
                          const isDisabled = !isSelected && currentSmall >= SELECT_MAX_SMALL;
                          return (
                            <button
                              key={id}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => toggleZone(id)}
                              className={`inline-flex items-center gap-2 px-4 py-2.5 border text-[14px] font-medium transition-all duration-base ease-standard rounded-full
                                focus:outline-none focus-visible:shadow-focus
                                ${isSelected ? 'bg-white text-velum-900 border-white shadow-md' : 'bg-transparent text-velum-200 border-velum-700 hover:border-velum-400 hover:text-velum-100'}
                                ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {isSelected && <Check size={13} className="text-velum-500" />}
                              {zone.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Zonas medianas */}
                    <div className="mb-8">
                      <div className="flex items-center gap-3 mb-4">
                        <p className="text-velum-100 text-[15px] font-semibold tracking-tight">Zonas medianas</p>
                        <div className="flex-1 h-px bg-velum-800" />
                        <p className="text-velum-400 text-[13px]">Elige {SELECT_MAX_MEDIUM}</p>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {MEDIUM_ZONE_IDS.map(id => {
                          const zone = ZONES.find(z => z.id === id)!;
                          if (!zone) return null;
                          const isSelected = selectedZones.includes(id);
                          const currentMedium = selectedZones.filter(z => MEDIUM_ZONE_IDS.includes(z)).length;
                          const isDisabled = !isSelected && currentMedium >= SELECT_MAX_MEDIUM;
                          return (
                            <button
                              key={id}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => toggleZone(id)}
                              className={`inline-flex items-center gap-2 px-4 py-2.5 border text-[14px] font-medium transition-all duration-base ease-standard rounded-full
                                focus:outline-none focus-visible:shadow-focus
                                ${isSelected ? 'bg-white text-velum-900 border-white shadow-md' : 'bg-transparent text-velum-200 border-velum-700 hover:border-velum-400 hover:text-velum-100'}
                                ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {isSelected && <Check size={13} className="text-velum-500" />}
                              {zone.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                <div className="mt-10 flex justify-between items-center border-t border-velum-800 pt-8">
                  <button
                    onClick={() => setStep(1)}
                    className="text-[14px] font-medium text-velum-400 hover:text-velum-100 transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus rounded-sm"
                  >
                    ← Volver
                  </button>
                  <PillButton
                    variant="outlineDark"
                    size="lg"
                    showChevron
                    disabled={!canProceed()}
                    onClick={handleProceedToSummary}
                  >
                    Continuar
                  </PillButton>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Checkout — Apple híbrido */}
          {step === 3 && selectedTier && isAuthenticated && (
            <div className="animate-fade-in max-w-2xl mx-auto bg-white p-10 sm:p-12 border border-velum-200/70 rounded-3xl">
              <div className="text-center mb-12">
                <p className="text-[13px] font-semibold text-velum-500">Confirmación</p>
                <h3 className="font-sans font-bold text-velum-900 text-3xl sm:text-4xl tracking-[-0.025em] mt-3">Tu membresía Velum</h3>
              </div>

              <div className="space-y-6 mb-10">
                <div className="flex justify-between items-center pb-5 border-b border-velum-100">
                  <span className="text-[13px] font-semibold text-velum-500">Plan</span>
                  <span className="font-sans font-bold text-velum-900 text-xl tracking-tight">{selectedTier.name}</span>
                </div>

                <div className="pb-5 border-b border-velum-100">
                  <span className="text-[13px] font-semibold text-velum-500 block mb-3">Zonas a tratar</span>
                  <div className="bg-velum-50 p-5 rounded-2xl space-y-2">
                    {selectedTier.isFullBody ? (
                      <div className="flex items-center text-velum-900 font-semibold text-[15px]">
                        <Sparkles size={14} className="mr-2 text-velum-500" aria-hidden="true" /> Cuerpo Completo — las 4 Zonas VELUM
                      </div>
                    ) : (
                      selectedZones.map(z => {
                        const master = MASTER_ZONES.find(m => m.id === z);
                        const subName = ZONES.find(zone => zone.id === z)?.name;
                        return (
                          <div key={z} className="flex items-center text-[15px] text-velum-800">
                            <div className="w-1.5 h-1.5 bg-velum-400 rounded-full mr-3" aria-hidden="true" />
                            {master ? `${master.name} · ${master.label}` : subName}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Total — escala extrema Apple */}
                <div className="flex items-baseline justify-between pt-2">
                  <span className="text-[13px] font-semibold text-velum-500">Cargo mensual</span>
                  <span className="font-sans font-bold tabular-nums text-velum-900 text-[56px] leading-none tracking-[-0.035em]">
                    ${selectedTier.price}
                  </span>
                </div>
              </div>

              <div className="bg-velum-50 p-5 border border-velum-100 rounded-2xl mb-10 flex gap-3 items-start">
                <ShieldCheck size={18} className="text-success-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="text-[13px] text-velum-600 leading-relaxed space-y-1">
                  <p className="font-semibold text-velum-900">Pago seguro vía Stripe</p>
                  <p>Serás redirigido a una pasarela encriptada (SSL). Velum Laser no almacena datos de tu tarjeta.</p>
                  <p>La suscripción se renueva mensualmente. Puedes cancelarla desde tu perfil.</p>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4">
                <PillButton
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleCheckout}
                  isLoading={isCheckingOut}
                  loadingLabel="Redirigiendo a Stripe..."
                >
                  Pagar y activar membresía
                </PillButton>
                <button
                  onClick={() => setStep(selectedTier.isFullBody ? 1 : 2)}
                  className="text-[14px] text-velum-500 hover:text-velum-900 underline transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus rounded-sm"
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

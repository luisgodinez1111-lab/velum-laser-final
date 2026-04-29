import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Sparkles, Star, Shield, Zap, Heart, User } from 'lucide-react';
import { buttonStyles, Card, Badge, VStack, HStack } from '../components/ui';

// ── Datos del catálogo (extraídos para legibilidad) ───────────────────────────

const WAVELENGTHS = [
  {
    nm: '755 nm',
    name: 'Alejandrita',
    desc: 'Máxima eficacia en piel clara y vello fino. Absorción óptima de melanina.',
    accent: 'from-violet-50 to-purple-50',
    border: 'border-violet-200',
    dot:    'bg-violet-400',
  },
  {
    nm: '808 nm',
    name: 'Diodo',
    desc: 'El estándar de oro mundial. Penetración profunda, todos los fototipos.',
    accent: 'from-blue-50 to-sky-50',
    border: 'border-blue-200',
    dot:    'bg-blue-400',
  },
  {
    nm: '980 nm',
    name: 'Infrarrojo',
    desc: 'Tratamiento vascular y folicular de alta precisión sin irritación.',
    accent: 'from-amber-50 to-orange-50',
    border: 'border-amber-200',
    dot:    'bg-amber-400',
  },
  {
    nm: '1064 nm',
    name: 'Nd:YAG',
    desc: 'Penetración máxima. Piel oscura y vello grueso tratados con total seguridad.',
    accent: 'from-red-50 to-rose-50',
    border: 'border-red-200',
    dot:    'bg-red-400',
  },
] as const;

const STEPS = [
  { num: '1', icon: <User size={22} />,          title: 'Elige tu zona',     desc: 'Selecciona el área a tratar. Cuatro zonas disponibles con membresías diseñadas para cada perfil.' },
  { num: '2', icon: <CalendarCheck size={22} />, title: 'Reserva tu sesión', desc: 'Agenda en minutos. Tu cabina privada te espera — sin sala de espera, sin distracciones.' },
  { num: '3', icon: <Sparkles size={22} />,      title: 'Ve los resultados', desc: 'Desde la primera sesión notarás la diferencia. A los 10 meses, resultados definitivos.' },
] as const;

const PILLARS = [
  { icon: <Shield size={22} />, label: 'Seguridad',  desc: 'Tecnología médica certificada. Cuatro longitudes de onda adaptadas a cada fototipo de piel.' },
  { icon: <Zap    size={22} />, label: 'Eficacia',   desc: 'Sistema cuatriodo 755·808·980·1064 nm. Los mejores resultados del mercado, garantizados.' },
  { icon: <User   size={22} />, label: 'Privacidad', desc: 'Cabina boutique exclusiva. Sin colas, sin ruido, sin miradas. Solo tú y tu sesión.' },
  { icon: <Heart  size={22} />, label: 'Estatus',    desc: 'Una experiencia que no gritas pero que se nota. El lujo silencioso aplicado a tu piel.' },
] as const;

const TESTIMONIALS = [
  { quote: 'La experiencia es completamente diferente a cualquier otro lugar. Silencio total, atención personalizada y resultados desde la primera sesión.', name: 'Sofía M.',   detail: 'Miembro desde 2024' },
  { quote: 'Me encanta que sea un espacio privado. Sin distracciones, sin ruido. Solo yo y mi sesión. Eso no lo encuentras en ningún otro lugar en Chihuahua.',     name: 'Andrea R.',  detail: 'Zona Identidad' },
  { quote: 'Membresías claras, sin sorpresas. Reserva fácil y el equipo es impresionante — notás la diferencia de tecnología desde el primer día.',                  name: 'Daniela V.', detail: 'Miembro activa' },
] as const;

// ── Componente principal ──────────────────────────────────────────────────────

export const Home: React.FC = () => {
  return (
    <div className="flex flex-col w-full font-sans">

      {/* ── HERO — cinematográfico ──────────────────────────────────────────── */}
      <section className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1920&q=90&auto=format&fit=crop&crop=center"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center motion-safe:animate-[scale-in_2s_ease-out_both]"
          loading="eager"
        />
        {/* Gradient overlay multi-capa para legibilidad y drama */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/85" />
        <div className="absolute inset-0 bg-velum-900/25" />

        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          {/* Eyebrow chip */}
          <div className="inline-flex items-center gap-2 border border-white/20 bg-white/10 backdrop-blur-md px-5 py-2 mb-8 rounded-full animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-velum-300 animate-pulse" />
            <span className="text-white/85 text-[10px] font-bold uppercase tracking-[0.3em]">
              Chihuahua · Tecnología Cuatriodo
            </span>
          </div>

          {/* H1 cinematic */}
          <h1
            className="text-[clamp(3rem,9vw,6rem)] font-serif text-white leading-[1.05] tracking-tight mb-6 animate-fade-in-up"
            style={{ animationDelay: '120ms' }}
          >
            Aquí vienes a<br />
            <em className="text-velum-200 italic">verte bien.</em>
          </h1>

          {/* Subtitle */}
          <p
            className="text-white/75 text-lg md:text-xl font-light leading-relaxed max-w-xl mx-auto mb-10 animate-fade-in-up"
            style={{ animationDelay: '240ms' }}
          >
            Depilación láser de élite. Cuatro longitudes de onda.
            Una sola cabina privada donde la experiencia lo es todo.
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in-up"
            style={{ animationDelay: '360ms' }}
          >
            <Link
              to="/agenda"
              className={`${buttonStyles({ variant: 'primary', size: 'lg' })} !bg-white !text-velum-900 hover:!bg-velum-50 !border-white min-w-[220px] shadow-2xl`}
            >
              Reservar cita
              <ArrowRight size={14} className="transition-transform duration-base ease-standard group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/memberships"
              className={`${buttonStyles({ variant: 'outline', size: 'lg' })} !text-white !border-white/40 hover:!bg-white/10 hover:!text-white hover:!border-white backdrop-blur-sm min-w-[220px]`}
            >
              Ver membresías
            </Link>
          </div>
        </div>

        {/* Social proof anclada abajo */}
        <div className="absolute bottom-10 left-0 right-0 animate-fade-in" style={{ animationDelay: '600ms' }}>
          <HStack gap={2} justify="center" align="center">
            <HStack gap={1} align="center">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={12} className="text-velum-300 fill-velum-300" />
              ))}
            </HStack>
            <span className="text-white/60 text-xs tracking-wide">+200 clientes en Chihuahua</span>
          </HStack>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 animate-bounce" aria-hidden="true">
          <div className="w-px h-8 bg-white/30" />
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────────────────────── */}
      <section className="bg-velum-900 py-12 border-t border-velum-800">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { num: '4',    label: 'Longitudes de onda' },
            { num: '200+', label: 'Clientes activos' },
            { num: '10',   label: 'Sesiones por zona' },
            { num: '1',    label: 'Cabina privada' },
          ].map((stat) => (
            <div key={stat.label} className="group">
              <p className="font-serif text-4xl md:text-5xl text-velum-200 mb-2 transition-colors duration-base ease-standard group-hover:text-velum-50">
                {stat.num}
              </p>
              <p className="text-velum-400 text-[10px] uppercase tracking-[0.25em]">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TECNOLOGÍA — Cuatriodo Láser ───────────────────────────────────── */}
      <section className="py-32 px-6 bg-velum-50">
        <div className="max-w-6xl mx-auto">
          <VStack gap={3} align="center" className="text-center max-w-2xl mx-auto mb-20">
            <Badge intent="neutral">Tecnología</Badge>
            <h2 className="text-4xl md:text-5xl font-serif text-velum-900 italic">Cuatriodo Láser.</h2>
            <p className="text-velum-600 font-light text-lg leading-relaxed">
              Cuatro longitudes de onda en un solo sistema. El estándar más alto
              de eficacia disponible para depilación permanente — el mismo que usan
              las clínicas más exigentes del mundo.
            </p>
          </VStack>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {WAVELENGTHS.map((w) => (
              <Card
                key={w.nm}
                variant="bordered"
                padding="md"
                interactive
                className={`bg-gradient-to-br ${w.accent} ${w.border} flex flex-col`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${w.dot} mb-4`} aria-hidden="true" />
                <p className="font-serif text-2xl text-velum-900 mb-1">{w.nm}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-velum-500 mb-3">{w.name}</p>
                <p className="text-xs text-velum-600 leading-relaxed font-light flex-1">{w.desc}</p>
              </Card>
            ))}
          </div>

          <p className="text-center text-xs text-velum-400 mt-10 tracking-wide">
            755 nm · 808 nm · 980 nm · 1064 nm — los cuatro espectros en una sola sesión.
          </p>
        </div>
      </section>

      {/* ── IDENTIDAD — El Esteta Minimalista ──────────────────────────────── */}
      <section className="py-32 px-6 bg-white">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <VStack gap={8}>
            <div>
              <Badge intent="neutral" className="mb-4">Por qué VELUM</Badge>
              <h2 className="text-4xl md:text-5xl font-serif text-velum-900 italic leading-snug">
                El Esteta<br />Minimalista.
              </h2>
            </div>
            <p className="text-velum-600 leading-relaxed font-light text-lg">
              Nos alejamos del modelo de "spa económico" o "clínica ruidosa".
              VELUM es una cabina boutique privada donde la depilación se convierte
              en una experiencia estética recurrente, elegante y predecible.
            </p>
            <ul className="space-y-4">
              {[
                'Pulcritud clínica y silencio visual en cada sesión.',
                'Tecnología cuatriodo de grado médico, sin exageraciones.',
                'Atención 100% personalizada. Sin listas de espera.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-velum-800 font-light">
                  <span className="mt-2 w-1.5 h-1.5 flex-shrink-0 bg-velum-400 rounded-full" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="pt-6 border-t border-velum-200 grid grid-cols-2 gap-8">
              <div>
                <p className="font-serif text-3xl text-velum-900">10 meses</p>
                <p className="text-[10px] text-velum-500 uppercase tracking-[0.2em] mt-1">Programa completo</p>
              </div>
              <div>
                <p className="font-serif text-3xl text-velum-900">4 λ</p>
                <p className="text-[10px] text-velum-500 uppercase tracking-[0.2em] mt-1">Longitudes de onda</p>
              </div>
            </div>
          </VStack>

          <div className="relative h-[560px] w-full overflow-hidden shadow-2xl rounded-lg group">
            <img
              src="https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=900&q=90&auto=format&fit=crop&crop=faces,center"
              alt="Elegancia y confianza — VELUM Laser"
              className="w-full h-full object-cover object-center transition-transform duration-[2s] ease-out group-hover:scale-[1.04]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-velum-900/10 group-hover:bg-transparent transition-colors duration-slower ease-standard" />
            <div className="absolute bottom-0 left-0 bg-white/95 backdrop-blur-sm border-t border-r border-velum-100 p-7 max-w-[280px] rounded-tr-lg">
              <p className="font-serif italic text-velum-900 text-lg leading-relaxed">"La piel habla por sí sola."</p>
              <div className="w-8 h-px bg-velum-400 mt-4" />
            </div>
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA — Three steps ─────────────────────────────────────── */}
      <section className="py-32 px-6 bg-velum-50">
        <div className="max-w-5xl mx-auto">
          <VStack gap={3} align="center" className="text-center mb-20">
            <Badge intent="neutral">El proceso</Badge>
            <h2 className="text-4xl md:text-5xl font-serif text-velum-900 italic">Tres pasos. Nada más.</h2>
          </VStack>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 relative">
            <div className="hidden md:block absolute top-8 left-[16.6%] right-[16.6%] h-px bg-velum-200" aria-hidden="true" />
            {STEPS.map((step) => (
              <div key={step.num} className="flex flex-col items-center text-center px-8 py-6 group">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-full bg-white border border-velum-200 shadow-sm flex items-center justify-center text-velum-400 transition-all duration-base ease-standard group-hover:border-velum-900 group-hover:text-velum-900 group-hover:shadow-md group-hover:-translate-y-1">
                    {step.icon}
                  </div>
                  <span className="absolute -top-1 -right-1 text-[10px] font-bold text-velum-400 bg-white border border-velum-200 rounded-full w-5 h-5 flex items-center justify-center transition-colors duration-base ease-standard group-hover:text-velum-900 group-hover:border-velum-900">
                    {step.num}
                  </span>
                </div>
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-velum-900 mb-3">{step.title}</h3>
                <p className="text-velum-500 text-sm leading-relaxed font-light">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link
              to="/agenda"
              className="group inline-flex items-center gap-2 text-velum-900 text-xs font-bold uppercase tracking-[0.2em] border-b border-velum-400 pb-1 hover:border-velum-900 transition-colors duration-base ease-standard"
            >
              Comenzar ahora
              <ArrowRight size={13} className="transition-transform duration-base ease-standard group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── PILARES ────────────────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-velum-900 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1920&q=80&auto=format&fit=crop&crop=center"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-10"
          loading="lazy"
        />
        <div className="relative max-w-6xl mx-auto">
          <VStack gap={3} align="center" className="text-center max-w-2xl mx-auto mb-16">
            <Badge intent="accent">Nuestra diferencia</Badge>
            <h2 className="text-4xl md:text-5xl font-serif text-velum-50 italic">Experiencia VELUM</h2>
            <p className="text-velum-400 font-light text-lg leading-relaxed">
              No compras sesiones. Compras pertenencia a un estilo de vida
              donde cuidarte es un hábito, no un lujo ocasional.
            </p>
          </VStack>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {PILLARS.map((card) => (
              <div
                key={card.label}
                className="border border-velum-700 hover:border-velum-400 p-8 rounded-lg hover:bg-velum-800/40 transition-all duration-base ease-standard group cursor-default"
              >
                <div className="text-velum-600 group-hover:text-velum-300 transition-colors duration-base ease-standard mb-5">
                  {card.icon}
                </div>
                <h4 className="font-bold text-sm uppercase tracking-[0.2em] text-velum-50 mb-3">{card.label}</h4>
                <p className="text-xs text-velum-400 leading-relaxed font-light">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALES ──────────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <VStack gap={3} align="center" className="text-center mb-16">
            <Badge intent="neutral">Lo que dicen</Badge>
            <h2 className="text-4xl md:text-5xl font-serif text-velum-900 italic">Ellas ya lo viven.</h2>
          </VStack>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {TESTIMONIALS.map((t) => (
              <Card
                key={t.name}
                variant="subtle"
                padding="lg"
                interactive
                className="flex flex-col gap-5"
              >
                <HStack gap={1}>
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={12} className="text-velum-400 fill-velum-400" />
                  ))}
                </HStack>
                <p className="text-velum-700 text-sm leading-relaxed font-light flex-1">"{t.quote}"</p>
                <div className="border-t border-velum-100 pt-5">
                  <p className="text-velum-900 text-sm font-semibold">{t.name}</p>
                  <p className="text-velum-400 text-[10px] uppercase tracking-[0.2em] mt-0.5">{t.detail}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────────── */}
      <section className="relative py-40 px-6 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1920&q=85&auto=format&fit=crop&crop=center"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-center"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-velum-900/75 via-velum-900/85 to-velum-900/95" />

        <VStack gap={6} align="center" className="relative max-w-3xl mx-auto text-center">
          <Badge intent="accent">Comienza hoy</Badge>
          <h2 className="text-4xl md:text-6xl font-serif italic text-white leading-tight">
            Tu piel merece<br />lo mejor de ti.
          </h2>
          <p className="text-white/65 text-lg font-light leading-relaxed max-w-md mx-auto">
            Elige la zona que quieres transformar. Tecnología cuatriodo.
            Cabina privada. Resultados que duran para siempre.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link
              to="/agenda"
              className={`${buttonStyles({ variant: 'primary', size: 'lg' })} !bg-white !text-velum-900 hover:!bg-velum-50 !border-white min-w-[220px] shadow-2xl group`}
            >
              Reservar cita
              <ArrowRight size={13} className="transition-transform duration-base ease-standard group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/memberships"
              className={`${buttonStyles({ variant: 'outline', size: 'lg' })} !text-white !border-white/30 hover:!bg-white/10 hover:!text-white hover:!border-white backdrop-blur-sm min-w-[220px]`}
            >
              Ver membresías
            </Link>
          </div>
        </VStack>
      </section>

    </div>
  );
};

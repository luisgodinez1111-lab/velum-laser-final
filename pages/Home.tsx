import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Heart, Zap, User, ArrowRight, CalendarCheck, Sparkles, Star } from 'lucide-react';

export const Home: React.FC = () => {
  return (
    <div className="flex flex-col w-full">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen w-full overflow-hidden flex flex-col items-center justify-center">
        {/* Fondo limpio — una sola capa */}
        <div className="absolute inset-0 bg-gradient-to-b from-stone-100 via-amber-50/60 to-velum-50" />
        {/* Viñeta sutil en bordes para enfocar el centro */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_40%,transparent_60%,rgba(253,252,251,0.7)_100%)]" />

        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          {/* Eyebrow badge — animación 1 */}
          <div className="animate-fade-in delay-50 inline-flex items-center gap-2 border border-velum-300/60 bg-white/70 backdrop-blur-sm px-5 py-2 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-velum-400 inline-block" />
            <span className="text-velum-600 text-xs font-bold uppercase tracking-[0.25em]">Chihuahua · Lujo Silencioso</span>
          </div>

          {/* H1 — animación 2 */}
          <h1 className="animate-fade-in-up delay-100 text-[clamp(3rem,10vw,6rem)] font-serif text-velum-900 leading-[1.05] tracking-tight mb-6">
            Aquí vienes a<br />
            <em>verte bien.</em>
          </h1>

          {/* Subtítulo — animación 3 */}
          <p className="animate-fade-in-up delay-200 text-velum-600 text-lg md:text-xl font-light leading-relaxed max-w-xl mx-auto mb-10">
            Y a sentirte aún mejor. Depilación láser de alta potencia
            en una cabina boutique privada — sin colas, sin ruido, sin contratos.
          </p>

          {/* CTAs — animación 4 */}
          <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              to="/agenda"
              className="inline-flex items-center justify-center gap-2.5 bg-velum-900 text-velum-50 hover:bg-velum-800 active:scale-[0.98] transition-all duration-200 px-8 py-4 text-xs font-bold uppercase tracking-widest rounded-sm shadow-xl min-w-[220px]"
            >
              Reservar cita
              <ArrowRight size={14} />
            </Link>
            <Link
              to="/memberships"
              className="inline-flex items-center justify-center gap-2 text-velum-700 hover:text-velum-900 text-xs font-bold uppercase tracking-widest transition-colors duration-200 px-6 py-4 border border-velum-300 hover:border-velum-600 rounded-sm min-w-[220px]"
            >
              Ver membresías
            </Link>
          </div>
        </div>

        {/* Prueba social mínima al fondo del hero */}
        <div className="absolute bottom-10 left-0 right-0 animate-fade-in delay-300">
          <div className="flex items-center justify-center gap-1.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={12} className="text-velum-400 fill-velum-400" />
            ))}
            <span className="text-velum-500 text-xs ml-2 tracking-wide">Más de 200 clientes en Chihuahua</span>
          </div>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────────── */}
      <section className="bg-velum-900 text-velum-50 py-10">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <p className="font-serif text-4xl text-velum-200 mb-1">200+</p>
            <p className="text-velum-400 text-xs uppercase tracking-widest">Clientes activos</p>
          </div>
          <div>
            <p className="font-serif text-4xl text-velum-200 mb-1">10</p>
            <p className="text-velum-400 text-xs uppercase tracking-widest">Sesiones por zona</p>
          </div>
          <div>
            <p className="font-serif text-4xl text-velum-200 mb-1">4</p>
            <p className="text-velum-400 text-xs uppercase tracking-widest">Zonas del cuerpo</p>
          </div>
          <div>
            <p className="font-serif text-4xl text-velum-200 mb-1">1</p>
            <p className="text-velum-400 text-xs uppercase tracking-widest">Cabina privada</p>
          </div>
        </div>
      </section>

      {/* ── Identidad ────────────────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-velum-50">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div>
              <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">Por qué VELUM</p>
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
                'Pulcritud clínica y silencio visual.',
                'Tecnología de alta potencia sin exageración.',
                'Atención estética 100% personalizada.',
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
                <p className="text-xs text-velum-500 uppercase tracking-widest mt-1">Programa completo</p>
              </div>
              <div>
                <p className="font-serif text-3xl text-velum-900">808 nm</p>
                <p className="text-xs text-velum-500 uppercase tracking-widest mt-1">Longitud de onda clínica</p>
              </div>
            </div>
          </div>

          {/* Imagen placeholder — reemplazar con /public/velum-closeup.jpg */}
          <div className="relative h-[540px] w-full overflow-hidden shadow-2xl rounded-sm group">
            <div className="w-full h-full bg-gradient-to-br from-stone-200 via-amber-100 to-stone-300 transition-transform duration-[2s] ease-out group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-velum-900/5 group-hover:bg-transparent transition-colors duration-500" />
            <div className="absolute bottom-0 left-0 bg-white/95 p-7 max-w-[280px] backdrop-blur-sm border-t border-r border-velum-100">
              <p className="font-serif italic text-velum-900 text-lg leading-relaxed">"La piel habla por sí sola."</p>
              <div className="w-8 h-px bg-velum-400 mt-4" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">El proceso</p>
            <h2 className="text-4xl md:text-5xl font-serif text-velum-900 italic">Tres pasos. Nada más.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 relative">
            {/* Línea conectora — solo desktop */}
            <div className="hidden md:block absolute top-8 left-[16.6%] right-[16.6%] h-px bg-velum-200" />

            {[
              {
                num: '01',
                icon: <CalendarCheck size={22} className="text-velum-400" />,
                title: 'Elige tu zona',
                desc: 'Selecciona el área que quieres tratar. Ofrecemos 4 zonas del cuerpo en membresías diseñadas para cada necesidad.',
              },
              {
                num: '02',
                icon: <Sparkles size={22} className="text-velum-400" />,
                title: 'Reserva tu sesión',
                desc: 'Agenda en minutos desde la app. Tu cabina privada te espera — sin sala de espera, sin distracciones.',
              },
              {
                num: '03',
                icon: <Star size={22} className="text-velum-400" />,
                title: 'Ve los resultados',
                desc: 'Desde la primera sesión notarás la diferencia. A los 10 meses, resultados definitivos.',
              },
            ].map((step) => (
              <div key={step.num} className="flex flex-col items-center text-center px-8 py-6">
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-full bg-velum-50 border border-velum-200 flex items-center justify-center">
                    {step.icon}
                  </div>
                  <span className="absolute -top-1 -right-1 text-[10px] font-bold text-velum-400 bg-white border border-velum-200 rounded-full w-5 h-5 flex items-center justify-center">
                    {step.num.slice(1)}
                  </span>
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-velum-900 mb-3">{step.title}</h3>
                <p className="text-velum-500 text-sm leading-relaxed font-light">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Link
              to="/agenda"
              className="inline-flex items-center gap-2 text-velum-900 text-xs font-bold uppercase tracking-widest border-b border-velum-400 pb-1 hover:border-velum-900 transition-colors duration-200"
            >
              Comenzar ahora
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Experiencia / Pilares ─────────────────────────────────────────────── */}
      <section className="bg-velum-100 py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">Nuestra diferencia</p>
            <h2 className="text-4xl md:text-5xl font-serif text-velum-900 italic mb-5">Experiencia VELUM</h2>
            <p className="text-velum-600 font-light text-lg leading-relaxed">
              No compras sesiones. Compras pertenencia a un estilo de vida donde cuidarte es un hábito, no un lujo.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {[
              {
                icon: <User size={24} />,
                label: 'Privacidad',
                desc: 'Cabina privada tipo boutique. Sin colas ni saturación visual.',
              },
              {
                icon: <Zap size={24} />,
                label: 'Eficacia',
                desc: 'Tecnología 808 nm de grado clínico. Resultados visibles desde la primera sesión.',
              },
              {
                icon: <Heart size={24} />,
                label: 'Hábito',
                desc: 'Convertimos el cuidado personal en una rutina predecible y placentera.',
              },
              {
                icon: <Clock size={24} />,
                label: 'Claridad',
                desc: 'Precios transparentes. Membresías inteligentes. Sin letra chica.',
              },
            ].map((card) => (
              <div
                key={card.label}
                className="bg-white p-8 border border-velum-200/50 hover:border-velum-400 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group rounded-sm"
              >
                <div className="text-velum-300 group-hover:text-velum-500 transition-colors duration-300 mb-5">
                  {card.icon}
                </div>
                <h4 className="font-bold text-sm uppercase tracking-widest text-velum-900 mb-3">{card.label}</h4>
                <p className="text-xs text-velum-500 leading-relaxed font-light">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimoniales ────────────────────────────────────────────────────── */}
      <section className="py-32 px-6 bg-velum-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-3">Lo que dicen</p>
            <h2 className="text-4xl md:text-5xl font-serif text-velum-900 italic">Ellas ya lo viven.</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                quote: 'La experiencia es completamente diferente a cualquier otro lugar. Silencio total, atención personalizada y resultados que se notan desde la primera sesión.',
                name: 'Sofía M.',
                detail: 'Miembro desde 2024',
              },
              {
                quote: 'Me encanta que sea un espacio privado. Sin distracciones, sin ruido. Solo yo y mi sesión. Eso no lo encuentras en otro lado en Chihuahua.',
                name: 'Andrea R.',
                detail: 'Zona Identidad',
              },
              {
                quote: 'Las membresías son muy claras, sin sorpresas. El proceso de reserva es súper fácil y siempre hay disponibilidad. 100% recomendado.',
                name: 'Daniela V.',
                detail: 'Miembro activa',
              },
            ].map((t) => (
              <div key={t.name} className="bg-white border border-velum-100 p-8 rounded-sm flex flex-col gap-5">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={12} className="text-velum-400 fill-velum-400" />
                  ))}
                </div>
                <p className="text-velum-700 text-sm leading-relaxed font-light flex-1">"{t.quote}"</p>
                <div className="border-t border-velum-100 pt-5">
                  <p className="text-velum-900 text-sm font-semibold">{t.name}</p>
                  <p className="text-velum-400 text-xs uppercase tracking-widest mt-0.5">{t.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ────────────────────────────────────────────────────────── */}
      <section className="bg-velum-900 text-velum-50 py-32 px-6 relative overflow-hidden">
        {/* Gradiente interior sutil */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_50%,rgba(184,156,118,0.08),transparent)]" />

        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-velum-400 uppercase tracking-[0.25em] mb-6">Comienza hoy</p>
          <h2 className="text-4xl md:text-5xl font-serif italic text-velum-50 mb-6 leading-tight">
            Tu piel merece<br />lo mejor de ti.
          </h2>
          <p className="text-velum-300 text-lg font-light leading-relaxed max-w-md mx-auto mb-12">
            Elige la zona que quieres transformar. Sin compromisos eternos.
            Con resultados que duran para siempre.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/agenda"
              className="inline-flex items-center justify-center gap-2 bg-velum-50 text-velum-900 hover:bg-velum-200 active:scale-[0.98] transition-all duration-200 px-10 py-4 text-xs font-bold uppercase tracking-widest rounded-sm min-w-[220px] shadow-lg"
            >
              Reservar cita
              <ArrowRight size={13} />
            </Link>
            <Link
              to="/memberships"
              className="inline-flex items-center justify-center gap-2 border border-velum-600 text-velum-200 hover:border-velum-300 hover:text-velum-50 transition-all duration-200 px-10 py-4 text-xs font-bold uppercase tracking-widest rounded-sm min-w-[220px]"
            >
              Ver membresías
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
};

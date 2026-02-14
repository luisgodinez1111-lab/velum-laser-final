import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Circle, ArrowRight } from 'lucide-react';
import { onboardingServiceFe, OnboardingStatusData } from '../services/onboardingService';

const STEPS = [
  { key: 'profileComplete', label: 'Completar Perfil', link: '/dashboard', description: 'Nombre, teléfono, fecha de nacimiento' },
  { key: 'intakeSubmitted', label: 'Expediente Médico', link: '/medical-intake', description: 'Historia clínica y consentimiento' },
  { key: 'intakeApproved', label: 'Aprobación Médica', link: '/dashboard', description: 'Revisión por staff clínico' },
  { key: 'membershipActive', label: 'Activar Membresía', link: '/memberships', description: 'Selecciona tu plan Velum' },
  { key: 'hasAppointment', label: 'Agendar Primera Cita', link: '/agenda', description: 'Reserva tu primera sesión' },
] as const;

export const OnboardingProgress: React.FC = () => {
  const [status, setStatus] = useState<OnboardingStatusData | null>(null);

  useEffect(() => {
    onboardingServiceFe.getStatus().then(setStatus).catch(() => null);
  }, []);

  if (!status || status.completionPercent === 100) return null;

  return (
    <div className="bg-white p-6 border border-velum-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-lg text-velum-900">Tu Progreso</h3>
        <span className="text-sm font-bold text-velum-500">{status.completionPercent}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-velum-100 rounded-full mb-6">
        <div
          className="h-2 bg-velum-700 rounded-full transition-all duration-500"
          style={{ width: `${status.completionPercent}%` }}
        />
      </div>

      <div className="space-y-3">
        {STEPS.map((step) => {
          const done = status[step.key as keyof OnboardingStatusData] as boolean;
          const isNext = !done && status.nextStep === step.key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 p-3 rounded-sm transition-all ${
                done ? 'bg-green-50' : isNext ? 'bg-velum-50 border border-velum-200' : 'opacity-50'
              }`}
            >
              {done ? (
                <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
              ) : (
                <Circle size={18} className="text-velum-300 flex-shrink-0" />
              )}
              <div className="flex-grow">
                <p className={`text-sm font-bold ${done ? 'text-green-700 line-through' : 'text-velum-800'}`}>
                  {step.label}
                </p>
                <p className="text-[10px] text-velum-500">{step.description}</p>
              </div>
              {isNext && (
                <Link to={step.link} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-velum-700 hover:text-velum-900">
                  Ir <ArrowRight size={12} />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

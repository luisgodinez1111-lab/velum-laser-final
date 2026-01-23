import React, { useState } from 'react';
import { Button } from '../components/Button';
import { ChevronLeft, ChevronRight, Lock, User, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

type ViewState = 'intro' | 'login' | 'register' | 'calendar';
type AppointmentType = 'standard' | 'valuation';

export const Agenda: React.FC = () => {
  const { login, register, isAuthenticated, user } = useAuth();

  const [viewState, setViewState] = useState<ViewState>('intro');
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('standard');
  
  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // --- Calendar Logic ---
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const times = ["09:00", "10:00", "11:00", "12:00", "13:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        await login(email, password);
        setViewState('calendar');
    } catch (e) {
        alert("Credenciales incorrectas.");
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register({ email, password, firstName, lastName });
      setViewState('calendar');
    } catch (e) {
      alert("No se pudo completar el registro.");
    }
  };

  // If already authenticated, show calendar immediately
  if (isAuthenticated && viewState === 'intro') {
      setViewState('calendar');
  }

  // --- Intro View (Gate) ---
  if (viewState === 'intro') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 max-w-4xl mx-auto animate-fade-in">
        <div className="text-center mb-12">
           <Lock className="mx-auto mb-6 text-velum-400" size={48} />
           <h1 className="text-4xl font-serif text-velum-900 italic mb-4">Agenda Exclusiva</h1>
           <p className="text-velum-600 font-light max-w-md mx-auto">
             Accede a nuestro calendario para gestionar tus sesiones. 
             Si es tu primera vez, regístrate para una valoración gratuita.
           </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
           <div 
             onClick={() => setViewState('login')}
             className="cursor-pointer group bg-white p-10 border border-velum-200 hover:border-velum-900 transition-all duration-300 text-center hover:shadow-xl"
           >
             <User className="mx-auto mb-6 text-velum-800 group-hover:scale-110 transition-transform" size={40} />
             <h3 className="font-serif text-2xl mb-2 text-velum-900">Soy Socio</h3>
             <p className="text-xs text-velum-500 uppercase tracking-widest mt-2">Iniciar Sesión</p>
           </div>

           <div 
             onClick={() => setViewState('register')}
             className="cursor-pointer group bg-velum-900 p-10 border border-velum-900 hover:bg-velum-800 transition-all duration-300 text-center hover:shadow-xl"
           >
             <Sparkles className="mx-auto mb-6 text-velum-50 group-hover:scale-110 transition-transform" size={40} />
             <h3 className="font-serif text-2xl mb-2 text-velum-50">Primera Vez</h3>
             <p className="text-xs text-velum-300 uppercase tracking-widest mt-2">Registro de Valoración</p>
           </div>
        </div>
      </div>
    );
  }

  // --- Login View ---
  if (viewState === 'login') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 animate-fade-in">
        <div className="w-full max-w-md bg-white p-8 border border-velum-200 shadow-sm relative">
          <button onClick={() => setViewState('intro')} className="absolute top-4 left-4 text-velum-400 hover:text-velum-900">
             <ChevronLeft size={24} />
          </button>
          <h2 className="font-serif text-2xl text-center mb-6 pt-4">Bienvenido de nuevo</h2>
          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Correo Electrónico</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="ana.garcia@gmail.com"/>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Contraseña</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="hashed_secret_123"/>
            </div>
            <Button type="submit" className="w-full">Entrar a la Agenda</Button>
          </form>
        </div>
      </div>
    );
  }

  if (viewState === 'register') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 animate-fade-in">
        <div className="w-full max-w-md bg-white p-8 border border-velum-200 shadow-sm relative">
          <button onClick={() => setViewState('intro')} className="absolute top-4 left-4 text-velum-400 hover:text-velum-900">
             <ChevronLeft size={24} />
          </button>
          <h2 className="font-serif text-2xl text-center mb-6 pt-4">Crear cuenta</h2>
          <form onSubmit={handleRegisterSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Nombre</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="Ana"/>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Apellido</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="García"/>
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Correo Electrónico</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="ana.garcia@gmail.com"/>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Contraseña</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors" placeholder="••••••••"/>
            </div>
            <Button type="submit" className="w-full">Crear cuenta</Button>
          </form>
        </div>
      </div>
    );
  }

  // --- Calendar View (Unlocked) ---
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex justify-between items-end mb-10 border-b border-velum-100 pb-4">
        <div>
          <h1 className="text-3xl font-serif italic text-velum-900 mb-2">
            Agenda {appointmentType === 'valuation' ? 'de Valoración' : 'Personal'}
          </h1>
          <p className="text-velum-600 font-light text-sm">
             Hola, {user?.name}. Gestiona tus próximas sesiones.
          </p>
        </div>
        <Link to="/dashboard" className="text-xs text-velum-900 font-bold underline mr-4">Ir a Mi Cuenta</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Calendar */}
        <div className="bg-white p-6 border border-velum-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-serif text-lg">Noviembre 2024</h3>
            <div className="flex gap-2">
              <button className="p-1 hover:bg-velum-100"><ChevronLeft size={20} /></button>
              <button className="p-1 hover:bg-velum-100"><ChevronRight size={20} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-sm mb-2 text-velum-400 font-bold uppercase text-[10px]">
            <div>D</div><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map(d => (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={`
                  aspect-square flex items-center justify-center text-sm transition-colors duration-200
                  ${selectedDay === d 
                    ? 'bg-velum-900 text-white shadow-md' 
                    : 'hover:bg-velum-100 text-velum-800'}
                `}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Time Slots */}
        <div className="flex flex-col h-full">
           <h3 className="font-serif text-lg mb-6">Horarios Disponibles {selectedDay ? `para el día ${selectedDay}` : ''}</h3>
           
           {!selectedDay ? (
             <div className="flex-1 flex items-center justify-center border border-dashed border-velum-300 bg-velum-50 text-velum-400 text-sm p-8 text-center">
               <p>Selecciona un día en el calendario para ver la disponibilidad.</p>
             </div>
           ) : (
             <div className="grid grid-cols-3 gap-3 mb-8">
               {times.map(t => (
                 <button
                   key={t}
                   onClick={() => setSelectedTime(t)}
                   className={`
                     py-2 border text-sm transition-all duration-200
                     ${selectedTime === t 
                       ? 'border-velum-900 bg-velum-900 text-white shadow-md transform scale-105' 
                       : 'border-velum-200 text-velum-800 hover:border-velum-400 hover:bg-velum-50'}
                   `}
                 >
                   {t}
                 </button>
               ))}
             </div>
           )}

           <div className="mt-auto pt-6 border-t border-velum-100">
             <Button className="w-full" disabled={!selectedDay || !selectedTime} onClick={() => alert("Cita agendada exitosamente. Te enviaremos un correo de confirmación.")}>
               Confirmar Cita
             </Button>
           </div>
        </div>
      </div>
    </div>
  );
};

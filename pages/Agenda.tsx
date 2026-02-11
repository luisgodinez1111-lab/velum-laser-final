import React, { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { ChevronLeft, ChevronRight, Lock, User, Sparkles, Loader2, Calendar, X, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { appointmentService, AppointmentData, TimeSlot } from '../services/appointmentService';
import { intakeService } from '../services/intakeService';

type ViewState = 'intro' | 'login' | 'register' | 'calendar';

export const Agenda: React.FC = () => {
  const { login, register, isAuthenticated, user } = useAuth();

  const [viewState, setViewState] = useState<ViewState>('intro');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [booking, setBooking] = useState(false);
  const [intakeStatus, setIntakeStatus] = useState<string | null>(null);
  const [loadingIntake, setLoadingIntake] = useState(true);

  useEffect(() => {
    if (isAuthenticated && viewState === 'intro') {
      setViewState('calendar');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAppointments();
      loadIntakeStatus();
    }
  }, [isAuthenticated]);

  const loadAppointments = async () => {
    try {
      const data = await appointmentService.getMyAppointments();
      setAppointments(data);
    } catch (e) { console.error(e); }
  };

  const loadIntakeStatus = async () => {
    try {
      const data = await intakeService.getMyIntake();
      setIntakeStatus(data?.status || null);
    } catch { setIntakeStatus(null); }
    finally { setLoadingIntake(false); }
  };

  const loadSlots = async (date: Date) => {
    setLoadingSlots(true);
    setSelectedTime(null);
    try {
      const dateStr = date.toISOString().split('T')[0];
      const data = await appointmentService.getAvailability(dateStr);
      setSlots(data.slots);
    } catch { setSlots([]); }
    finally { setLoadingSlots(false); }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    loadSlots(date);
  };

  const handleBooking = async () => {
    if (!selectedDate || !selectedTime) return;
    setBooking(true);
    try {
      const [h, m] = selectedTime.split(':').map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(h, m, 0, 0);
      const type = intakeStatus === 'approved' ? 'treatment' : 'valuation';
      await appointmentService.book({ scheduledAt: scheduledAt.toISOString(), type });
      alert('Cita agendada exitosamente.');
      setSelectedDate(null);
      setSelectedTime(null);
      setSlots([]);
      await loadAppointments();
    } catch (e: any) {
      alert(e.message || 'Error al agendar la cita.');
    } finally { setBooking(false); }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('¿Seguro que deseas cancelar esta cita?')) return;
    try {
      await appointmentService.cancel(id);
      await loadAppointments();
    } catch (e: any) { alert(e.message || 'Error al cancelar.'); }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await login(email, password); setViewState('calendar'); }
    catch { alert('Credenciales incorrectas.'); }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await register({ email, password, firstName, lastName }); setViewState('calendar'); }
    catch { alert('No se pudo completar el registro. La contraseña debe tener al menos 12 caracteres.'); }
  };

  // Calendar helpers
  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const isPast = (d: number) => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d) < today;
  const isSelected = (d: number) => selectedDate ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d).toDateString() === selectedDate.toDateString() : false;
  const isToday = (d: number) => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d).toDateString() === today.toDateString();
  const formatDate = (s: string) => new Date(s).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const statusBadge = (s: string) => ({ pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800', completed: 'bg-green-100 text-green-800', canceled: 'bg-red-100 text-red-800', no_show: 'bg-gray-100 text-gray-800', in_progress: 'bg-purple-100 text-purple-800' }[s] || 'bg-gray-100 text-gray-800');

  if (viewState === 'intro') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 max-w-4xl mx-auto animate-fade-in">
        <div className="text-center mb-12">
          <Lock className="mx-auto mb-6 text-velum-400" size={48} />
          <h1 className="text-4xl font-serif text-velum-900 italic mb-4">Agenda Exclusiva</h1>
          <p className="text-velum-600 font-light max-w-md mx-auto">Accede a nuestro calendario para gestionar tus sesiones. Si es tu primera vez, regístrate para una valoración gratuita.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
          <div onClick={() => setViewState('login')} className="cursor-pointer group bg-white p-10 border border-velum-200 hover:border-velum-900 transition-all text-center hover:shadow-xl">
            <User className="mx-auto mb-6 text-velum-800 group-hover:scale-110 transition-transform" size={40} />
            <h3 className="font-serif text-2xl mb-2 text-velum-900">Soy Socio</h3>
            <p className="text-xs text-velum-500 uppercase tracking-widest mt-2">Iniciar Sesión</p>
          </div>
          <div onClick={() => setViewState('register')} className="cursor-pointer group bg-velum-900 p-10 border border-velum-900 hover:bg-velum-800 transition-all text-center hover:shadow-xl">
            <Sparkles className="mx-auto mb-6 text-velum-50 group-hover:scale-110 transition-transform" size={40} />
            <h3 className="font-serif text-2xl mb-2 text-velum-50">Primera Vez</h3>
            <p className="text-xs text-velum-300 uppercase tracking-widest mt-2">Registro de Valoración</p>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === 'login') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 animate-fade-in">
        <div className="w-full max-w-md bg-white p-8 border border-velum-200 shadow-sm relative">
          <button onClick={() => setViewState('intro')} className="absolute top-4 left-4 text-velum-400 hover:text-velum-900"><ChevronLeft size={24} /></button>
          <h2 className="font-serif text-2xl text-center mb-6 pt-4">Bienvenido de nuevo</h2>
          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div><label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Correo Electrónico</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" /></div>
            <div><label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Contraseña</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" /></div>
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
          <button onClick={() => setViewState('intro')} className="absolute top-4 left-4 text-velum-400 hover:text-velum-900"><ChevronLeft size={24} /></button>
          <h2 className="font-serif text-2xl text-center mb-6 pt-4">Crear cuenta</h2>
          <form onSubmit={handleRegisterSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Nombre</label><input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" /></div>
              <div><label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Apellido</label><input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" /></div>
            </div>
            <div><label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Correo Electrónico</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" /></div>
            <div><label className="block text-xs uppercase tracking-widest text-velum-600 mb-2">Contraseña (mín. 12 caracteres)</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={12} className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none" /></div>
            <Button type="submit" className="w-full">Crear cuenta</Button>
          </form>
        </div>
      </div>
    );
  }

  // Calendar View
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const upcomingAppts = appointments.filter(a => ['pending', 'confirmed'].includes(a.status) && new Date(a.scheduledAt) >= today);
  const pastAppts = appointments.filter(a => !['pending', 'confirmed'].includes(a.status) || new Date(a.scheduledAt) < today).slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex justify-between items-end mb-8 border-b border-velum-100 pb-4">
        <div>
          <h1 className="text-3xl font-serif italic text-velum-900 mb-2">Agenda Personal</h1>
          <p className="text-velum-600 font-light text-sm">Hola, {user?.name}. Gestiona tus próximas sesiones.</p>
        </div>
        <Link to="/dashboard" className="text-xs text-velum-900 font-bold underline">Mi Cuenta</Link>
      </div>

      {!loadingIntake && (!intakeStatus || intakeStatus === 'draft' || intakeStatus === 'rejected') && (
        <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-6">
          <div className="flex items-start gap-3">
            <Calendar className="text-orange-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-bold text-orange-900 text-sm">Expediente Médico Pendiente</p>
              <p className="text-orange-800 text-xs mt-1">Puedes agendar una <strong>valoración gratuita</strong>, pero para tratamientos necesitas completar tu expediente.</p>
              <Link to="/medical-intake" className="text-orange-900 text-xs font-bold underline mt-2 inline-block">Completar Expediente</Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="bg-white p-6 border border-velum-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-serif text-lg">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h3>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="p-1 hover:bg-velum-100"><ChevronLeft size={20} /></button>
              <button onClick={nextMonth} className="p-1 hover:bg-velum-100"><ChevronRight size={20} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] mb-2 text-velum-400 font-bold uppercase">
            <div>D</div><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
              <button key={d} disabled={isPast(d)} onClick={() => handleDateSelect(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d))}
                className={`aspect-square flex items-center justify-center text-sm transition-colors rounded-sm ${isPast(d) ? 'text-velum-300 cursor-not-allowed' : ''} ${isSelected(d) ? 'bg-velum-900 text-white shadow-md' : ''} ${isToday(d) && !isSelected(d) ? 'border border-velum-900 font-bold' : ''} ${!isPast(d) && !isSelected(d) ? 'hover:bg-velum-100 text-velum-800' : ''}`}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <h3 className="font-serif text-lg mb-4">{selectedDate ? `Horarios — ${selectedDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Selecciona un día'}</h3>
          {!selectedDate ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-velum-300 bg-velum-50 text-velum-400 text-sm p-8 text-center"><p>Selecciona un día en el calendario.</p></div>
          ) : loadingSlots ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-velum-400" size={24} /></div>
          ) : slots.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-velum-300 bg-velum-50 text-velum-400 text-sm p-8 text-center"><p>No hay horarios disponibles.</p></div>
          ) : (
            <div className="grid grid-cols-3 gap-3 mb-6">
              {slots.map(s => (
                <button key={s.time} disabled={!s.available} onClick={() => setSelectedTime(s.time)}
                  className={`py-3 border text-sm transition-all ${!s.available ? 'border-velum-100 text-velum-300 cursor-not-allowed line-through' : ''} ${selectedTime === s.time ? 'border-velum-900 bg-velum-900 text-white shadow-md' : ''} ${s.available && selectedTime !== s.time ? 'border-velum-200 text-velum-800 hover:border-velum-400' : ''}`}>
                  {s.time}
                </button>
              ))}
            </div>
          )}
          {selectedDate && (
            <div className="mt-auto pt-6 border-t border-velum-100">
              <Button className="w-full" disabled={!selectedTime || booking} onClick={handleBooking}>
                {booking ? <Loader2 className="animate-spin mr-2" size={16} /> : <Calendar className="mr-2" size={16} />}
                Confirmar Cita
              </Button>
            </div>
          )}
        </div>
      </div>

      {upcomingAppts.length > 0 && (
        <div className="mt-12">
          <h3 className="font-serif text-lg mb-4">Próximas Citas</h3>
          <div className="space-y-3">
            {upcomingAppts.map(a => (
              <div key={a.id} className="bg-white p-4 border border-velum-200 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <Clock size={18} className="text-velum-400" />
                  <div>
                    <p className="text-sm font-medium text-velum-900">{formatDate(a.scheduledAt)}</p>
                    <p className="text-xs text-velum-500 capitalize">{a.type === 'valuation' ? 'Valoración' : a.type === 'treatment' ? 'Tratamiento' : 'Seguimiento'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] uppercase font-bold px-2 py-1 ${statusBadge(a.status)}`}>{a.status}</span>
                  {['pending', 'confirmed'].includes(a.status) && (
                    <button onClick={() => handleCancel(a.id)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pastAppts.length > 0 && (
        <div className="mt-8">
          <h3 className="font-serif text-lg mb-4 text-velum-500">Historial</h3>
          <div className="space-y-2">
            {pastAppts.map(a => (
              <div key={a.id} className="bg-velum-50 p-3 border border-velum-100 flex justify-between items-center opacity-60">
                <p className="text-xs text-velum-600">{formatDate(a.scheduledAt)} — <span className="capitalize">{a.type === 'valuation' ? 'Valoración' : 'Tratamiento'}</span></p>
                <span className={`text-[10px] uppercase font-bold px-2 py-1 ${statusBadge(a.status)}`}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { adminService, AppointmentAdminData, IntakeAdminData } from '../services/adminService';
import { sessionService } from '../services/sessionService';
import { treatmentPlanService, TreatmentPlanData } from '../services/treatmentPlanService';
import { fileUploadServiceFe } from '../services/fileUploadService';
import { Link } from 'react-router-dom';
import { Loader2, Calendar, FileText, CheckCircle, XCircle, Clock, ChevronRight, Zap, ClipboardList, Upload } from 'lucide-react';

type Tab = 'appointments' | 'intakes' | 'sessions' | 'plans';

export const StaffDashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading, hasRole } = useAuth();
  const [tab, setTab] = useState<Tab>('appointments');
  const [appointments, setAppointments] = useState<AppointmentAdminData[]>([]);
  const [intakes, setIntakes] = useState<IntakeAdminData[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<{ appointmentId: string; zones: string; laserSettings: string; skinResponse: string; fitzpatrickUsed: string; energyDelivered: string; notes: string } | null>(null);
  const [plans, setPlans] = useState<TreatmentPlanData[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    if (isAuthenticated && hasRole(['staff', 'admin'])) {
      loadData();
    }
  }, [isAuthenticated]);

  const loadData = async () => {
    setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const [appts, pendingIntakes, plansData] = await Promise.all([
        adminService.getAppointments({ date: todayStr }),
        adminService.getIntakes('submitted'),
        treatmentPlanService.getAll({ status: 'active' }).catch(() => [])
      ]);
      setAppointments(appts);
      setIntakes(pendingIntakes);
      setPlans(plansData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await adminService.updateAppointment(id, { status });
      await loadData();
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  const handleReview = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await adminService.reviewIntake(id, decision, reviewNotes || undefined);
      setReviewingId(null);
      setReviewNotes('');
      await loadData();
    } catch (e: any) { alert(e.message || 'Error'); }
  };

  const userName = (u: { email: string; profile?: { firstName?: string; lastName?: string } }) => {
    const name = `${u.profile?.firstName || ''} ${u.profile?.lastName || ''}`.trim();
    return name || u.email;
  };

  const formatTime = (s: string) => new Date(s).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const formatDate = (s: string) => new Date(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-velum-400" size={32} /></div>;

  if (!isAuthenticated || !hasRole(['staff', 'admin'])) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <h2 className="text-2xl font-serif mb-4">Acceso Restringido</h2>
        <p className="text-velum-600 mb-4">Solo personal autorizado puede acceder.</p>
        <Link to="/"><Button>Ir al Inicio</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex justify-between items-end mb-8 border-b border-velum-100 pb-4">
        <div>
          <h1 className="text-3xl font-serif text-velum-900 mb-1">Panel de Staff</h1>
          <p className="text-velum-600 text-sm">Hola, {user?.name}. Gestión clínica del día.</p>
        </div>
        {hasRole(['admin']) && <Link to="/admin" className="text-xs text-velum-900 font-bold underline">Panel Admin</Link>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8">
        <button onClick={() => setTab('appointments')}
          className={`px-6 py-3 text-xs uppercase tracking-widest font-bold transition-colors ${tab === 'appointments' ? 'bg-velum-900 text-white' : 'bg-velum-100 text-velum-600 hover:bg-velum-200'}`}>
          <Calendar size={14} className="inline mr-2" />Citas del Día ({appointments.length})
        </button>
        <button onClick={() => setTab('intakes')}
          className={`px-6 py-3 text-xs uppercase tracking-widest font-bold transition-colors ${tab === 'intakes' ? 'bg-velum-900 text-white' : 'bg-velum-100 text-velum-600 hover:bg-velum-200'}`}>
          <FileText size={14} className="inline mr-2" />Expedientes Pendientes ({intakes.length})
        </button>
        <button onClick={() => setTab('sessions')}
          className={`px-6 py-3 text-xs uppercase tracking-widest font-bold transition-colors ${tab === 'sessions' ? 'bg-velum-900 text-white' : 'bg-velum-100 text-velum-600 hover:bg-velum-200'}`}>
          <Zap size={14} className="inline mr-2" />Registrar Sesión
        </button>
        <button onClick={() => setTab('plans')}
          className={`px-6 py-3 text-xs uppercase tracking-widest font-bold transition-colors ${tab === 'plans' ? 'bg-velum-900 text-white' : 'bg-velum-100 text-velum-600 hover:bg-velum-200'}`}>
          <ClipboardList size={14} className="inline mr-2" />Planes ({plans.length})
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-velum-400" size={32} /></div>
      ) : tab === 'appointments' ? (
        <div className="space-y-4">
          {appointments.length === 0 ? (
            <div className="text-center py-16 text-velum-400">
              <Calendar size={48} className="mx-auto mb-4" />
              <p>No hay citas programadas para hoy.</p>
            </div>
          ) : appointments.map(a => (
            <div key={a.id} className="bg-white p-6 border border-velum-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Clock size={16} className="text-velum-400" />
                    <span className="font-bold text-velum-900">{formatTime(a.scheduledAt)}</span>
                    <span className="text-xs text-velum-500 capitalize">{a.type === 'valuation' ? 'Valoración' : 'Tratamiento'}</span>
                  </div>
                  <p className="text-sm text-velum-800 font-medium">{userName(a.user)}</p>
                  <p className="text-xs text-velum-500">{a.user.email}</p>
                  {a.zones.length > 0 && <p className="text-xs text-velum-500 mt-1">Zonas: {a.zones.join(', ')}</p>}
                  {a.notes && <p className="text-xs text-velum-400 mt-1 italic">{a.notes}</p>}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <span className={`text-[10px] uppercase font-bold px-2 py-1 ${
                    { pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800', in_progress: 'bg-purple-100 text-purple-800', completed: 'bg-green-100 text-green-800', canceled: 'bg-red-100 text-red-800', no_show: 'bg-gray-100 text-gray-800' }[a.status] || 'bg-gray-100 text-gray-800'
                  }`}>{a.status}</span>
                  <div className="flex gap-1">
                    {a.status === 'pending' && <button onClick={() => handleStatusChange(a.id, 'confirmed')} className="text-[10px] px-2 py-1 bg-blue-600 text-white hover:bg-blue-700">Confirmar</button>}
                    {a.status === 'confirmed' && <button onClick={() => handleStatusChange(a.id, 'in_progress')} className="text-[10px] px-2 py-1 bg-purple-600 text-white hover:bg-purple-700">Iniciar</button>}
                    {a.status === 'in_progress' && <button onClick={() => handleStatusChange(a.id, 'completed')} className="text-[10px] px-2 py-1 bg-green-600 text-white hover:bg-green-700">Completar</button>}
                    {['pending', 'confirmed'].includes(a.status) && <button onClick={() => handleStatusChange(a.id, 'no_show')} className="text-[10px] px-2 py-1 bg-gray-400 text-white hover:bg-gray-500">No Show</button>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {intakes.length === 0 ? (
            <div className="text-center py-16 text-velum-400">
              <FileText size={48} className="mx-auto mb-4" />
              <p>No hay expedientes pendientes de revisión.</p>
            </div>
          ) : intakes.map(intake => (
            <div key={intake.id} className="bg-white p-6 border border-velum-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-bold text-velum-900">{userName(intake.user)}</p>
                  <p className="text-xs text-velum-500">{intake.user.email} — Enviado {formatDate(intake.createdAt)}</p>
                  {intake.fitzpatrickType && <p className="text-xs text-velum-600 mt-1">Fototipo: Tipo {intake.fitzpatrickType}</p>}
                  {intake.contraindications.length > 0 && (
                    <p className="text-xs text-red-600 mt-1 font-medium">Contraindicaciones: {intake.contraindications.join(', ')}</p>
                  )}
                </div>
                <span className="text-[10px] uppercase font-bold px-2 py-1 bg-yellow-100 text-yellow-800">Pendiente</span>
              </div>

              {/* Questionnaire summary */}
              <div className="bg-velum-50 p-4 border border-velum-100 mb-4 text-xs space-y-1">
                {Object.entries(intake.questionnaire).map(([key, val]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-velum-600">{key}</span>
                    <span className="text-velum-900 font-medium">{val === true ? 'Sí' : val === false ? 'No' : String(val)}</span>
                  </div>
                ))}
              </div>

              {reviewingId === intake.id ? (
                <div className="space-y-3">
                  <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Notas de revisión (opcional)..."
                    className="w-full p-3 border border-velum-300 bg-velum-50 text-sm focus:border-velum-900 outline-none" rows={2} />
                  <div className="flex gap-2">
                    <button onClick={() => handleReview(intake.id, 'approved')}
                      className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white text-xs font-bold hover:bg-green-700">
                      <CheckCircle size={14} /> Aprobar
                    </button>
                    <button onClick={() => handleReview(intake.id, 'rejected')}
                      className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white text-xs font-bold hover:bg-red-700">
                      <XCircle size={14} /> Rechazar
                    </button>
                    <button onClick={() => { setReviewingId(null); setReviewNotes(''); }}
                      className="px-4 py-2 border border-velum-300 text-xs text-velum-600 hover:bg-velum-100">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setReviewingId(intake.id)}
                  className="flex items-center gap-1 text-xs text-velum-900 font-bold hover:underline">
                  Revisar <ChevronRight size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : tab === 'sessions' ? (
        <div className="space-y-4">
          {/* Select a completed appointment to record session */}
          {!sessionForm ? (
            <div>
              <p className="text-sm text-velum-600 mb-4">Selecciona una cita completada o en curso para registrar la sesión de tratamiento.</p>
              {appointments.filter(a => ['completed', 'in_progress'].includes(a.status)).length === 0 ? (
                <div className="text-center py-16 text-velum-400">
                  <Zap size={48} className="mx-auto mb-4" />
                  <p>No hay citas completadas hoy para registrar sesión.</p>
                </div>
              ) : (
                appointments.filter(a => ['completed', 'in_progress'].includes(a.status)).map(a => (
                  <div key={a.id} className="bg-white p-4 border border-velum-200 shadow-sm mb-2 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-sm">{userName(a.user)}</span>
                      <span className="text-xs text-velum-500 ml-2">{formatTime(a.scheduledAt)} — {a.type === 'valuation' ? 'Valoración' : 'Tratamiento'}</span>
                    </div>
                    <button
                      onClick={() => setSessionForm({ appointmentId: a.id, zones: a.zones.join(', '), laserSettings: '', skinResponse: '', fitzpatrickUsed: '', energyDelivered: '', notes: '' })}
                      className="text-xs px-3 py-1.5 bg-velum-900 text-white hover:bg-velum-800">
                      <Zap size={12} className="inline mr-1" />Registrar Sesión
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="bg-white p-6 border border-velum-200 shadow-sm">
              <h3 className="font-bold text-lg mb-4">Registro de Sesión</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase text-velum-500 mb-1">Zonas tratadas</label>
                  <input value={sessionForm.zones} onChange={e => setSessionForm({ ...sessionForm, zones: e.target.value })}
                    className="w-full p-2 border border-velum-300 text-sm outline-none focus:border-velum-900" placeholder="Axilas, Piernas..." />
                </div>
                <div>
                  <label className="block text-xs uppercase text-velum-500 mb-1">Fototipo usado</label>
                  <select value={sessionForm.fitzpatrickUsed} onChange={e => setSessionForm({ ...sessionForm, fitzpatrickUsed: e.target.value })}
                    className="w-full p-2 border border-velum-300 text-sm outline-none focus:border-velum-900">
                    <option value="">Seleccionar</option>
                    {['I', 'II', 'III', 'IV', 'V', 'VI'].map(t => <option key={t} value={t}>Tipo {t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase text-velum-500 mb-1">Energía entregada (J/cm²)</label>
                  <input value={sessionForm.energyDelivered} onChange={e => setSessionForm({ ...sessionForm, energyDelivered: e.target.value })}
                    className="w-full p-2 border border-velum-300 text-sm outline-none focus:border-velum-900" placeholder="20 J/cm²" />
                </div>
                <div>
                  <label className="block text-xs uppercase text-velum-500 mb-1">Respuesta de piel</label>
                  <select value={sessionForm.skinResponse} onChange={e => setSessionForm({ ...sessionForm, skinResponse: e.target.value })}
                    className="w-full p-2 border border-velum-300 text-sm outline-none focus:border-velum-900">
                    <option value="">Seleccionar</option>
                    <option value="normal">Normal</option>
                    <option value="mild_erythema">Eritema leve</option>
                    <option value="moderate_erythema">Eritema moderado</option>
                    <option value="edema">Edema</option>
                    <option value="adverse">Reacción adversa</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs uppercase text-velum-500 mb-1">Configuración láser (JSON)</label>
                  <input value={sessionForm.laserSettings} onChange={e => setSessionForm({ ...sessionForm, laserSettings: e.target.value })}
                    className="w-full p-2 border border-velum-300 text-sm outline-none focus:border-velum-900 font-mono" placeholder='{"wavelength": "808nm", "pulse": "30ms"}' />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs uppercase text-velum-500 mb-1">Notas clínicas</label>
                  <textarea value={sessionForm.notes} onChange={e => setSessionForm({ ...sessionForm, notes: e.target.value })}
                    className="w-full p-2 border border-velum-300 text-sm outline-none focus:border-velum-900" rows={3} placeholder="Observaciones..." />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={async () => {
                    try {
                      let laserJson = {};
                      if (sessionForm.laserSettings) {
                        try { laserJson = JSON.parse(sessionForm.laserSettings); } catch { laserJson = { raw: sessionForm.laserSettings }; }
                      }
                      await sessionService.create({
                        appointmentId: sessionForm.appointmentId,
                        zones: sessionForm.zones.split(',').map(z => z.trim()).filter(Boolean),
                        laserSettings: laserJson,
                        fitzpatrickUsed: sessionForm.fitzpatrickUsed || undefined,
                        energyDelivered: sessionForm.energyDelivered || undefined,
                        skinResponse: sessionForm.skinResponse || undefined,
                        notes: sessionForm.notes || undefined
                      });
                      alert('Sesión registrada correctamente.');
                      setSessionForm(null);
                    } catch (e: any) { alert(e.message || 'Error al registrar sesión'); }
                  }}
                  className="px-6 py-2 bg-green-600 text-white text-xs font-bold hover:bg-green-700">
                  <CheckCircle size={14} className="inline mr-1" />Guardar Sesión
                </button>
                <button onClick={() => setSessionForm(null)}
                  className="px-4 py-2 border border-velum-300 text-xs text-velum-600 hover:bg-velum-100">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      ) : tab === 'plans' ? (
        <div className="space-y-4">
          {plans.length === 0 ? (
            <div className="text-center py-16 text-velum-400">
              <ClipboardList size={48} className="mx-auto mb-4" />
              <p>No hay planes de tratamiento activos.</p>
            </div>
          ) : plans.map(plan => {
            const pct = Math.round((plan.completedSessions / plan.totalSessions) * 100);
            const patientName = plan.user?.profile
              ? `${plan.user.profile.firstName || ''} ${plan.user.profile.lastName || ''}`.trim()
              : 'Paciente';
            return (
              <div key={plan.id} className="bg-white p-6 border border-velum-200 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-velum-900">{patientName}</p>
                    <p className="text-xs text-velum-500">Zonas: {plan.zones.join(', ')}</p>
                  </div>
                  <span className={`text-[10px] uppercase font-bold px-2 py-1 ${
                    plan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>{plan.status}</span>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-velum-500">Progreso</span>
                    <span className="font-bold text-velum-800">{plan.completedSessions}/{plan.totalSessions} sesiones ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-velum-100 rounded-full">
                    <div className="h-2 bg-velum-700 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {plan.status === 'active' && plan.completedSessions < plan.totalSessions && (
                  <button
                    onClick={async () => {
                      try {
                        await treatmentPlanService.incrementSession(plan.id);
                        await loadData();
                      } catch (e: any) { alert(e.message || 'Error'); }
                    }}
                    className="text-xs px-3 py-1.5 bg-velum-900 text-white hover:bg-velum-800">
                    <Zap size={12} className="inline mr-1" />Registrar Sesión Completada
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

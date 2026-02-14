import React, { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { User, CreditCard, Calendar, ExternalLink, FileText, AlertTriangle, CheckCircle, Loader2, ClipboardList, Clock, XCircle, Zap } from 'lucide-react';
import { redirectToCustomerPortal } from '../services/stripeService';
import { SignaturePad } from '../components/SignaturePad';
import { Member, LegalDocument } from '../types';
import { useAuth } from '../context/AuthContext';
import { memberService, documentService } from '../services/dataService';
import { intakeService, IntakeData } from '../services/intakeService';
import { appointmentService, AppointmentData } from '../services/appointmentService';
import { sessionService, SessionData } from '../services/sessionService';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [memberData, setMemberData] = useState<Member | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [currentDocToSign, setCurrentDocToSign] = useState<LegalDocument | null>(null);
  const [intakeData, setIntakeData] = useState<IntakeData | null>(null);
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);

  // --- FETCH DATA ON LOAD ---
  useEffect(() => {
    const fetchData = async () => {
        if (user && user.role === 'member') {
            try {
                const [data, intake, appts, sessionsData] = await Promise.all([
                    memberService.getById(user.id),
                    intakeService.getMyIntake().catch(() => null),
                    appointmentService.getMyAppointments().catch(() => []),
                    sessionService.getMySessions().catch(() => [])
                ]);
                setMemberData(data || null);
                setIntakeData(intake);
                setAppointments(appts);
                setSessions(sessionsData);
            } catch (e) {
                console.error("Error fetching member data", e);
            } finally {
                setIsLoadingData(false);
            }
        } else {
            setIsLoadingData(false);
        }
    };
    if (!isAuthLoading) {
      fetchData();
    }
  }, [user, isAuthLoading]);

  const handlePortalAccess = async () => {
    await redirectToCustomerPortal();
  };

  const initiateSigning = (doc: LegalDocument) => {
    setCurrentDocToSign(doc);
    setShowSignatureModal(true);
  };

  const handleSignatureSave = async (signatureData: string) => {
    if (!currentDocToSign || !user) return;

    try {
        await documentService.signDocument(currentDocToSign.id, signatureData);
        // Refresh data to show signed status
        const updatedData = await memberService.getById(user.id);
        setMemberData(updatedData || null);
        alert("Documento firmado y almacenado correctamente.");
    } catch (e) {
        alert("Error al guardar la firma.");
    }
    
    setShowSignatureModal(false);
    setCurrentDocToSign(null);
  };

  // --- ACCESS CONTROL ---
  if (isAuthLoading || (isAuthenticated && isLoadingData)) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-velum-400" size={32}/></div>;
  }

  if (!isAuthenticated) {
      return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center">
              <h2 className="text-2xl font-serif mb-4">Acceso Restringido</h2>
              <p className="mb-4 text-velum-600">Debes iniciar sesión para ver tu panel.</p>
              <Link to="/agenda"><Button>Ir a Login</Button></Link>
          </div>
      );
  }

  if (!memberData) {
      return (
          <div className="max-w-4xl mx-auto py-12 px-4 text-center">
              <h2 className="text-xl font-serif">Cuenta Administrativa</h2>
              <p className="text-velum-600 mb-4">Estás logueado como {user?.role}. Este panel es para miembros.</p>
              <Link to="/admin"><Button>Ir al Panel Admin</Button></Link>
          </div>
      );
  }

  // Helper for doc status
  const documents = memberData.clinical?.documents || [];
  const pendingDocs = documents.filter((d) => !d.signed).length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 animate-fade-in relative">
      <h1 className="text-3xl font-serif text-velum-900 mb-8">Mi Cuenta Velum</h1>

      {/* COMPLIANCE ALERT BLOCKER */}
      {pendingDocs > 0 && (
          <div className="bg-orange-50 border-l-4 border-orange-500 p-6 mb-8 shadow-sm">
             <div className="flex items-start gap-4">
                 <AlertTriangle className="text-orange-500 flex-shrink-0" size={24} />
                 <div>
                     <h3 className="font-bold text-orange-900 text-lg">Documentación Requerida Pendiente</h3>
                     <p className="text-orange-800 text-sm mb-4">
                         Por regulaciones sanitarias (COFEPRIS) y seguridad, es necesario que firmes los siguientes documentos.
                     </p>
                     <div className="space-y-2">
                         {documents.filter((d) => !d.signed).map((doc) => (
                             <div key={doc.id} className="flex justify-between items-center bg-white p-3 border border-orange-200 rounded-sm">
                                 <span className="text-sm font-bold text-velum-800">{doc.title}</span>
                                 <Button size="sm" onClick={() => initiateSigning(doc)} className="bg-orange-600 hover:bg-orange-700 border-none text-[10px]">
                                     Firmar Ahora
                                 </Button>
                             </div>
                         ))}
                     </div>
                 </div>
             </div>
          </div>
      )}

      <div className="grid gap-6">
        
        {/* Profile Card */}
        <div className="bg-white p-6 border border-velum-200 shadow-sm flex items-center gap-6">
           <div className="w-16 h-16 bg-velum-100 rounded-full flex items-center justify-center text-velum-500">
             <User size={32} />
           </div>
           <div>
             <h3 className="font-bold text-lg text-velum-900">{memberData.name}</h3>
             <p className="text-sm text-velum-500">{memberData.email}</p>
             <p className="text-xs text-velum-400 mt-1 uppercase tracking-widest">{memberData.plan}</p>
           </div>
        </div>

        {/* Subscription Status */}
        <div className="bg-velum-50 p-8 border border-velum-300 relative overflow-hidden">
           <div className={`absolute top-0 right-0 text-white text-[10px] uppercase font-bold px-3 py-1 ${memberData.subscriptionStatus === 'active' ? 'bg-green-700' : 'bg-red-600'}`}>
               {memberData.subscriptionStatus}
           </div>
           <h3 className="text-sm uppercase tracking-widest text-velum-500 mb-2">Suscripción Actual</h3>
           <h2 className="text-2xl font-serif text-velum-900 mb-4">{memberData.plan}</h2>
           
           <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 bg-white border border-velum-200">
             <div className="flex-grow">
               <p className="text-xs font-bold text-velum-900 uppercase tracking-wide mb-1">Gestión de Facturación</p>
               <p className="text-xs text-velum-500">Administrado por Stripe.</p>
             </div>
             <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePortalAccess} 
                className="whitespace-nowrap"
             >
                <ExternalLink size={14} className="mr-2"/> Portal de Cliente
             </Button>
           </div>
        </div>
        
        {/* Document Status List (ReadOnly) */}
        <div className="p-6 bg-white border border-velum-200">
            <h3 className="font-serif text-lg mb-4">Mis Documentos Legales</h3>
            <div className="space-y-2">
                {documents.map((doc) => (
                    <div key={doc.id} className="flex justify-between items-center text-sm border-b border-velum-50 pb-2">
                        <div className="flex items-center gap-2">
                            <FileText size={16} className="text-velum-400"/>
                            <span className="text-velum-700">{doc.title}</span>
                        </div>
                        {doc.signed ? (
                            <span className="flex items-center gap-1 text-green-600 text-xs font-bold uppercase">
                                <CheckCircle size={12}/> Firmado {doc.signedAt}
                            </span>
                        ) : (
                            <span className="text-orange-500 text-xs font-bold uppercase">Pendiente</span>
                        )}
                    </div>
                ))}
            </div>
        </div>

        {/* Historia Clínica (Medical Intake) Card */}
        <div className="p-6 bg-white border border-velum-200">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg flex items-center gap-2">
                    <ClipboardList size={20} className="text-velum-400"/> Historia Clínica
                </h3>
                {intakeData && (
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 ${
                        intakeData.status === 'approved' ? 'bg-green-100 text-green-700' :
                        intakeData.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                        intakeData.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                    }`}>
                        {intakeData.status === 'draft' ? 'Borrador' :
                         intakeData.status === 'submitted' ? 'Enviado' :
                         intakeData.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                    </span>
                )}
            </div>
            {!intakeData ? (
                <div className="text-sm text-velum-500 mb-4">
                    No has completado tu expediente médico. Es necesario para agendar tratamientos.
                </div>
            ) : intakeData.status === 'rejected' ? (
                <div className="text-sm text-red-600 mb-4">
                    Tu expediente fue rechazado{intakeData.reviewNotes ? `: ${intakeData.reviewNotes}` : '.'}  Por favor corrígelo y reenvía.
                </div>
            ) : intakeData.status === 'approved' ? (
                <div className="text-sm text-green-700 mb-4">
                    Tu expediente está aprobado. Puedes agendar tratamientos.
                </div>
            ) : (
                <div className="text-sm text-velum-500 mb-4">
                    {intakeData.status === 'draft' ? 'Tienes un borrador sin enviar.' : 'Tu expediente está en revisión.'}
                </div>
            )}
            <Link to="/medical-intake">
                <Button size="sm" variant="outline">
                    {!intakeData || intakeData.status === 'rejected' ? 'Completar Expediente' :
                     intakeData.status === 'draft' ? 'Continuar Expediente' : 'Ver Expediente'}
                </Button>
            </Link>
        </div>

        {/* Próximas Citas Card */}
        {(() => {
            const now = new Date().toISOString();
            const upcoming = appointments.filter(a => a.status !== 'canceled' && a.scheduledAt > now);
            const past = appointments.filter(a => a.status === 'completed' || a.status === 'no_show' || (a.status === 'canceled' && a.scheduledAt <= now) || a.scheduledAt <= now);
            return (
                <>
                    <div className="p-6 bg-white border border-velum-200">
                        <h3 className="font-serif text-lg flex items-center gap-2 mb-4">
                            <Calendar size={20} className="text-velum-400"/> Próximas Citas
                        </h3>
                        {upcoming.length === 0 ? (
                            <p className="text-sm text-velum-500">No tienes citas programadas.</p>
                        ) : (
                            <div className="space-y-3">
                                {upcoming.slice(0, 5).map(appt => (
                                    <div key={appt.id} className="flex justify-between items-center text-sm border-b border-velum-50 pb-3">
                                        <div>
                                            <p className="font-bold text-velum-800">
                                                {new Date(appt.scheduledAt).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                                                {' · '}
                                                {new Date(appt.scheduledAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            <p className="text-xs text-velum-500 uppercase">
                                                {appt.type === 'valuation' ? 'Valoración' : appt.type === 'treatment' ? 'Tratamiento' : 'Seguimiento'}
                                                {appt.zones.length > 0 && ` · ${appt.zones.join(', ')}`}
                                            </p>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase px-2 py-1 ${
                                            appt.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {appt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="mt-4">
                            <Link to="/agenda"><Button size="sm" variant="outline">Agendar Cita</Button></Link>
                        </div>
                    </div>

                    {/* Historial de Citas Card */}
                    {past.length > 0 && (
                        <div className="p-6 bg-white border border-velum-200">
                            <h3 className="font-serif text-lg flex items-center gap-2 mb-4">
                                <Clock size={20} className="text-velum-400"/> Historial de Citas
                            </h3>
                            <div className="space-y-2">
                                {past.slice(0, 5).map(appt => (
                                    <div key={appt.id} className="flex justify-between items-center text-sm border-b border-velum-50 pb-2">
                                        <div>
                                            <p className="text-velum-700">
                                                {new Date(appt.scheduledAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </p>
                                            <p className="text-xs text-velum-400 uppercase">
                                                {appt.type === 'valuation' ? 'Valoración' : appt.type === 'treatment' ? 'Tratamiento' : 'Seguimiento'}
                                            </p>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase ${
                                            appt.status === 'completed' ? 'text-green-600' :
                                            appt.status === 'canceled' ? 'text-red-500' :
                                            appt.status === 'no_show' ? 'text-orange-500' : 'text-velum-400'
                                        }`}>
                                            {appt.status === 'completed' ? 'Completada' :
                                             appt.status === 'canceled' ? 'Cancelada' :
                                             appt.status === 'no_show' ? 'No asistió' : appt.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            );
        })()}

        {/* Mis Sesiones de Tratamiento Card */}
        {sessions.length > 0 && (
            <div className="p-6 bg-white border border-velum-200">
                <h3 className="font-serif text-lg flex items-center gap-2 mb-4">
                    <Zap size={20} className="text-velum-400"/> Mis Sesiones de Tratamiento
                </h3>
                <div className="space-y-3">
                    {sessions.slice(0, 5).map(s => (
                        <div key={s.id} className="flex justify-between items-start text-sm border-b border-velum-50 pb-3">
                            <div>
                                <p className="font-bold text-velum-800">
                                    {s.appointment ? new Date(s.appointment.scheduledAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : new Date(s.createdAt).toLocaleDateString('es-MX')}
                                </p>
                                {s.zones.length > 0 && <p className="text-xs text-velum-500">Zonas: {s.zones.join(', ')}</p>}
                                {s.fitzpatrickUsed && <p className="text-xs text-velum-400">Fototipo: {s.fitzpatrickUsed}</p>}
                                {s.energyDelivered && <p className="text-xs text-velum-400">Energía: {s.energyDelivered}</p>}
                            </div>
                            <div className="text-right">
                                {s.staff?.profile && <p className="text-xs text-velum-500">{s.staff.profile.firstName} {s.staff.profile.lastName}</p>}
                                {s.skinResponse && <p className="text-[10px] text-velum-400 mt-1">{s.skinResponse}</p>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

      </div>

      {/* Signature Modal Overlay */}
      {showSignatureModal && currentDocToSign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <SignaturePad 
                title={`Firmar: ${currentDocToSign.title}`} 
                onCancel={() => setShowSignatureModal(false)}
                onSave={handleSignatureSave}
              />
          </div>
      )}

    </div>
  );
};

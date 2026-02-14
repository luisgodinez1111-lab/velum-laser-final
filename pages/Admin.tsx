import React, { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { VelumLogo } from '../components/VelumLogo';
import {
  Users, Calendar, DollarSign, PieChart, Download, Search, AlertCircle, CheckCircle, Lock, ShieldAlert,
  CreditCard, X, RefreshCw, MoreHorizontal, FileText, Activity, Plus, Camera, Paperclip, ClipboardList,
  Banknote, Save, Edit2, Trash2, Mail, Upload, ShieldCheck, UserPlus, Phone, XCircle
} from 'lucide-react';
import { AuditLogEntry, Member } from '../types';
import { useAuth } from '../context/AuthContext';
import { memberService, auditService } from '../services/dataService';
import { adminService, LeadData, IntakeAdminData, AppointmentAdminData } from '../services/adminService';
import { analyticsServiceFe, OverviewData, AppointmentStatsData, LeadStatsData } from '../services/analyticsService';
import { invoiceServiceFe, InvoiceData, RevenueStats } from '../services/invoiceService';
import { treatmentPlanService, TreatmentPlanData } from '../services/treatmentPlanService';

export const Admin: React.FC = () => {
  const { login, logout, user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  
  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Dashboard Data State
  const [activeTab, setActiveTab] = useState<'members' | 'leads' | 'appointments' | 'intakes' | 'analytics' | 'invoices' | 'plans' | 'security'>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [intakes, setIntakes] = useState<IntakeAdminData[]>([]);
  const [adminAppointments, setAdminAppointments] = useState<AppointmentAdminData[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Filters & Interaction
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [leadStatusFilter, setLeadStatusFilter] = useState('all');
  const [intakeStatusFilter, setIntakeStatusFilter] = useState('all');
  const [apptStatusFilter, setApptStatusFilter] = useState('all');
  const [reviewNotes, setReviewNotes] = useState('');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [apptStats, setApptStats] = useState<AppointmentStatsData | null>(null);
  const [leadStats, setLeadStats] = useState<LeadStatsData | null>(null);
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [adminPlans, setAdminPlans] = useState<TreatmentPlanData[]>([]);

  // --- EFFECT: FETCH DATA ---
  useEffect(() => {
    if (isAuthenticated && (user?.role === 'admin' || user?.role === 'staff')) {
      loadData();
    }
  }, [isAuthenticated, user]);

  const loadData = async () => {
    setIsLoadingData(true);
    try {
        const [membersData, logsData, leadsData, intakesData, apptsData, overviewData, apptStatsData, leadStatsData] = await Promise.all([
            memberService.getAll(),
            user?.role === 'admin' ? auditService.getLogs() : Promise.resolve([]),
            adminService.getLeads().catch(() => []),
            adminService.getIntakes().catch(() => []),
            adminService.getAppointments().catch(() => []),
            user?.role === 'admin' ? analyticsServiceFe.getOverview().catch(() => null) : Promise.resolve(null),
            user?.role === 'admin' ? analyticsServiceFe.getAppointmentStats().catch(() => null) : Promise.resolve(null),
            user?.role === 'admin' ? analyticsServiceFe.getLeadStats().catch(() => null) : Promise.resolve(null),
            user?.role === 'admin' ? invoiceServiceFe.getRevenueStats().catch(() => null) : Promise.resolve(null),
            user?.role === 'admin' ? invoiceServiceFe.getAll().catch(() => []) : Promise.resolve([]),
            treatmentPlanService.getAll().catch(() => [])
        ]);
        setMembers(membersData);
        setAuditLogs(logsData);
        setLeads(leadsData);
        setIntakes(intakesData);
        setAdminAppointments(apptsData);
        setOverview(overviewData);
        setApptStats(apptStatsData);
        setLeadStats(leadStatsData);
        setRevenueStats(revenueData);
        setInvoices(invoicesData);
        setAdminPlans(plansData);
    } catch (e) {
        console.error("Error loading admin data");
    } finally {
        setIsLoadingData(false);
    }
  };

  // --- HANDLERS ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setLoginError(err.message || 'Error de autenticación');
    }
  };

  const handleUpdateMember = async (id: string, status: string) => {
    try {
      await memberService.updateMembershipStatus(id, status);
      loadData(); // Refresh list
      if (selectedMember && selectedMember.id === id) {
        setSelectedMember({ ...selectedMember, subscriptionStatus: status });
      }
      alert("Membresía actualizada.");
    } catch (e) {
      alert("Error al actualizar la membresía.");
    }
  };

  // Filter Logic
  const filteredMembers = members.filter(member => {
    const matchesSearch = 
      member.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      member.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' ? true :
      statusFilter === 'active' ? member.subscriptionStatus === 'active' :
      statusFilter === 'issue' ? member.subscriptionStatus !== 'active' : true;

    return matchesSearch && matchesStatus;
  });

  // --- RENDER LOGIN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-velum-50 px-4">
        <div className="max-w-md w-full bg-white p-10 border border-velum-200 shadow-2xl animate-fade-in-up">
          <div className="flex justify-center mb-8">
            <VelumLogo className="h-16 w-auto text-velum-900" />
          </div>
          <div className="text-center mb-8">
            <h2 className="font-serif text-2xl text-velum-900 italic">Portal Corporativo</h2>
            <p className="text-xs text-velum-500 uppercase tracking-widest mt-2">Gestión de Membresías & Clínica</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2 font-bold">ID Administrativo</label>
              <div className="relative">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 pl-10 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors text-sm" placeholder="admin@velum.com" />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-velum-400" size={16} />
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-velum-600 mb-2 font-bold">Clave de Seguridad</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border border-velum-300 bg-velum-50 focus:border-velum-900 outline-none transition-colors text-sm" placeholder="••••••" />
            </div>
            {loginError && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 text-xs border border-red-100">
                <ShieldAlert size={16} />{loginError}
              </div>
            )}
            <Button type="submit" className="w-full py-4" isLoading={isAuthLoading}>Autenticar</Button>
          </form>
        </div>
      </div>
    );
  }

  // --- RENDER MEMBER DETAIL (Modal) ---
  const renderMemberDetail = () => {
    if (!selectedMember) return null;
    return (
      <div className="fixed inset-0 z-50 flex justify-end animate-fade-in bg-black/20 backdrop-blur-sm">
        <div className="w-full max-w-4xl bg-white h-full shadow-2xl overflow-y-auto border-l border-velum-200 flex flex-col">
          <div className="p-6 border-b border-velum-200 flex justify-between items-start bg-velum-50">
            <div>
               <h2 className="text-2xl font-serif text-velum-900">{selectedMember.name}</h2>
               <p className="text-sm text-velum-500">{selectedMember.email}</p>
            </div>
            <button onClick={() => setSelectedMember(null)} className="text-velum-400 hover:text-velum-900"><X size={24} /></button>
          </div>
          
          <div className="p-8">
            <h3 className="font-bold text-lg mb-4">Información Rápida</h3>
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div className="p-4 border border-velum-200">
                    <p className="text-xs uppercase text-velum-500">Plan</p>
                    <p className="font-bold">{selectedMember.plan}</p>
                </div>
                <div className="p-4 border border-velum-200">
                    <p className="text-xs uppercase text-velum-500">Estado</p>
                    <p className="font-bold">{selectedMember.subscriptionStatus}</p>
                </div>
            </div>
            <Button 
                onClick={() => handleUpdateMember(selectedMember.id, 'canceled')} 
                variant="outline" 
                className="text-red-600 border-red-200"
                disabled={selectedMember.subscriptionStatus === 'canceled'}
            >
                Marcar como cancelada
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 min-h-screen animate-fade-in relative">
      {selectedMember && renderMemberDetail()}
      
      {/* Admin Header */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-10 border-b border-velum-200 pb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-velum-500">Panel Administrativo</span>
          <h1 className="text-3xl font-serif text-velum-900 italic mt-2">Gestión Integral Velum</h1>
        </div>
        <div className="flex items-center gap-4 mt-4 md:mt-0">
           <div className="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold uppercase">
              {user?.role}
           </div>
           <Button variant="outline" size="sm" onClick={logout}>Cerrar Sesión</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-velum-200 mb-8 overflow-x-auto">
        {([
          { key: 'members', label: 'Socios' },
          { key: 'leads', label: 'Leads' },
          { key: 'appointments', label: 'Citas' },
          { key: 'intakes', label: 'Expedientes' },
          { key: 'analytics', label: 'Analytics' },
          { key: 'invoices', label: 'Facturación' },
          { key: 'plans', label: 'Planes' },
          { key: 'security', label: 'Seguridad & Logs' }
        ] as const).map(tab => (
            <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-4 px-6 text-sm uppercase tracking-widest font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key ? 'border-velum-900 text-velum-900' : 'border-transparent text-velum-400'}`}
            >
                {tab.label}
            </button>
        ))}
      </div>

      {isLoadingData ? (
          <div className="text-center py-20 text-velum-400">Cargando datos del sistema...</div>
      ) : (
          <>
            {activeTab === 'members' && (
                <div className="bg-white border border-velum-200 shadow-sm animate-fade-in">
                  <div className="p-4 border-b border-velum-200 flex gap-4">
                     <Search size={20} className="text-velum-400"/>
                     <input className="w-full outline-none text-sm" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  </div>
                  <table className="w-full text-left border-collapse">
                      <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
                          <tr><th className="p-4">Nombre</th><th className="p-4">Plan</th><th className="p-4">Status</th></tr>
                      </thead>
                      <tbody>
                          {filteredMembers.map(m => (
                              <tr key={m.id} onClick={() => setSelectedMember(m)} className="border-b border-velum-100 hover:bg-velum-50 cursor-pointer">
                                  <td className="p-4 font-bold">{m.name}</td>
                                  <td className="p-4 text-sm">{m.plan}</td>
                                  <td className="p-4 text-xs uppercase">{m.subscriptionStatus}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                </div>
            )}

            {activeTab === 'leads' && (
                <div className="bg-white border border-velum-200 shadow-sm animate-fade-in">
                    <div className="p-4 border-b border-velum-200 flex flex-wrap gap-4 items-center">
                        <Search size={20} className="text-velum-400"/>
                        <input className="flex-1 min-w-[200px] outline-none text-sm" placeholder="Buscar leads..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <select value={leadStatusFilter} onChange={e => setLeadStatusFilter(e.target.value)} className="text-xs border border-velum-200 px-2 py-1 outline-none">
                            <option value="all">Todos</option>
                            <option value="new_lead">Nuevo</option>
                            <option value="contacted">Contactado</option>
                            <option value="qualified">Calificado</option>
                            <option value="converted">Convertido</option>
                            <option value="lost">Perdido</option>
                        </select>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
                                <tr>
                                    <th className="p-4">Nombre</th>
                                    <th className="p-4">Teléfono</th>
                                    <th className="p-4">Fuente</th>
                                    <th className="p-4">Estado</th>
                                    <th className="p-4">Fecha</th>
                                    <th className="p-4">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leads
                                    .filter(l => leadStatusFilter === 'all' || l.status === leadStatusFilter)
                                    .filter(l => !searchTerm || `${l.firstName} ${l.lastName || ''} ${l.email || ''} ${l.phone}`.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(lead => (
                                    <tr key={lead.id} className="border-b border-velum-100 hover:bg-velum-50">
                                        <td className="p-4 font-bold">{lead.firstName} {lead.lastName || ''}</td>
                                        <td className="p-4 text-sm">{lead.phone}</td>
                                        <td className="p-4 text-xs uppercase">{lead.source}</td>
                                        <td className="p-4">
                                            <select
                                                value={lead.status}
                                                onChange={async (e) => {
                                                    await adminService.updateLead(lead.id, { status: e.target.value });
                                                    loadData();
                                                }}
                                                className="text-xs border border-velum-200 px-2 py-1 outline-none"
                                            >
                                                <option value="new_lead">Nuevo</option>
                                                <option value="contacted">Contactado</option>
                                                <option value="qualified">Calificado</option>
                                                <option value="converted">Convertido</option>
                                                <option value="lost">Perdido</option>
                                            </select>
                                        </td>
                                        <td className="p-4 text-xs text-velum-500">{new Date(lead.createdAt).toLocaleDateString('es-MX')}</td>
                                        <td className="p-4">
                                            {!lead.convertedUserId && (
                                                <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
                                                    if (confirm('¿Convertir este lead a usuario registrado?')) {
                                                        try {
                                                            await adminService.convertLead(lead.id);
                                                            loadData();
                                                        } catch (e: any) {
                                                            alert(e.message || 'Error al convertir');
                                                        }
                                                    }
                                                }}>
                                                    <UserPlus size={12} className="mr-1"/> Convertir
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'appointments' && (
                <div className="bg-white border border-velum-200 shadow-sm animate-fade-in">
                    <div className="p-4 border-b border-velum-200 flex flex-wrap gap-4 items-center">
                        <Calendar size={20} className="text-velum-400"/>
                        <select value={apptStatusFilter} onChange={e => setApptStatusFilter(e.target.value)} className="text-xs border border-velum-200 px-2 py-1 outline-none">
                            <option value="all">Todos</option>
                            <option value="pending">Pendiente</option>
                            <option value="confirmed">Confirmada</option>
                            <option value="in_progress">En curso</option>
                            <option value="completed">Completada</option>
                            <option value="canceled">Cancelada</option>
                            <option value="no_show">No asistió</option>
                        </select>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
                                <tr>
                                    <th className="p-4">Paciente</th>
                                    <th className="p-4">Fecha/Hora</th>
                                    <th className="p-4">Tipo</th>
                                    <th className="p-4">Zonas</th>
                                    <th className="p-4">Estado</th>
                                    <th className="p-4">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {adminAppointments
                                    .filter(a => apptStatusFilter === 'all' || a.status === apptStatusFilter)
                                    .map(appt => (
                                    <tr key={appt.id} className="border-b border-velum-100 hover:bg-velum-50">
                                        <td className="p-4 font-bold text-sm">{appt.user?.profile?.firstName || ''} {appt.user?.profile?.lastName || ''}</td>
                                        <td className="p-4 text-sm">
                                            {new Date(appt.scheduledAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                                            {' '}
                                            {new Date(appt.scheduledAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="p-4 text-xs uppercase">{appt.type === 'valuation' ? 'Valoración' : appt.type === 'treatment' ? 'Tratamiento' : 'Seguimiento'}</td>
                                        <td className="p-4 text-xs">{appt.zones.join(', ') || '—'}</td>
                                        <td className="p-4">
                                            <select
                                                value={appt.status}
                                                onChange={async (e) => {
                                                    await adminService.updateAppointment(appt.id, { status: e.target.value });
                                                    loadData();
                                                }}
                                                className="text-xs border border-velum-200 px-2 py-1 outline-none"
                                            >
                                                <option value="pending">Pendiente</option>
                                                <option value="confirmed">Confirmada</option>
                                                <option value="in_progress">En curso</option>
                                                <option value="completed">Completada</option>
                                                <option value="canceled">Cancelada</option>
                                                <option value="no_show">No asistió</option>
                                            </select>
                                        </td>
                                        <td className="p-4 text-xs text-velum-500">{appt.staff?.profile?.firstName || 'Sin asignar'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'intakes' && (
                <div className="bg-white border border-velum-200 shadow-sm animate-fade-in">
                    <div className="p-4 border-b border-velum-200 flex flex-wrap gap-4 items-center">
                        <ClipboardList size={20} className="text-velum-400"/>
                        <span className="text-sm font-bold text-velum-700">Expedientes Médicos</span>
                        <select value={intakeStatusFilter} onChange={e => setIntakeStatusFilter(e.target.value)} className="text-xs border border-velum-200 px-2 py-1 outline-none ml-auto">
                            <option value="all">Todos</option>
                            <option value="submitted">Pendientes</option>
                            <option value="approved">Aprobados</option>
                            <option value="rejected">Rechazados</option>
                        </select>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
                                <tr>
                                    <th className="p-4">Paciente</th>
                                    <th className="p-4">Fototipo</th>
                                    <th className="p-4">Contraindicaciones</th>
                                    <th className="p-4">Estado</th>
                                    <th className="p-4">Fecha</th>
                                    <th className="p-4">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {intakes
                                    .filter(i => intakeStatusFilter === 'all' || i.status === intakeStatusFilter)
                                    .map(intake => (
                                    <tr key={intake.id} className="border-b border-velum-100 hover:bg-velum-50">
                                        <td className="p-4 font-bold text-sm">{intake.user?.profile?.firstName || ''} {intake.user?.profile?.lastName || ''}</td>
                                        <td className="p-4 text-sm">{intake.fitzpatrickType || '—'}</td>
                                        <td className="p-4 text-xs">
                                            {intake.contraindications.length > 0 ? (
                                                <span className="text-red-600 font-bold">{intake.contraindications.length} encontrada(s)</span>
                                            ) : (
                                                <span className="text-green-600">Ninguna</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className={`text-[10px] font-bold uppercase px-2 py-1 ${
                                                intake.status === 'approved' ? 'bg-green-100 text-green-700' :
                                                intake.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                                intake.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {intake.status === 'submitted' ? 'Pendiente' :
                                                 intake.status === 'approved' ? 'Aprobado' :
                                                 intake.status === 'rejected' ? 'Rechazado' : 'Borrador'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-xs text-velum-500">{new Date(intake.createdAt).toLocaleDateString('es-MX')}</td>
                                        <td className="p-4">
                                            {intake.status === 'submitted' && (
                                                <div className="flex gap-2">
                                                    <Button size="sm" className="text-xs bg-green-600 border-none text-white hover:bg-green-700" onClick={async () => {
                                                        await adminService.reviewIntake(intake.id, 'approved');
                                                        loadData();
                                                    }}>
                                                        <CheckCircle size={12} className="mr-1"/> Aprobar
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="text-xs text-red-600 border-red-200" onClick={async () => {
                                                        const notes = prompt('Motivo del rechazo:');
                                                        if (notes !== null) {
                                                            await adminService.reviewIntake(intake.id, 'rejected', notes || undefined);
                                                            loadData();
                                                        }
                                                    }}>
                                                        <XCircle size={12} className="mr-1"/> Rechazar
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'analytics' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Overview Cards */}
                    {overview && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {[
                                { label: 'Usuarios', value: overview.totalUsers, color: 'text-blue-600' },
                                { label: 'Leads', value: overview.totalLeads, color: 'text-purple-600' },
                                { label: 'Citas', value: overview.totalAppointments, color: 'text-green-600' },
                                { label: 'Miembros Activos', value: overview.activeMembers, color: 'text-velum-900' },
                                { label: 'Intakes Pendientes', value: overview.pendingIntakes, color: 'text-orange-600' }
                            ].map(card => (
                                <div key={card.label} className="bg-white p-6 border border-velum-200 text-center">
                                    <p className={`text-3xl font-serif ${card.color}`}>{card.value}</p>
                                    <p className="text-[10px] uppercase tracking-widest text-velum-500 mt-1">{card.label}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Appointment Stats */}
                    {apptStats && (
                        <div className="bg-white p-6 border border-velum-200">
                            <h3 className="font-serif text-lg mb-4">Citas (últimos 30 días)</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div className="text-center p-3 bg-velum-50">
                                    <p className="text-2xl font-bold text-velum-900">{apptStats.total}</p>
                                    <p className="text-[10px] uppercase text-velum-500">Total</p>
                                </div>
                                {Object.entries(apptStats.byStatus).map(([status, count]) => (
                                    <div key={status} className="text-center p-3 bg-velum-50">
                                        <p className="text-2xl font-bold text-velum-900">{count}</p>
                                        <p className="text-[10px] uppercase text-velum-500">{status}</p>
                                    </div>
                                ))}
                            </div>
                            <h4 className="text-xs uppercase font-bold text-velum-500 mb-2">Por tipo</h4>
                            <div className="flex gap-4">
                                {Object.entries(apptStats.byType).map(([type, count]) => (
                                    <div key={type} className="flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full bg-velum-400"></span>
                                        <span className="text-xs">{type === 'valuation' ? 'Valoración' : type === 'treatment' ? 'Tratamiento' : 'Seguimiento'}: <strong>{count}</strong></span>
                                    </div>
                                ))}
                            </div>
                            {Object.keys(apptStats.byDay).length > 0 && (
                                <div className="mt-4">
                                    <h4 className="text-xs uppercase font-bold text-velum-500 mb-2">Por día</h4>
                                    <div className="flex gap-1 items-end h-24">
                                        {Object.entries(apptStats.byDay).sort().slice(-14).map(([day, count]) => {
                                            const maxVal = Math.max(...Object.values(apptStats.byDay));
                                            const height = maxVal > 0 ? (count / maxVal) * 100 : 0;
                                            return (
                                                <div key={day} className="flex-1 flex flex-col items-center">
                                                    <div className="bg-velum-400 w-full rounded-t" style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}></div>
                                                    <span className="text-[8px] text-velum-400 mt-1">{day.slice(5)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Lead Stats */}
                    {leadStats && (
                        <div className="bg-white p-6 border border-velum-200">
                            <h3 className="font-serif text-lg mb-4">Leads (últimos 30 días)</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                                <div className="text-center p-3 bg-velum-50">
                                    <p className="text-2xl font-bold text-velum-900">{leadStats.total}</p>
                                    <p className="text-[10px] uppercase text-velum-500">Total</p>
                                </div>
                                <div className="text-center p-3 bg-velum-50">
                                    <p className="text-2xl font-bold text-green-600">{leadStats.conversionRate}%</p>
                                    <p className="text-[10px] uppercase text-velum-500">Tasa de Conversión</p>
                                </div>
                            </div>
                            <h4 className="text-xs uppercase font-bold text-velum-500 mb-2">Por fuente</h4>
                            <div className="flex flex-wrap gap-3">
                                {Object.entries(leadStats.bySource).map(([source, count]) => (
                                    <span key={source} className="text-xs bg-velum-100 px-3 py-1">{source}: <strong>{count}</strong></span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'invoices' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Revenue Summary */}
                    {revenueStats && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-6 border border-velum-200 text-center">
                                <p className="text-xs uppercase text-velum-500 tracking-widest">Ingresos (30d)</p>
                                <p className="text-3xl font-serif font-bold text-velum-900">${(revenueStats.totalRevenue / 100).toLocaleString('es-MX')} MXN</p>
                            </div>
                            <div className="bg-white p-6 border border-velum-200 text-center">
                                <p className="text-xs uppercase text-velum-500 tracking-widest">Facturas Pagadas</p>
                                <p className="text-3xl font-serif font-bold text-velum-900">{revenueStats.totalInvoices}</p>
                            </div>
                            <div className="bg-white p-6 border border-velum-200 text-center">
                                <p className="text-xs uppercase text-velum-500 tracking-widest">Ticket Promedio</p>
                                <p className="text-3xl font-serif font-bold text-velum-900">${(revenueStats.averageInvoice / 100).toLocaleString('es-MX')}</p>
                            </div>
                        </div>
                    )}

                    {/* Invoice Table */}
                    <div className="bg-white border border-velum-200 shadow-sm p-6">
                        <h3 className="font-serif text-xl mb-4">Historial de Facturación</h3>
                        <div className="overflow-x-auto border border-velum-200">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
                                    <tr>
                                        <th className="p-3">Fecha</th>
                                        <th className="p-3">Paciente</th>
                                        <th className="p-3">Monto</th>
                                        <th className="p-3">Estado</th>
                                        <th className="p-3">Descripción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-velum-100">
                                    {invoices.length === 0 ? (
                                        <tr><td colSpan={5} className="p-8 text-center text-velum-400">Sin facturas registradas</td></tr>
                                    ) : invoices.slice(0, 50).map(inv => (
                                        <tr key={inv.id} className="hover:bg-velum-50 text-xs">
                                            <td className="p-3 text-velum-500">{new Date(inv.createdAt).toLocaleDateString('es-MX')}</td>
                                            <td className="p-3 font-bold">{inv.user?.profile ? `${inv.user.profile.firstName || ''} ${inv.user.profile.lastName || ''}`.trim() : inv.user?.email || '-'}</td>
                                            <td className="p-3 font-bold">${(inv.amount / 100).toFixed(2)} {inv.currency.toUpperCase()}</td>
                                            <td className="p-3">
                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 ${
                                                    inv.status === 'paid' ? 'bg-green-100 text-green-700' :
                                                    inv.status === 'failed' ? 'bg-red-100 text-red-700' :
                                                    inv.status === 'refunded' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {inv.status === 'paid' ? 'Pagado' : inv.status === 'failed' ? 'Fallido' : inv.status === 'refunded' ? 'Reembolsado' : 'Pendiente'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-velum-500">{inv.description || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'plans' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-serif text-xl">Planes de Tratamiento</h3>
                        <span className="text-sm text-velum-500">{adminPlans.length} plan(es)</span>
                    </div>
                    {adminPlans.length === 0 ? (
                        <div className="bg-white border border-velum-200 p-12 text-center text-velum-400">
                            <ClipboardList size={48} className="mx-auto mb-4" />
                            <p>No hay planes de tratamiento registrados.</p>
                        </div>
                    ) : (
                        <div className="bg-white border border-velum-200 shadow-sm overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
                                    <tr>
                                        <th className="p-3">Paciente</th>
                                        <th className="p-3">Zonas</th>
                                        <th className="p-3">Progreso</th>
                                        <th className="p-3">Estado</th>
                                        <th className="p-3">Inicio</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-velum-100">
                                    {adminPlans.map(plan => {
                                        const pct = Math.round((plan.completedSessions / plan.totalSessions) * 100);
                                        const name = plan.user?.profile ? `${plan.user.profile.firstName || ''} ${plan.user.profile.lastName || ''}`.trim() : '-';
                                        return (
                                            <tr key={plan.id} className="hover:bg-velum-50 text-xs">
                                                <td className="p-3 font-bold">{name}</td>
                                                <td className="p-3 text-velum-500">{plan.zones.join(', ')}</td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20 h-2 bg-velum-100 rounded-full">
                                                            <div className="h-2 bg-velum-700 rounded-full" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="font-bold">{plan.completedSessions}/{plan.totalSessions}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 ${
                                                        plan.status === 'active' ? 'bg-green-100 text-green-700' :
                                                        plan.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                                                        plan.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                    }`}>{plan.status}</span>
                                                </td>
                                                <td className="p-3 text-velum-500">{new Date(plan.startDate).toLocaleDateString('es-MX')}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'security' && (
                 <div className="bg-white border border-velum-200 shadow-sm animate-fade-in p-6">
                     <h3 className="font-serif text-xl mb-4">Bitácora de Seguridad (Audit Logs)</h3>
                     <div className="overflow-x-auto border border-velum-200">
                         <table className="w-full text-left text-sm">
                             <thead className="bg-velum-50 text-[10px] uppercase font-bold text-velum-600">
                                 <tr>
                                     <th className="p-3">Timestamp</th>
                                     <th className="p-3">Usuario</th>
                                     <th className="p-3">Acción</th>
                                     <th className="p-3">IP</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-velum-100">
                                 {auditLogs.map((log) => (
                                     <tr key={log.id} className="hover:bg-velum-50 font-mono text-xs">
                                         <td className="p-3 text-velum-500">{log.timestamp}</td>
                                         <td className="p-3 font-bold">{log.user} ({log.role})</td>
                                         <td className="p-3">{log.action} - {log.resource}</td>
                                         <td className="p-3 text-velum-400">{log.ip}</td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                 </div>
            )}
          </>
      )}
    </div>
  );
};

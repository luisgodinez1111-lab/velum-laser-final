import React, { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { VelumLogo } from '../components/VelumLogo';
import { 
  Users, Calendar, DollarSign, PieChart, Download, Search, AlertCircle, CheckCircle, Lock, ShieldAlert,
  CreditCard, X, RefreshCw, MoreHorizontal, FileText, Activity, Plus, Camera, Paperclip, ClipboardList,
  Banknote, Save, Edit2, Trash2, Mail, Upload, ShieldCheck
} from 'lucide-react';
import { AuditLogEntry, Member, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { memberService, auditService, documentService } from '../services/dataService';

export const Admin: React.FC = () => {
  const { login, logout, user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  
  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Dashboard Data State
  const [activeTab, setActiveTab] = useState<'overview' | 'agenda' | 'members' | 'finance' | 'security'>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Filters & Interaction
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // --- EFFECT: FETCH DATA ---
  useEffect(() => {
    if (isAuthenticated && (user?.role === 'admin' || user?.role === 'reception')) {
        loadData();
    }
  }, [isAuthenticated, user]);

  const loadData = async () => {
    setIsLoadingData(true);
    try {
        const [membersData, logsData] = await Promise.all([
            memberService.getAll(),
            user?.role === 'admin' ? auditService.getLogs() : Promise.resolve([])
        ]);
        setMembers(membersData);
        setAuditLogs(logsData);
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

  const handleUpdateMember = async (id: number, data: Partial<Member>) => {
      try {
          await memberService.update(id, data, user?.email || 'admin');
          loadData(); // Refresh list
          // Update selected member view locally to avoid flicker
          if (selectedMember && selectedMember.id === id) {
              setSelectedMember({ ...selectedMember, ...data });
          }
          alert("Cambios guardados.");
      } catch (e) {
          alert("Error al actualizar.");
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
            <div className="text-xs text-center text-velum-500">
                <p>Demo: admin@velum.com / pass: velum</p>
            </div>
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
                onClick={() => handleUpdateMember(selectedMember.id, { subscriptionStatus: 'cancelled' })} 
                variant="outline" 
                className="text-red-600 border-red-200"
                disabled={selectedMember.subscriptionStatus === 'cancelled'}
            >
                Simular Cancelación (API)
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
        {['members', 'security'].map(tab => (
            <button 
                key={tab}
                onClick={() => setActiveTab(tab as any)} 
                className={`pb-4 px-6 text-sm uppercase tracking-widest font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-velum-900 text-velum-900' : 'border-transparent text-velum-400'}`}
            >
                {tab === 'members' ? 'Socios' : 'Seguridad & Logs'}
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
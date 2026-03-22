// Sidebar del panel de administración.
// Extraído de Admin.tsx para reducir el tamaño del monolito y evitar re-montajes
// innecesarios (definir el componente dentro del padre hace que React lo trate
// como un tipo nuevo en cada render y desmonte/remonte el sidebar completo).

import React from 'react';
import {
  Activity,
  Users,
  CalendarDays,
  FolderOpen,
  Wallet,
  TrendingUp,
  Banknote,
  AlertTriangle,
  ShieldCheck,
  Settings,
  LogOut,
  ChevronLeft,
} from 'lucide-react';
import { VelumLogo } from '../../components/VelumLogo';
import { Member, UserRole } from '../../types';
import { AdminSection, HealthFlag } from './adminTypes';

// ─── Constantes ──────────────────────────────────────────────────────────────

export const weekDayLabel: Record<number, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

export const sectionMeta: Record<AdminSection, { label: string; icon: React.ComponentType<any> }> = {
  panel:        { label: 'Panel',        icon: Activity },
  socias:       { label: 'Socias',       icon: Users },
  agenda:       { label: 'Agenda',       icon: CalendarDays },
  expedientes:  { label: 'Expedientes',  icon: FolderOpen },
  pagos:        { label: 'Pagos',        icon: Wallet },
  kpis:         { label: 'KPIs',         icon: TrendingUp },
  finanzas:     { label: 'Finanzas',     icon: Banknote },
  riesgos:      { label: 'Riesgos',      icon: AlertTriangle },
  cumplimiento: { label: 'Cumplimiento', icon: ShieldCheck },
  ajustes:      { label: 'Ajustes',      icon: Settings },
};

const NAV_SECTIONS: AdminSection[] = [
  'panel', 'socias', 'agenda', 'expedientes', 'pagos',
  'kpis', 'finanzas', 'riesgos', 'cumplimiento', 'ajustes',
];

export const allowedRoles: UserRole[] = ['admin', 'staff', 'system'];

const roleTitle: Record<UserRole, string> = {
  admin:  'Administrador General',
  staff:  'Gerencia Operativa',
  member: 'Socio',
  system: 'Sistema',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const riskOfMember = (member: Member): HealthFlag => {
  const status = member.subscriptionStatus;
  const consent = !!member.clinical?.consentFormSigned;
  if ((status === 'past_due' || status === 'canceled' || status === 'inactive') && !consent) return 'critical';
  if (status !== 'active' || !consent) return 'warning';
  return 'ok';
};

// ─── Componente ──────────────────────────────────────────────────────────────

type AdminSidebarProps = {
  isSidebarCollapsed: boolean;
  activeSection: AdminSection;
  members: Member[];
  user: { email?: string; name?: string; role?: string } | null;
  onSectionChange: (section: AdminSection) => void;
  onToggleCollapse: () => void;
  onLogout: () => void;
};

export const AdminSidebarContent: React.FC<AdminSidebarProps> = ({
  isSidebarCollapsed,
  activeSection,
  members,
  user,
  onSectionChange,
  onToggleCollapse,
  onLogout,
}) => (
  <>
    {/* Logo */}
    <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 shrink-0">
      <VelumLogo className="h-5 w-auto shrink-0 brightness-0 invert" />
      {!isSidebarCollapsed && (
        <span className="text-white font-serif text-[15px] leading-tight truncate">
          Velum <span className="text-white/40 font-sans text-[10px] uppercase tracking-widest">Admin</span>
        </span>
      )}
    </div>

    {/* Nav */}
    <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
      {NAV_SECTIONS.map((section) => {
        const meta = sectionMeta[section];
        const Icon = meta.icon;
        const isActive = activeSection === section;
        const badge =
          section === 'expedientes' ? members.filter((m) => m.intakeStatus === 'submitted').length
          : section === 'socias'    ? members.filter((m) => riskOfMember(m) !== 'ok').length
          : section === 'pagos'     ? members.filter((m) => ['past_due', 'paused', 'inactive', 'canceled'].includes(m.subscriptionStatus ?? '')).length
          : 0;
        return (
          <button
            key={section}
            onClick={() => onSectionChange(section)}
            title={isSidebarCollapsed ? meta.label : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150
              ${isActive
                ? 'bg-white/[0.14] text-white'
                : 'text-white/50 hover:text-white hover:bg-white/[0.07]'
              }`}
          >
            <div className="relative shrink-0 w-[18px] h-[18px] flex items-center justify-center">
              <Icon size={17} />
              {!isActive && badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            {!isSidebarCollapsed && (
              <>
                <span className="flex-1 truncate text-left">{meta.label}</span>
                {!isActive && badge > 0 && (
                  <span className="shrink-0 min-w-[20px] h-5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center px-1.5">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </nav>

    {/* Bottom */}
    <div className="border-t border-white/10 p-2 space-y-1 shrink-0">
      {!isSidebarCollapsed && (
        <div className="px-3 py-2">
          <p className="text-[11px] text-white/60 font-medium truncate">{user?.email}</p>
          <p className="text-[10px] text-white/30">{roleTitle[user?.role as UserRole] ?? user?.role}</p>
        </div>
      )}
      <button
        onClick={() => { if (window.confirm('¿Cerrar sesión?')) onLogout(); }}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition text-[13px]"
        title={isSidebarCollapsed ? 'Cerrar sesión' : undefined}
        aria-label="Cerrar sesión"
      >
        <LogOut size={15} className="shrink-0" />
        {!isSidebarCollapsed && 'Cerrar sesión'}
      </button>
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white/25 hover:text-white/60 transition"
        title={isSidebarCollapsed ? 'Expandir' : 'Colapsar'}
      >
        <ChevronLeft size={15} className={`shrink-0 transition-transform duration-200 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
        {!isSidebarCollapsed && <span className="text-[11px]">Colapsar</span>}
      </button>
    </div>
  </>
);

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
import { Tooltip } from '../../components/ui';
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

export const sectionMeta: Record<AdminSection, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; description: string }> = {
  panel:        { label: 'Panel',        icon: Activity,       description: 'Resumen operativo y atajos' },
  socias:       { label: 'Socias',       icon: Users,          description: 'Pacientes activas y sus expedientes' },
  agenda:       { label: 'Agenda',       icon: CalendarDays,   description: 'Calendario, citas y configuración de horarios' },
  expedientes:  { label: 'Expedientes',  icon: FolderOpen,     description: 'Historiales clínicos y documentos firmados' },
  pagos:        { label: 'Pagos',        icon: Wallet,         description: 'Cobros, suscripciones y reembolsos' },
  kpis:         { label: 'KPIs',         icon: TrendingUp,     description: 'Métricas de negocio y crecimiento' },
  finanzas:     { label: 'Finanzas',     icon: Banknote,       description: 'Reportes financieros y conciliación' },
  riesgos:      { label: 'Riesgos',      icon: AlertTriangle,  description: 'Pacientes en riesgo de cancelación' },
  cumplimiento: { label: 'Cumplimiento', icon: ShieldCheck,    description: 'Auditoría, consentimientos y RGPD' },
  ajustes:      { label: 'Ajustes',      icon: Settings,       description: 'Configuración del sistema, usuarios y permisos' },
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

// ── Sub-componente: nav item con tooltip cuando colapsado ────────────────────
interface NavItemProps {
  section: AdminSection;
  isActive: boolean;
  isCollapsed: boolean;
  badge: number;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ section, isActive, isCollapsed, badge, onClick }) => {
  const meta = sectionMeta[section];
  const Icon = meta.icon;

  const button = (
    <button
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-label={isCollapsed ? meta.label : undefined}
      className={[
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium',
        'transition-all duration-base ease-standard',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        isActive
          ? 'bg-white/[0.14] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
          : 'text-white/55 hover:text-white hover:bg-white/[0.07]',
      ].join(' ')}
    >
      <div className="relative shrink-0 w-[18px] h-[18px] flex items-center justify-center">
        <Icon size={17} className={`transition-transform duration-base ease-standard ${isActive ? '' : 'group-hover:scale-110'}`} />
        {isCollapsed && badge > 0 && (
          <span
            aria-label={`${badge} pendientes`}
            className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] bg-danger-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center px-0.5 leading-none ring-2 ring-velum-900"
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate text-left">{meta.label}</span>
          {badge > 0 && (
            <span
              aria-label={`${badge} pendientes`}
              className={[
                'shrink-0 min-w-[20px] h-5 rounded-full text-[10px] font-bold flex items-center justify-center px-1.5',
                isActive ? 'bg-white/20 text-white' : 'bg-danger-500 text-white',
              ].join(' ')}
            >
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </>
      )}
    </button>
  );

  // Tooltip solo cuando el sidebar está colapsado
  if (isCollapsed) {
    return (
      <Tooltip content={`${meta.label}${badge > 0 ? ` · ${badge} pendientes` : ''}`} placement="right" delay={300}>
        {button}
      </Tooltip>
    );
  }
  return button;
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
    {/* Logo header */}
    <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10 shrink-0">
      <VelumLogo className="h-5 w-auto shrink-0 brightness-0 invert" />
      {!isSidebarCollapsed && (
        <span className="text-white font-serif text-[15px] leading-tight truncate">
          Velum <span className="text-white/40 font-sans text-[10px] uppercase tracking-widest">Admin</span>
        </span>
      )}
    </div>

    {/* Nav */}
    <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5" aria-label="Navegación admin">
      {NAV_SECTIONS.map((section) => {
        const badge =
          section === 'expedientes' ? members.filter((m) => m.intakeStatus === 'submitted').length
          : section === 'socias'    ? members.filter((m) => riskOfMember(m) !== 'ok').length
          : section === 'pagos'     ? members.filter((m) => ['past_due', 'paused', 'inactive', 'canceled'].includes(m.subscriptionStatus ?? '')).length
          : 0;
        return (
          <NavItem
            key={section}
            section={section}
            isActive={activeSection === section}
            isCollapsed={isSidebarCollapsed}
            badge={badge}
            onClick={() => onSectionChange(section)}
          />
        );
      })}
    </nav>

    {/* Bottom: user info + actions */}
    <div className="border-t border-white/10 p-2 space-y-1 shrink-0">
      {!isSidebarCollapsed && (
        <div className="px-3 py-2.5 mb-1">
          <p className="text-[11px] text-white/65 font-semibold truncate">{user?.email}</p>
          <p className="text-[10px] text-white/35 mt-0.5 uppercase tracking-wider">
            {roleTitle[user?.role as UserRole] ?? user?.role}
          </p>
        </div>
      )}
      {/* Logout */}
      {(() => {
        const logoutBtn = (
          <button
            onClick={() => {
              if (window.confirm('¿Cerrar sesión?')) onLogout();
            }}
            aria-label="Cerrar sesión"
            className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/45 hover:text-white hover:bg-white/10 transition-all duration-base ease-standard text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <LogOut size={15} className="shrink-0 transition-transform duration-base ease-standard group-hover:translate-x-0.5" />
            {!isSidebarCollapsed && 'Cerrar sesión'}
          </button>
        );
        return isSidebarCollapsed ? (
          <Tooltip content="Cerrar sesión" placement="right" delay={300}>{logoutBtn}</Tooltip>
        ) : logoutBtn;
      })()}

      {/* Toggle collapse */}
      {(() => {
        const toggleBtn = (
          <button
            onClick={onToggleCollapse}
            aria-label={isSidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-all duration-base ease-standard focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <ChevronLeft
              size={15}
              className={`shrink-0 transition-transform duration-base ease-standard ${
                isSidebarCollapsed ? 'rotate-180' : ''
              }`}
            />
            {!isSidebarCollapsed && <span className="text-[11px]">Colapsar</span>}
          </button>
        );
        return isSidebarCollapsed ? (
          <Tooltip content="Expandir sidebar" placement="right" delay={300}>{toggleBtn}</Tooltip>
        ) : toggleBtn;
      })()}
    </div>
  </>
);

// Tipos compartidos del panel de administración.
// Separados de Admin.tsx para evitar dependencias circulares y reducir el tamaño del monolito.

export type AdminSection =
  | 'panel'
  | 'socias'
  | 'agenda'
  | 'expedientes'
  | 'pagos'
  | 'kpis'
  | 'finanzas'
  | 'riesgos'
  | 'cumplimiento'
  | 'ajustes';

export type HealthFlag = 'ok' | 'warning' | 'critical';

export type ControlAlert = {
  id: string;
  level: HealthFlag;
  title: string;
  detail: string;
  section: AdminSection;
};

export type AgendaPolicyDraft = {
  timezone: string;
  slotMinutes: number;
  autoConfirmHours: number;
  noShowGraceMinutes: number;
  maxActiveAppointmentsPerWeek: number;
  maxActiveAppointmentsPerMonth: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
};

export type AgendaTemplatePreset =
  | 'weekly_copy'
  | 'holiday_closed'
  | 'season_extended'
  | 'season_compact';

export type SettingsCategory = 'agenda' | 'sistema' | 'integraciones' | 'auditoria';

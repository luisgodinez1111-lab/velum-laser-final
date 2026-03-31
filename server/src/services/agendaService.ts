// agendaService.ts — barrel de re-exports para compatibilidad con imports existentes
// Los módulos reales están en los archivos agenda*.ts
export * from "./agendaTimezoneUtils";
export * from "./agendaConflictService";
export * from "./agendaAvailabilityService";
export * from "./agendaSyncService";
export * from "./agendaSetupService";
export { getAgendaConfig, updateAgendaConfig } from "./agendaConfigService";
export type { AgendaConfigPayload } from "./agendaConfigService";
export { createAgendaBlock, deleteAgendaBlock } from "./agendaBlockService";
export { getAgendaDaySnapshot, getAgendaDailyReport } from "./agendaReportService";

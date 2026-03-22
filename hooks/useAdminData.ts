import { useCallback, useEffect, useState } from 'react';
import { AuditLogEntry, Member } from '../types';
import { memberService, auditService } from '../services/dataService';
import {
  AgendaConfig,
  AgendaDaySnapshot,
  clinicalService,
} from '../services/clinicalService';
import {
  GoogleCalendarIntegrationStatus,
  googleCalendarIntegrationService,
} from '../services/googleCalendarIntegrationService';

export interface AdminDataState {
  isLoading: boolean;
  error: string;
  members: Member[];
  auditLogs: AuditLogEntry[];
  agendaConfig: AgendaConfig | null;
  agendaSnapshot: AgendaDaySnapshot | null;
  googleIntegrationStatus: GoogleCalendarIntegrationStatus | null;
}

const INITIAL_STATE: AdminDataState = {
  isLoading: false,
  error: '',
  members: [],
  auditLogs: [],
  agendaConfig: null,
  agendaSnapshot: null,
  googleIntegrationStatus: null,
};

interface UseAdminDataOptions {
  userRole?: string;
  agendaDate: string;
  isAuthenticated: boolean;
  hasAccess: boolean;
}

export function useAdminData({
  userRole,
  agendaDate,
  isAuthenticated,
  hasAccess,
}: UseAdminDataOptions) {
  const [state, setState] = useState<AdminDataState>(INITIAL_STATE);

  const isPrivileged = userRole === 'admin' || userRole === 'system';

  const load = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: '' }));
    try {
      const [membersData, logsData, configData, dayData, integrationData] =
        await Promise.all([
          memberService.getAll(),
          isPrivileged
            ? auditService.getLogs().catch(() => [] as AuditLogEntry[])
            : Promise.resolve([] as AuditLogEntry[]),
          clinicalService.getAdminAgendaConfig().catch(() => null),
          clinicalService.getAdminAgendaDay(agendaDate).catch(() => null),
          isPrivileged
            ? googleCalendarIntegrationService.getStatus().catch(() => null)
            : Promise.resolve(null),
        ]);

      setState({
        isLoading: false,
        error: '',
        members: membersData,
        auditLogs: logsData,
        agendaConfig: configData,
        agendaSnapshot: dayData,
        googleIntegrationStatus: integrationData,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo cargar los datos del panel.';
      setState((s) => ({ ...s, isLoading: false, error: message }));
    }
  }, [agendaDate, isPrivileged]);

  useEffect(() => {
    if (isAuthenticated && hasAccess) void load();
  }, [isAuthenticated, hasAccess, load]);

  return { ...state, reload: load };
}

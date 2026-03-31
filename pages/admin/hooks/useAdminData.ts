import { useState } from 'react';
import { apiFetch } from '../../../services/apiClient';
import { memberService, auditService } from '../../../services/dataService';
import { AgendaConfig, AgendaDaySnapshot, clinicalService } from '../../../services/clinicalService';
import {
  GoogleCalendarIntegrationStatus,
  googleCalendarIntegrationService,
} from '../../../services/googleCalendarIntegrationService';
import { Member, AuditLogEntry } from '../../../types';

type ServerReports = {
  users: number;
  activeMemberships: number;
  pastDueMemberships: number;
  pendingDocuments: number;
};

export interface LoadDataOptions {
  agendaDate: string;
  userRole: string | undefined;
  selectedAgendaMemberId: string;
  onAgendaConfigLoaded?: (config: AgendaConfig) => void;
  onAgendaDayLoaded?: (day: AgendaDaySnapshot) => void;
  onGoogleStatusLoaded?: (status: GoogleCalendarIntegrationStatus | null) => void;
  onFirstMemberIdLoaded?: (id: string) => void;
}

export interface AdminDataHook {
  members: Member[];
  setMembers: React.Dispatch<React.SetStateAction<Member[]>>;
  membersTotal: number;
  auditLogs: AuditLogEntry[];
  serverReports: ServerReports | null;
  isLoadingData: boolean;
  dataLoadError: string;
  loadData: (opts: LoadDataOptions) => Promise<void>;
}

export const useAdminData = (): AdminDataHook => {
  const [members, setMembers] = useState<Member[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [serverReports, setServerReports] = useState<ServerReports | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataLoadError, setDataLoadError] = useState('');

  const loadData = async ({
    agendaDate,
    userRole,
    selectedAgendaMemberId,
    onAgendaConfigLoaded,
    onAgendaDayLoaded,
    onGoogleStatusLoaded,
    onFirstMemberIdLoaded,
  }: LoadDataOptions) => {
    setIsLoadingData(true);
    setDataLoadError('');
    try {
      const isPrivileged = userRole === 'admin' || userRole === 'system';
      const [membersResult, logsData, configData, dayData, integrationData, reportsData] = await Promise.all([
        memberService.getAll({ limit: 200 }),
        isPrivileged
          ? auditService.getLogs().catch(() => [] as AuditLogEntry[])
          : Promise.resolve([] as AuditLogEntry[]),
        clinicalService.getAdminAgendaConfig().catch(() => null),
        clinicalService.getAdminAgendaDay(agendaDate).catch(() => null),
        isPrivileged
          ? googleCalendarIntegrationService.getStatus().catch(() => null)
          : Promise.resolve(null),
        apiFetch<any>('/admin/reports').catch(() => null),
      ]);

      setMembers(membersResult.members);
      setMembersTotal(membersResult.total);
      setAuditLogs(logsData);

      if (reportsData) setServerReports(reportsData);
      if (configData) onAgendaConfigLoaded?.(configData);
      if (dayData) onAgendaDayLoaded?.(dayData);
      onGoogleStatusLoaded?.(integrationData);

      if (!selectedAgendaMemberId && membersResult.members.length > 0) {
        onFirstMemberIdLoaded?.(membersResult.members[0].id);
      }
    } catch (err: any) {
      setDataLoadError(err?.message || 'No se pudo cargar los datos del panel.');
    } finally {
      setIsLoadingData(false);
    }
  };

  return {
    members,
    setMembers,
    membersTotal,
    auditLogs,
    serverReports,
    isLoadingData,
    dataLoadError,
    loadData,
  };
};

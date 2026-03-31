import { useState } from 'react';
import { apiFetch } from '../../../services/apiClient';

export interface IntegrationJobsHook {
  integrationJobs: any[];
  integrationJobsLoading: boolean;
  integrationJobsLoaded: boolean;
  integrationJobsStatus: string;
  setIntegrationJobsStatus: (v: string) => void;
  integrationJobsError: string;
  webhookEvents: any[];
  webhookEventsLoading: boolean;
  webhookEventsLoaded: boolean;
  webhookEventsError: string;
  loadIntegrationJobs: (status?: string) => Promise<void>;
  loadWebhookEvents: () => Promise<void>;
}

export const useIntegrationJobs = (): IntegrationJobsHook => {
  const [integrationJobs, setIntegrationJobs] = useState<any[]>([]);
  const [integrationJobsLoading, setIntegrationJobsLoading] = useState(false);
  const [integrationJobsLoaded, setIntegrationJobsLoaded] = useState(false);
  const [integrationJobsStatus, setIntegrationJobsStatus] = useState('');
  const [integrationJobsError, setIntegrationJobsError] = useState('');

  const [webhookEvents, setWebhookEvents] = useState<any[]>([]);
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false);
  const [webhookEventsLoaded, setWebhookEventsLoaded] = useState(false);
  const [webhookEventsError, setWebhookEventsError] = useState('');

  const loadIntegrationJobs = async (status?: string) => {
    setIntegrationJobsLoading(true);
    setIntegrationJobsError('');
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const data = await apiFetch<any>(`/v1/admin/integrations/jobs?${params.toString()}`);
      setIntegrationJobs(data?.jobs ?? []);
      setIntegrationJobsLoaded(true);
    } catch (e: any) {
      setIntegrationJobsError(e?.message ?? 'No se pudo cargar los trabajos');
    } finally {
      setIntegrationJobsLoading(false);
    }
  };

  const loadWebhookEvents = async () => {
    setWebhookEventsLoading(true);
    setWebhookEventsError('');
    try {
      const data = await apiFetch<any>('/v1/admin/stripe/webhook-events');
      setWebhookEvents(data?.events ?? []);
      setWebhookEventsLoaded(true);
    } catch (e: any) {
      setWebhookEventsError(e?.message ?? 'No se pudo cargar los eventos');
    } finally {
      setWebhookEventsLoading(false);
    }
  };

  return {
    integrationJobs,
    integrationJobsLoading,
    integrationJobsLoaded,
    integrationJobsStatus,
    setIntegrationJobsStatus,
    integrationJobsError,
    webhookEvents,
    webhookEventsLoading,
    webhookEventsLoaded,
    webhookEventsError,
    loadIntegrationJobs,
    loadWebhookEvents,
  };
};

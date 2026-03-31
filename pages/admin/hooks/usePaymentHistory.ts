import { useState } from 'react';
import { apiFetch } from '../../../services/apiClient';
import { useToast } from '../../../context/ToastContext';

export const HIST_LIMIT = 50;

export interface PaymentHistoryHook {
  histPayments: any[];
  histLoading: boolean;
  histLoaded: boolean;
  histError: string;
  histDateFrom: string;
  setHistDateFrom: (v: string) => void;
  histDateTo: string;
  setHistDateTo: (v: string) => void;
  histStatus: string;
  setHistStatus: (v: string) => void;
  histPage: number;
  histTotal: number;
  histPages: number;
  loadHistPayments: (page?: number) => Promise<void>;
  handleDownloadHistCSV: () => Promise<void>;
}

export const usePaymentHistory = (): PaymentHistoryHook => {
  const toast = useToast();

  const [histPayments, setHistPayments] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histLoaded, setHistLoaded] = useState(false);
  const [histError, setHistError] = useState('');
  const [histDateFrom, setHistDateFrom] = useState('');
  const [histDateTo, setHistDateTo] = useState('');
  const [histStatus, setHistStatus] = useState('');
  const [histPage, setHistPage] = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const [histPages, setHistPages] = useState(1);

  const loadHistPayments = async (page = 1) => {
    setHistLoading(true);
    setHistError('');
    try {
      const params = new URLSearchParams();
      if (histDateFrom) params.set('dateFrom', histDateFrom);
      if (histDateTo) params.set('dateTo', histDateTo);
      if (histStatus) params.set('status', histStatus);
      params.set('page', String(page));
      params.set('limit', String(HIST_LIMIT));
      const data = await apiFetch<any>(`/v1/payments?${params.toString()}`);
      setHistPayments(data?.payments ?? []);
      setHistTotal(data?.total ?? 0);
      setHistPages(data?.pages ?? 1);
      setHistPage(page);
      setHistLoaded(true);
    } catch (e: any) {
      setHistError(e?.message ?? 'No se pudo cargar el historial');
    } finally {
      setHistLoading(false);
    }
  };

  const handleDownloadHistCSV = async () => {
    try {
      const params = new URLSearchParams();
      if (histDateFrom) params.set('dateFrom', histDateFrom);
      if (histDateTo) params.set('dateTo', histDateTo);
      if (histStatus) params.set('status', histStatus);
      const resp = await fetch(`/api/v1/payments/export?${params.toString()}`, { credentials: 'include' });
      if (!resp.ok) throw new Error('Error al exportar');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pagos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('No se pudo descargar el CSV');
    }
  };

  return {
    histPayments,
    histLoading,
    histLoaded,
    histError,
    histDateFrom,
    setHistDateFrom,
    histDateTo,
    setHistDateTo,
    histStatus,
    setHistStatus,
    histPage,
    histTotal,
    histPages,
    loadHistPayments,
    handleDownloadHistCSV,
  };
};

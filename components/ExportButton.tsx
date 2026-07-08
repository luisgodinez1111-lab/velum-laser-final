import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { downloadBlob } from '../services/downloadBlob';
import { useToast } from '../context/ToastContext';

interface ExportButtonProps {
  endpoint: string;
  label: string;
  params?: Record<string, string>;
  className?: string;
  onError?: (message: string) => void;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ endpoint, label, params = {}, className = "", onError }) => {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleExport = async () => {
    setLoading(true);
    try {
      const qs = Object.entries(params)
        .filter(([, v]) => v)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      await downloadBlob(qs ? `${endpoint}?${qs}` : endpoint, "export.csv");
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al exportar';
      // SIEMPRE notificar: si el caller no pasó onError, usar toast (antes el
      // fallo se tragaba en silencio cuando Admin no pasaba onError).
      if (onError) onError(msg); else toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm border border-velum-300 text-velum-700 rounded-xl hover:bg-velum-50 transition-colors disabled:opacity-50 ${className}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {loading ? "Exportando..." : label}
    </button>
  );
};

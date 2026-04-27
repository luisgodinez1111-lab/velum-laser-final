import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { buildApiUrl } from '../services/apiClient';

interface ExportButtonProps {
  endpoint: string;
  label: string;
  params?: Record<string, string>;
  className?: string;
  onError?: (message: string) => void;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ endpoint, label, params = {}, className = "", onError }) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const url = new URL(buildApiUrl(endpoint), window.location.origin);
      Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Error en exportación");
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "export.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al exportar';
      if (onError) onError(msg);
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

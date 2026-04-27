import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { captureException } from '../services/sentry';

interface State {
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  declare readonly props: Readonly<Props>;
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Sentry primero (no-op si no hay DSN configurado).
    captureException(error, { componentStack: info.componentStack, url: window.location.href });

    // Report to backend — fire-and-forget; never throw from here
    const API_BASE = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '/api';
    fetch(`${API_BASE}/v1/errors/client`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 1000),
        componentStack: info.componentStack?.slice(0, 1000),
        url: window.location.href,
      }),
    }).catch(() => {});
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-velum-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
          </div>
          <div>
            <h1 className="font-serif text-2xl text-velum-900 mb-2">Algo salió mal</h1>
            <p className="text-sm text-velum-500 leading-relaxed">
              Ocurrió un error inesperado. Recarga la página para continuar.
              Si el problema persiste, contáctanos.
            </p>
          </div>
          {this.state.error.message && (
            <p className="text-xs text-velum-400 bg-velum-100 rounded-xl px-4 py-3 font-mono text-left break-all">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-velum-900 text-white text-sm font-medium rounded-xl hover:bg-velum-800 transition-colors"
          >
            <RefreshCw size={15} />
            Recargar página
          </button>
        </div>
      </div>
    );
  }
}

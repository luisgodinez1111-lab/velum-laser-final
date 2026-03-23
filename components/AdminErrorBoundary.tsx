import React from 'react';
import { AlertTriangle } from 'lucide-react';

type State = { hasError: boolean; error?: Error };

export class AdminErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log full details in development only — never expose to end users
    if (import.meta.env.DEV) {
      console.error("[AdminErrorBoundary]", error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[40vh] p-8 text-center">
          <AlertTriangle size={40} className="text-red-400 mb-4" />
          <h2 className="font-serif text-xl text-velum-900 mb-2">Algo salió mal</h2>
          <p className="text-sm text-velum-500 mb-6">
            Ocurrió un error inesperado en el panel. Si el problema persiste, contacta al equipo técnico.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-4 py-2 rounded-xl bg-velum-900 text-white text-sm font-medium hover:bg-velum-800 transition"
          >
            Intentar de nuevo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

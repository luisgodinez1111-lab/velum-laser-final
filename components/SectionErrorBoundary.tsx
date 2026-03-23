import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Friendly section name shown in the error message */
  section?: string;
}

interface State {
  error: Error | null;
}

/**
 * Lightweight error boundary for individual page sections.
 * Catches render-time errors so a broken widget doesn't crash the whole page.
 */
export class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-5 flex flex-col items-center gap-3 text-center">
        <AlertTriangle size={20} className="text-red-400" />
        <p className="text-sm text-red-700 font-medium">
          {this.props.section ? `Error al cargar "${this.props.section}"` : "Esta sección no pudo cargarse"}
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-800 transition"
        >
          <RefreshCw size={12} />
          Reintentar
        </button>
      </div>
    );
  }
}

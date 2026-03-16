import React from 'react';

interface PageSkeletonProps {
  /** Number of stat cards to show. Default: 3 */
  cards?: number;
  /** Number of list rows to show. Default: 4 */
  rows?: number;
}

export const PageSkeleton: React.FC<PageSkeletonProps> = ({ cards = 3, rows = 4 }) => (
  <div
    className="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-pulse"
    role="status"
    aria-label="Cargando contenido…"
    aria-busy="true"
  >
    {/* Page header */}
    <div className="space-y-2">
      <div className="h-7 bg-velum-100 rounded-lg w-40" />
      <div className="h-4 bg-velum-100 rounded-lg w-64" />
    </div>

    {/* Stat cards */}
    <div className={`grid grid-cols-1 sm:grid-cols-${Math.min(cards, 4)} gap-4`}>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="bg-velum-100 rounded-2xl h-28 flex flex-col justify-between p-4">
          <div className="h-3 bg-velum-200 rounded w-20" />
          <div className="h-8 bg-velum-200 rounded w-16" />
        </div>
      ))}
    </div>

    {/* Content section header */}
    <div className="h-5 bg-velum-100 rounded-lg w-32 mt-6" />

    {/* List rows */}
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-velum-100 rounded-2xl h-16 flex items-center px-4 gap-4">
          <div className="h-8 w-8 rounded-full bg-velum-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-velum-200 rounded w-3/4" />
            <div className="h-3 bg-velum-200 rounded w-1/2" />
          </div>
          <div className="h-6 w-16 bg-velum-200 rounded-full shrink-0" />
        </div>
      ))}
    </div>
    <span className="sr-only">Cargando…</span>
  </div>
);

import React from 'react';

export const PageSkeleton: React.FC = () => (
  <div className="max-w-5xl mx-auto px-4 py-16 space-y-6 animate-pulse">
    <div className="h-8 bg-velum-100 rounded-xl w-48" />
    <div className="h-4 bg-velum-100 rounded-xl w-72" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 bg-velum-100 rounded-2xl" />
      ))}
    </div>
    <div className="space-y-3 mt-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 bg-velum-100 rounded-2xl" />
      ))}
    </div>
  </div>
);

import React, { useMemo } from 'react';
import { Search, RefreshCw, ArrowRight, ChevronLeft, ChevronRight, Plus, Download } from 'lucide-react';
import { Member } from '../types';
import { Pill } from './adminSharedComponents';
import { statusLabel, statusPill, intakeStatusLabel, riskOfMember } from './adminUtils';
import { DataTable, type Column } from '../components/ui';

interface Props {
  members: Member[];
  displayedMembers: Member[];
  filteredMembers: Member[];
  membersTotal: number;
  tablePage: number;
  tablePageCount: number;
  tablePageSize: number;
  searchTerm: string;
  statusFilter: 'all' | 'active' | 'issue';
  isSearchingServer: boolean;
  onSearch: (term: string) => void;
  onFilter: (f: 'all' | 'active' | 'issue') => void;
  onPageChange: (p: number) => void;
  onOpenMember: (m: Member) => void;
  onNewPatient: () => void;
}

export const AdminSociasSection: React.FC<Props> = ({
  members, displayedMembers, filteredMembers, membersTotal,
  tablePage, tablePageCount, tablePageSize, searchTerm, statusFilter,
  isSearchingServer, onSearch, onFilter, onPageChange, onOpenMember, onNewPatient,
}) => {
  // La búsqueda y filtros son server-side controlados — DataTable recibe data
  // ya filtrada/paginada por el padre (displayedMembers). No usamos searchable
  // interno para no duplicar la UI.
  const columns = useMemo<Column<Member>[]>(
    () => [
      {
        id: 'nombre',
        header: 'Nombre',
        accessor: (m) => m.name ?? m.email ?? '',
        sortable: true,
        cell: (m) => (
          <div>
            <p className="font-medium text-velum-900">{m.name}</p>
            <p className="text-xs text-velum-400">{m.email}</p>
          </div>
        ),
      },
      {
        id: 'plan',
        header: 'Plan',
        accessor: (m) => m.plan ?? '',
        sortable: true,
        cell: (m) => <span className="text-velum-600">{m.plan ?? '—'}</span>,
      },
      {
        id: 'estado',
        header: 'Estado',
        accessor: (m) => m.subscriptionStatus ?? '',
        sortable: true,
        cell: (m) => (
          <Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} />
        ),
      },
      {
        id: 'expediente',
        header: 'Expediente',
        accessor: (m) => intakeStatusLabel(m.intakeStatus).label,
        sortable: true,
        cell: (m) => {
          const intake = intakeStatusLabel(m.intakeStatus);
          return <Pill label={intake.label} cls={intake.cls} />;
        },
      },
      {
        id: 'riesgo',
        header: 'Riesgo',
        accessor: (m) => {
          const r = riskOfMember(m);
          return r === 'critical' ? 0 : r === 'warning' ? 1 : 2;
        },
        sortable: true,
        cell: (m) => {
          const risk = riskOfMember(m);
          return (
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${risk === 'ok' ? 'text-emerald-600' : risk === 'warning' ? 'text-amber-600' : 'text-red-600'}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${risk === 'ok' ? 'bg-emerald-500' : risk === 'warning' ? 'bg-amber-400' : 'bg-red-500'}`}
              />
              {risk === 'ok' ? 'Normal' : risk === 'warning' ? 'Atención' : 'Crítico'}
            </span>
          );
        },
      },
      {
        id: 'arrow',
        header: '',
        accessor: () => null,
        width: '48px',
        align: 'right',
        cell: () => (
          <ArrowRight
            size={16}
            className="text-velum-400 group-hover:text-velum-900 transition"
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Socias</h1>
          <p className="text-sm text-velum-500 mt-1">{membersTotal || members.length} pacientes registradas</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/admin/users/export" download
            className="flex items-center gap-2 border border-velum-200 text-velum-700 rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-velum-50 transition">
            <Download size={15} />
            Exportar CSV
          </a>
          <button onClick={onNewPatient}
            className="flex items-center gap-2 bg-velum-900 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-velum-800 transition">
            <Plus size={15} />
            Nuevo expediente
          </button>
        </div>
      </div>

      {/* Search + filters (server-side, controlados externamente) */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-velum-400" />
          <input value={searchTerm} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar por nombre o correo..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-velum-200 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition bg-white" />
          {isSearchingServer && <RefreshCw size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-velum-400" />}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'issue'] as const).map((f) => (
            <button key={f} onClick={() => onFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition ${statusFilter === f ? 'bg-velum-900 text-white' : 'bg-white border border-velum-200 text-velum-600 hover:bg-velum-50'}`}>
              {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : 'Con incidencia'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        aria-label="Socias registradas"
        data={displayedMembers}
        columns={columns}
        rowKey={(m) => m.id}
        onRowClick={onOpenMember}
        empty={{
          title: 'Sin resultados',
          description: searchTerm
            ? 'No hay socios que coincidan con tu búsqueda.'
            : 'Aún no hay socias registradas.',
        }}
      />

      {/* Paginación (server-side) */}
      {tablePageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-velum-400">
            {(tablePage - 1) * tablePageSize + 1}–{Math.min(tablePage * tablePageSize, filteredMembers.length)} de {filteredMembers.length}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => onPageChange(Math.max(1, tablePage - 1))} disabled={tablePage === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-velum-200 text-sm text-velum-700 hover:bg-velum-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
              <ChevronLeft size={14} /> Anterior
            </button>
            <span className="text-xs text-velum-500 px-1">{tablePage} / {tablePageCount}</span>
            <button onClick={() => onPageChange(Math.min(tablePageCount, tablePage + 1))} disabled={tablePage === tablePageCount}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-velum-200 text-sm text-velum-700 hover:bg-velum-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

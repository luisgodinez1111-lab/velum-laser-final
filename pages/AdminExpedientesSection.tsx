import React, { useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Member } from '../types';
import { Pill } from './adminSharedComponents';
import { intakeStatusLabel } from './adminUtils';
import { DataTable, type Column, PageHeader, SectionHeading } from '../components/ui';

interface Props {
  members: Member[];
  intakeToReject: string | null;
  intakeRejectReason: string;
  isApprovingIntake: string | null;
  onOpenIntake: (m: Member) => void;
  onApprove: (id: string, approve: boolean) => void;
  onOpenMember: (m: Member) => void;
  onSetReject: (id: string | null) => void;
  onSetRejectReason: (r: string) => void;
}

export const AdminExpedientesSection: React.FC<Props> = ({
  members, intakeToReject, intakeRejectReason, isApprovingIntake,
  onOpenIntake, onApprove, onOpenMember, onSetReject, onSetRejectReason,
}) => {
  const pendingApproval = members.filter((m) => m.intakeStatus === 'submitted');
  const expStats = [
    { label: 'Aprobados',          value: members.filter((m) => m.intakeStatus === 'approved').length,                                  cls: 'text-success-700' },
    { label: 'Pendientes revisión', value: pendingApproval.length,                                                                       cls: 'text-warning-700' },
    { label: 'Rechazados',          value: members.filter((m) => m.intakeStatus === 'rejected').length,                                  cls: 'text-danger-700' },
    { label: 'Sin expediente',      value: members.filter((m) => !m.intakeStatus || m.intakeStatus === 'draft').length,                  cls: 'text-velum-600' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expedientes clínicos"
        description="Gestión de fichas médicas y consentimientos"
        bordered={false}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {expStats.map(({ label, value, cls }) => (
          <div key={label} className="bg-white rounded-2xl border border-velum-100 p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">{label}</p>
            <p className={`font-sans font-bold tabular-nums text-4xl leading-none tracking-[-0.025em] ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {pendingApproval.length > 0 && (
        <div>
          <SectionHeading>Cola de aprobación</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingApproval.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl border border-warning-100 bg-warning-50/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-velum-900 text-sm">{m.name}</p>
                    <p className="text-xs text-velum-500">{m.email}</p>
                  </div>
                  <button onClick={() => onOpenIntake(m)}
                    className="text-[10px] font-bold uppercase tracking-widest text-velum-600 hover:text-velum-900 transition border border-velum-200 rounded-lg px-2 py-1 bg-white shrink-0">
                    Ver expediente
                  </button>
                </div>
                {intakeToReject === m.id ? (
                  <div className="space-y-2">
                    <textarea value={intakeRejectReason} onChange={(e) => onSetRejectReason(e.target.value)}
                      placeholder="Motivo del rechazo (requerido)" rows={2}
                      className="w-full rounded-xl border border-danger-100 bg-danger-50/30 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-300 transition" />
                    <div className="flex gap-2">
                      <button onClick={() => onApprove(m.id, false)} disabled={!intakeRejectReason.trim() || isApprovingIntake === m.id}
                        className="flex-1 bg-danger-500 text-white rounded-xl py-1.5 text-xs font-medium hover:bg-danger-700 transition disabled:opacity-50">Confirmar</button>
                      <button onClick={() => { onSetReject(null); onSetRejectReason(''); }}
                        className="px-3 py-1.5 rounded-xl border border-velum-200 text-xs text-velum-600 hover:bg-velum-50 transition">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => onApprove(m.id, true)} disabled={isApprovingIntake === m.id}
                      className="flex-1 bg-success-500 text-white rounded-xl py-2 text-xs font-medium hover:bg-success-700 transition disabled:opacity-50">
                      {isApprovingIntake === m.id ? '...' : 'Aprobar'}
                    </button>
                    <button onClick={() => onSetReject(m.id)}
                      className="flex-1 border border-danger-100 text-danger-700 bg-danger-50 rounded-xl py-2 text-xs font-medium hover:bg-danger-100 transition">Rechazar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full table */}
      <ExpedientesTable
        members={members}
        onOpenIntake={onOpenIntake}
        onOpenMember={onOpenMember}
      />
    </div>
  );
};

// ── Tabla de expedientes con DataTable ─────────────────────────────────────
interface ExpedientesTableProps {
  members: Member[];
  onOpenIntake: (m: Member) => void;
  onOpenMember: (m: Member) => void;
}

const ExpedientesTable: React.FC<ExpedientesTableProps> = ({
  members,
  onOpenIntake,
  onOpenMember,
}) => {
  const columns = useMemo<Column<Member>[]>(
    () => [
      {
        id: 'socio',
        header: 'Socio',
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
        id: 'consentimiento',
        header: 'Consentimiento',
        accessor: (m) => (m.clinical?.consentFormSigned ? 1 : 0),
        sortable: true,
        cell: (m) => (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${m.clinical?.consentFormSigned ? 'text-success-700' : 'text-velum-400'}`}
          >
            {m.clinical?.consentFormSigned ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {m.clinical?.consentFormSigned ? 'Firmado' : 'Pendiente'}
          </span>
        ),
      },
      {
        id: 'expediente',
        header: 'Estado expediente',
        accessor: (m) => intakeStatusLabel(m.intakeStatus).label,
        sortable: true,
        cell: (m) => {
          const intake = intakeStatusLabel(m.intakeStatus);
          return <Pill label={intake.label} cls={intake.cls} />;
        },
      },
      {
        id: 'docs',
        header: 'Docs',
        accessor: (m) => m.clinical?.documents?.length ?? 0,
        sortable: true,
        align: 'right',
        cell: (m) => <span className="text-velum-500">{m.clinical?.documents?.length ?? 0}</span>,
      },
      {
        id: 'acciones',
        header: 'Acciones',
        accessor: () => null,
        cell: (m) => (
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenIntake(m);
              }}
              className="text-xs text-velum-900 font-semibold hover:underline transition"
            >
              Ver expediente
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenMember(m);
              }}
              className="text-xs text-velum-400 hover:text-velum-700 transition"
            >
              Perfil
            </button>
          </div>
        ),
      },
    ],
    [onOpenIntake, onOpenMember],
  );

  return (
    <div>
      <SectionHeading>Todos los expedientes</SectionHeading>
      <DataTable
        aria-label="Todos los expedientes"
        data={members}
        columns={columns}
        rowKey={(m) => m.id}
        searchable
        searchPlaceholder="Buscar por nombre o correo..."
        empty={{ title: 'Sin expedientes', description: 'No hay socios registrados todavía.' }}
      />
    </div>
  );
};

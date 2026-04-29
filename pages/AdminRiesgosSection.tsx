import React, { useMemo } from 'react';
import { AlertTriangle, CircleAlert, ShieldCheck, Activity } from 'lucide-react';
import { Member } from '../types';
import { KpiCard, Pill } from './adminSharedComponents';
import { riskOfMember, statusLabel, statusPill, intakeStatusLabel } from './adminUtils';
import { DataTable, type Column, PageHeader } from '../components/ui';

interface Props {
  members: Member[];
  failedAudits: number;
  onOpenMember: (m: Member) => void;
}

// Orden numérico para sort por nivel de riesgo: critical > warning > ok.
const riskRank: Record<'ok' | 'warning' | 'critical', number> = {
  critical: 0,
  warning: 1,
  ok: 2,
};

export const AdminRiesgosSection: React.FC<Props> = ({ members, failedAudits, onOpenMember }) => {
  const critical = useMemo(() => members.filter((m) => riskOfMember(m) === 'critical'), [members]);
  const warning = useMemo(() => members.filter((m) => riskOfMember(m) === 'warning'), [members]);

  const atRisk = useMemo(() => [...critical, ...warning], [critical, warning]);

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
        id: 'estado',
        header: 'Estado',
        accessor: (m) => m.subscriptionStatus ?? '',
        sortable: true,
        cell: (m) => (
          <Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} />
        ),
      },
      {
        id: 'consentimiento',
        header: 'Consentimiento',
        accessor: (m) => (m.clinical?.consentFormSigned ? 1 : 0),
        sortable: true,
        cell: (m) => (
          <span
            className={`text-xs font-medium ${m.clinical?.consentFormSigned ? 'text-success-700' : 'text-danger-500'}`}
          >
            {m.clinical?.consentFormSigned ? 'Firmado' : 'Sin firma'}
          </span>
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
        id: 'nivel',
        header: 'Nivel',
        accessor: (m) => riskRank[riskOfMember(m)],
        sortable: true,
        cell: (m) => {
          const risk = riskOfMember(m);
          return (
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                risk === 'critical' ? 'text-danger-700' : 'text-warning-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${risk === 'critical' ? 'bg-danger-500' : 'bg-warning-500'}`}
              />
              {risk === 'critical' ? 'Crítico' : 'Atención'}
            </span>
          );
        },
      },
      {
        id: 'acciones',
        header: 'Acciones',
        accessor: () => null,
        cell: (m) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenMember(m);
            }}
            className="text-xs text-velum-600 hover:text-velum-900 transition font-medium"
          >
            Ver perfil
          </button>
        ),
      },
    ],
    [onOpenMember],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Riesgos"
        description="Monitoreo de exposición operativa y clínica"
        bordered={false}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<AlertTriangle size={18} />} label="Críticos" value={critical.length} accent={critical.length > 0 ? 'text-danger-700' : 'text-velum-900'} />
        <KpiCard icon={<CircleAlert size={18} />} label="En atención" value={warning.length} accent={warning.length > 0 ? 'text-warning-700' : 'text-velum-900'} />
        <KpiCard icon={<ShieldCheck size={18} />} label="Sin consentimiento" value={members.filter((m) => !m.clinical?.consentFormSigned).length} />
        <KpiCard icon={<Activity size={18} />} label="Eventos fallidos" value={failedAudits} accent={failedAudits > 0 ? 'text-danger-700' : 'text-velum-900'} />
      </div>
      <DataTable
        aria-label="Socios en situación de riesgo"
        data={atRisk}
        columns={columns}
        rowKey={(m) => m.id}
        rowClassName={(m) => (riskOfMember(m) === 'critical' ? 'bg-danger-50/30' : '')}
        defaultSort={{ id: 'nivel', dir: 'asc' }}
        empty={{
          title: 'Sin socios en riesgo',
          description: 'Todos los socios están al corriente con consentimiento y suscripción.',
        }}
      />
    </div>
  );
};

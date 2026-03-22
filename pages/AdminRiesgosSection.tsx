import React from 'react';
import { AlertTriangle, CircleAlert, ShieldCheck, Activity } from 'lucide-react';
import { Member, AuditLogEntry } from '../types';
import { KpiCard, Pill } from './adminSharedComponents';
import { riskOfMember, statusLabel, statusPill, intakeStatusLabel } from './adminUtils';

interface Props {
  members: Member[];
  failedAudits: number;
  onOpenMember: (m: Member) => void;
}

export const AdminRiesgosSection: React.FC<Props> = ({ members, failedAudits, onOpenMember }) => {
  const critical = members.filter((m) => riskOfMember(m) === 'critical');
  const warning = members.filter((m) => riskOfMember(m) === 'warning');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-velum-900">Riesgos</h1>
        <p className="text-sm text-velum-500 mt-1">Monitoreo de exposición operativa y clínica</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<AlertTriangle size={18} />} label="Críticos" value={critical.length} accent={critical.length > 0 ? 'text-red-600' : 'text-velum-900'} />
        <KpiCard icon={<CircleAlert size={18} />} label="En atención" value={warning.length} accent={warning.length > 0 ? 'text-amber-600' : 'text-velum-900'} />
        <KpiCard icon={<ShieldCheck size={18} />} label="Sin consentimiento" value={members.filter((m) => !m.clinical?.consentFormSigned).length} />
        <KpiCard icon={<Activity size={18} />} label="Eventos fallidos" value={failedAudits} accent={failedAudits > 0 ? 'text-red-600' : 'text-velum-900'} />
      </div>
      <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
        {critical.length === 0 && warning.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck size={32} className="mx-auto text-emerald-300 mb-3" />
            <p className="text-sm text-velum-400">No hay socios en situación de riesgo</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-velum-100 bg-velum-50/50">
                  {['Socio', 'Estado', 'Consentimiento', 'Expediente', 'Nivel', 'Acciones'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...critical, ...warning].map((m, i) => {
                  const risk = riskOfMember(m);
                  const intake = intakeStatusLabel(m.intakeStatus);
                  return (
                    <tr key={m.id} className={`hover:bg-velum-50 transition ${i < critical.length + warning.length - 1 ? 'border-b border-velum-50' : ''} ${risk === 'critical' ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-velum-900">{m.name}</p>
                        <p className="text-xs text-velum-400">{m.email}</p>
                      </td>
                      <td className="px-4 py-3"><Pill label={statusLabel(m.subscriptionStatus)} cls={statusPill(m.subscriptionStatus)} /></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${m.clinical?.consentFormSigned ? 'text-emerald-600' : 'text-red-500'}`}>
                          {m.clinical?.consentFormSigned ? 'Firmado' : 'Sin firma'}
                        </span>
                      </td>
                      <td className="px-4 py-3"><Pill label={intake.label} cls={intake.cls} /></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${risk === 'critical' ? 'text-red-600' : 'text-amber-600'}`}>
                          <span className={`w-2 h-2 rounded-full ${risk === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
                          {risk === 'critical' ? 'Crítico' : 'Atención'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => onOpenMember(m)} className="text-xs text-velum-600 hover:text-velum-900 transition font-medium">Ver perfil</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

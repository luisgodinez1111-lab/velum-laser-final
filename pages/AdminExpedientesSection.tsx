import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Member } from '../types';
import { Pill } from './adminSharedComponents';
import { intakeStatusLabel } from './adminUtils';

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
    { label: 'Aprobados',          value: members.filter((m) => m.intakeStatus === 'approved').length,                                  cls: 'text-emerald-700' },
    { label: 'Pendientes revisión', value: pendingApproval.length,                                                                       cls: 'text-amber-600' },
    { label: 'Rechazados',          value: members.filter((m) => m.intakeStatus === 'rejected').length,                                  cls: 'text-red-600' },
    { label: 'Sin expediente',      value: members.filter((m) => !m.intakeStatus || m.intakeStatus === 'draft').length,                  cls: 'text-velum-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif text-velum-900">Expedientes clínicos</h1>
        <p className="text-sm text-velum-500 mt-1">Gestión de fichas médicas y consentimientos</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {expStats.map(({ label, value, cls }) => (
          <div key={label} className="bg-white rounded-2xl border border-velum-100 p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">{label}</p>
            <p className={`text-3xl font-serif font-bold ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {pendingApproval.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Cola de aprobación</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingApproval.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
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
                      className="w-full rounded-xl border border-red-200 bg-red-50/30 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-red-300 transition" />
                    <div className="flex gap-2">
                      <button onClick={() => onApprove(m.id, false)} disabled={!intakeRejectReason.trim() || isApprovingIntake === m.id}
                        className="flex-1 bg-red-600 text-white rounded-xl py-1.5 text-xs font-medium hover:bg-red-700 transition disabled:opacity-50">Confirmar</button>
                      <button onClick={() => { onSetReject(null); onSetRejectReason(''); }}
                        className="px-3 py-1.5 rounded-xl border border-velum-200 text-xs text-velum-600 hover:bg-velum-50 transition">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => onApprove(m.id, true)} disabled={isApprovingIntake === m.id}
                      className="flex-1 bg-emerald-600 text-white rounded-xl py-2 text-xs font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                      {isApprovingIntake === m.id ? '...' : 'Aprobar'}
                    </button>
                    <button onClick={() => onSetReject(m.id)}
                      className="flex-1 border border-red-200 text-red-600 bg-red-50 rounded-xl py-2 text-xs font-medium hover:bg-red-100 transition">Rechazar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full table */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Todos los expedientes</h2>
        <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-velum-100 bg-velum-50/50">
                  {['Socio', 'Consentimiento', 'Estado expediente', 'Docs', 'Acciones'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-velum-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => {
                  const intake = intakeStatusLabel(m.intakeStatus);
                  return (
                    <tr key={m.id} className={`hover:bg-velum-50 transition ${i < members.length - 1 ? 'border-b border-velum-50' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-velum-900">{m.name}</p>
                        <p className="text-xs text-velum-400">{m.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.clinical?.consentFormSigned ? 'text-emerald-600' : 'text-velum-400'}`}>
                          {m.clinical?.consentFormSigned ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          {m.clinical?.consentFormSigned ? 'Firmado' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-4 py-3"><Pill label={intake.label} cls={intake.cls} /></td>
                      <td className="px-4 py-3 text-velum-500">{m.clinical?.documents?.length ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => onOpenIntake(m)} className="text-xs text-velum-900 font-semibold hover:underline transition">Ver expediente</button>
                          <button onClick={() => onOpenMember(m)} className="text-xs text-velum-400 hover:text-velum-700 transition">Perfil</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

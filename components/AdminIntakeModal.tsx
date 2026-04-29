import React from 'react';
import {
  FolderOpen, AlertTriangle, FileText, Activity,
  CheckCircle2, XCircle, CheckCheck
} from 'lucide-react';
import { Member } from '../types';
import { MedicalIntake } from '../services/clinicalService';
import { intakeStatusLabel, Pill } from '../pages/adminShared';
import { Modal, EmptyState, Skeleton } from './ui';

const FITZPATRICK = [
  { type: 1, label: 'Tipo I',   desc: 'Muy clara. Siempre se quema, nunca broncea.',         color: '#FDEBD0', textCls: 'text-amber-900' },
  { type: 2, label: 'Tipo II',  desc: 'Clara. Siempre se quema, a veces broncea.',            color: '#F5CBA7', textCls: 'text-amber-900' },
  { type: 3, label: 'Tipo III', desc: 'Media. A veces se quema, siempre broncea.',            color: '#E59866', textCls: 'text-amber-900' },
  { type: 4, label: 'Tipo IV',  desc: 'Oliva. Raramente se quema, siempre broncea.',          color: '#CA6F1E', textCls: 'text-white'     },
  { type: 5, label: 'Tipo V',   desc: 'Morena oscura. Muy raramente se quema.',               color: '#784212', textCls: 'text-white'     },
  { type: 6, label: 'Tipo VI',  desc: 'Negra. No se quema, broncea profundamente.',           color: '#2C1503', textCls: 'text-white'     },
];

export interface AdminIntakeModalProps {
  intakeModal: { member: Member; intake: MedicalIntake | null } | null;
  intakeModalLoading: boolean;
  intakeToReject: string | null;
  intakeRejectReason: string;
  isApprovingIntake: string | null;
  onClose: () => void;
  onSetReject: (id: string | null) => void;
  onSetRejectReason: (reason: string) => void;
  onApprove: (memberId: string, approved: boolean) => void;
}

export const AdminIntakeModal: React.FC<AdminIntakeModalProps> = ({
  intakeModal,
  intakeModalLoading,
  intakeToReject,
  intakeRejectReason,
  isApprovingIntake,
  onClose,
  onSetReject,
  onSetRejectReason,
  onApprove,
}) => {
  if (!intakeModal) return null;
  const { member: m, intake } = intakeModal;
  const pj = (intake?.personalJson as Record<string, unknown>) ?? {};
  const hj = (intake?.historyJson as Record<string, unknown>) ?? {};
  const fitz = FITZPATRICK.find((f) => f.type === intake?.phototype);
  const intakeStatus = intakeStatusLabel(m.intakeStatus);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={m.name || m.email || 'Paciente'}
      description={`Expediente clínico · ${m.email}`}
      size="xl"
    >
      {/* Status pill anclado en el body */}
      <div className="-mt-1 mb-4 flex justify-end">
        <Pill label={intakeStatus.label} cls={intakeStatus.cls} />
      </div>

      <div>
            {intakeModalLoading ? (
              <div className="space-y-3 p-2">
                <Skeleton height={20} width="40%" />
                <Skeleton height={60} />
                <Skeleton height={120} />
                <Skeleton height={120} />
              </div>
            ) : !intake ? (
              <EmptyState
                icon={<FolderOpen />}
                title="Sin expediente"
                description="Este paciente aún no tiene expediente clínico registrado."
                size="comfortable"
              />
            ) : (
              <div className="divide-y divide-velum-50">
                {/* Fototipo Fitzpatrick */}
                <div className="p-5 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Fototipo de Fitzpatrick</p>
                  <div className="flex gap-1.5">
                    {FITZPATRICK.map((f) => (
                      <div key={f.type}
                        className={`flex-1 rounded-xl py-2 text-center transition ${intake.phototype === f.type ? 'ring-2 ring-offset-1 ring-velum-900 scale-105' : 'opacity-50'}`}
                        style={{ backgroundColor: f.color }}>
                        <p className={`text-[10px] font-bold ${f.textCls}`}>{f.label}</p>
                      </div>
                    ))}
                  </div>
                  {fitz ? (
                    <div className="flex items-start gap-3 bg-velum-50 rounded-xl p-3">
                      <div className="w-8 h-8 rounded-full shrink-0 ring-2 ring-velum-200" style={{ backgroundColor: fitz.color }} />
                      <div>
                        <p className="text-sm font-semibold text-velum-900">{fitz.label}</p>
                        <p className="text-xs text-velum-500 mt-0.5">{fitz.desc}</p>
                        {intake.phototype && intake.phototype >= 4 && (
                          <p className="text-xs text-amber-700 font-medium mt-1.5 flex items-center gap-1">
                            <AlertTriangle size={11} /> Precaución: fototipos altos requieren parámetros láser ajustados.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-velum-400 italic">No registrado</p>
                  )}
                </div>

                {/* Datos personales */}
                <div className="p-5 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Datos personales</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Nombre completo', value: pj.fullName as string | undefined },
                      { label: 'Teléfono', value: pj.phone as string | undefined },
                      { label: 'Fecha de nacimiento', value: pj.birthDate ? new Date(pj.birthDate as string).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : null },
                      { label: 'Correo electrónico', value: m.email },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-velum-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">{label}</p>
                        <p className="text-sm text-velum-900">{value || <span className="text-velum-300 italic">No registrado</span>}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Historia clínica */}
                <div className="p-5 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Historia clínica</p>
                  <div className="space-y-3">
                    {[
                      { label: 'Alergias', value: hj.allergies as string | undefined, icon: <AlertTriangle size={12} /> },
                      { label: 'Medicamentos actuales', value: hj.medications as string | undefined, icon: <FileText size={12} /> },
                      { label: 'Condiciones de piel', value: hj.skinConditions as string | undefined, icon: <Activity size={12} /> },
                    ].map(({ label, value, icon }) => (
                      <div key={label} className="bg-velum-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1 flex items-center gap-1">{icon}{label}</p>
                        <p className="text-sm text-velum-900 whitespace-pre-wrap">{value || <span className="text-velum-300 italic">Ninguna / No especificado</span>}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Consentimiento */}
                <div className="p-5 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Consentimiento informado</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`rounded-xl p-3 flex items-center gap-2 ${intake.consentAccepted ? 'bg-emerald-50' : 'bg-velum-50'}`}>
                      {intake.consentAccepted ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> : <XCircle size={16} className="text-velum-300 shrink-0" />}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Consentimiento</p>
                        <p className={`text-sm font-medium ${intake.consentAccepted ? 'text-emerald-700' : 'text-velum-500'}`}>
                          {intake.consentAccepted ? 'Aceptado' : 'Pendiente'}
                        </p>
                      </div>
                    </div>
                    <div className={`rounded-xl p-3 flex items-center gap-2 ${intake.signatureKey ? 'bg-emerald-50' : 'bg-velum-50'}`}>
                      {intake.signatureKey ? <CheckCheck size={16} className="text-emerald-600 shrink-0" /> : <XCircle size={16} className="text-velum-300 shrink-0" />}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Firma digital</p>
                        <p className={`text-sm font-medium ${intake.signatureKey ? 'text-emerald-700' : 'text-velum-500'}`}>
                          {intake.signatureKey ? 'Firmado' : 'Sin firma'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Candidacy note */}
                {intake.phototype && (
                  <div className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Determinación de candidatura</p>
                    <div className={`rounded-xl p-4 text-sm ${intake.phototype <= 3 ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : intake.phototype === 4 ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                      {intake.phototype <= 3 && <><strong>Candidata favorable.</strong> Fototipo I–III: responde óptimamente al láser de depilación con mínimo riesgo de pigmentación.</>}
                      {intake.phototype === 4 && <><strong>Candidata con precaución.</strong> Fototipo IV: requiere parámetros ajustados (fluencia reducida, pulso largo). Riesgo moderado de hiperpigmentación post-tratamiento.</>}
                      {intake.phototype >= 5 && <><strong>Candidata de alto riesgo.</strong> Fototipo V–VI: alto riesgo de hiperpigmentación. Evaluar con especialista antes de iniciar tratamiento. Considerar láser Nd:YAG 1064 nm.</>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer — approve/reject */}
          {!intakeModalLoading && intake && (m.intakeStatus === 'submitted' || intakeToReject === m.id) && (
            <div className="px-6 py-4 border-t border-velum-100 bg-velum-50/50 shrink-0 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Resolución del expediente</p>
              {intakeToReject === m.id ? (
                <div className="space-y-2">
                  <textarea value={intakeRejectReason} onChange={(e) => onSetRejectReason(e.target.value)}
                    placeholder="Motivo del rechazo (requerido)" rows={2}
                    className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 transition" />
                  <div className="flex gap-2">
                    <button onClick={() => onApprove(m.id, false)} disabled={!intakeRejectReason.trim() || isApprovingIntake === m.id}
                      className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                      {isApprovingIntake === m.id ? 'Procesando...' : 'Confirmar rechazo'}
                    </button>
                    <button onClick={() => { onSetReject(null); onSetRejectReason(''); }}
                      className="px-4 py-2.5 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-white transition">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => onApprove(m.id, true)} disabled={isApprovingIntake === m.id}
                    className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                    {isApprovingIntake === m.id ? 'Procesando...' : 'Aprobar candidatura'}
                  </button>
                  <button onClick={() => onSetReject(m.id)}
                    className="flex-1 border border-red-200 text-red-600 bg-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-50 transition">Rechazar</button>
                </div>
              )}
            </div>
          )}
          {!intakeModalLoading && intake && m.intakeStatus === 'approved' && (
            <div className="-mx-6 -mb-5 mt-6 px-6 py-4 border-t border-velum-100 bg-success-50/50">
              <div className="flex items-center gap-2 text-success-700">
                <CheckCircle2 size={16} />
                <p className="text-sm font-medium">Expediente aprobado. Paciente candidata confirmada.</p>
              </div>
            </div>
          )}
          {!intakeModalLoading && intake && m.intakeStatus === 'rejected' && (
            <div className="-mx-6 -mb-5 mt-6 px-6 py-4 border-t border-velum-100 bg-danger-50/50">
              <div className="flex items-center gap-2 text-danger-700">
                <XCircle size={16} />
                <p className="text-sm font-medium">Expediente rechazado. Revisar con la paciente.</p>
              </div>
            </div>
          )}
    </Modal>
  );
};

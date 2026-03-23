import React from 'react';
import {
  X, Zap, CheckCircle2, CircleAlert, XCircle, FolderOpen, Trash2
} from 'lucide-react';
import { Member } from '../types';
import { Appointment, SessionTreatment } from '../services/clinicalService';
import {
  Pill, formatMoney, statusLabel, statusPill, intakeStatusLabel, apptStatusLabel
} from '../pages/adminShared';

type DrawerDeleteStep = 'idle' | 'otp-send' | 'otp-confirm';

export type AdminMemberDrawerProps = {
  member: Member;
  onClose: () => void;
  // Intake approval
  intakeToApprove: string | null;
  intakeToReject: string | null;
  intakeRejectReason: string;
  isApprovingIntake: string | null;
  onSetIntakeToApprove: (id: string | null) => void;
  onSetIntakeToReject: (id: string | null) => void;
  onSetIntakeRejectReason: (reason: string) => void;
  onApproveIntake: (userId: string, approved: boolean) => void;
  // Critical actions
  criticalActionsOpen: boolean;
  onSetCriticalActionsOpen: (open: boolean) => void;
  onCloseCriticalActions: () => void;
  drawerDeactivating: boolean;
  drawerDeleteStep: DrawerDeleteStep;
  drawerDeleteOtp: string;
  drawerDeleteMsg: string;
  drawerDeleteSending: boolean;
  drawerDeleting: boolean;
  drawerOtpRef: React.RefObject<HTMLInputElement>;
  onSetDrawerDeleteStep: (step: DrawerDeleteStep) => void;
  onSetDrawerDeleteOtp: (otp: string) => void;
  onSetDrawerDeleteMsg: (msg: string) => void;
  onDrawerDeactivate: (id: string) => void;
  onRequestOtp: (id: string) => void;
  onConfirmDelete: (id: string, email: string) => void;
  // Actions
  onOpenSessionModal: (member: Member) => void;
  onOpenIntakeModal: (member: Member) => void;
  onUpdateMember: (id: string, status: string) => void;
  // History
  isLoadingMemberHistory: boolean;
  memberAppointments: Appointment[];
  memberPayments: unknown[];
  memberSessions: SessionTreatment[];
};

export const AdminMemberDrawer: React.FC<AdminMemberDrawerProps> = ({
  member,
  onClose,
  intakeToApprove,
  intakeToReject,
  intakeRejectReason,
  isApprovingIntake,
  onSetIntakeToApprove,
  onSetIntakeToReject,
  onSetIntakeRejectReason,
  onApproveIntake,
  criticalActionsOpen,
  onSetCriticalActionsOpen,
  onCloseCriticalActions,
  drawerDeactivating,
  drawerDeleteStep,
  drawerDeleteOtp,
  drawerDeleteMsg,
  drawerDeleteSending,
  drawerDeleting,
  drawerOtpRef,
  onSetDrawerDeleteStep,
  onSetDrawerDeleteOtp,
  onSetDrawerDeleteMsg,
  onDrawerDeactivate,
  onRequestOtp,
  onConfirmDelete,
  onOpenSessionModal,
  onOpenIntakeModal,
  onUpdateMember,
  isLoadingMemberHistory,
  memberAppointments,
  memberPayments,
  memberSessions,
}) => {
  const intake = intakeStatusLabel(member.intakeStatus);
  const mem = member;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-velum-100 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Perfil del socio</p>
            <h2 className="font-serif text-xl text-velum-900 mt-1">{mem.name}</h2>
            <p className="text-xs text-velum-500 mt-0.5">{mem.email}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar perfil de paciente" className="p-2 rounded-xl hover:bg-velum-50 text-velum-400 hover:text-velum-700 transition"><X size={18} /></button>
        </div>
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 p-4 border-b border-velum-100">
          {[
            { label: 'Plan', value: mem.plan ?? '—' },
            { label: 'Estado', value: <Pill label={statusLabel(mem.subscriptionStatus)} cls={statusPill(mem.subscriptionStatus)} /> },
            { label: 'Cobro', value: mem.amount ? `${formatMoney(mem.amount)}${mem.interval === 'year' ? '/año' : mem.interval === 'week' ? '/sem' : '/mes'}` : '—' },
            { label: 'Expediente', value: <Pill label={intake.label} cls={intake.cls} /> }
          ].map(({ label, value }) => (
            <div key={label} className="bg-velum-50 rounded-xl p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">{label}</p>
              <div className="text-sm font-medium text-velum-900">{value}</div>
            </div>
          ))}
        </div>
        {/* Payment status banner */}
        <div className={`mx-4 mt-3 mb-0 px-4 py-2.5 rounded-xl flex items-center gap-2 border ${mem.subscriptionStatus === 'active' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${mem.subscriptionStatus === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className={`text-sm font-semibold ${mem.subscriptionStatus === 'active' ? 'text-emerald-800' : 'text-red-800'}`}>
            {mem.subscriptionStatus === 'active' ? 'Al corriente' : 'Pago vencido / no regularizada'}
          </span>
          {mem.nextBillingDate && (
            <span className="text-xs text-velum-400 ml-auto shrink-0">
              {mem.subscriptionStatus === 'active' ? 'Renueva:' : 'Desde:'} {mem.nextBillingDate}
            </span>
          )}
        </div>
        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Acciones */}
          <div className="p-4 border-b border-velum-100 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Acciones</p>
            <button onClick={() => { onOpenSessionModal(mem); onClose(); }}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-velum-900 text-white rounded-xl text-sm font-medium hover:bg-velum-800 transition">
              <Zap size={14} />Registrar sesión
            </button>
            {mem.subscriptionStatus !== 'active' && (
              <button onClick={() => onUpdateMember(mem.id, 'active')}
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
                <CheckCircle2 size={14} />Activar cuenta
              </button>
            )}
            {mem.subscriptionStatus === 'active' && (
              <button onClick={() => onUpdateMember(mem.id, 'past_due')}
                className="w-full flex items-center gap-2 px-4 py-2.5 border border-amber-300 text-amber-700 bg-amber-50 rounded-xl text-sm font-medium hover:bg-amber-100 transition">
                <CircleAlert size={14} />Marcar pago vencido
              </button>
            )}
            {mem.subscriptionStatus !== 'canceled' && (
              <button onClick={() => onUpdateMember(mem.id, 'canceled')}
                className="w-full flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 bg-red-50 rounded-xl text-sm font-medium hover:bg-red-100 transition">
                <XCircle size={14} />Cancelar membresía
              </button>
            )}

            {/* Acciones Críticas */}
            <div className="pt-2 border-t border-red-100">
              <button
                onClick={() => onSetCriticalActionsOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-red-300 text-red-600 bg-red-50 rounded-xl text-sm font-semibold hover:bg-red-100 transition"
              >
                <CircleAlert size={14} />
                Acciones Críticas
              </button>
            </div>

            {/* Modal de Acciones Críticas */}
            {criticalActionsOpen && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onCloseCriticalActions}>
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                <div
                  className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-red-500">Zona de peligro</p>
                      <p className="font-semibold text-velum-900 text-sm mt-0.5 truncate max-w-[220px]">{mem.email}</p>
                    </div>
                    <button onClick={onCloseCriticalActions} className="p-1.5 rounded-lg hover:bg-velum-100 text-velum-400 hover:text-velum-700 transition">
                      <XCircle size={18} />
                    </button>
                  </div>

                  {/* Desactivar */}
                  <button
                    onClick={async () => { await onDrawerDeactivate(mem.id); onCloseCriticalActions(); }}
                    disabled={drawerDeactivating}
                    className="w-full flex items-center gap-3 px-4 py-3 border border-amber-300 text-amber-700 bg-amber-50 rounded-xl text-sm font-medium hover:bg-amber-100 transition disabled:opacity-50"
                  >
                    <CircleAlert size={15} className="shrink-0" />
                    <span className="text-left">
                      <span className="block font-semibold">{drawerDeactivating ? 'Desactivando...' : 'Desactivar y cancelar suscripción'}</span>
                      <span className="block text-xs opacity-70 mt-0.5">Bloquea acceso y cancela cobro en Stripe</span>
                    </span>
                  </button>

                  {/* Eliminar — paso 1: botón inicial */}
                  {drawerDeleteStep === 'idle' && (
                    <button
                      onClick={() => onSetDrawerDeleteStep('otp-send')}
                      className="w-full flex items-center gap-3 px-4 py-3 border border-red-300 text-red-600 bg-red-50 rounded-xl text-sm font-medium hover:bg-red-100 transition"
                    >
                      <Trash2 size={15} className="shrink-0" />
                      <span className="text-left">
                        <span className="block font-semibold">Eliminar paciente permanentemente</span>
                        <span className="block text-xs opacity-70 mt-0.5">Borra perfil, expediente, citas y pagos. Irreversible.</span>
                      </span>
                    </button>
                  )}

                  {/* Paso 2: confirmación antes de enviar OTP */}
                  {drawerDeleteStep === 'otp-send' && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                      <p className="text-xs text-red-700 font-medium leading-relaxed">
                        Se enviará un código OTP a tu correo electrónico para confirmar la eliminación de <strong>{mem.email}</strong>.
                      </p>
                      {drawerDeleteMsg && <p className="text-xs text-red-600">{drawerDeleteMsg}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => void onRequestOtp(mem.id)} disabled={drawerDeleteSending}
                          className="flex-1 bg-red-600 text-white rounded-xl py-2 text-xs font-bold hover:bg-red-700 transition disabled:opacity-50">
                          {drawerDeleteSending ? 'Enviando...' : 'Enviar OTP por correo'}
                        </button>
                        <button onClick={() => { onSetDrawerDeleteStep('idle'); onSetDrawerDeleteMsg(''); }}
                          className="px-3 rounded-xl border border-velum-200 text-xs text-velum-500 hover:bg-velum-50 transition">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Paso 3: ingresar código OTP */}
                  {drawerDeleteStep === 'otp-confirm' && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                      {drawerDeleteMsg && (
                        <p className={`text-xs rounded-lg px-2 py-1 ${drawerDeleteMsg.toLowerCase().includes('enviado') || drawerDeleteMsg.toLowerCase().includes('correo') ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-red-600'}`}>
                          {drawerDeleteMsg}
                        </p>
                      )}
                      <input
                        ref={drawerOtpRef}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Código OTP (6 dígitos)"
                        value={drawerDeleteOtp}
                        onChange={(e) => onSetDrawerDeleteOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && drawerDeleteOtp.length === 6) void onConfirmDelete(mem.id, mem.email); }}
                        className="w-full rounded-xl border border-red-300 px-3 py-2.5 text-center text-lg font-bold tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-red-300 transition bg-white"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => void onConfirmDelete(mem.id, mem.email)} disabled={drawerDeleting || drawerDeleteOtp.length !== 6}
                          className="flex-1 bg-red-600 text-white rounded-xl py-2 text-xs font-bold hover:bg-red-700 transition disabled:opacity-50">
                          {drawerDeleting ? 'Eliminando...' : 'Confirmar eliminación'}
                        </button>
                        <button onClick={() => { onSetDrawerDeleteStep('otp-send'); onSetDrawerDeleteOtp(''); onSetDrawerDeleteMsg(''); }}
                          className="px-3 rounded-xl border border-red-200 text-xs text-red-500 hover:bg-red-100 transition">
                          Reenviar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Expediente viewer button */}
          {member.intakeStatus && member.intakeStatus !== 'draft' && (
            <div className="px-4 pt-4 pb-0">
              <button onClick={() => { onOpenIntakeModal(mem); onClose(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-velum-200 text-velum-700 rounded-xl text-sm font-medium hover:bg-velum-50 transition">
                <FolderOpen size={14} />Ver expediente completo
              </button>
            </div>
          )}
          {/* Intake approval */}
          {(member.intakeStatus === 'submitted' || intakeToReject === mem.id) && (
            <div className="p-4 border-b border-velum-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Revisión de expediente</p>
              {intakeToReject === mem.id ? (
                <div className="space-y-3">
                  <textarea value={intakeRejectReason} onChange={(e) => onSetIntakeRejectReason(e.target.value)}
                    placeholder="Motivo del rechazo (requerido)" rows={3}
                    className="w-full rounded-xl border border-red-200 bg-red-50/30 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 transition" />
                  <div className="flex gap-2">
                    <button onClick={() => onApproveIntake(mem.id, false)} disabled={!intakeRejectReason.trim() || isApprovingIntake === mem.id}
                      className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-700 transition disabled:opacity-50">
                      {isApprovingIntake === mem.id ? 'Procesando...' : 'Confirmar rechazo'}
                    </button>
                    <button onClick={() => { onSetIntakeToReject(null); onSetIntakeRejectReason(''); }}
                      className="px-3 py-2 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition">Cancelar</button>
                  </div>
                </div>
              ) : intakeToApprove === mem.id ? (
                <div className="space-y-2">
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">¿Confirmas que el expediente cumple los requisitos clínicos?</p>
                  <div className="flex gap-2">
                    <button onClick={() => { onSetIntakeToApprove(null); onApproveIntake(mem.id, true); }} disabled={isApprovingIntake === mem.id}
                      className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50">
                      {isApprovingIntake === mem.id ? 'Procesando...' : 'Confirmar aprobación'}
                    </button>
                    <button onClick={() => onSetIntakeToApprove(null)}
                      className="px-3 py-2.5 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => onSetIntakeToApprove(mem.id)}
                    className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-emerald-700 transition">
                    Aprobar
                  </button>
                  <button onClick={() => onSetIntakeToReject(mem.id)}
                    className="flex-1 border border-red-200 text-red-600 bg-red-50 rounded-xl py-2.5 text-sm font-medium hover:bg-red-100 transition">Rechazar</button>
                </div>
              )}
            </div>
          )}
          {/* Citas */}
          <div className="p-4 border-b border-velum-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Citas recientes</p>
            {isLoadingMemberHistory ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-velum-100 rounded-xl animate-pulse" />)}</div>
            ) : !Array.isArray(memberAppointments) || memberAppointments.length === 0 ? (
              <p className="text-xs text-velum-400 text-center py-4">Sin citas registradas</p>
            ) : (
              <div className="space-y-2">
                {memberAppointments.slice(0, 5).map((a) => {
                  const s = apptStatusLabel(a.status);
                  return (
                    <div key={a.id} className="flex items-center justify-between p-2.5 rounded-xl bg-velum-50">
                      <div>
                        <p className="text-xs font-medium text-velum-900">{new Date(a.startAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        <p className="text-[11px] text-velum-500">{a.treatment?.name ?? 'Sin tratamiento'}</p>
                      </div>
                      <Pill label={s.label} cls={s.cls} />
                    </div>
                  );
                })}
                {memberAppointments.length > 5 && <p className="text-[11px] text-velum-400 text-center">+{memberAppointments.length - 5} más</p>}
              </div>
            )}
          </div>
          {/* Pagos */}
          <div className="p-4 border-b border-velum-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Historial de pagos</p>
            {isLoadingMemberHistory ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-10 bg-velum-100 rounded-xl animate-pulse" />)}</div>
            ) : !Array.isArray(memberPayments) || memberPayments.length === 0 ? (
              <p className="text-xs text-velum-400 text-center py-4">Sin pagos registrados</p>
            ) : (
              <div className="space-y-2">
                {(memberPayments as any[]).slice(0, 20).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl bg-velum-50">
                    <div>
                      <p className="text-xs font-medium text-velum-900">
                        {new Date(p.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-[11px] text-velum-500">{p.concept ?? p.description ?? p.membership?.planId ?? '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-velum-900">{p.amount ? formatMoney(p.amount) : '—'}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${p.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : p.status === 'failed' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                        {p.status === 'paid' ? 'Pagado' : p.status === 'failed' ? 'Fallido' : p.status === 'refunded' ? 'Reembolsado' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                ))}
                {memberPayments.length > 20 && <p className="text-[11px] text-velum-400 text-center">+{memberPayments.length - 20} más</p>}
              </div>
            )}
          </div>
          {/* Sesiones */}
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-3">Sesiones clínicas</p>
            {isLoadingMemberHistory ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-velum-100 rounded-xl animate-pulse" />)}</div>
            ) : !Array.isArray(memberSessions) || memberSessions.length === 0 ? (
              <p className="text-xs text-velum-400 text-center py-4">Sin sesiones registradas</p>
            ) : (
              <div className="space-y-2">
                {memberSessions.slice(0, 5).map((s) => {
                  const params = s.laserParametersJson as Record<string, string> | null;
                  return (
                    <div key={s.id} className="p-3 rounded-xl bg-velum-50 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-velum-900">{new Date(s.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        {s.adverseEvents && <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200">Evento adverso</span>}
                      </div>
                      {params && (
                        <p className="text-[11px] text-velum-500">
                          {[params.zona, params.fluencia, params.frecuencia, params.spot].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {s.notes && <p className="text-[11px] text-velum-500 line-clamp-1">{s.notes}</p>}
                    </div>
                  );
                })}
                {memberSessions.length > 5 && <p className="text-[11px] text-velum-400 text-center">+{memberSessions.length - 5} más</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

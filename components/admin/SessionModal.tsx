import React from 'react';
import { X, Zap } from 'lucide-react';
import { Member } from '../../types';
import { Appointment } from '../../services/clinicalService';

export type SessionForm = {
  appointmentId: string;
  zona: string;
  fluencia: string;
  frecuencia: string;
  spot: string;
  passes: string;
  notes: string;
  adverseEvents: string;
};

interface SessionModalProps {
  member: Member;
  appointments: Appointment[];
  form: SessionForm;
  isSaving: boolean;
  onFormChange: (updater: (f: SessionForm) => SessionForm) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export const SessionModal: React.FC<SessionModalProps> = ({
  member,
  appointments,
  form,
  isSaving,
  onFormChange,
  onSubmit,
  onClose,
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-velum-100 overflow-hidden flex flex-col max-h-[90vh]">
      <div className="px-6 py-5 border-b border-velum-100 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-velum-500">Registro clínico</p>
          <h3 className="font-serif text-lg text-velum-900 mt-0.5">{member.name}</h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar registro clínico"
          className="text-velum-400 hover:text-velum-900 p-1 rounded-xl hover:bg-velum-50 transition"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-6 space-y-5 overflow-y-auto">
        {appointments.length > 0 && (
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Cita asociada</label>
            <select
              value={form.appointmentId}
              onChange={(e) => onFormChange((f) => ({ ...f, appointmentId: e.target.value }))}
              className="w-full rounded-xl border border-velum-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition bg-white"
            >
              <option value="">Sin cita específica</option>
              {appointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {new Date(a.startAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} — {a.treatment?.name ?? 'Sin tratamiento'}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-velum-500 mb-3">Parámetros láser</p>
          <div className="grid grid-cols-2 gap-3">
            {([
              ['zona', 'Zona tratada', 'Ej. Zona I', 'text'],
              ['fluencia', 'Fluencia (J/cm²)', 'Ej. 14', 'number'],
              ['frecuencia', 'Frecuencia (Hz)', 'Ej. 2', 'number'],
              ['spot', 'Spot (mm)', 'Ej. 12', 'number'],
            ] as const).map(([field, label, placeholder, type]) => (
              <div key={field}>
                <label className="block text-xs text-velum-500 mb-1">{label}</label>
                <input
                  value={form[field]}
                  onChange={(e) => onFormChange((f) => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  type={type}
                  min="0"
                  step={field === 'fluencia' ? '0.1' : field === 'frecuencia' ? '0.5' : '1'}
                  className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition"
                />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs text-velum-500 mb-1">Pasadas</label>
              <input
                value={form.passes}
                onChange={(e) => onFormChange((f) => ({ ...f, passes: e.target.value }))}
                placeholder="Ej. 3"
                type="number"
                min="1"
                className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Notas clínicas</label>
          <textarea
            value={form.notes}
            onChange={(e) => onFormChange((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Observaciones, tolerancia del cliente, respuesta al tratamiento..."
            className="w-full rounded-xl border border-velum-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-900 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-velum-500 mb-2">Eventos adversos</label>
          <textarea
            value={form.adverseEvents}
            onChange={(e) => onFormChange((f) => ({ ...f, adverseEvents: e.target.value }))}
            rows={2}
            placeholder="Eritema, edema... (dejar vacío si no aplica)"
            className={`w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-velum-900/20 transition ${
              form.adverseEvents ? 'border-amber-300 bg-amber-50/40' : 'border-velum-200 focus:border-velum-900'
            }`}
          />
        </div>
      </div>

      <div className="px-6 py-4 border-t border-velum-100 flex gap-3 bg-velum-50/50">
        <button
          onClick={onSubmit}
          disabled={isSaving}
          className="flex-1 bg-velum-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Zap size={14} />{isSaving ? 'Registrando...' : 'Registrar sesión'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl border border-velum-200 text-sm text-velum-700 hover:bg-velum-100 transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  </div>
);

import React from 'react';
import { Zap } from 'lucide-react';
import { Member } from '../../types';
import { Appointment } from '../../services/clinicalService';
import { Modal, Button } from '../ui';

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

// Estilos compartidos del input — mantener consistente con el resto del codebase.
// Cuando se migre a TextField primitivo en futuras fases, esto desaparece.
const inputCls =
  'w-full rounded-md border border-velum-200 px-3 py-2.5 text-sm transition-all duration-base ease-standard ' +
  'focus:outline-none focus-visible:shadow-focus focus:border-velum-900';

export const SessionModal: React.FC<SessionModalProps> = ({
  member,
  appointments,
  form,
  isSaving,
  onFormChange,
  onSubmit,
  onClose,
}) => (
  <Modal
    isOpen
    onClose={onClose}
    title={member.name ?? 'Paciente'}
    description="Registro clínico de sesión"
    size="lg"
  >
    <div className="space-y-5">
      {appointments.length > 0 && (
        <div>
          <label htmlFor="session-appointment" className="block text-[11px] font-bold uppercase tracking-widest text-velum-700 mb-2">
            Cita asociada
          </label>
          <select
            id="session-appointment"
            value={form.appointmentId}
            onChange={(e) => onFormChange((f) => ({ ...f, appointmentId: e.target.value }))}
            className={`${inputCls} bg-white`}
          >
            <option value="">Sin cita específica</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {new Date(a.startAt).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                — {a.treatment?.name ?? 'Sin tratamiento'}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-velum-700 mb-3">Parámetros láser</p>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['zona', 'Zona tratada', 'Ej. Zona I', 'text'],
              ['fluencia', 'Fluencia (J/cm²)', 'Ej. 14', 'number'],
              ['frecuencia', 'Frecuencia (Hz)', 'Ej. 2', 'number'],
              ['spot', 'Spot (mm)', 'Ej. 12', 'number'],
            ] as const
          ).map(([field, label, placeholder, type]) => (
            <div key={field}>
              <label htmlFor={`session-${field}`} className="block text-xs text-velum-500 mb-1.5">
                {label}
              </label>
              <input
                id={`session-${field}`}
                value={form[field]}
                onChange={(e) => onFormChange((f) => ({ ...f, [field]: e.target.value }))}
                placeholder={placeholder}
                type={type}
                min="0"
                step={field === 'fluencia' ? '0.1' : field === 'frecuencia' ? '0.5' : '1'}
                className={inputCls}
              />
            </div>
          ))}
          <div className="col-span-2">
            <label htmlFor="session-passes" className="block text-xs text-velum-500 mb-1.5">Pasadas</label>
            <input
              id="session-passes"
              value={form.passes}
              onChange={(e) => onFormChange((f) => ({ ...f, passes: e.target.value }))}
              placeholder="Ej. 3"
              type="number"
              min="1"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="session-notes" className="block text-[11px] font-bold uppercase tracking-widest text-velum-700 mb-2">
          Notas clínicas
        </label>
        <textarea
          id="session-notes"
          value={form.notes}
          onChange={(e) => onFormChange((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          placeholder="Observaciones, tolerancia del cliente, respuesta al tratamiento…"
          className={`${inputCls} resize-none`}
        />
      </div>

      <div>
        <label htmlFor="session-adverse" className="block text-[11px] font-bold uppercase tracking-widest text-velum-700 mb-2">
          Eventos adversos
        </label>
        <textarea
          id="session-adverse"
          value={form.adverseEvents}
          onChange={(e) => onFormChange((f) => ({ ...f, adverseEvents: e.target.value }))}
          rows={2}
          placeholder="Eritema, edema… (dejar vacío si no aplica)"
          className={`${inputCls} resize-none ${
            form.adverseEvents
              ? 'border-warning-500 bg-warning-50/40 focus:border-warning-700'
              : ''
          }`}
        />
      </div>

      {/* Footer de acciones — usa primitivos */}
      <div className="flex gap-3 pt-5 border-t border-velum-100 -mx-6 px-6 -mb-5 pb-5">
        <Button
          variant="primary"
          onClick={onSubmit}
          isLoading={isSaving}
          loadingLabel="Registrando…"
          leftIcon={<Zap size={14} />}
          fullWidth
        >
          Registrar sesión
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={isSaving}>
          Cancelar
        </Button>
      </div>
    </div>
  </Modal>
);

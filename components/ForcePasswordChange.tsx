import React, { useState } from "react";
import { Shield, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import { useAuth } from "../context/AuthContext";
import { Modal, Button } from "./ui";

const getChecks = (v: string) => ({
  length: v.length >= 12,
  upper: /[A-Z]/.test(v),
  lower: /[a-z]/.test(v),
  number: /[0-9]/.test(v),
  special: /[^A-Za-z0-9]/.test(v),
});

const CHECK_LABELS = [
  { key: "length",  label: "Mínimo 12 caracteres" },
  { key: "upper",   label: "Una mayúscula" },
  { key: "lower",   label: "Una minúscula" },
  { key: "number",  label: "Un número" },
  { key: "special", label: "Un símbolo especial" },
] as const;

export const ForcePasswordChange: React.FC = () => {
  const navigate = useNavigate();
  const { user, clearMustChangePassword } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const checks = getChecks(newPassword);
  const score = Object.values(checks).filter(Boolean).length;
  const allPassed = Object.values(checks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allPassed) {
      setError("La contraseña no cumple todos los requisitos.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setIsLoading(true);
    try {
      await authService.changeInitialPassword(newPassword);
      setSuccess(true);
      setTimeout(() => {
        clearMustChangePassword();
        navigate(user?.role === "member" ? "/dashboard" : "/admin", { replace: true });
      }, 1200);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? "No se pudo actualizar la contraseña. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  // Strength meter usa intent tokens semánticos (no red-500/amber/green hardcoded)
  const strengthMeta =
    score <= 2 ? { label: "Débil",  text: "text-danger-700",  bar: "bg-danger-500"  } :
    score <= 4 ? { label: "Media",  text: "text-warning-700", bar: "bg-warning-500" } :
                 { label: "Fuerte", text: "text-success-700", bar: "bg-success-500" };

  return (
    <Modal
      isOpen
      // Bloqueante: no se puede cerrar sin completar
      onClose={() => {}}
      closeOnBackdrop={false}
      closeOnEsc={false}
      hideCloseButton
      aria-label="Establecer contraseña permanente"
      size="md"
      className="!p-0 overflow-hidden"
    >
      <div className="-mx-6 -my-5">
        {/* Custom dark header — preservamos el branding institucional */}
        <div className="bg-velum-900 px-8 py-7">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-velum-400">
                Velum Laser · Administración
              </p>
              <h2 className="text-lg font-serif text-white mt-0.5">
                Establece tu contraseña
              </h2>
            </div>
          </div>
          <p className="mt-4 text-sm text-velum-300 leading-relaxed">
            Por seguridad, debes crear tu contraseña permanente antes de continuar.
            Esta contraseña temporal ya no será válida después de este cambio.
          </p>
        </div>

        {/* Form / success */}
        <div className="px-8 py-7">
          {success ? (
            <div className="flex flex-col items-center py-6 gap-4 animate-fade-in">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-success-50">
                <CheckCircle2 className="w-7 h-7 text-success-700" />
              </div>
              <p className="text-base font-semibold text-velum-900">¡Contraseña establecida!</p>
              <p className="text-sm text-velum-500 text-center">Redirigiendo al panel…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* New password */}
              <div>
                <label htmlFor="new-pwd" className="block text-[11px] font-bold uppercase tracking-[0.16em] text-velum-700 mb-2">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input
                    id="new-pwd"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mín. 12 caracteres"
                    className="w-full rounded-md bg-velum-50 border border-velum-200 px-4 py-3.5 pr-12 text-[15px] text-velum-900 placeholder:text-velum-400 transition-all duration-base ease-standard focus:outline-none focus:bg-white focus:border-velum-900 focus-visible:shadow-focus"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    aria-label={showNew ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-velum-400 hover:text-velum-900 transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus rounded p-1"
                  >
                    {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>

                {/* Strength bar */}
                {newPassword && (
                  <div className="mt-2.5" aria-live="polite">
                    <div className="flex gap-1 mb-1.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors duration-slow ease-standard ${
                            i <= score ? strengthMeta.bar : "bg-velum-100"
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-[11px] font-bold uppercase tracking-widest ${strengthMeta.text}`}>
                      {strengthMeta.label}
                    </p>
                  </div>
                )}

                {/* Checklist */}
                {newPassword && (
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {CHECK_LABELS.map(({ key, label }) => (
                      <div
                        key={key}
                        className={`flex items-center gap-1.5 text-[11px] transition-colors duration-base ease-standard ${
                          checks[key] ? "text-success-700" : "text-velum-400"
                        }`}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full transition-colors duration-base ease-standard ${
                            checks[key] ? "bg-success-500" : "bg-velum-300"
                          }`}
                          aria-hidden="true"
                        />
                        {label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label htmlFor="confirm-pwd" className="block text-[11px] font-bold uppercase tracking-[0.16em] text-velum-700 mb-2">
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <input
                    id="confirm-pwd"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña"
                    aria-invalid={confirmPassword !== "" && confirmPassword !== newPassword || undefined}
                    className={`w-full rounded-md bg-velum-50 border px-4 py-3.5 pr-12 text-[15px] text-velum-900 placeholder:text-velum-400 transition-all duration-base ease-standard focus:outline-none focus:bg-white focus-visible:shadow-focus ${
                      confirmPassword && confirmPassword !== newPassword
                        ? "border-danger-500 focus:border-danger-700 focus-visible:shadow-focusDanger"
                        : "border-velum-200 focus:border-velum-900"
                    }`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-velum-400 hover:text-velum-900 transition-colors duration-base ease-standard focus:outline-none focus-visible:shadow-focus rounded p-1"
                  >
                    {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="mt-1.5 text-[11px] text-danger-700" role="alert">
                    Las contraseñas no coinciden
                  </p>
                )}
              </div>

              {error && (
                <div role="alert" className="rounded-md border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isLoading}
                loadingLabel="Guardando…"
                disabled={!allPassed || newPassword !== confirmPassword}
              >
                Establecer contraseña permanente
              </Button>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
};

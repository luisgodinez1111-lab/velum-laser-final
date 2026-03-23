import React, { useState } from "react";
import { Shield, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { authService } from "../services/authService";
import { useAuth } from "../context/AuthContext";

const getChecks = (v: string) => ({
  length: v.length >= 12,
  upper: /[A-Z]/.test(v),
  lower: /[a-z]/.test(v),
  number: /[0-9]/.test(v),
  special: /[^A-Za-z0-9]/.test(v),
});

export const ForcePasswordChange: React.FC = () => {
  const { clearMustChangePassword } = useAuth();
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
    if (!allPassed) { setError("La contraseña no cumple todos los requisitos."); return; }
    if (newPassword !== confirmPassword) { setError("Las contraseñas no coinciden."); return; }
    setIsLoading(true);
    try {
      await authService.changeInitialPassword(newPassword);
      setSuccess(true);
      setTimeout(() => clearMustChangePassword(), 1200);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo actualizar la contraseña. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const strengthLabel = score <= 2 ? "Débil" : score <= 4 ? "Media" : "Fuerte";
  const strengthColor = score <= 2 ? "text-red-500" : score <= 4 ? "text-amber-500" : "text-green-600";
  const strengthBar = score <= 2 ? "bg-red-400" : score <= 4 ? "bg-amber-400" : "bg-green-500";

  const CHECK_LABELS = [
    { key: "length", label: "Mínimo 12 caracteres" },
    { key: "upper", label: "Una mayúscula" },
    { key: "lower", label: "Una minúscula" },
    { key: "number", label: "Un número" },
    { key: "special", label: "Un símbolo especial" },
  ] as const;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-velum-900/90 backdrop-blur-md">
      <div className="w-full max-w-md bg-white rounded-[28px] shadow-[0_32px_80px_rgba(0,0,0,0.25)] border border-velum-100 overflow-hidden">
        {/* Header */}
        <div className="bg-velum-900 px-8 py-7">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-velum-400">Velum Laser · Administración</p>
              <h2 className="text-lg font-serif text-white mt-0.5">Establece tu contraseña</h2>
            </div>
          </div>
          <p className="mt-4 text-sm text-velum-300 leading-relaxed">
            Por seguridad, debes crear tu contraseña permanente antes de continuar.
            Esta contraseña temporal ya no será válida después de este cambio.
          </p>
        </div>

        {/* Form */}
        <div className="px-8 py-7">
          {success ? (
            <div className="flex flex-col items-center py-6 gap-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <p className="text-base font-semibold text-velum-900">¡Contraseña establecida!</p>
              <p className="text-sm text-velum-500 text-center">Redirigiendo al panel...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* New password */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-velum-500 mb-2">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mín. 12 caracteres"
                    className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 pr-12 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-velum-400 hover:text-velum-700">
                    {showNew ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>

                {/* Strength bar */}
                {newPassword && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= score ? strengthBar : "bg-velum-100"}`} />
                      ))}
                    </div>
                    <p className={`text-[11px] font-semibold ${strengthColor}`}>{strengthLabel}</p>
                  </div>
                )}

                {/* Checklist */}
                {newPassword && (
                  <div className="mt-3 grid grid-cols-2 gap-1">
                    {CHECK_LABELS.map(({ key, label }) => (
                      <div key={key} className={`flex items-center gap-1.5 text-[11px] ${checks[key] ? "text-green-600" : "text-velum-400"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${checks[key] ? "bg-green-500" : "bg-velum-300"}`} />
                        {label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-velum-500 mb-2">
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña"
                    className={`w-full rounded-2xl bg-velum-50 border px-5 py-4 pr-12 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all focus:bg-white focus:ring-4 focus:ring-velum-900/[0.07] ${
                      confirmPassword && confirmPassword !== newPassword
                        ? "border-red-300 focus:border-red-400"
                        : "border-velum-200/60 focus:border-velum-900"
                    }`}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-velum-400 hover:text-velum-700">
                    {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="mt-1.5 text-[11px] text-red-500">Las contraseñas no coinciden</p>
                )}
              </div>

              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading || !allPassed || newPassword !== confirmPassword}
                className="w-full bg-velum-900 text-white rounded-2xl py-4 text-[15px] font-semibold hover:bg-velum-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Guardando..." : "Establecer contraseña permanente"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

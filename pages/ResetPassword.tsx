import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { authService } from "../services/authService";
import { PasswordInput } from "../components/PasswordInput";

function getPasswordChecks(pw: string) {
  return {
    length: pw.length >= 12,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const checks = getPasswordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;
  const strength = score <= 2 ? "Débil" : score <= 4 ? "Media" : "Fuerte";
  const strengthClass = score <= 2 ? "text-red-600" : score <= 4 ? "text-amber-600" : "text-green-700";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!Object.values(checks).every(Boolean)) {
      setError("La contraseña no cumple todos los requisitos de seguridad.");
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate("/agenda"), 2500);
    } catch (err: any) {
      setError(err?.message ?? "El enlace es inválido o ya expiró. Solicita uno nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm text-center">
          <p className="text-[14px] text-velum-500">Enlace inválido. Solicita un nuevo enlace desde la pantalla de inicio de sesión.</p>
          <button
            onClick={() => navigate("/agenda")}
            className="mt-6 w-full rounded-2xl bg-velum-900 py-4 text-[15px] font-semibold text-white hover:bg-velum-800 transition-all"
          >
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center bg-white px-6 py-12 animate-fade-in">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={28} className="text-green-600" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-2">Listo</p>
          <h2 className="font-serif text-[2.25rem] italic text-velum-900 mb-3 leading-tight">Contraseña actualizada</h2>
          <p className="text-[14px] text-velum-500 leading-relaxed">
            Tu contraseña fue cambiada correctamente. Redirigiendo al inicio de sesión…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center bg-white px-6 py-12 animate-fade-in">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="w-14 h-14 rounded-2xl bg-velum-50 border border-velum-200 flex items-center justify-center mb-6">
            <KeyRound size={24} className="text-velum-700" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500 mb-2">Nueva contraseña</p>
          <h2 className="font-serif text-[2.25rem] italic text-velum-900 mb-3 leading-tight">Crear contraseña</h2>
          <p className="text-[14px] text-velum-500 leading-relaxed">
            Elige una contraseña segura para tu cuenta Velum Laser.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">
              Nueva contraseña
            </label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-2xl bg-velum-50 border border-velum-200/60 px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:border-velum-900 focus:ring-4 focus:ring-velum-900/[0.07]"
              placeholder="••••••••"
              autoFocus
            />
            {password.length > 0 && (
              <div className="mt-3 rounded-2xl bg-velum-50 border border-velum-200/60 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-velum-500">Fortaleza</p>
                  <p className={`text-[11px] font-bold ${strengthClass}`}>{strength}</p>
                </div>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= score ? (score <= 2 ? "bg-red-400" : score <= 4 ? "bg-amber-400" : "bg-green-500") : "bg-velum-200"}`} />
                  ))}
                </div>
                <ul className="space-y-1 pt-1">
                  {[
                    { key: "length",  label: "Mínimo 12 caracteres" },
                    { key: "upper",   label: "Una letra mayúscula" },
                    { key: "lower",   label: "Una letra minúscula" },
                    { key: "number",  label: "Un número" },
                    { key: "special", label: "Un símbolo (!@#$...)" },
                  ].map(({ key, label }) => (
                    <li key={key} className={`flex items-center gap-2 text-[12px] ${checks[key as keyof typeof checks] ? "text-green-700" : "text-velum-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${checks[key as keyof typeof checks] ? "bg-green-500" : "bg-velum-300"}`} />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-velum-500">
              Confirmar contraseña
            </label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={`w-full rounded-2xl bg-velum-50 border px-5 py-4 text-[15px] text-velum-900 placeholder:text-velum-400 outline-none transition-all duration-200 focus:bg-white focus:ring-4 focus:ring-velum-900/[0.07] ${confirmPassword && confirmPassword !== password ? "border-red-400 focus:border-red-400" : "border-velum-200/60 focus:border-velum-900"}`}
              placeholder="••••••••"
            />
            {confirmPassword && confirmPassword !== password && (
              <p className="mt-1.5 text-[12px] text-red-500">Las contraseñas no coinciden</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-velum-900 py-4 text-[15px] font-semibold text-white hover:bg-velum-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-all duration-200"
          >
            {loading ? "Actualizando..." : "Establecer nueva contraseña"}
          </button>
        </form>

        {error && (
          <div className="mt-5 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-600">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, CreditCard, ArrowRight } from "lucide-react";

type ChargeInfo = {
  id: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  amountFormatted: string;
  type: "ONE_TIME" | "RECURRING";
  interval?: string;
  intervalLabel?: string;
  status: string;
  expiresAt?: string;
  user: { email: string; profile?: { firstName?: string } };
};

const apiBase = (import.meta.env as Record<string, string | undefined>)?.VITE_API_URL ?? "";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || "Error en la solicitud");
  return json;
}

export const CustomChargePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const paymentResult = searchParams.get("payment");

  const [charge, setCharge] = useState<ChargeInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [otpBlocked, setOtpBlocked] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/v1/custom-charges/${id}`)
      .then((data) => setCharge(data.charge))
      .catch((e) => setLoadError(e.message || "No se encontró el cobro"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(""));
      inputRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length !== 6) { setVerifyError("Ingresa los 6 dígitos del código"); return; }
    setVerifyError(""); setVerifying(true);
    try {
      const data = await apiFetch(`/api/v1/custom-charges/${id}/verify`, {
        method: "POST",
        body: JSON.stringify({ otp: code }),
      });
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Código incorrecto o expirado";
      const isTerminal = msg.toLowerCase().includes("demasiados intentos") ||
                         msg.toLowerCase().includes("too many");
      if (isTerminal) setOtpBlocked(true);
      setVerifyError(msg);
      setVerifying(false);
    }
  };

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      await apiFetch(`/api/v1/custom-charges/${id}/resend`, { method: "POST" });
      setOtp(["", "", "", "", "", ""]);
      setVerifyError("");
      setOtpBlocked(false);
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
      resendTimerRef.current = interval;
    } catch (e: unknown) {
      setVerifyError(e instanceof Error ? e.message : "No se pudo reenviar el código");
    } finally {
      setResending(false);
    }
  }, [id]);

  useEffect(() => {
    return () => { if (resendTimerRef.current) clearInterval(resendTimerRef.current); };
  }, []);

  // ── Payment success state ──────────────────────────────────────────
  if (paymentResult === "success") {
    return (
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg p-10 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-serif text-velum-900">¡Pago realizado!</h1>
          <p className="text-sm text-velum-500">Tu pago fue procesado exitosamente. El equipo de Velum Laser recibirá la confirmación.</p>
          <a href="/#/" className="inline-block mt-2 px-6 py-3 bg-velum-900 text-white rounded-xl text-sm font-medium hover:bg-velum-800 transition">
            Ir a mi cuenta
          </a>
        </div>
      </div>
    );
  }

  if (paymentResult === "cancelled") {
    return (
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg p-10 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
            <XCircle size={32} className="text-amber-500" />
          </div>
          <h1 className="text-2xl font-serif text-velum-900">Pago cancelado</h1>
          <p className="text-sm text-velum-500">Cancelaste el proceso de pago. Puedes intentarlo de nuevo cuando quieras.</p>
          <button onClick={() => window.location.href = window.location.href.split("?")[0]}
            className="inline-block mt-2 px-6 py-3 bg-velum-900 text-white rounded-xl text-sm font-medium hover:bg-velum-800 transition">
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center">
        <Loader2 size={28} className="text-velum-400 animate-spin" />
      </div>
    );
  }

  if (loadError || !charge) {
    return (
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg p-10 max-w-sm w-full text-center space-y-4">
          <XCircle size={36} className="text-red-400 mx-auto" />
          <h1 className="text-xl font-serif text-velum-900">Cobro no encontrado</h1>
          <p className="text-sm text-velum-500">{loadError || "Este enlace no es válido o ya expiró."}</p>
        </div>
      </div>
    );
  }

  if (charge.status === "PAID") {
    return (
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg p-10 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <h1 className="text-2xl font-serif text-velum-900">Ya pagado</h1>
          <p className="text-sm text-velum-500">Este cobro ya fue liquidado. Gracias.</p>
        </div>
      </div>
    );
  }

  if (charge.status === "ACCEPTED") {
    return (
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg p-10 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-amber-500" />
          </div>
          <h1 className="text-xl font-serif text-velum-900">Cobro autorizado</h1>
          <p className="text-sm text-velum-500">
            Tu autorización fue recibida. Si no fuiste redirigida al pago, contacta al equipo de Velum Laser.
          </p>
        </div>
      </div>
    );
  }

  if (charge.status === "CANCELLED" || charge.status === "EXPIRED") {
    return (
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg p-10 max-w-sm w-full text-center space-y-4">
          <XCircle size={36} className="text-velum-300 mx-auto" />
          <h1 className="text-xl font-serif text-velum-900">
            {charge.status === "EXPIRED" ? "Cobro expirado" : "Cobro cancelado"}
          </h1>
          <p className="text-sm text-velum-500">
            {charge.status === "EXPIRED"
              ? "Este cobro ha expirado. Contacta a Velum Laser para más información."
              : "Este cobro fue cancelado. Contacta a Velum Laser para más información."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-3xl shadow-lg w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a1614] px-8 py-7">
          <p className="text-[11px] font-bold tracking-widest uppercase text-[#c9b89a]">Velum Laser</p>
          <p className="text-[10px] tracking-wider text-[#7a6a58] mt-1">Cobro personalizado</p>
        </div>

        <div className="px-8 py-8 space-y-6">
          {/* Charge details */}
          <div>
            <h1 className="text-xl font-serif text-velum-900">{charge.title}</h1>
            {charge.description && <p className="text-sm text-velum-500 mt-1">{charge.description}</p>}
          </div>

          <div className="bg-[#f8f6f3] rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-widest text-velum-400">Monto</span>
              <span className="text-2xl font-bold text-velum-900">{charge.amountFormatted}</span>
            </div>
            <div className="flex justify-between items-center border-t border-[#ede8e2] pt-3">
              <span className="text-xs font-bold uppercase tracking-widest text-velum-400">Tipo</span>
              <span className="text-sm text-velum-700 flex items-center gap-1.5">
                <CreditCard size={13} />
                {charge.type === "RECURRING"
                  ? `Recurrente · ${charge.intervalLabel ?? charge.interval ?? ""}`
                  : "Pago único"}
              </span>
            </div>
            {charge.user.profile?.firstName && (
              <div className="flex justify-between items-center border-t border-[#ede8e2] pt-3">
                <span className="text-xs font-bold uppercase tracking-widest text-velum-400">Para</span>
                <span className="text-sm text-velum-700">{charge.user.profile.firstName}</span>
              </div>
            )}
          </div>

          {/* OTP input */}
          <div className="space-y-3">
            <p className="text-sm text-velum-700">
              Ingresa el código de 6 dígitos que recibiste en tu correo <strong>{charge.user.email}</strong> para autorizar este cobro.
            </p>

            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  disabled={otpBlocked}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className={`w-11 h-14 text-center text-xl font-bold text-velum-900 border-2 rounded-xl
                    focus:outline-none focus:border-velum-700 focus:ring-2 focus:ring-velum-900/10 transition
                    ${otpBlocked
                      ? "bg-velum-100 border-velum-100 opacity-50 cursor-not-allowed"
                      : "border-velum-200 bg-[#f8f6f3]"}`}
                />
              ))}
            </div>

            {verifyError && (
              <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border ${
                otpBlocked
                  ? "bg-amber-50 border-amber-200"
                  : "bg-red-50 border-red-200"
              }`}>
                <XCircle size={14} className={`shrink-0 ${otpBlocked ? "text-amber-500" : "text-red-500"}`} />
                <p className={`text-sm ${otpBlocked ? "text-amber-700" : "text-red-700"}`}>{verifyError}</p>
              </div>
            )}

            <button
              onClick={handleResend}
              disabled={resending || resendCooldown > 0}
              className="w-full text-center text-xs text-velum-400 hover:text-velum-700 transition disabled:opacity-40 py-1"
            >
              {resendCooldown > 0
                ? `Reenviar código en ${resendCooldown}s`
                : resending ? "Enviando..." : "¿No recibiste el código? Reenviar"}
            </button>

            <button onClick={handleVerify} disabled={verifying || otp.join("").length !== 6 || otpBlocked}
              className="w-full flex items-center justify-center gap-2 bg-[#1a1614] text-white rounded-xl py-3.5 text-sm font-semibold
                hover:bg-velum-800 transition disabled:opacity-40">
              {verifying
                ? <><Loader2 size={16} className="animate-spin" /> Verificando...</>
                : <><ArrowRight size={16} /> Autorizar y pagar</>}
            </button>
          </div>

          <p className="text-xs text-velum-400 text-center">
            Si no solicitaste este cobro o tienes dudas, contacta a Velum Laser antes de proceder.
          </p>
        </div>
      </div>
    </div>
  );
};

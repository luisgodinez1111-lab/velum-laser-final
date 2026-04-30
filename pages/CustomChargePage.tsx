import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, CreditCard, ArrowRight, Clock } from "lucide-react";
import { PillButton } from "../components/ui";
import { apiFetch } from "../services/apiClient";
import { track } from "../services/analytics";

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

  const [expirySecondsLeft, setExpirySecondsLeft] = useState<number | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch<{ charge: ChargeInfo }>(`/v1/custom-charges/${id}`)
      .then((data) => {
        setCharge(data.charge);
        // Start expiry countdown if charge is pending and has an expiresAt
        if (data.charge?.expiresAt && data.charge.status === "PENDING_ACCEPTANCE") {
          const calcSecondsLeft = () => Math.max(0, Math.floor((new Date(data.charge.expiresAt).getTime() - Date.now()) / 1000));
          setExpirySecondsLeft(calcSecondsLeft());
          expiryTimerRef.current = setInterval(() => {
            const secs = calcSecondsLeft();
            setExpirySecondsLeft(secs);
            if (secs <= 0 && expiryTimerRef.current) clearInterval(expiryTimerRef.current);
          }, 1000);
        }
      })
      .catch((e) => setLoadError(e.message || "No se encontró el cobro"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    return () => { if (expiryTimerRef.current) clearInterval(expiryTimerRef.current); };
  }, []);

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
      const data = await apiFetch<{ checkoutUrl?: string }>(`/v1/custom-charges/${id}/verify`, {
        method: "POST",
        body: JSON.stringify({ otp: code }),
      });
      if (data.checkoutUrl) {
        track('custom_charge_authorize', {
          chargeId: id,
          type: charge?.type ?? 'unknown',
        });
        window.location.href = data.checkoutUrl;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Código incorrecto o expirado";
      const isTerminal = msg.toLowerCase().includes("demasiados intentos") ||
                         msg.toLowerCase().includes("too many");
      if (isTerminal) setOtpBlocked(true);
      track('error_payment', { context: 'custom_charge_otp', terminal: isTerminal });
      setVerifyError(msg);
      setVerifying(false);
    }
  };

  const handleResend = useCallback(async () => {
    setResending(true);
    try {
      await apiFetch(`/v1/custom-charges/${id}/resend`, { method: "POST" });
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
      <div className="min-h-screen bg-velum-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-md p-10 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-success-700" />
          </div>
          <h1 className="font-sans font-bold text-velum-900 text-2xl tracking-tight">¡Pago realizado!</h1>
          <p className="text-[14px] text-velum-500">Tu pago fue procesado exitosamente. El equipo de Velum Laser recibirá la confirmación.</p>
          <a href="/#/dashboard" className="inline-flex items-center justify-center gap-1.5 mt-2 px-5 py-2.5 bg-velum-900 hover:bg-velum-800 text-white rounded-full text-[14px] font-semibold transition-colors duration-base ease-standard">
            Ir a mi cuenta
          </a>
        </div>
      </div>
    );
  }

  if (paymentResult === "cancelled") {
    return (
      <div className="min-h-screen bg-velum-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-md p-10 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-warning-50 rounded-full flex items-center justify-center mx-auto">
            <XCircle size={32} className="text-warning-700" />
          </div>
          <h1 className="font-sans font-bold text-velum-900 text-2xl tracking-tight">Pago cancelado</h1>
          <p className="text-[14px] text-velum-500">Cancelaste el proceso de pago. Puedes intentarlo de nuevo cuando quieras.</p>
          <PillButton
            variant="primary"
            size="md"
            onClick={() => window.location.href = window.location.href.split("?")[0]}
          >
            Intentar de nuevo
          </PillButton>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-velum-50 flex items-center justify-center">
        <Loader2 size={28} className="text-velum-400 animate-spin" />
      </div>
    );
  }

  if (loadError || !charge) {
    return (
      <div className="min-h-screen bg-velum-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-md p-10 max-w-sm w-full text-center space-y-4">
          <XCircle size={36} className="text-danger-500 mx-auto" />
          <h1 className="font-sans font-bold text-velum-900 text-xl tracking-tight">Cobro no encontrado</h1>
          <p className="text-[14px] text-velum-500">{loadError || "Este enlace no es válido o ya expiró."}</p>
        </div>
      </div>
    );
  }

  if (charge.status === "PAID") {
    return (
      <div className="min-h-screen bg-velum-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-md p-10 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-success-700" />
          </div>
          <h1 className="font-sans font-bold text-velum-900 text-2xl tracking-tight">Ya pagado</h1>
          <p className="text-[14px] text-velum-500">Este cobro ya fue liquidado. Gracias.</p>
        </div>
      </div>
    );
  }

  if (charge.status === "ACCEPTED") {
    return (
      <div className="min-h-screen bg-velum-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-md p-10 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-warning-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-warning-700" />
          </div>
          <h1 className="font-sans font-bold text-velum-900 text-xl tracking-tight">Cobro autorizado</h1>
          <p className="text-[14px] text-velum-500">
            Tu autorización fue recibida. Si no fuiste redirigida al pago, contacta al equipo de Velum Laser.
          </p>
        </div>
      </div>
    );
  }

  if (charge.status === "CANCELLED" || charge.status === "EXPIRED") {
    return (
      <div className="min-h-screen bg-velum-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-md p-10 max-w-sm w-full text-center space-y-4">
          <XCircle size={36} className="text-velum-300 mx-auto" />
          <h1 className="font-sans font-bold text-velum-900 text-xl tracking-tight">
            {charge.status === "EXPIRED" ? "Cobro expirado" : "Cobro cancelado"}
          </h1>
          <p className="text-[14px] text-velum-500">
            {charge.status === "EXPIRED"
              ? "Este cobro ha expirado. Contacta a Velum Laser para más información."
              : "Este cobro fue cancelado. Contacta a Velum Laser para más información."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-velum-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-3xl shadow-md w-full max-w-md overflow-hidden">
        {/* Header — Apple híbrido oscuro sin uppercase tracking extremo */}
        <div className="bg-velum-900 px-8 py-7">
          <p className="text-[13px] font-semibold text-velum-300">Velum Laser</p>
          <p className="text-[12px] text-velum-500 mt-1">Cobro personalizado</p>
        </div>

        <div className="px-8 py-8 space-y-6">
          {/* Charge details */}
          <div>
            <h1 className="font-sans font-bold text-velum-900 text-2xl tracking-tight">{charge.title}</h1>
            {charge.description && <p className="text-[14px] text-velum-500 mt-1.5">{charge.description}</p>}
          </div>

          <div className="bg-velum-50 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-semibold text-velum-500">Monto</span>
              <span className="font-sans font-bold tabular-nums text-velum-900 text-3xl tracking-tight">{charge.amountFormatted}</span>
            </div>
            <div className="flex justify-between items-center border-t border-velum-100 pt-3">
              <span className="text-[13px] font-semibold text-velum-500">Tipo</span>
              <span className="text-[14px] text-velum-700 flex items-center gap-1.5">
                <CreditCard size={13} />
                {charge.type === "RECURRING"
                  ? `Recurrente · ${charge.intervalLabel ?? charge.interval ?? ""}`
                  : "Pago único"}
              </span>
            </div>
            {charge.user.profile?.firstName && (
              <div className="flex justify-between items-center border-t border-velum-100 pt-3">
                <span className="text-[13px] font-semibold text-velum-500">Para</span>
                <span className="text-[14px] text-velum-700">{charge.user.profile.firstName}</span>
              </div>
            )}
          </div>

          {/* OTP input */}
          <div className="space-y-3">
            <p className="text-[14px] text-velum-700">
              Ingresa el código de 6 dígitos que recibiste en tu correo <strong>{charge.user.email}</strong> para autorizar este cobro.
            </p>
            {expirySecondsLeft !== null && expirySecondsLeft > 0 && (
              <div className="flex items-center gap-1.5 text-[12px] text-velum-500 tabular-nums">
                <Clock size={12} />
                <span>
                  Expira en {expirySecondsLeft >= 3600
                    ? `${Math.floor(expirySecondsLeft / 3600)}h ${Math.floor((expirySecondsLeft % 3600) / 60)}m`
                    : expirySecondsLeft >= 60
                    ? `${Math.floor(expirySecondsLeft / 60)}m ${expirySecondsLeft % 60}s`
                    : `${expirySecondsLeft}s`}
                </span>
              </div>
            )}
            {expirySecondsLeft === 0 && (
              <div className="flex items-center gap-1.5 text-[12px] text-warning-700 font-medium">
                <Clock size={12} />
                <span>Este cobro ha expirado. Contacta a Velum Laser.</span>
              </div>
            )}

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
                  className={`w-11 h-14 text-center text-xl font-bold tabular-nums text-velum-900 border-2 rounded-xl
                    focus:outline-none focus:border-velum-700 focus:ring-2 focus:ring-velum-900/10 transition-all duration-base ease-standard
                    ${otpBlocked
                      ? "bg-velum-100 border-velum-100 opacity-50 cursor-not-allowed"
                      : "border-velum-200 bg-velum-50"}`}
                />
              ))}
            </div>

            {verifyError && (
              <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 border ${
                otpBlocked
                  ? "bg-warning-50 border-warning-100"
                  : "bg-danger-50 border-danger-100"
              }`}>
                <XCircle size={14} className={`shrink-0 ${otpBlocked ? "text-warning-700" : "text-danger-500"}`} />
                <p className={`text-[14px] ${otpBlocked ? "text-warning-700" : "text-danger-700"}`}>{verifyError}</p>
              </div>
            )}

            <button
              onClick={handleResend}
              disabled={resending || resendCooldown > 0}
              className="w-full text-center text-[12px] text-velum-500 hover:text-velum-900 transition-colors duration-base ease-standard disabled:opacity-40 py-1 tabular-nums"
            >
              {resendCooldown > 0
                ? `Reenviar código en ${resendCooldown}s`
                : resending ? "Enviando..." : "¿No recibiste el código? Reenviar"}
            </button>

            <PillButton
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleVerify}
              disabled={verifying || otp.join("").length !== 6 || otpBlocked}
              isLoading={verifying}
              loadingLabel="Verificando..."
              rightIcon={<ArrowRight size={16} aria-hidden="true" />}
            >
              Autorizar y pagar
            </PillButton>
          </div>

          <p className="text-[12px] text-velum-500 text-center">
            Si no solicitaste este cobro o tienes dudas, contacta a Velum Laser antes de proceder.
          </p>
        </div>
      </div>
    </div>
  );
};

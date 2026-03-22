import React, { useEffect, useState } from "react";
import { apiFetch } from "../services/apiClient";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronUp,
  Send,
  Ban,
  CreditCard,
  Clock,
  RotateCcw,
} from "lucide-react";

type Props = { embedded?: boolean };

type PlanRow = {
  _key: string;
  planCode: string;
  name: string;
  amount: number;
  interval: "day" | "week" | "month" | "year";
  stripePriceId: string;
  active: boolean;
};

type UserOption = { id: string; email: string; firstName?: string; lastName?: string };

type CustomCharge = {
  id: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  type: "ONE_TIME" | "RECURRING";
  interval?: string;
  status: "PENDING_ACCEPTANCE" | "ACCEPTED" | "PAID" | "EXPIRED" | "CANCELLED";
  acceptedAt?: string;
  paidAt?: string;
  createdAt: string;
  user: { id: string; email: string; profile?: { firstName?: string; lastName?: string } };
};

type NewChargeForm = {
  userId: string;
  title: string;
  description: string;
  amount: string;
  currency: string;
  type: "ONE_TIME" | "RECURRING";
  interval: "day" | "week" | "month" | "year";
};

const genKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const api = (path: string, init?: RequestInit) =>
  apiFetch<any>(path.replace(/^\/api/, ""), init);

const INTERVAL_LABELS: Record<string, string> = {
  day: "Día", week: "Semana", month: "Mes", year: "Año"
};

export const AdminStripeSettings: React.FC<Props> = ({ embedded = false }) => {
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [plansExpanded, setPlansExpanded] = useState(true);
  const [chargesExpanded, setChargesExpanded] = useState(false);
  const [charges, setCharges] = useState<CustomCharge[]>([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargeFormVisible, setChargeFormVisible] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [chargeOk, setChargeOk] = useState("");
  const [savingCharge, setSavingCharge] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [newCharge, setNewCharge] = useState<NewChargeForm>({
    userId: "", title: "", description: "", amount: "", currency: "mxn",
    type: "ONE_TIME", interval: "month",
  });

  const [masked, setMasked] = useState({
    source: "env",
    configured: false,
    secretKeyMasked: "",
    publishableKeyMasked: "",
    webhookSecretMasked: "",
  });

  const [form, setForm] = useState({ secretKey: "", publishableKey: "", webhookSecret: "" });
  const [plans, setPlans] = useState<PlanRow[]>([]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [cfg, pl] = await Promise.all([
        api("/api/v1/admin/integrations/stripe"),
        api("/api/v1/admin/integrations/stripe/plans").catch(() => ({ plans: [] })),
      ]);
      setMasked({
        source: cfg.source || "env",
        configured: !!cfg.configured,
        secretKeyMasked: cfg.secretKeyMasked || "",
        publishableKeyMasked: cfg.publishableKeyMasked || "",
        webhookSecretMasked: cfg.webhookSecretMasked || "",
      });
      setPlans(Array.isArray(pl?.plans) ? pl.plans.map((p: any) => ({ ...p, _key: genKey() })) : []);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar la configuración de Stripe");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const saveConfig = async () => {
    setError(""); setOk(""); setTestResult(null);
    const payload: Record<string, string> = {};
    if (form.secretKey.trim()) payload.secretKey = form.secretKey.trim();
    if (form.publishableKey.trim()) payload.publishableKey = form.publishableKey.trim();
    if (form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
    if (Object.keys(payload).length === 0) { setError("Ingresa al menos una clave para guardar"); return; }
    setSavingConfig(true);
    try {
      const out = await api("/api/v1/admin/integrations/stripe", { method: "PUT", body: JSON.stringify(payload) });
      setForm({ secretKey: "", publishableKey: "", webhookSecret: "" });
      setMasked({
        source: out.source || "database",
        configured: !!out.configured,
        secretKeyMasked: out.secretKeyMasked || "",
        publishableKeyMasked: out.publishableKeyMasked || "",
        webhookSecretMasked: out.webhookSecretMasked || "",
      });
      setOk(out.message || "Configuración guardada");
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar la configuración");
    } finally {
      setSavingConfig(false);
    }
  };

  const testStripe = async () => {
    setError(""); setOk(""); setTestResult(null);
    setTesting(true);
    try {
      const out = await api("/api/v1/admin/integrations/stripe/test", { method: "POST" });
      setTestResult({ ok: true, text: `${out.message}${out?.account?.id ? ` · Cuenta: ${out.account.id}` : ""}` });
    } catch (e: any) {
      setTestResult({ ok: false, text: e?.message || "No se pudo validar la conexión con Stripe" });
    } finally {
      setTesting(false);
    }
  };

  const addPlan = () => setPlans((p) => [...p, { _key: genKey(), planCode: "", name: "", amount: 0, interval: "month", stripePriceId: "", active: true }]);
  const updatePlan = (idx: number, key: keyof PlanRow, value: any) =>
    setPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  const removePlan = (idx: number) => setPlans((prev) => prev.filter((_, i) => i !== idx));

  const savePlans = async () => {
    setError(""); setOk("");
    const payload = plans
      .map((p) => ({
        planCode: (p.planCode || "").trim().toLowerCase(),
        name: (p.name || "").trim(),
        amount: Number(p.amount || 0),
        interval: p.interval || "month",
        stripePriceId: (p.stripePriceId || "").trim(),
        active: !!p.active,
      }))
      .filter((p) => p.planCode && p.name);
    if (payload.length === 0) { setError("Debes agregar al menos un plan válido"); return; }
    setSavingPlans(true);
    try {
      const out = await api("/api/v1/admin/integrations/stripe/plans", { method: "PUT", body: JSON.stringify({ plans: payload }) });
      setPlans(out.plans || payload);
      setOk(out.message || "Planes guardados");
    } catch (e: any) {
      setError(e?.message || "No se pudieron guardar los planes");
    } finally {
      setSavingPlans(false);
    }
  };

  const loadCharges = async () => {
    setChargesLoading(true);
    try {
      const out = await api("/api/v1/admin/custom-charges");
      setCharges(Array.isArray(out?.charges) ? out.charges : []);
    } catch { /* silent */ } finally { setChargesLoading(false); }
  };

  const loadUsers = async () => {
    try {
      const out = await api("/admin/users?role=member&limit=100");
      const list = Array.isArray(out?.data) ? out.data : Array.isArray(out?.users) ? out.users : Array.isArray(out) ? out : [];
      setUsers(list.map((u: any) => ({
        id: u.id,
        email: u.email,
        firstName: u.profile?.firstName,
        lastName: u.profile?.lastName,
      })));
    } catch { /* silent */ }
  };

  const openChargesSection = async () => {
    const next = !chargesExpanded;
    setChargesExpanded(next);
    if (next && charges.length === 0) {
      await Promise.all([loadCharges(), loadUsers()]);
    }
  };

  const submitNewCharge = async () => {
    setChargeError(""); setChargeOk("");
    if (!newCharge.userId) { setChargeError("Selecciona un cliente"); return; }
    if (!newCharge.title.trim()) { setChargeError("El concepto es obligatorio"); return; }
    if (!newCharge.amount || Number(newCharge.amount) <= 0) { setChargeError("El monto debe ser mayor a 0"); return; }
    if (Number(newCharge.amount) < 10) { setChargeError("El monto mínimo es $10.00 MXN"); return; }
    setSavingCharge(true);
    try {
      await api("/api/v1/admin/custom-charges", {
        method: "POST",
        body: JSON.stringify({
          userId: newCharge.userId,
          title: newCharge.title.trim(),
          description: newCharge.description.trim() || undefined,
          amount: Number(newCharge.amount),
          currency: newCharge.currency,
          type: newCharge.type,
          interval: newCharge.interval,
        }),
      });
      setChargeOk("Cobro creado y OTP enviado al cliente por correo");
      setNewCharge({ userId: "", title: "", description: "", amount: "", currency: "mxn", type: "ONE_TIME", interval: "month" });
      setChargeFormVisible(false);
      await loadCharges();
    } catch (e: any) {
      setChargeError(e?.message || "No se pudo crear el cobro");
    } finally { setSavingCharge(false); }
  };

  const handleCancelCharge = async (id: string) => {
    if (!confirm("¿Cancelar este cobro? El cliente ya no podrá pagarlo.")) return;
    try {
      await api(`/api/v1/admin/custom-charges/${id}`, { method: "DELETE" });
      setCharges((prev) => prev.map((c) => c.id === id ? { ...c, status: "CANCELLED" } : c));
    } catch (e: any) { setChargeError(e?.message || "No se pudo cancelar el cobro"); }
  };

  const handleResendOtp = async (id: string) => {
    try {
      await api(`/api/v1/admin/custom-charges/${id}/resend`, { method: "POST" });
      setChargeOk("OTP reenviado al cliente");
    } catch (e: any) { setChargeError(e?.message || "No se pudo reenviar el OTP"); }
  };

  const chargeStatusLabel: Record<string, { label: string; cls: string }> = {
    PENDING_ACCEPTANCE: { label: "Pendiente", cls: "text-amber-700 bg-amber-50 border-amber-200" },
    ACCEPTED:           { label: "Aceptado",  cls: "text-blue-700 bg-blue-50 border-blue-200" },
    PAID:               { label: "Pagado",    cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    EXPIRED:            { label: "Expirado",  cls: "text-gray-500 bg-gray-50 border-gray-200" },
    CANCELLED:          { label: "Cancelado", cls: "text-red-600 bg-red-50 border-red-200" },
  };

  const formatAmount = (cents: number, currency: string) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

  const INTERVAL_LABELS: Record<string, string> = { day: "Diario", week: "Semanal", month: "Mensual", year: "Anual" };

  const StatusDot = ({ ok }: { ok: boolean }) => (
    <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-emerald-500" : "bg-amber-400"}`} />
  );

  const content = (
    <div className="space-y-5">
      {/* Feedback — al tope para visibilidad inmediata */}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle size={15} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {ok && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700">{ok}</p>
        </div>
      )}

      {/* Status card */}
      <div className={`rounded-2xl border p-5 ${masked.configured ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {masked.configured
              ? <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
              : <AlertTriangle size={20} className="text-amber-600 shrink-0" />
            }
            <div>
              <p className={`text-sm font-semibold ${masked.configured ? "text-emerald-800" : "text-amber-800"}`}>
                {masked.configured ? "Stripe configurado" : "Configuración incompleta"}
              </p>
              <p className={`text-xs mt-0.5 ${masked.configured ? "text-emerald-600" : "text-amber-600"}`}>
                Fuente: {masked.source === "database" ? "Base de datos" : "Variables de entorno"}
              </p>
            </div>
          </div>
          <button onClick={testStripe} disabled={testing || !masked.configured}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-current text-xs font-medium transition disabled:opacity-40
              text-emerald-700 border-emerald-300 hover:bg-emerald-100">
            {testing ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
            {testing ? "Probando..." : "Probar conexión"}
          </button>
        </div>
        {testResult && (
          <div className={`mt-3 flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl ${testResult.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
            {testResult.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {testResult.text}
          </div>
        )}
      </div>

      {/* Keys — current masked values */}
      {masked.configured && (
        <div className="bg-white rounded-2xl border border-velum-100 p-5 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Claves activas</p>
          {[
            { label: "Secret Key", value: masked.secretKeyMasked },
            { label: "Publishable Key", value: masked.publishableKeyMasked },
            { label: "Webhook Secret", value: masked.webhookSecretMasked },
          ].filter(({ value }) => value).map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-velum-50 last:border-0">
              <span className="text-xs text-velum-500">{label}</span>
              <span className="text-xs font-mono text-velum-700 bg-velum-50 px-2 py-1 rounded-lg">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Update keys */}
      <div className="bg-white rounded-2xl border border-velum-100 p-5 space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-0.5">Actualizar claves</p>
          <p className="text-xs text-velum-400">Deja en blanco los campos que no deseas modificar.</p>
        </div>
        <div className="space-y-3">
          {[
            { key: "secretKey" as const, label: "Secret Key", placeholder: "sk_live_...", type: "password" },
            { key: "publishableKey" as const, label: "Publishable Key", placeholder: "pk_live_...", type: "text" },
            { key: "webhookSecret" as const, label: "Webhook Secret", placeholder: "whsec_...", type: "password" },
          ].map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-velum-600 mb-1.5">{label}</label>
              <input type={type} className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm text-velum-900
                focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition placeholder:text-velum-300"
                placeholder={placeholder} value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
        </div>
        <button onClick={saveConfig} disabled={savingConfig}
          className="w-full bg-velum-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50">
          {savingConfig ? "Guardando..." : "Guardar claves"}
        </button>
      </div>

      {/* Plans */}
      <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
        <button onClick={() => setPlansExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-velum-50 transition">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-velum-900">Planes y membresías</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-velum-400 bg-velum-100 px-2 py-0.5 rounded-full">
              {plans.filter((p) => p.active).length} activos
            </span>
          </div>
          {plansExpanded ? <ChevronUp size={16} className="text-velum-400" /> : <ChevronDown size={16} className="text-velum-400" />}
        </button>

        {plansExpanded && (
          <div className="px-5 pb-5 space-y-3 border-t border-velum-50">
            <p className="text-xs text-velum-400 pt-3">Mapeo plan interno → Stripe Price ID para redirección al checkout.</p>

            {plans.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-velum-400">Sin planes configurados.</p>
                <p className="text-xs text-velum-300 mt-1">Agrega al menos un plan para activar pagos de membresía.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {plans.map((p, idx) => (
                  <div key={p._key} className={`rounded-xl border p-4 space-y-3 transition ${p.active ? "border-velum-200" : "border-velum-100 bg-velum-50/50 opacity-60"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusDot ok={p.active} />
                        <span className="text-sm font-medium text-velum-900">{p.name || <span className="text-velum-300 italic">Sin nombre</span>}</span>
                        {p.planCode && <span className="text-[10px] font-mono text-velum-400 bg-velum-100 px-1.5 py-0.5 rounded">{p.planCode}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-velum-500 cursor-pointer">
                          <input type="checkbox" className="rounded" checked={p.active} onChange={(e) => updatePlan(idx, "active", e.target.checked)} />
                          Activo
                        </label>
                        <button onClick={() => removePlan(idx)} className="p-1.5 rounded-lg text-velum-300 hover:text-red-500 hover:bg-red-50 transition">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Código plan</label>
                        <input className="w-full rounded-lg border border-velum-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700 transition"
                          placeholder="pro_mensual" value={p.planCode} onChange={(e) => updatePlan(idx, "planCode", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Nombre visible</label>
                        <input className="w-full rounded-lg border border-velum-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700 transition"
                          placeholder="Pro Mensual" value={p.name} onChange={(e) => updatePlan(idx, "name", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Monto (MXN)</label>
                        <input type="number" className="w-full rounded-lg border border-velum-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700 transition"
                          placeholder="1500" value={p.amount} onChange={(e) => updatePlan(idx, "amount", Number(e.target.value || 0))} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Ciclo</label>
                        <select className="w-full rounded-lg border border-velum-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700 transition"
                          value={p.interval} onChange={(e) => updatePlan(idx, "interval", e.target.value)}>
                          {Object.entries(INTERVAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Stripe Price ID</label>
                      <input className="w-full rounded-lg border border-velum-200 px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700 transition"
                        placeholder="price_1..." value={p.stripePriceId} onChange={(e) => updatePlan(idx, "stripePriceId", e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button onClick={addPlan}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-velum-200 text-xs font-medium text-velum-700 hover:bg-velum-50 transition">
                <Plus size={13} />Agregar plan
              </button>
              <button onClick={savePlans} disabled={savingPlans || plans.length === 0}
                className="flex-1 bg-velum-900 text-white rounded-xl py-2 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-40">
                {savingPlans ? "Guardando..." : "Guardar planes"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Custom Charges */}
      <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
        <button onClick={openChargesSection}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-velum-50 transition">
          <div className="flex items-center gap-3">
            <CreditCard size={16} className="text-velum-500" />
            <p className="text-sm font-semibold text-velum-900">Cobros personalizados</p>
            <span className="text-[10px] font-bold uppercase tracking-widest text-velum-400 bg-velum-100 px-2 py-0.5 rounded-full">
              {charges.filter((c) => c.status === "PENDING_ACCEPTANCE").length} pendientes
            </span>
          </div>
          {chargesExpanded ? <ChevronUp size={16} className="text-velum-400" /> : <ChevronDown size={16} className="text-velum-400" />}
        </button>

        {chargesExpanded && (
          <div className="px-5 pb-5 border-t border-velum-50 space-y-4">
            <p className="text-xs text-velum-400 pt-3">
              Crea cobros personalizados para clientes. El cliente recibirá un correo con un código OTP para autorizar el pago.
            </p>

            {/* Feedback */}
            {chargeError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <XCircle size={14} className="text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{chargeError}</p>
              </div>
            )}
            {chargeOk && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-700">{chargeOk}</p>
              </div>
            )}

            {/* New charge form */}
            {chargeFormVisible && (
              <div className="bg-velum-50 rounded-2xl border border-velum-200 p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-velum-500">Nuevo cobro</p>

                {/* Client selector */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Cliente</label>
                  <select className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700 bg-white"
                    value={newCharge.userId}
                    onChange={(e) => setNewCharge((p) => ({ ...p, userId: e.target.value }))}>
                    <option value="">Selecciona un cliente...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email} — {u.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Title */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Concepto / Título</label>
                    <input className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700"
                      placeholder="Ej: Sesión adicional zona especial"
                      value={newCharge.title}
                      onChange={(e) => setNewCharge((p) => ({ ...p, title: e.target.value }))} />
                  </div>

                  {/* Description */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Descripción (opcional)</label>
                    <input className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700"
                      placeholder="Detalles adicionales del cobro"
                      value={newCharge.description}
                      onChange={(e) => setNewCharge((p) => ({ ...p, description: e.target.value }))} />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Monto (pesos)</label>
                    <input type="number" min="1"
                      className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700"
                      placeholder="1500"
                      value={newCharge.amount}
                      onChange={(e) => setNewCharge((p) => ({ ...p, amount: e.target.value }))} />
                  </div>

                  {/* Currency */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Moneda</label>
                    <select className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700 bg-white"
                      value={newCharge.currency}
                      onChange={(e) => setNewCharge((p) => ({ ...p, currency: e.target.value }))}>
                      <option value="mxn">MXN — Peso mexicano</option>
                      <option value="usd">USD — Dólar americano</option>
                    </select>
                  </div>

                  {/* Type */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Tipo de cobro</label>
                    <select className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700 bg-white"
                      value={newCharge.type}
                      onChange={(e) => setNewCharge((p) => ({ ...p, type: e.target.value as "ONE_TIME" | "RECURRING" }))}>
                      <option value="ONE_TIME">Pago único</option>
                      <option value="RECURRING">Recurrente (suscripción)</option>
                    </select>
                  </div>

                  {/* Interval (only for RECURRING) */}
                  {newCharge.type === "RECURRING" && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1">Ciclo de cobro</label>
                      <select className="w-full rounded-lg border border-velum-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-velum-900/20 focus:border-velum-700 bg-white"
                        value={newCharge.interval}
                        onChange={(e) => setNewCharge((p) => ({ ...p, interval: e.target.value as any }))}>
                        <option value="day">Diario</option>
                        <option value="week">Semanal</option>
                        <option value="month">Mensual</option>
                        <option value="year">Anual</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setChargeFormVisible(false); setChargeError(""); setChargeOk(""); }}
                    className="px-4 py-2 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-100 transition">
                    Cancelar
                  </button>
                  <button onClick={submitNewCharge} disabled={savingCharge}
                    className="flex-1 flex items-center justify-center gap-2 bg-velum-900 text-white rounded-xl py-2 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50">
                    <Send size={14} />
                    {savingCharge ? "Enviando..." : "Crear cobro y enviar OTP"}
                  </button>
                </div>
              </div>
            )}

            {/* Charges list */}
            {chargesLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => <div key={i} className="h-16 bg-velum-100 rounded-xl animate-pulse" />)}
              </div>
            ) : charges.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-velum-400">Sin cobros personalizados.</p>
                <p className="text-xs text-velum-300 mt-1">Crea el primero con el botón de abajo.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {charges.map((c) => {
                  const st = chargeStatusLabel[c.status] ?? { label: c.status, cls: "text-velum-500 bg-velum-50 border-velum-200" };
                  const clientName = [c.user.profile?.firstName, c.user.profile?.lastName].filter(Boolean).join(" ") || c.user.email;
                  return (
                    <div key={c.id} className="rounded-xl border border-velum-100 p-4 bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-velum-900 truncate">{c.title}</p>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${st.cls}`}>
                              {st.label}
                            </span>
                          </div>
                          <p className="text-xs text-velum-500 mt-0.5">{clientName} · {c.user.email}</p>
                          {c.description && <p className="text-xs text-velum-400 mt-0.5 truncate">{c.description}</p>}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="text-xs font-bold text-velum-800">{formatAmount(c.amount, c.currency)}</span>
                            <span className="text-[10px] text-velum-400">
                              {c.type === "RECURRING" ? `Recurrente · ${INTERVAL_LABELS[c.interval ?? "month"]}` : "Pago único"}
                            </span>
                            <span className="text-[10px] text-velum-300 flex items-center gap-1">
                              <Clock size={10} />
                              {new Date(c.createdAt).toLocaleDateString("es-MX")}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.status === "PENDING_ACCEPTANCE" && (
                            <>
                              <button onClick={() => handleResendOtp(c.id)} title="Reenviar OTP"
                                className="p-1.5 rounded-lg text-velum-400 hover:text-blue-600 hover:bg-blue-50 transition">
                                <RotateCcw size={13} />
                              </button>
                              <button onClick={() => handleCancelCharge(c.id)} title="Cancelar cobro"
                                className="p-1.5 rounded-lg text-velum-400 hover:text-red-500 hover:bg-red-50 transition">
                                <Ban size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!chargeFormVisible && (
              <button onClick={() => { setChargeFormVisible(true); setChargeError(""); setChargeOk(""); if (users.length === 0) loadUsers(); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-velum-200 text-xs font-medium text-velum-700 hover:bg-velum-50 transition">
                <Plus size={13} />Nuevo cobro personalizado
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-velum-100 rounded-2xl animate-pulse" />)}
      </div>
    );
  }

  if (embedded) return content;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Configuración Stripe</h1>
          <p className="text-sm text-velum-500 mt-1">Pagos y membresías en línea</p>
        </div>
        <Link to="/admin" className="px-4 py-2 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition">
          Volver
        </Link>
      </div>
      {content}
    </div>
  );
};

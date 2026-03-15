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

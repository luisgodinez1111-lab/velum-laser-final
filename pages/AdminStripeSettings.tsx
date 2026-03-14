import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Props = { embedded?: boolean };

type PlanRow = {
  planCode: string;
  name: string;
  amount: number;
  interval: "day" | "week" | "month" | "year";
  stripePriceId: string;
  active: boolean;
};

const api = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.message || `Error ${res.status}`);
  return data;
};

export const AdminStripeSettings: React.FC<Props> = ({ embedded = false }) => {
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [masked, setMasked] = useState({
    source: "env",
    configured: false,
    secretKeyMasked: "",
    publishableKeyMasked: "",
    webhookSecretMasked: "",
  });

  const [form, setForm] = useState({
    secretKey: "",
    publishableKey: "",
    webhookSecret: "",
  });

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

      const incoming: PlanRow[] = Array.isArray(pl?.plans) ? pl.plans : [];
      setPlans(incoming);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar Stripe");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const saveConfig = async () => {
    setError("");
    setOk("");
    const payload: Record<string, string> = {};
    if (form.secretKey.trim()) payload.secretKey = form.secretKey.trim();
    if (form.publishableKey.trim()) payload.publishableKey = form.publishableKey.trim();
    if (form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim();
    if (Object.keys(payload).length === 0) {
      setError("Ingresa al menos una clave para guardar");
      return;
    }

    setSavingConfig(true);
    try {
      const out = await api("/api/v1/admin/integrations/stripe", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setForm({ secretKey: "", publishableKey: "", webhookSecret: "" });
      setMasked({
        source: out.source || "database",
        configured: !!out.configured,
        secretKeyMasked: out.secretKeyMasked || "",
        publishableKeyMasked: out.publishableKeyMasked || "",
        webhookSecretMasked: out.webhookSecretMasked || "",
      });
      setOk(out.message || "Configuración Stripe guardada");
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar configuración");
    } finally {
      setSavingConfig(false);
    }
  };

  const testStripe = async () => {
    setError("");
    setOk("");
    setTesting(true);
    try {
      const out = await api("/api/v1/admin/integrations/stripe/test", { method: "POST" });
      setOk(`${out.message}${out?.account?.id ? ` (account: ${out.account.id})` : ""}`);
    } catch (e: any) {
      setError(e?.message || "No se pudo validar Stripe");
    } finally {
      setTesting(false);
    }
  };

  const addPlan = () => {
    setPlans((prev) => [
      ...prev,
      { planCode: "", name: "", amount: 0, interval: "month", stripePriceId: "", active: true },
    ]);
  };

  const updatePlan = (idx: number, key: keyof PlanRow, value: any) => {
    setPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, [key]: value } : p)));
  };

  const removePlan = (idx: number) => {
    setPlans((prev) => prev.filter((_, i) => i !== idx));
  };

  const savePlans = async () => {
    setError("");
    setOk("");

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

    if (payload.length === 0) {
      setError("Debes agregar al menos un plan válido");
      return;
    }

    setSavingPlans(true);
    try {
      const out = await api("/api/v1/admin/integrations/stripe/plans", {
        method: "PUT",
        body: JSON.stringify({ plans: payload }),
      });
      setPlans(out.plans || payload);
      setOk(out.message || "Planes Stripe guardados");
    } catch (e: any) {
      setError(e?.message || "No se pudieron guardar planes");
    } finally {
      setSavingPlans(false);
    }
  };

  return (
    <div className={embedded ? "space-y-6" : "max-w-6xl mx-auto px-4 py-10 space-y-6"}>
      {!embedded && (
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-3xl font-serif text-velum-900">Configuración Stripe</h1>
          <Link to="/admin" className="rounded-xl border border-velum-300 px-4 py-2 text-sm text-velum-700 hover:border-velum-600">
            Volver a Admin
          </Link>
        </div>
      )}

      <div className="rounded-2xl border border-velum-200 bg-white p-6 space-y-3">
        <p className="text-sm text-velum-600">
          Estado: {masked.configured ? "Configurado" : "Incompleto"} · Fuente: {masked.source}
        </p>
        <p className="text-xs text-velum-500">Secret actual: {masked.secretKeyMasked || "N/A"}</p>
        <p className="text-xs text-velum-500">Publishable actual: {masked.publishableKeyMasked || "N/A"}</p>
        <p className="text-xs text-velum-500">Webhook actual: {masked.webhookSecretMasked || "N/A"}</p>

        <div className="grid gap-3">
          <input className="rounded-xl border border-velum-300 px-4 py-3 text-sm" type="password" placeholder="STRIPE_SECRET_KEY (sk_live_...)" value={form.secretKey} onChange={(e) => setForm((p) => ({ ...p, secretKey: e.target.value }))} />
          <input className="rounded-xl border border-velum-300 px-4 py-3 text-sm" placeholder="STRIPE_PUBLISHABLE_KEY (pk_live_...)" value={form.publishableKey} onChange={(e) => setForm((p) => ({ ...p, publishableKey: e.target.value }))} />
          <input className="rounded-xl border border-velum-300 px-4 py-3 text-sm" type="password" placeholder="STRIPE_WEBHOOK_SECRET (whsec_...)" value={form.webhookSecret} onChange={(e) => setForm((p) => ({ ...p, webhookSecret: e.target.value }))} />
        </div>

        <div className="flex gap-2">
          <button disabled={loading || savingConfig} onClick={saveConfig} className="rounded-xl bg-velum-900 text-white px-4 py-2 text-sm">
            {savingConfig ? "Guardando..." : "Guardar configuración"}
          </button>
          <button disabled={loading || testing} onClick={testStripe} className="rounded-xl border border-velum-300 px-4 py-2 text-sm text-velum-700">
            {testing ? "Probando..." : "Probar conexión"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-velum-200 bg-white p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-serif text-velum-900">Planes Stripe (mapeo membresía → price_id)</h2>
          <button className="rounded-xl border border-velum-300 px-3 py-2 text-sm text-velum-700" onClick={addPlan}>Agregar plan</button>
        </div>

        <div className="space-y-3">
          {plans.map((p, idx) => (
            <div key={idx} className="grid md:grid-cols-7 gap-2 border border-velum-200 rounded-xl p-3">
              <input className="rounded-lg border border-velum-300 px-3 py-2 text-sm" placeholder="plan_code (ej: pro_mensual)" value={p.planCode} onChange={(e) => updatePlan(idx, "planCode", e.target.value)} />
              <input className="rounded-lg border border-velum-300 px-3 py-2 text-sm" placeholder="name (ej: Pro Mensual)" value={p.name} onChange={(e) => updatePlan(idx, "name", e.target.value)} />
              <input className="rounded-lg border border-velum-300 px-3 py-2 text-sm" type="number" placeholder="amount" value={p.amount} onChange={(e) => updatePlan(idx, "amount", Number(e.target.value || 0))} />
              <select className="rounded-lg border border-velum-300 px-3 py-2 text-sm" value={p.interval} onChange={(e) => updatePlan(idx, "interval", e.target.value)}>
                <option value="day">day</option>
                <option value="week">week</option>
                <option value="month">month</option>
                <option value="year">year</option>
              </select>
              <input className="rounded-lg border border-velum-300 px-3 py-2 text-sm md:col-span-2" placeholder="stripe_price_id (price_...)" value={p.stripePriceId} onChange={(e) => updatePlan(idx, "stripePriceId", e.target.value)} />
              <div className="flex items-center gap-2">
                <label className="text-xs text-velum-700 flex items-center gap-2">
                  <input type="checkbox" checked={!!p.active} onChange={(e) => updatePlan(idx, "active", e.target.checked)} />
                  active
                </label>
                <button className="rounded-lg border border-red-300 text-red-700 px-2 py-1 text-xs" onClick={() => removePlan(idx)}>Quitar</button>
              </div>
            </div>
          ))}

          {plans.length === 0 && <p className="text-sm text-velum-500">Sin planes configurados.</p>}
        </div>

        <div>
          <button disabled={loading || savingPlans} onClick={savePlans} className="rounded-xl bg-velum-900 text-white px-4 py-2 text-sm">
            {savingPlans ? "Guardando..." : "Guardar planes"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-700">{ok}</p>}
    </div>
  );
};

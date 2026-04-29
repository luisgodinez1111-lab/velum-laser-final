import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui";
import { apiFetch, ApiError } from "../services/apiClient";

type Row = {
  userId: string;
  email: string;
  onboardingStatus?: string;
  phototype?: string;
};

const LIST_PATHS = ["/api/admin/members/onboarding", "/api/admin/member-onboarding"];
const DETAIL_PATHS = (id: string) => [`/api/admin/members/onboarding/${id}`, `/api/admin/member-onboarding/${id}`];

const requestWithFallback = async <T,>(paths: string[], init?: RequestInit): Promise<T> => {
  let lastError = "Servicio no disponible.";
  for (const path of paths) {
    try {
      return await apiFetch<T>(path.replace(/^\/api/, ""), init);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) continue;
      lastError = e instanceof Error ? e.message : lastError;
    }
  }
  throw new Error(lastError);
};

export const OnboardingAdmin: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const allowed = useMemo(() => user?.role === "admin" || user?.role === "staff", [user?.role]);

  useEffect(() => {
    if (!isAuthenticated || !allowed) return;
    setLoading(true);
    requestWithFallback<any>(LIST_PATHS)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.items ?? data?.rows ?? [];
        setRows(
          list.map((item: any) => ({
            userId: item.userId ?? item.user?.id ?? item.id,
            email: item.email ?? item.user?.email ?? "(sin correo)",
            onboardingStatus: item.onboardingStatus ?? item.status,
            phototype: item.phototype ?? item.p2Assessment?.phototype
          }))
        );
      })
      .catch((e: any) => setMsg(e?.message ?? "No se pudo cargar onboarding."))
      .finally(() => setLoading(false));
  }, [isAuthenticated, allowed]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    requestWithFallback<any>(DETAIL_PATHS(selectedId))
      .then((data) => setDetail(data))
      .catch((e: any) => setMsg(e?.message ?? "No se pudo cargar detalle."))
      .finally(() => setLoading(false));
  }, [selectedId]);

  if (!isAuthenticated) return <div className="max-w-4xl mx-auto px-4 py-12">Inicia sesión para continuar.</div>;
  if (!allowed) return <div className="max-w-4xl mx-auto px-4 py-12">Acceso restringido a staff/admin.</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <h1 className="font-sans font-bold text-velum-900 text-3xl tracking-[-0.025em] mb-2">Onboarding clínico</h1>
      <p className="text-[14px] text-velum-600 mb-6">Vista de historial clínico, P2/fototipo y contrato firmado.</p>
      {msg && <p className="text-[14px] text-danger-700 mb-4">{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-velum-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-velum-200 text-[10px] uppercase tracking-[0.18em] font-bold text-velum-500">Pacientes</div>
          <div className="max-h-[70vh] overflow-auto">
            {rows.map((row) => (
              <button
                key={row.userId}
                onClick={() => setSelectedId(row.userId)}
                className={`w-full text-left p-4 border-b border-velum-100 hover:bg-velum-50 transition-colors duration-base ease-standard ${selectedId === row.userId ? "bg-velum-100" : ""}`}
              >
                <p className="text-[14px] font-semibold text-velum-900">{row.email}</p>
                <p className="text-[12px] text-velum-500 mt-0.5">Estado: {row.onboardingStatus ?? "pendiente"}</p>
                <p className="text-[12px] text-velum-500">Fototipo: {row.phototype ?? "-"}</p>
              </button>
            ))}
            {!rows.length && !loading && <p className="p-4 text-[13px] text-velum-500">Sin registros.</p>}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-velum-200 bg-white p-6">
          {!selectedId && <p className="text-[14px] text-velum-500">Selecciona un paciente para ver detalle.</p>}
          {!!selectedId && loading && <p className="text-[14px] text-velum-500">Cargando detalle...</p>}
          {!!selectedId && !loading && detail && (
            <div className="space-y-6">
              <div>
                <h2 className="font-sans font-bold text-velum-900 text-2xl tracking-tight">{detail?.user?.email ?? "Paciente"}</h2>
                <p className="text-[12px] text-velum-500 mt-1 tabular-nums">ID: {detail?.user?.id ?? selectedId}</p>
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-[0.18em] font-bold text-velum-500 mb-2">Historial clínico</h3>
                <pre className="text-[12px] bg-velum-50 border border-velum-200 rounded-xl p-3 overflow-auto">{JSON.stringify(detail?.clinicalHistory ?? detail?.clinical ?? {}, null, 2)}</pre>
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-[0.18em] font-bold text-velum-500 mb-2">P2 / Fototipo</h3>
                <pre className="text-[12px] bg-velum-50 border border-velum-200 rounded-xl p-3 overflow-auto">{JSON.stringify(detail?.p2Assessment ?? detail?.p2 ?? {}, null, 2)}</pre>
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-[0.18em] font-bold text-velum-500 mb-2">Contrato</h3>
                {((detail?.contractSignature?.signatureDataUrl ?? detail?.contract?.signatureDataUrl ?? detail?.contract?.signature) as string | undefined) ? (
                  <img
                    src={(detail?.contractSignature?.signatureDataUrl ?? detail?.contract?.signatureDataUrl ?? detail?.contract?.signature) as string}
                    alt="Firma contrato"
                    className="max-h-40 rounded-xl border border-velum-200 bg-white"
                  />
                ) : (
                  <p className="text-[12px] text-velum-500">Sin firma disponible en respuesta.</p>
                )}
                <pre className="text-[12px] bg-velum-50 border border-velum-200 rounded-xl p-3 mt-2 overflow-auto">{JSON.stringify(detail?.contractSignature ?? detail?.contract ?? {}, null, 2)}</pre>
              </div>

              <Button variant="outline" onClick={() => setSelectedId("")}>Cerrar detalle</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

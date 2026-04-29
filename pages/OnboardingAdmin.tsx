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
      <h1 className="font-serif text-3xl italic text-velum-900 mb-2">Onboarding Clínico</h1>
      <p className="text-sm text-velum-600 mb-6">Vista de historial clínico, P2/fototipo y contrato firmado.</p>
      {msg && <p className="text-sm text-red-600 mb-4">{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border border-velum-200 bg-white">
          <div className="p-4 border-b border-velum-200 text-xs uppercase tracking-widest font-bold">Pacientes</div>
          <div className="max-h-[70vh] overflow-auto">
            {rows.map((row) => (
              <button
                key={row.userId}
                onClick={() => setSelectedId(row.userId)}
                className={`w-full text-left p-4 border-b border-velum-100 hover:bg-velum-50 ${selectedId === row.userId ? "bg-velum-100" : ""}`}
              >
                <p className="text-sm font-bold text-velum-900">{row.email}</p>
                <p className="text-xs text-velum-500">Estado: {row.onboardingStatus ?? "pendiente"}</p>
                <p className="text-xs text-velum-500">Fototipo: {row.phototype ?? "-"}</p>
              </button>
            ))}
            {!rows.length && !loading && <p className="p-4 text-sm text-velum-500">Sin registros.</p>}
          </div>
        </div>

        <div className="lg:col-span-2 border border-velum-200 bg-white p-6">
          {!selectedId && <p className="text-sm text-velum-500">Selecciona un paciente para ver detalle.</p>}
          {!!selectedId && loading && <p className="text-sm text-velum-500">Cargando detalle...</p>}
          {!!selectedId && !loading && detail && (
            <div className="space-y-6">
              <div>
                <h2 className="font-serif text-2xl text-velum-900">{detail?.user?.email ?? "Paciente"}</h2>
                <p className="text-xs text-velum-500">ID: {detail?.user?.id ?? selectedId}</p>
              </div>

              <div>
                <h3 className="text-sm uppercase tracking-widest font-bold text-velum-700 mb-2">Historial Clínico</h3>
                <pre className="text-xs bg-velum-50 border border-velum-200 p-3 overflow-auto">{JSON.stringify(detail?.clinicalHistory ?? detail?.clinical ?? {}, null, 2)}</pre>
              </div>

              <div>
                <h3 className="text-sm uppercase tracking-widest font-bold text-velum-700 mb-2">P2 / Fototipo</h3>
                <pre className="text-xs bg-velum-50 border border-velum-200 p-3 overflow-auto">{JSON.stringify(detail?.p2Assessment ?? detail?.p2 ?? {}, null, 2)}</pre>
              </div>

              <div>
                <h3 className="text-sm uppercase tracking-widest font-bold text-velum-700 mb-2">Contrato</h3>
                {((detail?.contractSignature?.signatureDataUrl ?? detail?.contract?.signatureDataUrl ?? detail?.contract?.signature) as string | undefined) ? (
                  <img
                    src={(detail?.contractSignature?.signatureDataUrl ?? detail?.contract?.signatureDataUrl ?? detail?.contract?.signature) as string}
                    alt="Firma contrato"
                    className="max-h-40 border border-velum-200 bg-white"
                  />
                ) : (
                  <p className="text-xs text-velum-500">Sin firma disponible en respuesta.</p>
                )}
                <pre className="text-xs bg-velum-50 border border-velum-200 p-3 mt-2 overflow-auto">{JSON.stringify(detail?.contractSignature ?? detail?.contract ?? {}, null, 2)}</pre>
              </div>

              <Button variant="outline" onClick={() => setSelectedId("")}>Cerrar Detalle</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

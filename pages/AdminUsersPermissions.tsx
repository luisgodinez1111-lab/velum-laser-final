import React, { useEffect, useMemo, useState } from "react";

type PermissionItem = { code: string; label: string; description: string };
type UserRow = {
  id: string;
  email: string;
  role: "admin" | "staff" | "member" | "system";
  kind: "administrativo" | "paciente";
  createdAt: string;
  permissions: string[];
};

type Props = { embedded?: boolean };

const api = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
};

export const AdminUsersPermissions: React.FC<Props> = ({ embedded = false }) => {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [catalog, setCatalog] = useState<PermissionItem[]>([]);

  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "staff" | "member">("staff");

  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [permDrafts, setPermDrafts] = useState<Record<string, string[]>>({});
  const [resetDrafts, setResetDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const out = await api("/api/v1/admin/access/users");
      const list: UserRow[] = out.users || [];
      setUsers(list);
      setCatalog(out.permissionsCatalog || []);
      const nextRoles: Record<string, string> = {};
      const nextPerms: Record<string, string[]> = {};
      list.forEach((u) => {
        nextRoles[u.id] = u.role;
        nextPerms[u.id] = u.permissions || [];
      });
      setRoleDrafts(nextRoles);
      setPermDrafts(nextPerms);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar usuarios/permisos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const canHavePermissions = (role: string) => role === "admin" || role === "staff";

  const togglePerm = (userId: string, code: string) => {
    setPermDrafts((prev) => {
      const current = prev[userId] || [];
      const next = current.includes(code)
        ? current.filter((x) => x !== code)
        : [...current, code];
      return { ...prev, [userId]: next };
    });
  };

  const createUser = async () => {
    setError("");
    setMessage("");
    try {
      await api("/api/v1/admin/access/users", {
        method: "POST",
        body: JSON.stringify({
          email: createEmail.trim(),
          password: createPassword,
          role: createRole,
        }),
      });
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("staff");
      setMessage("Usuario creado");
      await load();
    } catch (e: any) {
      setError(e?.message || "No se pudo crear usuario");
    }
  };

  const saveUser = async (u: UserRow) => {
    setError("");
    setMessage("");
    try {
      await api(`/api/v1/admin/access/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: roleDrafts[u.id] || u.role,
          permissions: permDrafts[u.id] || [],
        }),
      });
      setMessage(`Usuario actualizado: ${u.email}`);
      await load();
    } catch (e: any) {
      setError(e?.message || "No se pudo actualizar usuario");
    }
  };

  const resetPassword = async (u: UserRow) => {
    const pass = (resetDrafts[u.id] || "").trim();
    if (pass.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    setError("");
    setMessage("");
    try {
      await api(`/api/v1/admin/access/users/${u.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: pass }),
      });
      setResetDrafts((prev) => ({ ...prev, [u.id]: "" }));
      setMessage(`Contraseña actualizada: ${u.email}`);
    } catch (e: any) {
      setError(e?.message || "No se pudo actualizar contraseña");
    }
  };

  const sorted = useMemo(
    () => [...users].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [users]
  );

  return (
    <div className={embedded ? "space-y-4" : "max-w-6xl mx-auto px-4 py-10 space-y-6"}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-serif text-velum-900">Usuarios y permisos</h1>
          <a href="#/admin" className="rounded-xl border border-velum-300 px-4 py-2 text-sm text-velum-700 hover:border-velum-600">
            Volver a Admin
          </a>
        </div>
      )}

      <div className="bg-white border border-velum-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-lg font-serif text-velum-900">Crear usuario administrativo o paciente</h2>
        <p className="text-xs text-velum-500">Paciente = role member</p>
        <div className="grid md:grid-cols-4 gap-3">
          <input className="rounded-xl border border-velum-300 px-3 py-2 text-sm" placeholder="correo@dominio.com" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
          <input className="rounded-xl border border-velum-300 px-3 py-2 text-sm" type="password" placeholder="Contraseña temporal" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} />
          <select className="rounded-xl border border-velum-300 px-3 py-2 text-sm" value={createRole} onChange={(e) => setCreateRole(e.target.value as any)}>
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
            <option value="member">Paciente</option>
          </select>
          <button className="rounded-xl bg-velum-900 text-white px-3 py-2 text-sm" onClick={createUser}>Crear usuario</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-700">{message}</p>}

      <div className="bg-white border border-velum-200 rounded-2xl p-5">
        <h2 className="text-lg font-serif text-velum-900 mb-4">Matriz de usuarios, roles y permisos</h2>
        {loading ? (
          <p className="text-sm text-velum-500">Cargando...</p>
        ) : (
          <div className="space-y-4">
            {sorted.map((u) => (
              <div key={u.id} className="border border-velum-200 rounded-xl p-4 space-y-3">
                <div className="grid md:grid-cols-5 gap-3 items-center">
                  <div>
                    <p className="text-sm font-semibold text-velum-900">{u.email}</p>
                    <p className="text-xs text-velum-500">{u.kind}</p>
                  </div>
                  <select className="rounded-xl border border-velum-300 px-3 py-2 text-sm" value={roleDrafts[u.id] || u.role} onChange={(e) => setRoleDrafts((p) => ({ ...p, [u.id]: e.target.value }))}>
                    <option value="admin">admin</option>
                    <option value="staff">staff</option>
                    <option value="member">member (paciente)</option>
                    {u.role === "system" && <option value="system">system</option>}
                  </select>
                  <input type="password" className="rounded-xl border border-velum-300 px-3 py-2 text-sm" placeholder="Nueva contraseña" value={resetDrafts[u.id] || ""} onChange={(e) => setResetDrafts((p) => ({ ...p, [u.id]: e.target.value }))} />
                  <button className="rounded-xl border border-velum-300 px-3 py-2 text-sm text-velum-700" onClick={() => resetPassword(u)}>Reset password</button>
                  <button className="rounded-xl bg-velum-900 text-white px-3 py-2 text-sm" onClick={() => saveUser(u)}>Guardar usuario</button>
                </div>

                {canHavePermissions(roleDrafts[u.id] || u.role) && (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {catalog.map((perm) => {
                      const enabled = (permDrafts[u.id] || []).includes(perm.code);
                      return (
                        <button
                          key={perm.code}
                          type="button"
                          className={`text-left border rounded-lg px-3 py-2 text-xs ${enabled ? "border-velum-900 bg-velum-900 text-white" : "border-velum-300 bg-velum-50 text-velum-700"}`}
                          onClick={() => togglePerm(u.id, perm.code)}
                        >
                          <p className="font-semibold">{perm.label}</p>
                          <p className={enabled ? "text-white/80" : "text-velum-500"}>{perm.description}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {sorted.length === 0 && <p className="text-sm text-velum-500">No hay usuarios.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

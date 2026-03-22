import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../services/apiClient";
import {
  CheckCircle2,
  XCircle,
  Shield,
  User,
  Users,
  Eye,
  EyeOff,
  RefreshCw,
  Plus,
  Trash2,
  AlertTriangle,
} from "lucide-react";

type PermissionItem = { code: string; label: string; description: string };
type UserRole = "admin" | "staff" | "member" | "system";
type UserRow = {
  id: string;
  email: string;
  role: UserRole;
  kind: "administrativo" | "paciente";
  isActive: boolean;
  deactivatedAt?: string | null;
  membershipStatus?: string | null;
  createdAt: string;
  permissions: string[];
};
type Props = { embedded?: boolean };

const api = (path: string, init?: RequestInit) =>
  apiFetch<any>(path.replace(/^\/api/, ""), init);

const ROLE_CONFIG: Record<string, { label: string; cls: string }> = {
  admin:  { label: "Admin",   cls: "bg-velum-900 text-white" },
  staff:  { label: "Staff",   cls: "bg-velum-100 text-velum-700 border border-velum-200" },
  member: { label: "Paciente", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  system: { label: "Sistema", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
};

const initials = (email: string) => {
  const [local = ''] = email.split('@');
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
};

export const AdminUsersPermissions: React.FC<Props> = ({ embedded = false }) => {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [catalog, setCatalog] = useState<PermissionItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const PAGE_LIMIT = 50;

  // Create form
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showCreatePwd, setShowCreatePwd] = useState(false);
  const [createRole, setCreateRole] = useState<"admin" | "staff" | "member">("staff");
  const [isCreating, setIsCreating] = useState(false);
  const [createExpanded, setCreateExpanded] = useState(false);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterRole, setFilterRole] = useState<"all" | UserRole>("all");

  // Delete + OTP state
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleteOtpSent, setDeleteOtpSent] = useState(false);
  const [deleteOtpCode, setDeleteOtpCode] = useState("");
  const [deleteOtpMsg, setDeleteOtpMsg] = useState("");
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Per-user drafts
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [permDrafts, setPermDrafts] = useState<Record<string, string[]>>({});
  const [resetDrafts, setResetDrafts] = useState<Record<string, string>>({});
  const [showResetPwd, setShowResetPwd] = useState<Record<string, boolean>>({});
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [resettingPwd, setResettingPwd] = useState<string | null>(null);

  const load = async (targetPage = page) => {
    setLoading(true);
    setError("");
    try {
      const out = await api(`/api/v1/admin/access/users?page=${targetPage}&limit=${PAGE_LIMIT}`);
      const list: UserRow[] = out.users || [];
      setUsers(list);
      setCatalog(out.permissionsCatalog || []);
      setTotalUsers(out.total ?? list.length);
      setTotalPages(out.pages ?? 1);
      const nextRoles: Record<string, string> = {};
      const nextPerms: Record<string, string[]> = {};
      list.forEach((u) => { nextRoles[u.id] = u.role; nextPerms[u.id] = u.permissions || []; });
      setRoleDrafts(nextRoles);
      setPermDrafts(nextPerms);
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(page); }, [page]);

  const canHavePermissions = (role: string) => role === "admin" || role === "staff";

  const togglePerm = (userId: string, code: string) =>
    setPermDrafts((prev) => {
      const current = prev[userId] || [];
      const next = current.includes(code) ? current.filter((x) => x !== code) : [...current, code];
      return { ...prev, [userId]: next };
    });

  const createUser = async () => {
    setError(""); setMessage("");
    if (!createEmail.trim()) { setError("El correo es obligatorio"); return; }
    if (createRole === "member" && createPassword.length < 8) { setError("La contraseña debe tener al menos 8 caracteres"); return; }
    setIsCreating(true);
    try {
      const body: any = { email: createEmail.trim(), role: createRole };
      if (createRole === "member") body.password = createPassword;
      await api("/api/v1/admin/access/users", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCreateEmail(""); setCreatePassword(""); setCreateRole("staff");
      setCreateExpanded(false);
      setMessage(
        createRole === "admin" || createRole === "staff"
          ? "Usuario creado. Se envió correo con credenciales temporales."
          : "Usuario creado correctamente"
      );
      await load();
    } catch (e: any) {
      setError(e?.message || "No se pudo crear el usuario");
    } finally {
      setIsCreating(false);
    }
  };

  const saveUser = async (u: UserRow) => {
    setError(""); setMessage("");
    setSavingUser(u.id);
    try {
      await api(`/api/v1/admin/access/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: roleDrafts[u.id] || u.role, permissions: permDrafts[u.id] || [] }),
      });
      setMessage(`Usuario actualizado: ${u.email}`);
      await load();
    } catch (e: any) {
      setError(e?.message || "No se pudo actualizar el usuario");
    } finally {
      setSavingUser(null);
    }
  };

  const resetPassword = async (u: UserRow) => {
    const pass = (resetDrafts[u.id] || "").trim();
    if (pass.length < 8) { setError("La nueva contraseña debe tener al menos 8 caracteres"); return; }
    setError(""); setMessage("");
    setResettingPwd(u.id);
    try {
      await api(`/api/v1/admin/access/users/${u.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: pass }),
      });
      setResetDrafts((prev) => ({ ...prev, [u.id]: "" }));
      setMessage(`Contraseña actualizada: ${u.email}`);
    } catch (e: any) {
      setError(e?.message || "No se pudo actualizar la contraseña");
    } finally {
      setResettingPwd(null);
    }
  };

  const openDeleteModal = (u: UserRow) => {
    setDeleteTarget(u);
    setDeleteOtpSent(false);
    setDeleteOtpCode("");
    setDeleteOtpMsg("");
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteOtpSent(false);
    setDeleteOtpCode("");
    setDeleteOtpMsg("");
  };

  const requestDeleteOtp = async () => {
    if (!deleteTarget) return;
    setIsRequestingOtp(true);
    setDeleteOtpMsg("");
    try {
      const out = await api(`/api/v1/admin/access/users/${deleteTarget.id}/request-delete-otp`, {
        method: "POST",
      });
      setDeleteOtpSent(true);
      setDeleteOtpMsg(out?.message ?? "Código enviado");
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch (e: any) {
      setDeleteOtpMsg(e?.message ?? "No se pudo enviar el código OTP");
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget || !deleteOtpCode.trim()) return;
    setIsDeletingUser(true);
    setDeleteOtpMsg("");
    try {
      const out = await api(`/api/v1/admin/access/users/${deleteTarget.id}`, {
        method: "DELETE",
        body: JSON.stringify({ otp: deleteOtpCode.trim() }),
      });
      setMessage(out?.message ?? `Usuario eliminado`);
      closeDeleteModal();
      setExpandedUser(null);
      await load();
    } catch (e: any) {
      setDeleteOtpMsg(e?.message ?? "No se pudo eliminar el usuario");
    } finally {
      setIsDeletingUser(false);
    }
  };

  const [togglingActive, setTogglingActive] = useState<string | null>(null);

  const toggleActive = async (u: UserRow) => {
    if (u.isActive) {
      const confirmed = window.confirm(
        `¿Desactivar a ${u.email}?\nEsto cancelará su suscripción en Stripe y bloqueará su acceso inmediatamente.`
      );
      if (!confirmed) return;
    }
    setTogglingActive(u.id);
    setError(""); setMessage("");
    try {
      const action = u.isActive ? "deactivate" : "activate";
      const out = await api(`/api/v1/admin/access/users/${u.id}/${action}`, { method: "PATCH" });
      setMessage(out?.message ?? (u.isActive ? "Usuario desactivado" : "Usuario activado"));
      await load();
    } catch (e: any) {
      setError(e?.message ?? "No se pudo cambiar el estado del usuario");
    } finally {
      setTogglingActive(null);
    }
  };

  const sorted = useMemo(() => {
    return [...users]
      .filter((u) => {
        if (filterStatus === "active" && !u.isActive) return false;
        if (filterStatus === "inactive" && u.isActive) return false;
        if (filterRole !== "all" && u.role !== filterRole) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [users, filterStatus, filterRole]);

  const hasDirtyDrafts = useMemo(() =>
    users.some((u) =>
      roleDrafts[u.id] !== u.role ||
      JSON.stringify([...(permDrafts[u.id] || [])].sort()) !== JSON.stringify([...(u.permissions || [])].sort())
    ), [users, roleDrafts, permDrafts]);

  const changePage = (next: number) => {
    if (hasDirtyDrafts && !window.confirm("Tienes cambios sin guardar en esta página. ¿Cambiar de página y descartarlos?")) return;
    setPage(next);
  };

  const adminCount = users.filter((u) => u.role === "admin").length;
  const staffCount = users.filter((u) => u.role === "staff").length;
  const memberCount = users.filter((u) => u.role === "member").length;

  const content = (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Administradores", value: adminCount, icon: <Shield size={14} />, cls: "text-velum-900" },
          { label: "Staff", value: staffCount, icon: <Users size={14} />, cls: "text-velum-700" },
          { label: "Pacientes", value: memberCount, icon: <User size={14} />, cls: "text-emerald-700" },
        ].map(({ label, value, icon, cls }) => (
          <div key={label} className="bg-white rounded-2xl border border-velum-100 p-4">
            <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest mb-2 ${cls}`}>{icon}{label}</div>
            <p className={`text-2xl font-serif font-bold ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <XCircle size={15} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {message && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700">{message}</p>
        </div>
      )}

      {/* Create user */}
      <div className="bg-white rounded-2xl border border-velum-100 overflow-hidden">
        <button onClick={() => setCreateExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-velum-50 transition">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-velum-900 flex items-center justify-center">
              <Plus size={14} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-velum-900">Crear nuevo usuario</p>
          </div>
          <span className="text-xs text-velum-400">{createExpanded ? "Cerrar" : "Expandir"}</span>
        </button>
        {createExpanded && (
          <div className="px-5 pb-5 space-y-3 border-t border-velum-50 pt-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1.5">Correo electrónico</label>
                <input type="email" className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
                  placeholder="correo@dominio.com" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
              </div>
              {createRole === "member" ? (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1.5">Contraseña temporal</label>
                  <div className="relative">
                    <input type={showCreatePwd ? "text" : "password"}
                      className="w-full rounded-xl border border-velum-200 px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
                      placeholder="Mín. 8 caracteres" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} />
                    <button type="button" onClick={() => setShowCreatePwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-velum-400 hover:text-velum-700 transition">
                      {showCreatePwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-velum-50 border border-velum-100 px-3.5 py-3">
                  <Shield size={13} className="text-velum-400 shrink-0" />
                  <p className="text-xs text-velum-500">Se enviará contraseña temporal por correo electrónico al nuevo {createRole === "admin" ? "administrador" : "staff"}.</p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1.5">Rol</label>
              <div className="flex gap-2">
                {(["admin", "staff", "member"] as const).map((r) => {
                  const cfg = ROLE_CONFIG[r];
                  return (
                    <button key={r} onClick={() => setCreateRole(r)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition border ${createRole === r ? cfg.cls + " ring-2 ring-velum-900/20" : "border-velum-200 text-velum-500 hover:bg-velum-50"}`}>
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={createUser} disabled={isCreating}
              className="w-full bg-velum-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50">
              {isCreating ? "Creando..." : "Crear usuario"}
            </button>
          </div>
        )}
      </div>

      {/* Users list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400">Usuarios del sistema</p>
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs text-velum-400 hover:text-velum-700 transition">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />Actualizar
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl overflow-hidden border border-velum-200 text-xs">
            {(["all", "active", "inactive"] as const).map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 font-medium transition ${filterStatus === s ? "bg-velum-900 text-white" : "bg-white text-velum-500 hover:bg-velum-50"}`}>
                {s === "all" ? "Todos" : s === "active" ? "Activos" : "Inactivos"}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl overflow-hidden border border-velum-200 text-xs">
            {(["all", "admin", "staff", "member", "system"] as const).map((r) => (
              <button key={r} onClick={() => setFilterRole(r)}
                className={`px-3 py-1.5 font-medium transition ${filterRole === r ? "bg-velum-900 text-white" : "bg-white text-velum-500 hover:bg-velum-50"}`}>
                {r === "all" ? "Todos" : ROLE_CONFIG[r]?.label ?? r}
              </button>
            ))}
          </div>
          {(filterStatus !== "all" || filterRole !== "all") && (
            <button onClick={() => { setFilterStatus("all"); setFilterRole("all"); }}
              className="px-3 py-1.5 rounded-xl border border-velum-200 text-xs text-velum-400 hover:text-velum-700 hover:bg-velum-50 transition">
              Limpiar filtros
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-velum-100 rounded-2xl animate-pulse" />)}</div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-velum-100 py-12 text-center">
            <Users size={28} className="mx-auto text-velum-200 mb-3" />
            <p className="text-sm text-velum-400">No hay usuarios registrados</p>
          </div>
        ) : (
          sorted.map((u) => {
            const roleCfg = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.member;
            const currentRole = roleDrafts[u.id] || u.role;
            const currentRoleCfg = ROLE_CONFIG[currentRole] ?? ROLE_CONFIG.member;
            const perms = permDrafts[u.id] || [];
            const isExpanded = expandedUser === u.id;
            const isDirty = roleDrafts[u.id] !== u.role ||
              JSON.stringify([...(permDrafts[u.id] || [])].sort()) !== JSON.stringify([...(u.permissions || [])].sort());

            return (
              <div key={u.id} className={`bg-white rounded-2xl border transition ${isDirty ? "border-velum-300" : "border-velum-100"} overflow-hidden`}>
                {/* User header row */}
                <div className="flex items-center gap-3 p-4">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl bg-velum-100 flex items-center justify-center text-xs font-bold text-velum-700 shrink-0">
                    {initials(u.email)}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${u.isActive ? "text-velum-900" : "text-velum-400 line-through"}`}>{u.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${roleCfg.cls}`}>{roleCfg.label}</span>
                      {!u.isActive && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600">Inactivo</span>
                      )}
                      {u.isActive && u.membershipStatus && (
                        <span className="text-[10px] text-velum-400">{u.membershipStatus}</span>
                      )}
                      {canHavePermissions(u.role) && (
                        <span className="text-[10px] text-velum-400">{u.permissions.length} permisos</span>
                      )}
                    </div>
                  </div>
                  {/* Expand toggle */}
                  <button onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                    className="text-xs text-velum-400 hover:text-velum-700 transition px-2 py-1 rounded-lg hover:bg-velum-50">
                    {isExpanded ? "Cerrar" : "Editar"}
                  </button>
                </div>

                {/* Expanded edit panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t border-velum-50 pt-4">
                    {/* Role selector */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">Rol</p>
                      <div className="flex gap-2 flex-wrap">
                        {(["admin", "staff", "member"] as const).map((r) => {
                          const cfg = ROLE_CONFIG[r];
                          return (
                            <button key={r} onClick={() => setRoleDrafts((p) => ({ ...p, [u.id]: r }))}
                              disabled={u.role === "system"}
                              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition border disabled:opacity-40
                                ${currentRole === r ? cfg.cls + " ring-2 ring-velum-900/15" : "border-velum-200 text-velum-500 hover:bg-velum-50"}`}>
                              {cfg.label}
                            </button>
                          );
                        })}
                        {u.role === "system" && (
                          <span className="px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Sistema (no modificable)</span>
                        )}
                      </div>
                    </div>

                    {/* Permissions */}
                    {canHavePermissions(currentRole) && catalog.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">
                          Permisos ({perms.length} de {catalog.length})
                        </p>
                        <div className="grid sm:grid-cols-2 gap-1.5">
                          {catalog.map((perm) => {
                            const enabled = perms.includes(perm.code);
                            return (
                              <button key={perm.code} type="button" onClick={() => togglePerm(u.id, perm.code)}
                                className={`text-left rounded-xl px-3 py-2.5 text-xs transition border ${
                                  enabled
                                    ? "bg-velum-900 border-velum-900 text-white"
                                    : "bg-velum-50 border-velum-100 text-velum-600 hover:border-velum-300"
                                }`}>
                                <p className="font-semibold">{perm.label}</p>
                                <p className={`mt-0.5 ${enabled ? "text-white/70" : "text-velum-400"}`}>{perm.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Activate / Deactivate */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={togglingActive === u.id}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium border transition disabled:opacity-50 ${
                          u.isActive
                            ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                            : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        }`}
                      >
                        {togglingActive === u.id
                          ? "..."
                          : u.isActive
                          ? "Desactivar (cancela Stripe)"
                          : "Reactivar cuenta"}
                      </button>
                    </div>

                    {/* Save role/perms */}
                    <button onClick={() => saveUser(u)} disabled={savingUser === u.id}
                      className={`w-full py-2.5 rounded-xl text-sm font-medium transition ${
                        isDirty
                          ? "bg-velum-900 text-white hover:bg-velum-800"
                          : "bg-velum-50 text-velum-400 border border-velum-200"
                      } disabled:opacity-50`}>
                      {savingUser === u.id ? "Guardando..." : isDirty ? "Guardar cambios" : "Sin cambios pendientes"}
                    </button>

                    {/* Reset password */}
                    <div className="pt-1 border-t border-velum-50">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-2">Restablecer contraseña</p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input type={showResetPwd[u.id] ? "text" : "password"}
                            className="w-full rounded-xl border border-velum-200 px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-velum-900/20 focus:border-velum-700 transition"
                            placeholder="Nueva contraseña (mín. 8)"
                            value={resetDrafts[u.id] || ""}
                            onChange={(e) => setResetDrafts((p) => ({ ...p, [u.id]: e.target.value }))} />
                          <button type="button" onClick={() => setShowResetPwd((p) => ({ ...p, [u.id]: !p[u.id] }))}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-velum-400 hover:text-velum-700 transition">
                            {showResetPwd[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <button onClick={() => resetPassword(u)} disabled={resettingPwd === u.id || !(resetDrafts[u.id] || "").trim()}
                          className="px-4 py-2 rounded-xl border border-velum-200 text-sm text-velum-700 hover:bg-velum-50 transition disabled:opacity-40 whitespace-nowrap">
                          {resettingPwd === u.id ? "..." : "Restablecer"}
                        </button>
                      </div>
                    </div>

                    {/* Delete user */}
                    <div className="pt-1 border-t border-red-100">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2">Zona de peligro</p>
                      <button
                        onClick={() => openDeleteModal(u)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50 hover:border-red-400 transition w-full"
                      >
                        <Trash2 size={14} />
                        Eliminar usuario permanentemente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-velum-100 text-sm text-velum-500">
          <span>{totalUsers} usuarios en total</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => changePage(page - 1)}
              disabled={page === 1 || loading}
              className="px-3 py-1.5 rounded-xl border border-velum-200 disabled:opacity-40 hover:bg-velum-50 transition text-xs font-medium"
            >
              Anterior
            </button>
            <span className="text-xs">Página {page} de {totalPages}</span>
            <button
              onClick={() => changePage(page + 1)}
              disabled={page === totalPages || loading}
              className="px-3 py-1.5 rounded-xl border border-velum-200 disabled:opacity-40 hover:bg-velum-50 transition text-xs font-medium"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // OTP Delete Modal
  const deleteModal = deleteTarget && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDeleteModal} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl border border-red-200 max-w-md w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-velum-900">Eliminar usuario</h3>
            <p className="text-xs text-velum-500 mt-0.5">Esta acción es irreversible</p>
          </div>
        </div>

        {/* Target info */}
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 space-y-1">
          <p className="text-xs text-velum-500 uppercase tracking-widest font-bold">Usuario a eliminar</p>
          <p className="text-sm font-semibold text-velum-900">{deleteTarget.email}</p>
          <p className="text-xs text-velum-500">Rol: {ROLE_CONFIG[deleteTarget.role]?.label ?? deleteTarget.role}</p>
          <p className="text-xs text-red-600 mt-2 font-medium">
            Se eliminarán también: perfil, membresía, expediente clínico, citas, documentos y pagos.
          </p>
        </div>

        {/* OTP section */}
        {!deleteOtpSent ? (
          <div className="space-y-3">
            <p className="text-sm text-velum-700">
              Para confirmar, enviaremos un código OTP de seguridad a tu número de WhatsApp registrado.
            </p>
            {deleteOtpMsg && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{deleteOtpMsg}</p>
            )}
            <button
              onClick={requestDeleteOtp}
              disabled={isRequestingOtp}
              className="w-full py-2.5 rounded-xl bg-velum-900 text-white text-sm font-medium hover:bg-velum-800 transition disabled:opacity-50"
            >
              {isRequestingOtp ? "Enviando código..." : "Enviar código OTP por WhatsApp"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {deleteOtpMsg && (
              <p className={`text-sm rounded-xl px-3 py-2 ${
                deleteOtpMsg.toLowerCase().includes("error") || deleteOtpMsg.toLowerCase().includes("incorrecto") || deleteOtpMsg.toLowerCase().includes("expirado")
                  ? "text-red-600 bg-red-50 border border-red-100"
                  : "text-emerald-700 bg-emerald-50 border border-emerald-100"
              }`}>{deleteOtpMsg}</p>
            )}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-velum-400 mb-1.5">
                Ingresa el código OTP (6 dígitos)
              </label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="w-full rounded-xl border border-velum-200 px-3.5 py-3 text-center text-xl font-bold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 transition"
                placeholder="000000"
                value={deleteOtpCode}
                onChange={(e) => setDeleteOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => { if (e.key === "Enter" && deleteOtpCode.length === 6) void confirmDeleteUser(); }}
              />
            </div>
            <button
              onClick={() => { setDeleteOtpSent(false); setDeleteOtpCode(""); setDeleteOtpMsg(""); }}
              className="text-xs text-velum-400 hover:text-velum-700 transition underline"
            >
              Reenviar código
            </button>
            <button
              onClick={confirmDeleteUser}
              disabled={isDeletingUser || deleteOtpCode.length !== 6}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition disabled:opacity-50"
            >
              {isDeletingUser ? "Eliminando..." : "Confirmar eliminación"}
            </button>
          </div>
        )}

        {/* Cancel */}
        <button
          onClick={closeDeleteModal}
          disabled={isDeletingUser}
          className="w-full py-2.5 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  if (embedded) return <>{content}{deleteModal}</>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif text-velum-900">Usuarios y permisos</h1>
          <p className="text-sm text-velum-500 mt-1">Gestión de acceso al panel administrativo</p>
        </div>
        <Link to="/admin" className="px-4 py-2 rounded-xl border border-velum-200 text-sm text-velum-600 hover:bg-velum-50 transition">
          Volver
        </Link>
      </div>
      {content}
      {deleteModal}
    </div>
  );
};

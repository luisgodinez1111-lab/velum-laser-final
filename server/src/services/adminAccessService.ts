import { prisma } from "../db/prisma";

export type PermissionItem = {
  code: string;
  label: string;
  description: string;
};

export const PERMISSIONS_CATALOG: PermissionItem[] = [
  { code: "users.read", label: "Ver usuarios", description: "Puede ver usuarios administrativos y pacientes" },
  { code: "users.create", label: "Crear usuarios", description: "Puede crear usuarios admin/staff/paciente" },
  { code: "users.update", label: "Editar usuarios", description: "Puede editar rol y estado operativo" },
  { code: "users.permissions", label: "Editar permisos", description: "Puede editar matriz de permisos" },
  { code: "settings.general", label: "General", description: "Configuración general/fiscal/empresa" },
  { code: "settings.agenda", label: "Agenda", description: "Configuración de agenda" },
  { code: "settings.meta", label: "Meta", description: "Integración Meta/campañas" },
  { code: "settings.stripe", label: "Stripe", description: "Integración Stripe" },
  { code: "settings.whatsapp", label: "WhatsApp OTP", description: "Configuración WhatsApp Business OTP" },
  { code: "compliance.read", label: "Cumplimiento", description: "Acceso a cumplimiento" },
  { code: "risk.read", label: "Riesgos", description: "Acceso a riesgos" },
  { code: "logs.read", label: "Logs", description: "Acceso a bitácora/logs" },
];

type AccessStore = {
  byUserId: Record<string, string[]>;
};

const SETTING_KEY = "admin_access_matrix_v1";
let memoryStore: AccessStore = { byUserId: {} };

const getAppSettingModel = (): any | null => {
  const model = prisma.appSetting;
  if (!model) return null;
  if (typeof model.findUnique !== "function" || typeof model.upsert !== "function") return null;
  return model;
};

const normalizePermissions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out = value
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return Array.from(new Set(out));
};

const normalizeStore = (value: unknown): AccessStore => {
  if (!value || typeof value !== "object") return { byUserId: {} };
  const raw = value as any;
  const byUserId: Record<string, string[]> = {};
  const source = raw.byUserId && typeof raw.byUserId === "object" ? raw.byUserId : {};
  for (const [k, v] of Object.entries(source)) byUserId[k] = normalizePermissions(v);
  return { byUserId };
};

export const defaultPermissionsByRole = (role: string): string[] => {
  if (role === "admin" || role === "system") return PERMISSIONS_CATALOG.map((p) => p.code);
  if (role === "staff") {
    return [
      "users.read",
      "settings.general",
      "settings.agenda",
      "settings.whatsapp",
      "compliance.read",
      "risk.read",
      "logs.read",
    ];
  }
  return [];
};

export const readAccessStore = async (): Promise<AccessStore> => {
  const model = getAppSettingModel();
  if (!model) return memoryStore;

  try {
    const row = await model.findUnique({
      where: { key: SETTING_KEY },
      select: { value: true },
    });
    memoryStore = normalizeStore(row?.value ?? {});
    return memoryStore;
  } catch {
    return memoryStore;
  }
};

export const writeAccessStore = async (store: AccessStore): Promise<void> => {
  memoryStore = normalizeStore(store);

  const model = getAppSettingModel();
  if (!model) return;

  try {
    await model.upsert({
      where: { key: SETTING_KEY },
      update: { value: memoryStore as any },
      create: { key: SETTING_KEY, value: memoryStore as any },
    });
  } catch {
    // fallback en memoria para no romper operación
  }
};

export const getEffectivePermissions = (store: AccessStore, userId: string, role: string): string[] => {
  const custom = store.byUserId[userId];
  if (custom && custom.length > 0) return custom;
  return defaultPermissionsByRole(role);
};

export const setUserPermissions = async (userId: string, permissions: string[]): Promise<void> => {
  const store = await readAccessStore();
  store.byUserId[userId] = normalizePermissions(permissions);
  await writeAccessStore(store);
};

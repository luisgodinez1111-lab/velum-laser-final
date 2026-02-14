import { apiFetch } from "./apiClient";

export interface FileUploadData {
  id: string;
  userId: string;
  category: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

export const fileUploadServiceFe = {
  upload: async (file: File, meta: { category?: string; entityType?: string; entityId?: string }) => {
    const formData = new FormData();
    formData.append("file", file);
    if (meta.category) formData.append("category", meta.category);
    if (meta.entityType) formData.append("entityType", meta.entityType);
    if (meta.entityId) formData.append("entityId", meta.entityId);

    const res = await fetch("/api/files/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json() as Promise<FileUploadData>;
  },

  getMyFiles: () => apiFetch<FileUploadData[]>("/me/files"),

  getDownloadUrl: (id: string) => `/api/files/${id}/download`,

  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/files/${id}`, { method: "DELETE" }),
};

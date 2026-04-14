import { API_BASE_URL } from "./config";

export interface Asset {
  id: number;
  name: string;
  path: string;
  content_type: string | null;
  size_bytes: number;
  url: string;
  created_at: string;
  updated_at: string;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  healthz: () => http<{ status: string }>("/healthz"),
  readyz: () => http<{ status: string }>("/readyz"),
  listAssets: () => http<Asset[]>("/api/assets"),
  uploadAsset: (file: File, name?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (name) fd.append("name", name);
    return http<Asset>("/api/assets", { method: "POST", body: fd });
  },
  deleteAsset: (id: number) => http<void>(`/api/assets/${id}`, { method: "DELETE" }),
};

import { API_BASE_URL } from "./config";

export interface AssetCreate {
  asset_code: string;
  name: string;
  type: string;
  model: string;
  specification: string;
  vendor: string;
  purchase_date: string;
  purchase_price: number;
  storage_location?: string | null;
  owner_id?: number | null;
  activation_date: string;
  warranty_expiry: string;
  status?: string;
}

export interface Asset extends AssetCreate {
  id: number;
  created_at: string;
  version: number;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers = {
    ...init?.headers,
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };
  
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
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
  
  // Asset 實體設備
  listAssets: () => http<Asset[]>("/api/assets"),
  createAsset: (payload: AssetCreate) => http<Asset>("/api/assets", { 
    method: "POST", 
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify(payload) 
  }),
  deleteAsset: (id: number) => http<void>(`/api/assets/${id}`, { method: "DELETE" }),

  // Auth
  login: (payload: any) => http<any>("/api/login", { 
    method: "POST", 
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify(payload) 
  }),
  getMe: () => http<any>("/api/me"),
};

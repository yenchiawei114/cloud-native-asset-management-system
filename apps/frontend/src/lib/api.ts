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

export interface RepairRequest {
  id: number;
  asset_id: number;
  requester_id: number;
  description: string;
  need_backup: boolean;
  backup_spec: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  expected_completion_date: string | null;
  pickup_location: string | null;
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
    let errorMessage = `${res.status} ${res.statusText}`;
    try {
      const errorData = await res.json();
      errorMessage = errorData.detail || errorMessage;
    } catch (e) {
      const text = await res.text().catch(() => "");
      if (text) errorMessage = text;
    }
    throw new Error(errorMessage);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  healthz: () => http<{ status: string }>("/healthz"),
  readyz: () => http<{ status: string }>("/readyz"),
  
  // Asset 實體設備
  listAssets: (employeeId?: string) => {
    const url = employeeId ? `/api/assets?owner_employee_id=${employeeId}` : "/api/assets";
    return http<Asset[]>(url);
  },
  getAsset: (id: number) => http<Asset>(`/api/assets/${id}`),
  createAsset: (payload: AssetCreate) => http<Asset>("/api/assets", { 
    method: "POST", 
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify(payload) 
  }),
  deleteAsset: (id: number) => http<void>(`/api/assets/${id}`, { method: "DELETE" }),

  // Tickets 維修工單
  listTickets: () => http<RepairRequest[]>("/api/tickets"),
  listMyTickets: (employeeId: string) => http<RepairRequest[]>(`/api/tickets/list/${employeeId}`),
  createTicket: (payload: any) => http<RepairRequest>("/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }),
  getTicket: (id: number) => http<RepairRequest>(`/api/tickets/${id}`),
  getTicketRecord: (ticketId: number) => http<any>(`/api/tickets/${ticketId}/record`),
  getTicketInspection: (ticketId: number) => http<any>(`/api/tickets/${ticketId}/inspection`),
  getTicketAttachments: (ticketId: number) => http<any[]>(`/api/attachments?attachable_type=REPAIR_REQUEST&attachable_id=${ticketId}`),

  // Auth & User
  login: (payload: any) => http<any>("/api/login", { 
    method: "POST", 
    headers: { "Content-Type": "application/json" }, 
    body: JSON.stringify(payload) 
  }),
  getMe: () => http<any>("/api/users/me"),
  changePassword: (payload: any) => http<any>("/api/users/me/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }),
  getNotificationPreferences: () => http<any[]>("/api/users/me/notification-preferences"),
  updateNotificationPreference: (payload: any) => http<any>("/api/users/me/notification-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }),

  // Attachments
  uploadAttachment: (formData: FormData) => fetch(`${API_BASE_URL}/api/attachments/upload`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem('token')}`
    },
    body: formData
  }).then(r => {
    if (!r.ok) throw new Error("Upload failed");
    return r.json();
  }),
};

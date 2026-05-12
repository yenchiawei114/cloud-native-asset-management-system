import { API_BASE_URL } from "./config";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers = {
    ...init?.headers,
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const errorData = await res.json();
      detail = errorData.detail || detail;
    } catch (e) {
      const text = await res.text().catch(() => "");
      if (text) detail = text;
    }
    throw new Error(`[${res.status}] ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface User {
  id: number;
  employee_id: string;
  name: string;
  sex: 'M' | 'F';
  department_id: number;
  role: 'employee' | 'admin';
  email: string;
  must_change_password: boolean;
  last_password_changed_at: string | null;
  created_at: string;
}

export interface UserCreatePayload {
  employee_id: string;
  password: string;
  name: string;
  sex: 'M' | 'F';
  department_id: number;
  email: string;
  role: 'employee' | 'admin';
}

export interface Asset {
  id: number;
  asset_code: string;
  name: string;
  type: string;
  model: string;
  specification: string;
  vendor: string;
  purchase_date: string;
  purchase_price: number;
  storage_location: string | null;
  owner_id: number | null;
  activation_date: string;
  warranty_expiry: string;
  status: string;
  created_at: string;
  version: number;
}

export interface AssetCreatePayload {
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

export interface RepairRequest {
  id: number;
  asset_id: number;
  requester_id: number;
  description: string;
  need_backup: boolean;
  backup_spec: string | null;
  status: string;
  expected_completion_date: string | null;
  pickup_location: string | null;
  created_at: string;
  version: number;
  priority: string;
  title?: string;
  requester_name?: string;
  asset_serial?: string;
  requester_dept?: string;
}

export type Ticket = RepairRequest;

export interface NotificationPreference {
  id: number;
  user_id: number;
  type: 'EMAIL' | 'SLACK' | 'TEAMS';
  value: string;
}

export interface AuditLog {
  id: number;
  user_id: number;
  actor_name: string | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  target_type: 'ASSET' | 'TICKET' | 'INSPECTION' | 'RECORD' | 'ATTACHMENT' | 'USER';
  target_id: number;
  target_name: string | null;
  timestamp: string;
  detail: {
    before?: any;
    after?: any;
  } | null;
}

export interface AuditLogListResponse {
  items: AuditLog[];
  total: number;
  page: number;
  page_size: number;
}

export const api = {
  login: (data: any) => http<any>("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }),
  logout: () => http<any>("/api/logout", { method: "POST" }),

  getMe: () => http<User>("/api/users/me"),
  listUsers: (keyword?: string) =>
    http<User[]>(`/api/users${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),
  createUser: (payload: UserCreatePayload) =>
    http<User>("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  updateUser: (employeeId: string, payload: Partial<UserCreatePayload>) =>
    http<User>(`/api/users/${employeeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  getUser: (employeeId: string) =>
    http<User>(`/api/users/${employeeId}`),
  deleteUser: (employeeId: string) =>
    http<void>(`/api/users/${employeeId}`, { method: 'DELETE' }),

  changePassword: (payload: any) =>
    http<any>("/api/users/me/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),

  getNotificationPreferences: () =>
    http<NotificationPreference[]>("/api/users/me/notification-preferences"),

  updateNotificationPreference: (payload: any) =>
    http<NotificationPreference>("/api/users/me/notification-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),

  listAssets: (params?: { keyword?: string; status?: string; owner_employee_id?: string }) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(([_, v]) => v !== undefined && v !== null && v !== "" && v !== "undefined")
    );
    const query = new URLSearchParams(Object.entries(cleanParams).map(([k, v]) => [k, String(v)])).toString();
    return http<Asset[]>(`/api/assets${query ? `?${query}` : ''}`);
  },
  getAsset: (id: number) => http<Asset>(`/api/assets/${id}`),
  updateAsset: (id: number, payload: Partial<AssetCreatePayload>) =>
    http<Asset>(`/api/assets/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  createAsset: (payload: AssetCreatePayload) =>
    http<Asset>("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  deleteAsset: (id: number) => http<void>(`/api/assets/${id}`, { method: "DELETE" }),

  listTickets: (status?: string) =>
    http<RepairRequest[]>(`/api/tickets${status && status !== 'ALL' ? `?status=${status}` : ''}`),
  listMyTickets: (employeeId: string) =>
    http<RepairRequest[]>(`/api/tickets/list/${employeeId}`),
  getTicket: (id: number) =>
    http<RepairRequest>(`/api/tickets/${id}`),
  createTicket: (payload: any) =>
    http<RepairRequest>("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  approveTicket: (ticketId: number, status: string = 'DONE') =>
    http<RepairRequest>(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    }),
  rejectTicket: (ticketId: number, reason?: string) =>
    http<RepairRequest>(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: 'CANCELLED', note: reason })
    }),
  getTicketRecord: (ticketId: number) =>
    http<any>(`/api/tickets/${ticketId}/record`),
  getTicketInspection: (ticketId: number) =>
    http<any>(`/api/tickets/${ticketId}/inspection`),
  getTicketAttachments: (ticketId: number) =>
    http<any[]>(`/api/attachments`),
  getTicketStats: () => {
    return Promise.resolve({ pending_count: 0, completed_last_7_days: 0 });
  },
  uploadAttachment: (formData: FormData) =>
    http<any>("/api/attachments", {
      method: "POST",
      body: formData
    }),
  createTicketRecord: (ticketId: number, payload: any) =>
    http<any>(`/api/tickets/${ticketId}/record`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  updateTicketRecord: (ticketId: number, payload: any) =>
    http<any>(`/api/tickets/${ticketId}/record`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  createTicketInspection: (ticketId: number, payload: any) =>
    http<any>(`/api/tickets/${ticketId}/inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  updateTicketInspection: (ticketId: number, payload: any) =>
    http<any>(`/api/tickets/${ticketId}/inspection`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),

  listAuditLogs: (params?: { target_type?: string; action?: string; from_date?: string; to_date?: string; page?: number; page_size?: number }) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(([_, v]) => v !== undefined && v !== null && v !== "" && v !== "undefined")
    );
    const query = new URLSearchParams(Object.entries(cleanParams).map(([k, v]) => [k, String(v)])).toString();
    return http<AuditLogListResponse>(`/api/audit-logs${query ? `?${query}` : ''}`);
  },
  getAuditLog: (id: number) => http<AuditLog>(`/api/audit-logs/${id}`),

  healthz: () => http<{ status: string }>("/healthz"),
};

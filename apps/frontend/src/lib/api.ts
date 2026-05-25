import { API_BASE_URL } from "./config";

const TICKET_CONFLICT_DETAIL = "Ticket has been modified by another user";
const TICKET_CONFLICT_MESSAGE = "此工單已被其他人更新，請重新整理頁面後再操作。";

function formatApiError(status: number, detail: string): string {
  if (status === 409 && detail.includes(TICKET_CONFLICT_DETAIL)) {
    return TICKET_CONFLICT_MESSAGE;
  }

  return `[${status}] ${detail}`;
}

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
    throw new Error(formatApiError(res.status, detail));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Department {
  id: number;
  name: string;
}

export interface OfficeLocation {
  id: number;
  name: string;
}

export interface Vendor {
  id: number;
  name: string;
}

export interface User {
  id: number;
  employee_id: string;
  name: string;
  sex: 'MALE' | 'FEMALE';
  department_id: number;
  location: string | null;
  role: 'EMPLOYEE' | 'ADMIN';
  email: string;
  must_change_password: boolean;
  last_password_changed_at: string | null;
  hire_date: string | null;
  termination_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface OffboardingAssetItem {
  id: number;
  asset_code: string;
  name: string;
  status: string;
}

export interface OffboardingTicketItem {
  id: number;
  description: string;
  status: string;
  has_loaner: boolean;
}

export interface OffboardingTransferItem {
  id: number;
  asset_id: number;
  asset_name: string | null;
  asset_code: string | null;
}

export interface OffboardingTransferStatus {
  transfer_id: number;
  asset_id: number;
  asset_code: string;
  asset_name: string;
  to_owner_name: string;
  to_owner_employee_id: string;
  status: 'PENDING' | 'COMPLETED';
  to_confirmed: boolean;
}

export interface OffboardingChecklist {
  can_proceed: boolean;
  hard_blocker_reason: string | null;
  owned_assets: OffboardingAssetItem[];
  borrowed_loaners: OffboardingAssetItem[];
  in_progress_tickets: OffboardingTicketItem[];
  pending_transfers: OffboardingTransferItem[];
  open_tickets: OffboardingTicketItem[];
  is_offboarding_in_progress: boolean;
  offboarding_transfers: OffboardingTransferStatus[];
  all_transfers_complete: boolean;
}

export interface OffboardPayload {
  asset_successor_id: number | null;
  termination_date: string;
}

export interface UserCreatePayload {
  employee_id: string;
  password: string;
  name: string;
  sex: 'MALE' | 'FEMALE';
  department_id: number;
  location?: string | null;
  email: string;
  role: 'EMPLOYEE' | 'ADMIN';
  hire_date?: string | null;
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
  borrower_id?: number | null;
  activation_date: string;
  warranty_expiry: string;
  status: string;
  created_at: string;
  version: number;
  owner_name?: string | null;
  owner_employee_id?: string | null;
  office_location?: string | null;
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

export interface AssetImportRowResult {
  row: number;
  asset_code?: string | null;
  action?: string | null;
  success: boolean;
  error?: string | null;
}

export interface AssetImportResponse {
  total: number;
  success_count: number;
  failure_count: number;
  results: AssetImportRowResult[];
}

export interface RepairRequest {
  id: number;
  asset_id: number;
  requester_id: number;
  description: string;
  need_backup: boolean;
  backup_spec: string | null;
  status: string;
  reject_reason?: string | null;
  expected_completion_date: string | null;
  pickup_location: string | null;
  loaner_asset_id?: number | null;
  loaner_asset_code?: string | null;
  loaner_asset_name?: string | null;
  loaner_return_borrower_confirmed?: boolean;
  loaner_return_lender_confirmed?: boolean;
  handled_by?: number | null;
  handled_by_name?: string | null;
  created_at: string;
  version: number;
  priority: string;
  title?: string;
  requester_name?: string;
  asset_serial?: string;
  requester_dept?: string;
}

export type Ticket = RepairRequest;

export interface AssetTransfer {
  id: number;
  asset_id: number;
  initiator_id: number;
  from_owner_id: number;
  to_owner_id: number;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  from_confirmed: boolean;
  to_confirmed: boolean;
  created_at: string;
  asset_name?: string | null;
  asset_code?: string | null;
  from_owner_name?: string | null;
  to_owner_name?: string | null;
}

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

  getDepartments: () => http<Department[]>("/api/departments"),
  getOfficeLocations: () => http<OfficeLocation[]>("/api/office-locations"),
  listVendors: () => http<Vendor[]>("/api/vendors"),

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
  getOffboardingChecklist: (employeeId: string) =>
    http<OffboardingChecklist>(`/api/users/${employeeId}/offboarding-checklist`),
  offboardUser: (employeeId: string, payload: OffboardPayload) =>
    http<User>(`/api/users/${employeeId}/offboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  finalizeOffboarding: (employeeId: string) =>
    http<User>(`/api/users/${employeeId}/offboard/finalize`, { method: 'POST' }),

  verifyPassword: (currentPassword: string) =>
    http<{ valid: boolean }>("/api/users/me/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPassword })
    }),

  changePassword: (payload: any) =>
    http<any>("/api/users/me/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),

  updateMyEmail: (email: string) =>
    http<User>("/api/users/me/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    }),

  getNotificationPreferences: () =>
    http<NotificationPreference[]>("/api/users/me/notification-preferences"),

  updateNotificationPreference: (payload: any) =>
    http<NotificationPreference>("/api/users/me/notification-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),

  listAssets: (params?: {
    keyword?: string;
    status?: string;
    owner_employee_id?: string;
    asset_code_q?: string;
    name_q?: string;
    model_q?: string;
    spec_q?: string;
    vendor_q?: string;
    owner_q?: string;
    office_location_q?: string;
    asset_type?: string;
  }) => {
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
  deactivateAsset: (id: number) =>
    http<Asset>(`/api/assets/${id}/deactivate`, { method: "POST" }),
  activateAsset: (id: number) =>
    http<Asset>(`/api/assets/${id}/activate`, { method: "POST" }),
  toggleAssetStatus: (id: number) =>
    http<Asset>(`/api/assets/${id}/toggle-status`, { method: "POST" }),
  listIdleAssets: () => http<Asset[]>('/api/assets/idle'),
  listMyIdleAssets: () => http<Asset[]>('/api/assets/idle?owner_only=true'),
  importAssetsCsv: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return http<AssetImportResponse>('/api/assets/import', {
      method: 'POST',
      body: formData,
    });
  },
  confirmLoanerReturn: (ticketId: number, version: number) =>
    http<RepairRequest>(`/api/tickets/${ticketId}/confirm-loaner-return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version })
    }),

  getAssetTickets: (assetId: number) =>
    http<{ request: RepairRequest; attachment: { id: number; file_url: string; file_name: string } | null }[]>(`/api/assets/${assetId}/tickets`),
  listTickets: (status?: string) =>
    http<RepairRequest[]>(`/api/tickets${status && status !== 'ALL' ? `?status=${status}` : ''}`),
  listMyTickets: async (employeeId: string): Promise<RepairRequest[]> => {
    const items = await http<{ request: RepairRequest; attachment: unknown }[]>(`/api/tickets/list/${employeeId}`);
    return items.map(item => item.request);
  },
  getTicket: (id: number) =>
    http<RepairRequest>(`/api/tickets/${id}`),
  createTicket: (payload: any) =>
    http<RepairRequest>("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  updateTicketStatus: (
    ticketId: number,
    status: RepairRequest['status'],
    version: number,
    payload?: { expected_completion_date?: string | null; reject_reason?: string | null; loaner_asset_id?: number | null }
  ) =>
    http<RepairRequest>(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        version,
        ...payload,
      })
    }),
  approveTicket: (ticketId: number, version: number, expectedCompletionDate?: string, loanerAssetId?: number | null) =>
    http<RepairRequest>(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: 'IN_PROGRESS',
        version,
        expected_completion_date: expectedCompletionDate || null,
        loaner_asset_id: loanerAssetId ?? null,
      })
    }),
  returnTicket: (ticketId: number, version: number, reason: string) =>
    http<RepairRequest>(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: 'RETURNED', version, reject_reason: reason })
    }),
  rejectTicket: (ticketId: number, version: number, reason?: string) =>
    http<RepairRequest>(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: 'CANCELLED', version, note: reason })
    }),
  updateTicket: (ticketId: number, payload: { asset_id: number; requester_id: number; description: string; version: number; need_backup: boolean; backup_spec?: string | null; pickup_location?: string | null }) =>
    http<RepairRequest>(`/api/tickets/${ticketId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, status: 'OPEN' })
    }),
  closeTicket: (ticketId: number, payload: { version: number; issue_description: string; solution: string; vendor_id: number; cost: number }) =>
    http<RepairRequest>(`/api/tickets/${ticketId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  initiateTransfer: (assetId: number, toOwnerId: number) =>
    http<AssetTransfer>(`/api/assets/${assetId}/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_owner_id: toOwnerId })
    }),
  getPendingTransfers: () =>
    http<AssetTransfer[]>('/api/transfers/pending'),
  confirmTransfer: (transferId: number) =>
    http<AssetTransfer>(`/api/transfers/${transferId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }),
  cancelTransfer: (transferId: number) =>
    http<void>(`/api/transfers/${transferId}`, { method: "DELETE" }),
  getTicketRecord: (ticketId: number) =>
    http<any>(`/api/tickets/${ticketId}/record`),
  getTicketInspection: (ticketId: number) =>
    http<any>(`/api/tickets/${ticketId}/inspection`),
  getTicketAttachments: (ticketId: number) =>
    http<any[]>(`/api/tickets/${ticketId}/attachments`),
  getTicketStats: () => {
    return Promise.resolve({ pending_count: 0, completed_last_7_days: 0 });
  },
  uploadAttachment: (formData: FormData) =>
    http<any>("/api/attachments", {
      method: "POST",
      body: formData
    }),
  deleteAttachment: (attachmentId: number) =>
    http<void>(`/api/attachments/${attachmentId}`, { method: "DELETE" }),
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

  listAuditLogs: (params?: { target_type?: string; action?: string; from_date?: string; to_date?: string; user_id?: number; page?: number; page_size?: number }) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(([_, v]) => v !== undefined && v !== null && v !== "" && v !== "undefined")
    );
    const query = new URLSearchParams(Object.entries(cleanParams).map(([k, v]) => [k, String(v)])).toString();
    return http<AuditLogListResponse>(`/api/audit-logs${query ? `?${query}` : ''}`);
  },
  getAuditLog: (id: number) => http<AuditLog>(`/api/audit-logs/${id}`),

  healthz: () => http<{ status: string }>("/healthz"),
};

# API 與前端流程對照文件

> 對應 commit `bfa096c`（Merge feature/frontend → dev）  
> 本文件說明此次合併新增或修改的 API endpoint，以及前端如何呼叫這些 API 完成各功能流程。

---

## 目錄

1. [廠商管理](#1-廠商管理)
2. [辦公地點 / 部門查詢](#2-辦公地點--部門查詢)
3. [資產狀態管理](#3-資產狀態管理)
4. [資產轉移](#4-資產轉移)
5. [維修工單 — 結案流程](#5-維修工單--結案流程)
6. [維修工單 — 備用機歸還確認](#6-維修工單--備用機歸還確認)
7. [資產維修歷史](#7-資產維修歷史)
8. [使用者個人資料](#8-使用者個人資料)
9. [離職流程（Offboarding）](#9-離職流程offboarding)

---

## 1. 廠商管理

### DB Schema 變更

**Migration `6a7b8c9d0e1f`** — `add_vendors`（2026-05-17）

新建 `vendors` 表：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | BIGINT PK AUTO_INCREMENT | 廠商 ID |
| `name` | VARCHAR(100) UNIQUE NOT NULL | 廠商名稱 |

### 新增 API

| 方法 | 路徑 | 權限 |
|------|------|------|
| `GET` | `/api/vendors` | 登入用戶 |

**回傳格式**
```json
[{ "id": 1, "name": "廠商名稱" }]
```

### 前端使用流程

```
EmployeeDashboard / AddAssetDialog / AdminDashboard
  └─ 篩選列「廠商」下拉選單掛載時
       └─ api.listVendors()
            └─ GET /api/vendors
                 └─ SELECT * FROM vendors ORDER BY name
```

前端在篩選資產時，廠商欄位從靜態輸入改為從 API 取得的下拉選單，可確保選項與資料庫同步。

---

## 2. 辦公地點 / 部門查詢

### DB Schema 變更

**Migration `4e5f6a7b8c9d`** — `move_location_to_user`（2026-05-16）

| 資料表 | 操作 | 欄位 | 說明 |
|--------|------|------|------|
| `users` | 新增欄位 | `location VARCHAR(255) NULL` | 個人辦公地點（自由文字，從部門移來） |
| `departments` | 刪除欄位 | `location` | 地點不再屬於部門層級 |

**Migration `5f6a7b8c9d0e`** — `add_office_locations`（2026-05-16）

新建 `office_locations` 表（與 `users.location` 並存，供下拉選單使用）：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | BIGINT PK AUTO_INCREMENT | 地點 ID |
| `name` | VARCHAR(255) UNIQUE NOT NULL | 地點名稱 |

> `users.location` 為自由文字快取；`office_locations` 為主控表，前端下拉選單從此表取值。

### 新增 API

| 方法 | 路徑 | 權限 |
|------|------|------|
| `GET` | `/api/office-locations` | 登入用戶 |
| `GET` | `/api/departments` | 登入用戶 |

### 前端使用流程

```
UserCreatePage / UserDetailPage / EmployeeDashboard
  └─ 表單初始化時
       ├─ api.getOfficeLocations()
       │    └─ GET /api/office-locations
       │         └─ SELECT * FROM office_locations
       └─ api.getDepartments()
            └─ GET /api/departments
                 └─ SELECT * FROM departments
```

辦公地點從 `departments.location`（部門層級）拆分為 `users.location`（個人層級），並新增 `office_locations` 主控表，前端以下拉選單取代自由文字輸入。

---

## 3. 資產狀態管理

### DB Schema 變更

**Migration `2b3c4d5e6f7a`** — `asset_deactivated_status_and_loaner_asset`（2026-05-15）

| 資料表 | 操作 | 說明 |
|--------|------|------|
| `assets.status` | 擴充 ENUM | 加入 `deactivated` 值（原有：`in_use`, `maintenance`, `borrowed`, `available`） |

完整 ENUM 值（更新後）：
```
in_use | maintenance | borrowed | available | deactivated
```

### 新增 API

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `POST` | `/api/assets/{asset_id}/deactivate` | 管理員 | 停用資產（清空保管人） |
| `POST` | `/api/assets/{asset_id}/activate` | 管理員 | 重新啟用已停用資產 |
| `POST` | `/api/assets/{asset_id}/toggle-status` | 管理員 | 在 `AVAILABLE` ↔ `IN_USE` 之間切換 |

**業務規則**
- `deactivate`：資產已為 `DEACTIVATED` 時拒絕。
- `activate`：僅限 `DEACTIVATED` 狀態的資產；啟用後 owner 設為操作管理員，`storage_location` 設為管理員的辦公地點。
- `toggle-status`：操作者必須是該資產的保管人；僅 `AVAILABLE` / `IN_USE` 可切換。

### 前端使用流程

```
AssetDetailPage / AdminDashboard
  ├─ 停用資產按鈕
  │    └─ api.deactivateAsset(id)        →  POST /api/assets/{id}/deactivate
  │         └─ assets.status = 'deactivated', owner_id = NULL
  ├─ 啟用資產按鈕
  │    └─ api.activateAsset(id)          →  POST /api/assets/{id}/activate
  │         └─ assets.status = 'available', owner_id = 管理員ID
  └─ 切換狀態按鈕（保管人視角）
       └─ api.toggleAssetStatus(id)      →  POST /api/assets/{id}/toggle-status
            └─ assets.status: available ↔ in_use
```

---

## 4. 資產轉移

### DB Schema 變更

**Migration `4385d7a8eef7`** — `add_returned_status_reject_reason_...`（2026-05-14）

新建 `asset_transfers` 表：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | BIGINT PK AUTO_INCREMENT | 轉移 ID |
| `asset_id` | BIGINT FK → `assets.id` | 轉移的資產 |
| `initiator_id` | BIGINT FK → `users.id` | 發起者 |
| `from_owner_id` | BIGINT FK → `users.id` | 原保管人 |
| `to_owner_id` | BIGINT FK → `users.id` | 新保管人 |
| `status` | ENUM(`PENDING`, `COMPLETED`, `CANCELLED`) | 轉移狀態 |
| `from_confirmed` | BOOLEAN NOT NULL | 原保管人已確認 |
| `to_confirmed` | BOOLEAN NOT NULL | 新保管人已確認 |
| `created_at` | DATETIME DEFAULT now() | 建立時間 |

**Migration `9d0e1f2a3b4c`** — `add_is_offboarding_to_asset_transfers`（2026-05-18）

| 資料表 | 操作 | 欄位 | 說明 |
|--------|------|------|------|
| `asset_transfers` | 新增欄位 | `is_offboarding_transfer BOOLEAN DEFAULT 0` | 標記此筆轉移為離職流程所建立 |

### 新增 API

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `POST` | `/api/assets/{asset_id}/transfers` | 管理員 | 發起轉移請求 |
| `GET` | `/api/transfers/pending` | 登入用戶 | 取得待確認的轉移列表 |
| `POST` | `/api/transfers/{transfer_id}/confirm` | 登入用戶 | 確認接收轉移 |
| `DELETE` | `/api/transfers/{transfer_id}` | 管理員 | 撤銷轉移（僅發起者） |

**業務規則**
- 維修中（`IN_PROGRESS`）的資產不可發起轉移。
- `confirm`：收件方確認後，資產 `owner_id` 更新為新保管人，`status` 改為 `IN_USE`。
- `cancel`：只有轉移發起者可撤銷，狀態為 `PENDING` 時有效。

### 前端使用流程

```
AssetTransferDialog（管理員）
  └─ 提交轉移
       └─ api.initiateTransfer(assetId, toOwnerId)
            └─ POST /api/assets/{id}/transfers
                 └─ INSERT asset_transfers(status='PENDING', from_confirmed=0, to_confirmed=0)

PendingTransfersBanner（員工儀表板）
  ├─ 頁面載入
  │    └─ api.getPendingTransfers()
  │         └─ GET /api/transfers/pending
  │              └─ SELECT ... WHERE (to_owner_id=me OR from_owner_id=me) AND status='PENDING'
  ├─ 確認接收按鈕
  │    └─ api.confirmTransfer(transferId)
  │         └─ POST /api/transfers/{id}/confirm
  │              └─ UPDATE asset_transfers SET to_confirmed=1, status='COMPLETED'
  │                 UPDATE assets SET owner_id=to_owner_id, status='in_use'
  └─ 撤銷按鈕（僅發起者可見）
       └─ api.cancelTransfer(transferId)
            └─ DELETE /api/transfers/{id}
                 └─ UPDATE asset_transfers SET status='CANCELLED'
```

---

## 5. 維修工單 — 結案流程

### DB Schema 變更

**Migration `4385d7a8eef7`** — `add_returned_status_reject_reason_...`（2026-05-14）

| 資料表 | 操作 | 欄位／說明 |
|--------|------|------|
| `repair_requests.status` | 擴充 ENUM | 加入 `RETURNED`（原有：`OPEN`, `IN_PROGRESS`, `DONE`, `CANCELLED`） |
| `repair_requests` | 新增欄位 | `reject_reason TEXT NULL`：退回或取消時的說明 |
| `attachments.attachable_type` | 擴充 ENUM | 加入 `REPAIR_RECORD`（原有：`REPAIR_REQUEST`, `REPAIR_INSPECTION`） |

**Migration `2b3c4d5e6f7a`** — `asset_deactivated_status_and_loaner_asset`（2026-05-15）

| 資料表 | 操作 | 欄位 | 說明 |
|--------|------|------|------|
| `repair_requests` | 新增欄位 | `loaner_asset_id BIGINT NULL FK → assets.id` | 管理員核准時指派的備用機 |

完整 `repair_requests.status` ENUM（更新後）：
```
OPEN | IN_PROGRESS | DONE | CANCELLED | RETURNED | WAITING_LOANER_RETURN
```
（`WAITING_LOANER_RETURN` 由 Migration `c1d2e3f4a5b6` 新增，見第 6 節）

### 新增 API

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `POST` | `/api/tickets/{ticket_id}/close` | 管理員 | 結案並建立維修紀錄 |

**Request Body**
```json
{
  "issue_description": "問題描述",
  "solution": "解決方案",
  "vendor": "維修廠商",
  "cost": 1500
}
```

**業務規則**
- 僅 `IN_PROGRESS` 狀態的工單可結案。
- 結案時自動建立或更新 `RepairRecord`。
- 若工單有備用機（`loaner_asset_id`），狀態改為 `WAITING_LOANER_RETURN`；否則直接改為 `RETURNED`，資產還原為 `AVAILABLE`。

### 前端使用流程

```
CloseTicketDialog（管理員工單詳情 Modal 內）
  └─ 管理員填寫結案資訊並送出
       └─ api.closeTicket(ticketId, payload)
            └─ POST /api/tickets/{id}/close
                 ├─ UPSERT repair_records（issue_description, solution, vendor, cost）
                 ├─ 有 loaner_asset_id
                 │    └─ repair_requests.status = 'WAITING_LOANER_RETURN'
                 └─ 無 loaner_asset_id
                      └─ repair_requests.status = 'RETURNED'
                         assets.status = 'available'
```

---

## 6. 維修工單 — 備用機歸還確認

### DB Schema 變更

**Migration `c1d2e3f4a5b6`** — `loaner_return_flow`（2026-05-16）

| 資料表 | 操作 | 欄位 | 說明 |
|--------|------|------|------|
| `assets` | 新增欄位 | `borrower_id BIGINT NULL FK → users.id` | 目前借用備用機的使用者 |
| `repair_requests.status` | 擴充 ENUM | 加入 `WAITING_LOANER_RETURN` | 備用機待歸還的中間狀態 |
| `repair_requests` | 新增欄位 | `loaner_return_borrower_confirmed BOOLEAN DEFAULT 0` | 借用方（申請人）已確認歸還 |
| `repair_requests` | 新增欄位 | `loaner_return_lender_confirmed BOOLEAN DEFAULT 0` | 出借方（loaner 保管人）已確認收回 |

### 新增 API

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `POST` | `/api/tickets/{ticket_id}/confirm-loaner-return` | 登入用戶 | 雙方分別確認備用機歸還 |

**業務規則**
- 工單必須為 `WAITING_LOANER_RETURN` 狀態。
- 出借方（loaner 保管人）與借用方（申請人）各自呼叫一次。
- 雙方皆確認後，工單改為 `RETURNED`，備用機資產還原為 `AVAILABLE`。

### 前端使用流程

```
ReturnTicketDialog / TicketDetailPage
  └─ 「確認已歸還備用機」按鈕
       └─ api.confirmLoanerReturn(ticketId)
            └─ POST /api/tickets/{id}/confirm-loaner-return
                 ├─ 呼叫者為借用方（requester_id）
                 │    └─ repair_requests.loaner_return_borrower_confirmed = 1
                 ├─ 呼叫者為出借方（loaner.owner_id）
                 │    └─ repair_requests.loaner_return_lender_confirmed = 1
                 └─ 雙方皆確認（both = 1）
                      ├─ repair_requests.status = 'RETURNED'
                      ├─ assets(loaner).status = 'available'
                      └─ assets(loaner).borrower_id = NULL
```

---

## 7. 資產維修歷史

### DB Schema 關聯

本節 API 為唯讀查詢，無新增欄位，但依賴以下既有與本次新增的欄位：

| 資料表 | 欄位 | 來自 Migration |
|--------|------|----------------|
| `repair_requests.loaner_asset_id` | 備用機 FK | `2b3c4d5e6f7a` |
| `repair_requests.reject_reason` | 退回原因 | `4385d7a8eef7` |
| `attachments.attachable_type = 'REPAIR_RECORD'` | 維修紀錄附件 | `4385d7a8eef7` |

### 新增 API

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/assets/{asset_id}/tickets` | 登入用戶 | 取得資產所有維修工單（含附件） |

**回傳格式**
```json
[
  {
    "request": { /* RepairRequest，含 loaner_asset_id, reject_reason 等新欄位 */ },
    "attachment": { "id": 1, "file_url": "...", "file_name": "..." } | null
  }
]
```

### 前端使用流程

```
AssetRepairHistoryModal（資產詳情頁 / 管理員資產頁）
  └─ Modal 開啟時
       └─ api.getAssetTickets(assetId)
            └─ GET /api/assets/{id}/tickets
                 └─ SELECT rr.*, a.file_url, a.file_name
                    FROM repair_requests rr
                    LEFT JOIN attachments a ON a.attachable_id = rr.id
                    WHERE rr.asset_id = {assetId}
```

---

## 8. 使用者個人資料

### DB Schema 變更

**Migration `7b8c9d0e1f2g`** — `add_hire_termination_date_to_users`（2026-05-17）

| 資料表 | 操作 | 欄位 | 說明 |
|--------|------|------|------|
| `users` | 新增欄位 | `hire_date DATE NULL` | 到職日期 |
| `users` | 新增欄位 | `termination_date DATE NULL` | 離職日期（NULL = 在職；非 NULL = 離職流程已啟動） |

> `termination_date` 非 NULL 表示此員工的離職流程已啟動，`offboarding-checklist` 會切換為「追蹤轉移進度」模式。

**Migration `8c9d0e1f2a3b`** — `add_is_active_to_users`（2026-05-18）

| 資料表 | 操作 | 欄位 | 說明 |
|--------|------|------|------|
| `users` | 新增欄位 | `is_active BOOLEAN NOT NULL DEFAULT 1` | 帳號是否啟用（`finalize` 後設為 0） |

### 新增 API

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `POST` | `/api/users/me/verify-password` | 登入用戶 | 驗證目前密碼（用於變更前確認） |
| `PUT` | `/api/users/me/email` | 登入用戶 | 更新 Email |

**verify-password Request / Response**
```json
// Request
{ "current_password": "..." }
// Response
{ "valid": true }
```

### 前端使用流程

```
ProfilePage — 修改 Email 流程
  ├─ Step 1：輸入目前密碼
  │    └─ api.verifyPassword(currentPassword)
  │         └─ POST /api/users/me/verify-password
  │              └─ bcrypt.checkpw(current_password, users.hashed_password)
  └─ Step 2（驗證通過後）：輸入新 Email
       └─ api.updateMyEmail(email)
            └─ PUT /api/users/me/email
                 └─ UPDATE users SET email = ? WHERE id = me

UserCreatePage / UserDetailPage — 編輯使用者資料
  └─ hire_date / termination_date 欄位
       └─ api.createUser() / api.updateUser()
            └─ INSERT/UPDATE users(..., hire_date, termination_date)
```

---

## 9. 離職流程（Offboarding）

### DB Schema 變更

本節依賴跨三個 migration 的欄位，三者合力完成完整的離職狀態機：

**Migration `7b8c9d0e1f2g`** — `add_hire_termination_date_to_users`（2026-05-17）

| 欄位 | 用途 |
|------|------|
| `users.termination_date DATE NULL` | `offboard` 呼叫後設為指定離職日期；`offboarding-checklist` 以此判斷流程是否已啟動 |

**Migration `8c9d0e1f2a3b`** — `add_is_active_to_users`（2026-05-18）

| 欄位 | 用途 |
|------|------|
| `users.is_active BOOLEAN DEFAULT 1` | `finalize` 呼叫後設為 `0`，帳號停用，無法再登入 |

**Migration `9d0e1f2a3b4c`** — `add_is_offboarding_to_asset_transfers`（2026-05-18）

| 欄位 | 用途 |
|------|------|
| `asset_transfers.is_offboarding_transfer BOOLEAN DEFAULT 0` | 離職流程批次建立的轉移單會設為 `1`；`offboarding-checklist` 僅追蹤 `is_offboarding_transfer=1` 的轉移進度 |

### 新增 API

| 方法 | 路徑 | 權限 | 說明 |
|------|------|------|------|
| `GET` | `/api/users/{employee_id}/offboarding-checklist` | 管理員 | 取得離職前置清單與阻擋項目 |
| `POST` | `/api/users/{employee_id}/offboard` | 管理員 | 啟動離職流程（批次建立資產轉移） |
| `POST` | `/api/users/{employee_id}/offboard/finalize` | 管理員 | 確認所有轉移完成，停用帳號 |

**offboarding-checklist 回傳格式（摘要）**
```json
{
  "can_proceed": true,
  "hard_blocker_reason": null,
  "owned_assets": [...],
  "borrowed_loaners": [...],
  "in_progress_tickets": [...],
  "pending_transfers": [...],
  "open_tickets": [...],
  "is_offboarding_in_progress": false,
  "offboarding_transfers": [...],
  "all_transfers_complete": false
}
```

**offboard Request Body**
```json
{
  "asset_successor_id": 42,
  "termination_date": "2026-06-30"
}
```

**業務規則**
- 管理員不可對自己發起離職。
- 有「維修中工單」或「進行中備用機借用」時為硬性阻擋（`hard_blocker_reason` 非空），無法進行。
- `offboard`：設定 `termination_date`，對所有 `owned_assets` 建立 `is_offboarding_transfer=true` 的 `AssetTransfer`。
- `finalize`：確認 `all_transfers_complete`（所有離職轉移均已 `COMPLETED`）後停用帳號（`is_active = false`）。

### 前端使用流程

```
UserManagementPage → OffboardingModal

  Step 1：確認前置條件
    └─ api.getOffboardingChecklist(employeeId)
         └─ GET /api/users/{id}/offboarding-checklist
              ├─ users.termination_date IS NULL
              │    → 查詢 owned_assets, open_tickets, in_progress_tickets…
              │    → can_proceed = false（有 hard_blocker）→ 顯示阻擋原因，停止
              │    → can_proceed = true  → 顯示待處理清單，進入 Step 2
              └─ users.termination_date IS NOT NULL（流程已啟動）
                   → 查詢 is_offboarding_transfer=1 的轉移進度
                   → 直接進入 Step 3

  Step 2：指定接收人 & 離職日期 → 啟動流程
    └─ api.offboardUser(employeeId, { asset_successor_id, termination_date })
         └─ POST /api/users/{id}/offboard
              ├─ UPDATE users SET termination_date = ?
              └─ 對每筆 owned_asset：
                   INSERT asset_transfers(
                     asset_id, from_owner_id=員工, to_owner_id=接收人,
                     is_offboarding_transfer=1, status='PENDING'
                   )

  Step 3：等待所有轉移完成（接收人各自在 PendingTransfersBanner 確認）
    └─ api.getOffboardingChecklist(employeeId)
         └─ GET /api/users/{id}/offboarding-checklist
              ├─ all_transfers_complete = false
              │    → 顯示 offboarding_transfers 列表（含 to_confirmed 狀態）
              └─ all_transfers_complete = true
                   → 解鎖「完成離職」按鈕

  Step 4：最終確認，停用帳號
    └─ api.finalizeOffboarding(employeeId)
         └─ POST /api/users/{id}/offboard/finalize
              └─ UPDATE users SET is_active = 0（帳號停用，無法再登入）
```

---

## 新增 TypeScript 型別對照表

| 型別名稱 | 說明 |
|----------|------|
| `Department` | 部門（id, name） |
| `OfficeLocation` | 辦公地點（id, name） |
| `Vendor` | 廠商（id, name） |
| `AssetTransfer` | 資產轉移記錄（含雙方確認狀態） |
| `OffboardingChecklist` | 離職前置清單（阻擋項目、進度追蹤） |
| `OffboardingAssetItem` | 離職清單中的資產項目 |
| `OffboardingTicketItem` | 離職清單中的工單項目 |
| `OffboardingTransferItem` | 離職清單中待處理的轉移項目 |
| `OffboardingTransferStatus` | 離職轉移進度（含雙方確認旗標） |
| `OffboardPayload` | 啟動離職 API 的請求體 |

---

## Migration 遷移鏈與影響資料表

按執行順序排列，`←` 表示 `down_revision` 依賴關係：

```
6ca2a962c478 (apply_indexing)
  ↓
4385d7a8eef7  add_returned_status_reject_reason   (2026-05-14)
  │  ┌─ CREATE TABLE asset_transfers
  │  ├─ ALTER repair_requests.status  ADD 'RETURNED'
  │  ├─ ADD   repair_requests.reject_reason TEXT NULL
  │  └─ ALTER attachments.attachable_type  ADD 'REPAIR_RECORD'
  ↓
2b3c4d5e6f7a  asset_deactivated_status_and_loaner_asset  (2026-05-15)
  │  ├─ ALTER assets.status  ADD 'deactivated'
  │  └─ ADD   repair_requests.loaner_asset_id BIGINT FK→assets
  ↓
c1d2e3f4a5b6  loaner_return_flow  (2026-05-16)
  │  ├─ ADD   assets.borrower_id BIGINT FK→users
  │  ├─ ALTER repair_requests.status  ADD 'WAITING_LOANER_RETURN'
  │  ├─ ADD   repair_requests.loaner_return_borrower_confirmed BOOL
  │  └─ ADD   repair_requests.loaner_return_lender_confirmed BOOL
  ↓
4e5f6a7b8c9d  move_location_to_user  (2026-05-16)
  │  ├─ ADD   users.location VARCHAR(255) NULL
  │  └─ DROP  departments.location
  ↓
5f6a7b8c9d0e  add_office_locations  (2026-05-16)
  │  └─ CREATE TABLE office_locations (id, name UNIQUE)
  ↓
6a7b8c9d0e1f  add_vendors  (2026-05-17)
  │  └─ CREATE TABLE vendors (id, name UNIQUE)
  ↓
7b8c9d0e1f2g  add_hire_termination_date_to_users  (2026-05-17)
  │  ├─ ADD   users.hire_date DATE NULL
  │  └─ ADD   users.termination_date DATE NULL
  ↓
8c9d0e1f2a3b  add_is_active_to_users  (2026-05-18)
  │  └─ ADD   users.is_active BOOL NOT NULL DEFAULT 1
  ↓
9d0e1f2a3b4c  add_is_offboarding_to_asset_transfers  (2026-05-18)
     └─ ADD   asset_transfers.is_offboarding_transfer BOOL NOT NULL DEFAULT 0
```

### 受影響資料表彙整

| 資料表 | 變更類型 | 本次異動欄位 |
|--------|----------|-------------|
| `vendors` | 新建 | — |
| `office_locations` | 新建 | — |
| `asset_transfers` | 新建 | `is_offboarding_transfer` |
| `assets` | 欄位新增 / enum 擴充 | `borrower_id`, `status(+deactivated)` |
| `repair_requests` | 欄位新增 / enum 擴充 | `reject_reason`, `loaner_asset_id`, `loaner_return_borrower_confirmed`, `loaner_return_lender_confirmed`, `status(+RETURNED +WAITING_LOANER_RETURN)` |
| `attachments` | enum 擴充 | `attachable_type(+REPAIR_RECORD)` |
| `users` | 欄位新增 | `location`, `hire_date`, `termination_date`, `is_active` |
| `departments` | 欄位刪除 | `location` |

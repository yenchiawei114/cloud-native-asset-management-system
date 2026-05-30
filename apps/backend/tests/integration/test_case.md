根據您提供的 API 列表，這份「雲原生 API」設計具有非常明確的**身分驗證 (Authentication)** 與**角色權限控制 (RBAC, 包含一般用戶與管理員)** 機制。

在撰寫整合測試 (Integration Test) 時，除了測試基本的資料庫 CRUD（新增、讀取、更新、刪除）是否正常外，**最重要的核心是測試「權限隔離」與「業務流程」**。

以下是建議您需要撰寫的整合測試清單，分為「共通性測試」、「各模組 API 測試」以及「整合情境測試」三個層次：

### 一、 共通性安全與驗證測試 (Global Middleware)
這些測試確保您的系統基底是安全的，不會因為漏掉掛載 Middleware 而產生漏洞。
1. **未登入存取防護 (401 Unauthorized)**：
   * 針對所有標註為「登入用戶」或「管理員 (ADMIN)」的 API，不帶 Token 進行呼叫，確認皆返回 `401 Unauthorized`。
2. **無效 / 過期 Token 測試** (有機會再做)：
   * 帶入竄改過的 Token 或已過期的 Token 呼叫 API，確認系統正確攔截並返回錯誤。
3. **越權存取防護 (403 Forbidden)**：
   * 使用「一般用戶」的 Token，嘗試呼叫標註為「管理員 (ADMIN)」專屬的 API（例如 `POST /api/assets`, `DELETE /api/tickets/{ticket_id}/inspection` 等），確認返回 `403 Forbidden`。

---

### 二、 各模組 API 具體測試案例

#### 1. Auth (身分認證模組)
* **`POST /api/login`**：
  * **[成功]** 輸入正確帳號密碼，成功回傳 Token 與用戶基本資訊。
  * **[失敗]** 輸入錯誤密碼或不存在的帳號，回傳錯誤訊息 (400 或 401)。
* **`GET /api/me`**：
  * **[成功]** 帶入有效 Token，回傳該 Token 對應的正確用戶資訊。
* **`POST /api/logout`**：
  * **[成功]** 呼叫後，該 Token 應立即失效 (可搭配呼叫 `/api/me` 驗證是否變成 401)。

#### 2. Assets (資產模組)
* **資料隔離測試 (最重要)**：
  * **[成功]** 用戶 A 呼叫 `GET /api/assets`，**只**會回傳用戶 A 的資產列表。
  * **[失敗]** 用戶 A 嘗試呼叫 `GET /api/assets/{用戶B的資產ID}`，應回傳 `403 Forbidden` 或 `404 Not Found` (避免洩漏該 ID 存在)。
* **管理員權限測試**：
  * **[成功]** 管理員呼叫 `POST /api/assets` 成功新增資產，並能呼叫 `DELETE` 成功刪除。
  * **[成功]** (假設邏輯允許) 管理員呼叫 `GET /api/assets` 應能看到系統內所有資產。

#### 3. Tickets (維修單模組 - 系統核心)
這個模組最複雜，包含主表單與多個子資源，需著重測試「僅限本人」的業務邏輯。

* **主表單 (Tickets)**
  * **[成功]** 一般用戶呼叫 `POST /api/tickets` 成功建立表單。
  * **[成功]** 一般用戶呼叫 `PUT /api/tickets/{自己表單ID}` 成功更新內容。
  * **[失敗]** 一般用戶呼叫 `PUT /api/tickets/{他人表單ID}` 拒絕更新 (403/404)。
  * **[成功]** 管理員呼叫 `PATCH /api/tickets/{ticket_id}/status` 成功變更狀態。
* **報修檢驗 (Inspection) & 維修紀錄 (Record)**
  * **[寫入權限]** 驗證 `POST`, `PUT`, `DELETE` 這些端點只有 ADMIN 可以操作成功，一般用戶會被擋下。
  * **[讀取權限]** 用戶 A 呼叫 `GET /api/tickets/{自己表單ID}/record` 成功取得紀錄；但呼叫 `{他人表單ID}/record` 應被拒絕。管理員則可取得任何表單的紀錄。
* **附件 (Attachments)**
  * **[成功]** 測試 `POST /api/attachments/upload` 能正確處理 multipart/form-data 檔案上傳並儲存。
  * **[資料隔離]** 一般用戶呼叫 `GET` 或 `PUT` 只能操作自己上傳的附件 `{attachment_id}`。
  * **[成功]** 管理員呼叫 `GET /api/attachments` 成功列出系統所有附件清單。

---

### 三、 端到端 (End-to-End) 業務情境測試
除了單一 API，強烈建議撰寫幾支涵蓋完整生命週期的整合測試，這能確保資料庫交易 (Transaction) 與資料關聯正確無誤：

* **情境一：完整的維修單處理流程 (Happy Path)**
  1. 一般用戶 A 登入取得 Token。
  2. 用戶 A 建立一張維修單 (`POST /api/tickets`)，取得 `ticket_id`。
  3. 用戶 A 上傳損壞照片 (`POST /api/attachments/upload`)。
  4. 管理員登入取得 Admin Token。
  5. 管理員查看列表 (`GET /api/tickets`) 發現新表單。
  6. 管理員建立報修檢驗 (`POST /api/tickets/{ticket_id}/inspection`)。
  7. 管理員更新表單狀態為「處理中」 (`PATCH /api/tickets/{ticket_id}/status`)。
  8. 用戶 A 查看自己的表單 (`GET /api/tickets/{ticket_id}`)，確認狀態已改變且能看到檢驗資訊。

* **情境二：資源刪除的連鎖反應 (Cascade Delete 測試)**
  1. 用戶建立維修單並關聯附件。
  2. 管理員針對該維修單建立檢驗與維修紀錄。
  3. 用戶呼叫 `DELETE /api/tickets/{ticket_id}` 刪除該維修單。
  4. **[驗證]** 透過管理員權限查詢資料庫或 API，確認該 `ticket_id` 底下的 inspection, record 是否有被正確清除 (或者標記為軟刪除 Soft Delete)，避免產生孤兒資料 (Orphan Data)。

**給開發者的實作建議：**
在撰寫這些測試時，建議每個 Test Case 開始前都準備乾淨的資料庫狀態 (例如使用 Test Database 並在每次執行前清除資料/重新建立 Seed)，並建立 Helper 函式來快速產生「一般用戶 Token」與「管理員 Token」，這會大幅加快您的測試開發速度。
# Frontend Architecture (前端架構說明)

本專案的前端基於 **垂直模組化 (Vertical Slice Architecture)** 與 **領域驅動設計 (Domain-Driven Design)** 的理念進行建構。這份文件詳細介紹了 `src/` 目錄下各個資料夾的職責與組織方式，幫助開發團隊維持高內聚、低耦合的程式碼基礎。

## 目錄結構總覽

```text
src/
├── assets/         // 靜態資源：圖片、字體、全域樣式
├── modules/        // 核心業務與通用邏輯，採用垂直模組化
│   ├── core/       // 基礎建設與通用服務層
│   ├── auth/       // 身份驗證與權限控管
│   ├── assets/     // 資產管理核心業務
│   └── ticketing/  // 報修與維修流程
├── pages/          // 頁面進入點：組合 modules/ 中的組件以定義路由
├── store/          // 全域狀態管理 (Zustand / Context)
├── types/          // 核心型別定義
└── App.tsx         // React 應用程式進入點與 Router 設定
```

---

## 詳細說明

### 1. `modules/`：核心業務領域 (Domain Modules)
這是整個前端架構的核心。有別於傳統將所有 components 或 hooks 混雜在一起的做法，我們依照「業務功能 (Feature/Domain)」來切分資料夾。這帶來了極佳的可維護性：當你要修改某個特定功能時，相關的 UI 與邏輯都在同一個模組內。

#### `core/` (基礎建設層 Horizontal Shared Layer)
負責橫跨所有模組的通用功能，不屬於任何特定領域。
* **`components/`**：頂層共用 UI (例如 `Layout`, `Navbar`, `Footer`) 以及不受業務限制的基礎元件。
* **`design-system/`**：通用的底層 UI 庫 (例如 `Button`, `InputField`, `Modal`)，確保整站視覺與操作流程一致。
* **`hooks/`**：全域無業務關聯的 Hook (例如 `useWindowSize`, 多語系 `useI18n`)。
* **`services/`**：API 基礎建設 (如設定 Axios Instance、全局錯誤攔截)。
* **`utils/`**：純粹的 JS/TS 工具函式 (如 `formatDate`, `validateEmail`)。

#### `auth/` (身分驗證 領域)
專注於使用者的登入、登出、權限管理與 Session 控制。
* **`components/`**：登入表單元件、角色權限圍欄 (Role-Based Access Control Wrapper)。
* **`hooks/`**：`useAuth()` 獲取當前使用者與權限狀態。
* **`services/`**：登入 API、權限檢查 API。

#### `assets/` (資產管理 領域)
處理雲端原生資產管理系統中「資產」的本體邏輯。
* **`components/`**：資產清單表、資產詳細資料卡片、條件篩選器。
* **`hooks/`**：包含例如併發控制的邏輯處理 (如樂觀鎖 `useEditLock`)。
* **`services/`**：資產 CRUD API 封裝。

#### `ticketing/` (報修 / 維修 領域)
處理企業內部設備申請、報修或盤點等表單簽核流程。
* **`components/`**：報修表單 (含動態欄位例如備用機)、驗收流程卡片。
* **`hooks/`**：處理複雜的動態表單狀態。
* **`services/`**：報修單 CRUD、狀態流轉的 API 呼叫。

### 2. `pages/` (頁面與路由)
這裡的元件非常「薄 (Thin)」。它們的職責是依照路由 (URL) 對應到相應的頁面，然後**組裝 (Compose)** 來自各個 `modules/` 的組件來渲染畫面。
* **守則**：這裡不應該包含太複雜的 API 呼叫、狀態管理或樣式，請將邏輯封裝在 `modules` 內再引進來。

### 3. `store/` (全域狀態管理)
存放真正跨越多個業務模組、且必須在應用程式生命週期中留存的共用狀態。
* 可以使用 Context API 或 Zustand (建議) 來實作。
* 例如：全域 `Theme` (Dark/Light Mode)、全域 `Toast` 通知列表狀態等。

### 4. `types/` (全域型別)
TypeScript 專用。放置跨模組共用的 Interface、Type 與 Enum，例如 `IUser`, `IAsset`, `APIResponse`，能有效避免模組之間的循環依賴 (Circular Dependency) 問題。

### 5. `assets/` (靜態資源)
放置不會變動的應用程式級靜態資源。
* 全站 CSS Reset 與全域樣式檔。
* 圖片資源、公司 Logo (SVG / PNG)。
* 外部字體。

## 開發守則與注意事項 (Development Guidelines)
1. **先找模組，再寫 Code**：開發新功能時，先判斷它屬於哪個既有模組。若它是全新的獨立業務線，請在 `modules/` 下開一個新資料夾。
2. **避免跨模組耦合**：盡量不要讓 `assets` 模組直接去載入 `ticketing` 模組內部的 Hooks 或特殊組件。如果某個功能被多個模組共用，就應該重構將其搬移到 `core/` 下。

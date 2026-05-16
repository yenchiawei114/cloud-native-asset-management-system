import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "../modules/dashboard/components/DashboardLayout";
import { useAssets } from "../modules/assets/hooks/useAssets";
import { AddAssetDialog } from "../modules/assets/components/AddAssetDialog";
import { AssetTransferDialog } from "../modules/assets/components/AssetTransferDialog";
import { api, Asset, Vendor } from "../lib/api";
import { PendingTransfersBanner } from "../modules/assets/components/PendingTransfersBanner";

const ASSET_TYPES = [
  { value: "", label: "所有類別" },
  { value: "laptop", label: "筆電" },
  { value: "desktop", label: "桌機" },
  { value: "phone", label: "手機" },
  { value: "tablet", label: "平板" },
  { value: "server", label: "伺服器" },
  { value: "network", label: "網路設備" },
  { value: "other", label: "其他" },
];

const ASSET_TYPE_OPTIONS = ASSET_TYPES.filter((t) => t.value);

const ASSET_STATUSES = [
  { value: "", label: "所有狀態" },
  { value: "in_use", label: "使用中" },
  { value: "available", label: "閒置" },
  { value: "maintenance", label: "維修中" },
  { value: "borrowed", label: "已借出" },
  { value: "deactivated", label: "已停用" },
];

const ASSET_STATUS_OPTIONS = ASSET_STATUSES.filter((s) => s.value);

interface SearchState {
  asset_code_q: string;
  name_q: string;
  model_q: string;
  spec_q: string;
  vendor_q: string;
  owner_q: string;
  asset_type: string;
  status: string;
}

const EMPTY_SEARCH: SearchState = {
  asset_code_q: "",
  name_q: "",
  model_q: "",
  spec_q: "",
  vendor_q: "",
  owner_q: "",
  asset_type: "",
  status: "",
};

export const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<SearchState>(EMPTY_SEARCH);
  const [submitted, setSubmitted] = useState<SearchState>(EMPTY_SEARCH);

  const { assets, loading, refresh } = useAssets({
    asset_code_q: submitted.asset_code_q || undefined,
    name_q: submitted.name_q || undefined,
    model_q: submitted.model_q || undefined,
    spec_q: submitted.spec_q || undefined,
    vendor_q: submitted.vendor_q || undefined,
    owner_q: submitted.owner_q || undefined,
    asset_type: submitted.asset_type || undefined,
    status: submitted.status || undefined,
  });

  const [vendors, setVendors] = useState<Vendor[]>([]);
  useEffect(() => {
    api
      .listVendors()
      .then(setVendors)
      .catch(() => {});
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [transferAsset, setTransferAsset] = useState<Asset | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<
    Record<number, Record<string, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const handleSearch = () => setSubmitted({ ...draft });
  const handleClear = () => {
    setDraft(EMPTY_SEARCH);
    setSubmitted(EMPTY_SEARCH);
  };
  const draftField = (key: keyof SearchState, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setFieldEdit = (assetId: number, field: string, value: string) =>
    setPendingEdits((prev) => ({
      ...prev,
      [assetId]: { ...(prev[assetId] ?? {}), [field]: value },
    }));

  const getFieldValue = (asset: Asset, field: keyof Asset) =>
    (pendingEdits[asset.id]?.[field as string] ??
      String(asset[field] ?? "")) as string;

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const updateResults = await Promise.allSettled(
        Object.entries(pendingEdits).map(([id, edits]) =>
          api.updateAsset(Number(id), edits as any),
        ),
      );
      const updateFailed = updateResults.filter(
        (r) => r.status === "rejected",
      ).length;
      if (updateFailed > 0) {
        setSaveError(`${updateFailed} 筆更新失敗`);
      }
      setPendingEdits({});
      setEditMode(false);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    if (!confirm("確定要停用此資產？停用後將清除保管人與辦公地點資訊。"))
      return;
    try {
      await api.deactivateAsset(id);
      refresh();
    } catch (err: any) {
      alert(`停用失敗：${err.message}`);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      await api.activateAsset(id);
      refresh();
    } catch (err: any) {
      alert(`啟用失敗：${err.message}`);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setPendingEdits({});
    setSaveError("");
  };

  if (loading) {
    return (
      <DashboardLayout activeTab="all">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const editCount = Object.keys(pendingEdits).length;

  return (
    <DashboardLayout activeTab="all">
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
              {t("auth.nav.allAssets")}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {editMode ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">
                    save
                  </span>
                  {saving
                    ? "儲存中..."
                    : `存檔${editCount > 0 ? `（更新 ${editCount} 筆）` : ""}`}
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors"
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">
                    edit
                  </span>
                  編輯
                </button>
                <button
                  onClick={() => setAddOpen(true)}
                  className="px-4 py-2 bg-gradient-to-br from-primary to-primary-container text-on-primary text-sm font-bold rounded-lg flex items-center gap-2 transition-transform active:scale-95"
                >
                  <span className="material-symbols-outlined text-sm">
                    add_circle
                  </span>
                  {t("auth.nav.addNewAsset")}
                </button>
              </>
            )}
          </div>
        </div>

        {saveError && (
          <div className="bg-error-container/20 border border-error/30 rounded-lg px-4 py-2 text-sm text-error font-medium">
            {saveError}
          </div>
        )}

        <PendingTransfersBanner onConfirmed={refresh} />

        {/* Search */}
        <section className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
            <SearchInput
              label="資產編號"
              value={draft.asset_code_q}
              onChange={(v) => draftField("asset_code_q", v)}
              placeholder="A0000001"
            />
            <SearchInput
              label="資產名稱"
              value={draft.name_q}
              onChange={(v) => draftField("name_q", v)}
              placeholder="MacBook Pro"
            />
            <SearchInput
              label="型號"
              value={draft.model_q}
              onChange={(v) => draftField("model_q", v)}
              placeholder="MBP14-M3"
            />
            <SearchInput
              label="規格"
              value={draft.spec_q}
              onChange={(v) => draftField("spec_q", v)}
              placeholder="16GB 512GB"
            />
            <SearchInput
              label="保管人（姓名/工號）"
              value={draft.owner_q}
              onChange={(v) => draftField("owner_q", v)}
              placeholder="王小明 / A12345678"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                廠商
              </label>
              <input
                value={draft.vendor_q}
                onChange={(e) => draftField("vendor_q", e.target.value)}
                placeholder="Apple, Dell..."
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                分類
              </label>
              <select
                value={draft.asset_type}
                onChange={(e) => draftField("asset_type", e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none"
              >
                {ASSET_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                狀態
              </label>
              <select
                value={draft.status}
                onChange={(e) => draftField("status", e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none"
              >
                {ASSET_STATUSES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleSearch}
                className="flex-1 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">
                  search
                </span>
                搜尋
              </button>
              <button
                onClick={handleClear}
                className="flex-1 py-2 bg-surface-container-highest text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container transition-colors flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">
                  clear_all
                </span>
                清空
              </button>
            </div>
          </div>
        </section>

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm border border-outline-variant/10">
          <div className="overflow-x-auto">
            <table className="min-w-max w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                  {!editMode && <th className="px-4 py-3">操作</th>}
                  <th className="px-4 py-3">資產編號</th>
                  <th className="px-4 py-3">資產名稱</th>
                  <th className="px-4 py-3 text-center">狀態</th>
                  <th className="px-4 py-3">分類</th>
                  <th className="px-4 py-3">廠商</th>
                  <th className="px-4 py-3">型號</th>
                  <th className="px-4 py-3">規格</th>
                  <th className="px-4 py-3">保管人</th>
                  <th className="px-4 py-3">辦公地點</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {assets.map((asset) => {
                  const isDeactivated = asset.status === "deactivated";
                  const isRowDirty = !!pendingEdits[asset.id];
                  const val = (f: keyof Asset) => getFieldValue(asset, f);
                  const set = (f: string, v: string) =>
                    setFieldEdit(asset.id, f, v);

                  return (
                    <tr
                      key={asset.id}
                      className={`transition-colors ${isDeactivated ? "opacity-50" : isRowDirty ? "bg-amber-50" : "hover:bg-surface-container-low"}`}
                    >
                      {/* 操作 — 編輯模式下隱藏 */}
                      {!editMode && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {!isDeactivated && (
                              <ActionBtn
                                icon="build"
                                label="維修紀錄"
                                onClick={() =>
                                  navigate(`/all-assets/${asset.id}/repairs`)
                                }
                              />
                            )}
                            {!isDeactivated && (
                              <ActionBtn
                                icon="swap_horiz"
                                label="資產轉移"
                                onClick={() => setTransferAsset(asset)}
                              />
                            )}
                            {!isDeactivated && (
                              <ActionBtn
                                icon="power_off"
                                label="停用"
                                onClick={() => handleDeactivate(asset.id)}
                              />
                            )}
                            {isDeactivated && (
                              <ActionBtn
                                icon="power"
                                label="啟用"
                                onClick={() => handleActivate(asset.id)}
                              />
                            )}
                          </div>
                        </td>
                      )}

                      {/* 資產編號 */}
                      <td className="px-4 py-3">
                        {editMode && !isDeactivated ? (
                          <input
                            value={val("asset_code")}
                            onChange={(e) => set("asset_code", e.target.value)}
                            className={inlineCls}
                            maxLength={10}
                          />
                        ) : (
                          <span className="font-mono font-bold text-primary text-xs">
                            {asset.asset_code}
                          </span>
                        )}
                      </td>

                      {/* 資產名稱 */}
                      <td className="px-4 py-3">
                        {editMode && !isDeactivated ? (
                          <input
                            value={val("name")}
                            onChange={(e) => set("name", e.target.value)}
                            className={inlineCls}
                          />
                        ) : (
                          <p className="font-semibold text-on-surface">
                            {asset.name}
                          </p>
                        )}
                      </td>

                      {/* 狀態 — 唯讀，僅透過業務流程變更 */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusStyle(asset.status)}`}
                        >
                          {ASSET_STATUS_OPTIONS.find(
                            (s) => s.value === asset.status,
                          )?.label ?? asset.status}
                        </span>
                      </td>

                      {/* 分類 */}
                      <td className="px-4 py-3 text-on-surface-variant text-xs">
                        {editMode && !isDeactivated ? (
                          <select
                            value={val("type")}
                            onChange={(e) => set("type", e.target.value)}
                            className={inlineCls}
                          >
                            {ASSET_TYPE_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (ASSET_TYPE_OPTIONS.find(
                            (t) => t.value === asset.type,
                          )?.label ?? asset.type)
                        )}
                      </td>

                      {/* 廠商 */}
                      <td className="px-4 py-3 text-on-surface-variant">
                        {editMode && !isDeactivated ? (
                          <select
                            value={val("vendor")}
                            onChange={(e) => set("vendor", e.target.value)}
                            className={inlineCls}
                          >
                            {vendors.map((v) => (
                              <option key={v.id} value={v.name}>
                                {v.name}
                              </option>
                            ))}
                            {vendors.length === 0 && (
                              <option value={val("vendor")}>
                                {val("vendor")}
                              </option>
                            )}
                          </select>
                        ) : (
                          <span className="whitespace-nowrap">
                            {asset.vendor || "—"}
                          </span>
                        )}
                      </td>

                      {/* 型號 */}
                      <td className="px-4 py-3 text-on-surface-variant">
                        {editMode && !isDeactivated ? (
                          <input
                            value={val("model")}
                            onChange={(e) => set("model", e.target.value)}
                            className={inlineCls}
                            placeholder="型號"
                          />
                        ) : (
                          <span className="whitespace-nowrap">
                            {asset.model || "—"}
                          </span>
                        )}
                      </td>

                      {/* 規格 */}
                      <td className="px-4 py-3 text-on-surface-variant">
                        {editMode && !isDeactivated ? (
                          <input
                            value={val("specification")}
                            onChange={(e) =>
                              set("specification", e.target.value)
                            }
                            className={inlineCls}
                            placeholder="規格"
                          />
                        ) : (
                          <span className="whitespace-nowrap">
                            {asset.specification || "—"}
                          </span>
                        )}
                      </td>

                      {/* 保管人（鎖定） */}
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                        {asset.owner_name ? (
                          <div>
                            <p className="font-medium text-on-surface">
                              {asset.owner_name}
                            </p>
                            <p className="text-[10px] font-mono">
                              {asset.owner_employee_id}
                            </p>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* 辦公地點（跟隨保管人，唯讀） */}
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                        {asset.office_location || "—"}
                      </td>
                    </tr>
                  );
                })}

                {assets.length === 0 && (
                  <tr>
                    <td
                      colSpan={editMode ? 9 : 10}
                      className="py-20 text-center opacity-40 whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-6xl mb-4 block">
                        database_off
                      </span>
                      <p className="font-bold">
                        {t("dashboard.employee.noAssets")}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AddAssetDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={refresh}
      />
      <AssetTransferDialog
        asset={transferAsset}
        onClose={() => setTransferAsset(null)}
        onTransferInitiated={refresh}
      />
    </DashboardLayout>
  );
};

const inlineCls =
  "w-full bg-surface-container-highest rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary min-w-[80px]";

const getStatusStyle = (status: string) => {
  switch (status) {
    case "available":
      return "bg-green-100 text-green-700 border-green-200";
    case "in_use":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "maintenance":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "borrowed":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "deactivated":
      return "bg-slate-100 text-slate-400 border-slate-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
};

const ActionBtn: React.FC<{
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ icon, label, onClick, disabled }) => (
  <button
    onClick={onClick}
    title={label}
    disabled={disabled}
    className="p-1.5 rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant flex items-center gap-1 disabled:opacity-30 disabled:pointer-events-none"
  >
    <span className="material-symbols-outlined text-base">{icon}</span>
    <span className="text-xs font-medium hidden xl:inline">{label}</span>
  </button>
);

const SearchInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
      {label}
    </label>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
    />
  </div>
);

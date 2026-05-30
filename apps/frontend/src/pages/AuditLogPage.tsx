import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "../modules/dashboard/components/DashboardLayout";
import { useAuditLogs } from "../modules/audit/hooks/useAuditLogs";
import { UserSearchCombobox } from "../modules/core/components/UserSearchCombobox";
import { Pagination } from "../modules/core/design-system/Pagination";
import type { AuditLog, User } from "../lib/api";
import { fmtDateTime } from "../lib/locale";

const PAGE_SIZE = 20;

const sanitizeTargetName = (name: string | null | undefined): string => {
  if (!name) return "—";
  return name.replace(/^[一-鿿]+\s*/, "");
};

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
};

const DiffSummary: React.FC<{ log: AuditLog }> = ({ log }) => {
  const { t } = useTranslation();
  const na = t("common.noData");

  if (!log.detail) {
    return <span className="text-xs text-outline italic">—</span>;
  }

  const { before, after } = log.detail;

  if (log.action === "UPDATE" && before && after) {
    const isObj =
      typeof after === "object" && after !== null && !Array.isArray(after);

    if (isObj) {
      const changed = Object.keys(after).filter(
        (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
      );
      if (changed.length === 0) {
        return (
          <span className="text-xs text-outline italic">
            {t("audit.noChanges")}
          </span>
        );
      }
      return (
        <div className="space-y-1">
          {changed.map((key) => (
            <div key={key} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <span className="text-[10px] font-mono text-outline shrink-0">
                {t(`audit.fields.${key}`, { defaultValue: key })}
              </span>
              <span className="text-red-500 line-through">
                {String(before[key] ?? na)}
              </span>
              <span className="material-symbols-outlined text-[12px] text-outline leading-none shrink-0">
                arrow_forward
              </span>
              <span className="text-green-700 font-medium">
                {String(after[key] ?? na)}
              </span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span className="text-red-500 line-through">{String(before ?? na)}</span>
        <span className="material-symbols-outlined text-[12px] text-outline leading-none">
          arrow_forward
        </span>
        <span className="text-green-700 font-medium">{String(after ?? na)}</span>
      </div>
    );
  }

  const isCreate = log.action === "CREATE";
  const data = isCreate ? after : before ?? log.detail;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return (
      <span className={`text-xs font-medium ${isCreate ? "text-green-700" : "text-red-600"}`}>
        {String(data ?? na)}
      </span>
    );
  }

  return (
    <div className="space-y-0.5">
      {Object.entries(data as Record<string, unknown>).map(([key, val]) => (
        <div
          key={key}
          className={`flex items-center gap-1 text-xs whitespace-nowrap ${isCreate ? "text-green-700" : "text-red-600"}`}
        >
          <span className="text-[10px] font-mono text-outline shrink-0">
            {t(`audit.fields.${key}`, { defaultValue: key })}:
          </span>
          <span className="font-medium">{String(val ?? na)}</span>
        </div>
      ))}
    </div>
  );
};

// 拆解 "YYYY-MM-DDTHH:MM" → { date, time }
const splitDt = (dt: string) => {
  if (!dt) return { date: "", time: "" };
  const idx = dt.indexOf("T");
  return idx === -1
    ? { date: dt, time: "" }
    : { date: dt.slice(0, idx), time: dt.slice(idx + 1) };
};

// 合併 date + time → "YYYY-MM-DDTHH:MM"（date 必須有值才合併）
const mergeDt = (date: string, time: string) => {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
};

export const AuditLogPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === "en-US";
  const dateLang = isEn ? "en" : "zh-TW";

  const [skip, setSkip] = useState(0);
  const [filters, setFilters] = useState({
    target_type: "",
    from_datetime: "",
    to_datetime: "",
  });
  const [selectedOperator, setSelectedOperator] = useState<User | null>(null);

  const fromDt = splitDt(filters.from_datetime);
  const toDt = splitDt(filters.to_datetime);

  const isInvalidRange =
    !!filters.from_datetime &&
    !!filters.to_datetime &&
    filters.to_datetime <= filters.from_datetime;

  const { logs, total, loading } = useAuditLogs({
    page: Math.floor(skip / PAGE_SIZE) + 1,
    page_size: PAGE_SIZE,
    target_type: filters.target_type || undefined,
    from_datetime: filters.from_datetime || undefined,
    to_datetime: !isInvalidRange ? (filters.to_datetime || undefined) : undefined,
    user_id: selectedOperator?.id ?? undefined,
  });

  const setFilter = <K extends keyof typeof filters>(key: K, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setSkip(0);
  };

  const setFromDate = (date: string) => setFilter("from_datetime", mergeDt(date, fromDt.time));
  const setFromTime = (time: string) => { if (fromDt.date) setFilter("from_datetime", mergeDt(fromDt.date, time)); };
  const setToDate = (date: string) => setFilter("to_datetime", mergeDt(date, toDt.time));
  const setToTime = (time: string) => { if (toDt.date) setFilter("to_datetime", mergeDt(toDt.date, time)); };

  return (
    <DashboardLayout activeTab="audit">
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
              {t("audit.title")}
            </h1>
          </div>
        </div>

        {/* Filters */}
        <section className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {/* 操作人員 */}
            <UserSearchCombobox
              label={t("audit.operator")}
              selectedUser={selectedOperator}
              onSelect={(u) => {
                setSelectedOperator(u);
                setSkip(0);
              }}
            />

            {/* 目標類型 */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {t("audit.targetType")}
              </label>
              <select
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none appearance-none"
                value={filters.target_type}
                onChange={(e) => setFilter("target_type", e.target.value)}
              >
                <option value="">{t("audit.filters.allTypes")}</option>
                <option value="ASSET">{t("audit.type.ASSET")}</option>
                <option value="TICKET">{t("audit.type.TICKET")}</option>
                <option value="USER">{t("audit.type.USER")}</option>
              </select>
            </div>

            {/* 開始時間：date + time 分開 */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {t("audit.filters.startTime")}
              </label>
              <div className="flex gap-1">
                <div className="relative group flex-1 min-w-0">
                  <input
                    key={`from-date-${dateLang}`}
                    type="date"
                    lang={dateLang}
                    style={isEn && !fromDt.date ? { color: "transparent" } : undefined}
                    className="w-full bg-surface-container-highest border-none rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none px-2 py-2"
                    max={toDt.date || undefined}
                    value={fromDt.date}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                  {isEn && !fromDt.date && (
                    <span className="absolute inset-0 flex items-center px-2 text-sm text-on-surface-variant/40 pointer-events-none group-focus-within:hidden">
                      mm/dd/yyyy
                    </span>
                  )}
                </div>
                <input
                  type="time"
                  className="w-[8rem] bg-surface-container-highest border-none rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none px-2 py-2"
                  value={fromDt.time}
                  disabled={!fromDt.date}
                  onChange={(e) => setFromTime(e.target.value)}
                />
              </div>
            </div>

            {/* 結束時間：date + time 分開 */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {t("audit.filters.endTime")}
              </label>
              <div className="flex gap-1">
                <div className="relative group flex-1 min-w-0">
                  <input
                    key={`to-date-${dateLang}`}
                    type="date"
                    lang={dateLang}
                    style={isEn && !toDt.date ? { color: "transparent" } : undefined}
                    className={`w-full bg-surface-container-highest border-none rounded-lg text-sm focus:ring-2 outline-none px-2 py-2 ${
                      isInvalidRange ? "ring-2 ring-error focus:ring-error" : "focus:ring-primary"
                    }`}
                    min={fromDt.date || undefined}
                    value={toDt.date}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                  {isEn && !toDt.date && (
                    <span className="absolute inset-0 flex items-center px-2 text-sm text-on-surface-variant/40 pointer-events-none group-focus-within:hidden">
                      mm/dd/yyyy
                    </span>
                  )}
                </div>
                <input
                  type="time"
                  className={`w-[8rem] bg-surface-container-highest border-none rounded-lg text-sm focus:ring-2 outline-none px-2 py-2 ${
                    isInvalidRange ? "ring-2 ring-error focus:ring-error" : "focus:ring-primary"
                  }`}
                  value={toDt.time}
                  disabled={!toDt.date}
                  onChange={(e) => setToTime(e.target.value)}
                />
              </div>
              {isInvalidRange && (
                <p className="text-[10px] text-error font-medium flex items-center gap-1 mt-0.5">
                  <span className="material-symbols-outlined text-xs leading-none">error</span>
                  {t("audit.filters.invalidRange")}
                </p>
              )}
            </div>
          </div>

          {/* 清空按鈕 */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                setFilters({ target_type: "", from_datetime: "", to_datetime: "" });
                setSelectedOperator(null);
                setSkip(0);
              }}
              className="py-2 px-4 bg-surface-container-highest text-on-surface-variant text-sm font-semibold rounded-lg hover:bg-surface-container transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">clear_all</span>
              {t("assets.clearAll")}
            </button>
          </div>
        </section>

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm border border-outline-variant/10">
          <div className="overflow-x-auto">
            <table className="min-w-max w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="px-4 py-3 whitespace-nowrap">
                    {t("audit.summary.logId")}
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    {t("audit.timestamp")}
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    {t("audit.operator")}
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    {t("audit.action")}
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    {t("audit.targetType")} / {t("audit.targetId")}
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    {t("audit.diff.title")}
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    {t("audit.status")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center opacity-40 whitespace-nowrap">
                      <span className="material-symbols-outlined text-6xl mb-4 block">
                        manage_search
                      </span>
                      <p className="font-bold">{t("audit.noLogs")}</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-surface-container-low transition-colors"
                    >
                      {/* 日誌 ID */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono font-bold text-outline bg-surface-container-low px-2 py-0.5 rounded">
                          LOG-{log.id.toString().padStart(6, "0")}
                        </span>
                      </td>

                      {/* 時間 */}
                      <td className="px-4 py-3 text-on-surface-variant text-xs whitespace-nowrap">
                        {fmtDateTime(log.timestamp)}
                      </td>

                      {/* 操作人員 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                            {log.actor_name?.charAt(0) || t("audit.system").charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-on-surface text-xs">
                              {log.actor_name || t("audit.system")}
                            </p>
                            <p className="text-[10px] font-mono text-outline">
                              ID: {log.user_id}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* 操作類型 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-black rounded uppercase tracking-wider ${ACTION_BADGE[log.action] ?? "bg-surface-container-low text-outline"}`}
                        >
                          {t(`audit.actionType.${log.action}`)}
                        </span>
                      </td>

                      {/* 目標類型 / ID */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono font-bold text-primary bg-primary/5 px-2 py-0.5 rounded">
                          {t(`audit.type.${log.target_type}`)}-{log.target_id}
                        </span>
                        <p className="text-[11px] text-outline mt-0.5">
                          {sanitizeTargetName(log.target_name)}
                        </p>
                      </td>

                      {/* 欄位變更比較 */}
                      <td className="px-4 py-3">
                        <DiffSummary log={log} />
                      </td>

                      {/* 狀態 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase tracking-wider">
                          {t("audit.completed")}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-outline-variant/10">
            <Pagination
              total={total}
              skip={skip}
              limit={PAGE_SIZE}
              onPageChange={setSkip}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

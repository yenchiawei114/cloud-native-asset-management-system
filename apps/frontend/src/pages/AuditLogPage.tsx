import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "../modules/dashboard/components/DashboardLayout";
import { useAuditLogs } from "../modules/audit/hooks/useAuditLogs";
import { UserSearchCombobox } from "../modules/core/components/UserSearchCombobox";
import type { User } from "../lib/api";
import { fmtDateTime, fmtNumber } from "../lib/locale";

const sanitizeTargetName = (name: string | null | undefined): string => {
  if (!name) return '—';
  // Strip legacy Chinese prefix stored before i18n migration (e.g. "報修單 #0001")
  return name.replace(/^[一-鿿]+\s*/, '');
};

export const AuditLogPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en-US';
  const dateLang = isEn ? 'en' : 'zh-TW';
  const navigate = useNavigate();
  const [params, setParams] = useState({
    page: 1,
    page_size: 20,
    target_type: "",
    action: "",
    from_date: "",
    to_date: "",
  });
  const [selectedOperator, setSelectedOperator] = useState<User | null>(null);

  const { logs, total, loading } = useAuditLogs({
    ...params,
    target_type: params.target_type || undefined,
    action: params.action || undefined,
    from_date: params.from_date || undefined,
    to_date: params.to_date || undefined,
    user_id: selectedOperator?.id ?? undefined,
  });

  const totalPages = Math.ceil(total / params.page_size);

  return (
    <DashboardLayout activeTab="audit">
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Title Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
              {t("audit.title")}
            </h1>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-on-surface-variant rounded-md shadow-sm text-sm font-semibold border border-outline-variant/10 hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-lg">
                download
              </span>
              {t("audit.export")}
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest text-on-surface-variant rounded-md shadow-sm text-sm font-semibold border border-outline-variant/10 hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined text-lg">print</span>
              {t("audit.print")}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
            <UserSearchCombobox
              label={t("audit.operator")}
              selectedUser={selectedOperator}
              onSelect={(u) => { setSelectedOperator(u); setParams(p => ({ ...p, page: 1 })); }}
              labelClassName="block text-[10px] font-bold text-outline uppercase tracking-widest mb-2 px-1"
              inputClassName="w-full bg-surface-container-low border-none rounded-md text-sm focus:ring-2 focus:ring-primary outline-none px-3 py-2 pr-8"
            />
          </div>
          <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10">
            <label className="block text-[10px] font-bold text-outline uppercase tracking-widest mb-2 px-1">
              {t("audit.targetType")}
            </label>
            <select
              className="w-full bg-surface-container-low border-none rounded-md text-sm focus:ring-2 focus:ring-primary outline-none"
              value={params.target_type}
              onChange={(e) =>
                setParams({ ...params, target_type: e.target.value, page: 1 })
              }
            >
              <option value="">{t("audit.filters.allTypes")}</option>
              <option value="ASSET">{t("audit.type.ASSET")}</option>
              <option value="TICKET">{t("audit.type.TICKET")}</option>
              <option value="USER">{t("audit.type.USER")}</option>
            </select>
          </div>
          <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm border border-outline-variant/10 md:col-span-2">
            <label className="block text-[10px] font-bold text-outline uppercase tracking-widest mb-2 px-1">
              {t("audit.filters.dateRange")}
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 group">
                <input
                  key={`from-${dateLang}`}
                  type="date"
                  lang={dateLang}
                  className="w-full bg-surface-container-low border-none rounded-md text-sm focus:ring-2 focus:ring-primary outline-none px-3 py-2"
                  style={isEn && !params.from_date ? { color: 'transparent' } : undefined}
                  value={params.from_date}
                  onChange={(e) =>
                    setParams({ ...params, from_date: e.target.value, page: 1 })
                  }
                />
                {isEn && !params.from_date && (
                  <span className="absolute inset-0 flex items-center px-3 text-sm text-on-surface-variant/40 pointer-events-none group-focus-within:hidden">
                    mm / dd / yyyy
                  </span>
                )}
              </div>
              <span className="text-outline text-xs shrink-0">
                {t("audit.filters.to")}
              </span>
              <div className="relative flex-1 group">
                <input
                  key={`to-${dateLang}`}
                  type="date"
                  lang={dateLang}
                  className="w-full bg-surface-container-low border-none rounded-md text-sm focus:ring-2 focus:ring-primary outline-none px-3 py-2"
                  style={isEn && !params.to_date ? { color: 'transparent' } : undefined}
                  value={params.to_date}
                  onChange={(e) =>
                    setParams({ ...params, to_date: e.target.value, page: 1 })
                  }
                />
                {isEn && !params.to_date && (
                  <span className="absolute inset-0 flex items-center px-3 text-sm text-on-surface-variant/40 pointer-events-none group-focus-within:hidden">
                    mm / dd / yyyy
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Table Area */}
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
            <h3 className="font-bold text-lg text-on-surface">
              {t("audit.latestRecords", { count: 50 })}
            </h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                {t("audit.liveUpdating")}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low/50">
                  <th className="px-6 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                    {t("audit.timestamp")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                    {t("audit.operator")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                    {t("audit.targetId")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                    {t("audit.action")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-outline uppercase tracking-widest">
                    {t("audit.status")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold text-outline uppercase tracking-widest text-right">
                    {t("audit.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-20 text-center text-outline text-sm"
                    >
                      {t("audit.noLogs")}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => navigate(`/audit-logs/${log.id}`)}
                      className="group hover:bg-surface-container-low transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4 text-sm text-on-surface-variant font-medium">
                        {fmtDateTime(log.timestamp)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary-container/10 flex items-center justify-center text-[10px] font-bold text-primary">
                            {log.actor_name?.charAt(0) || "S"}
                          </div>
                          <span className="text-sm font-bold text-on-surface">
                            {log.actor_name || "System"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono font-bold text-primary bg-primary/5 px-2 py-1 rounded">
                          {log.target_type}-{log.target_id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-on-surface">
                            {t(`audit.actionType.${log.action}`)}{" "}
                            {t(`audit.type.${log.target_type}`)}
                          </span>
                          <span className="text-[10px] text-outline line-clamp-1">
                            {sanitizeTargetName(log.target_name)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase tracking-wider">
                          {t("audit.completed")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 text-outline group-hover:text-primary transition-colors">
                          <span className="material-symbols-outlined">
                            visibility
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-6 bg-surface-container-low/30 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-4">
            <span className="text-xs text-outline font-medium">
              {t("audit.pagination", {
                start: (params.page - 1) * params.page_size + 1,
                end: Math.min(params.page * params.page_size, total),
                total: fmtNumber(total),
              })}
            </span>
            <div className="flex gap-1">
              <button
                disabled={params.page === 1}
                onClick={() => setParams({ ...params, page: params.page - 1 })}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high text-outline disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm">
                  chevron_left
                </span>
              </button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const p = i + 1; // Simplistic pagination for now
                return (
                  <button
                    key={p}
                    onClick={() => setParams({ ...params, page: p })}
                    className={`w-8 h-8 flex items-center justify-center rounded text-xs font-bold transition-all ${params.page === p ? "bg-primary text-white shadow-md shadow-primary/20" : "text-on-surface-variant hover:bg-surface-container-high"}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={params.page === totalPages || totalPages === 0}
                onClick={() => setParams({ ...params, page: params.page + 1 })}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high text-outline disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm">
                  chevron_right
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

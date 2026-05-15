import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAssets } from '../modules/assets/hooks/useAssets';
import { useTickets } from '../modules/ticketing/hooks/useTickets';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { NewRepairRequestModal } from '../modules/ticketing/components/NewRepairRequestModal';
import { AssetRepairHistoryModal } from '../modules/ticketing/components/AssetRepairHistoryModal';
import type { Asset } from '../lib/api';
import { PendingTransfersBanner } from '../modules/assets/components/PendingTransfersBanner';

// 封鎖提示彈窗：資產已有未完成維修單，不允許再建立新申請
function BlockedRepairDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-500 text-2xl mt-0.5">warning</span>
          <div>
            <h3 className="text-base font-bold text-on-surface">已有進行中的維修申請</h3>
            <p className="text-sm text-on-surface-variant mt-1">
              {asset.name}（{asset.asset_code}）目前已有未完成的維修單，無法再建立新的申請。<br />
              請等待現有維修單完成後再行申請。
            </p>
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:opacity-90 transition-opacity"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  in_use: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-amber-100 text-amber-700',
  borrowed: 'bg-purple-100 text-purple-700',
};

const ASSET_STATUSES = ['available', 'in_use', 'maintenance', 'borrowed'] as const;

interface FilterState {
  assetCode: string;
  assetName: string;
  model: string;
  spec: string;
  category: string;
  status: string;
}

const EMPTY_FILTERS: FilterState = {
  assetCode: '',
  assetName: '',
  model: '',
  spec: '',
  category: '',
  status: '',
};

export const EmployeeDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { assets: allAssets, loading: assetsLoading, refresh: refreshAssets } = useAssets();
  const { tickets, refresh: refreshTickets } = useTickets();

  const [inputs, setInputs] = useState<FilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [repairModalAsset, setRepairModalAsset] = useState<Asset | null>(null);
  const [historyModalAsset, setHistoryModalAsset] = useState<Asset | null>(null);
  const [blockedRepairAsset, setBlockedRepairAsset] = useState<Asset | null>(null);

  const categories = useMemo(() => Array.from(new Set(allAssets.map(a => a.type))), [allAssets]);

  const blockedAssetIds = useMemo(
    () => new Set(tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').map(t => t.asset_id)),
    [tickets]
  );

  const handleSearch = useCallback(() => {
    setAppliedFilters({ ...inputs });
  }, [inputs]);

  const filteredAssets = useMemo(() => {
    const { assetCode, assetName, model, spec, category, status } = appliedFilters;
    return allAssets.filter(a => {
      const matchCode = !assetCode || a.asset_code.toLowerCase().includes(assetCode.toLowerCase());
      const matchName = !assetName || a.name.toLowerCase().includes(assetName.toLowerCase());
      const matchModel = !model || a.model.toLowerCase().includes(model.toLowerCase());
      const matchSpec = !spec || a.specification.toLowerCase().includes(spec.toLowerCase());
      const matchCategory = !category || a.type === category;
      const matchStatus = !status || a.status === status;
      return matchCode && matchName && matchModel && matchSpec && matchCategory && matchStatus;
    });
  }, [allAssets, appliedFilters]);

  const handleRepairSuccess = useCallback(async () => {
    setRepairModalAsset(null);
    await Promise.all([refreshAssets(), refreshTickets()]);
  }, [refreshAssets, refreshTickets]);

  const inputCls = "flex-1 min-w-0 px-3 py-2 bg-surface-container-low border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all";
  const labelCls = "text-xs font-semibold text-slate-500 whitespace-nowrap shrink-0";
  const selectCls = "bg-surface-container-low border-none rounded-lg pl-3 pr-8 py-2 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none transition-all";

  return (
    <DashboardLayout activeTab="assets">
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface font-headline">
          {t('dashboard.employee.myAssets')}
        </h1>

        <PendingTransfersBanner onConfirmed={refreshAssets} />

        {/* Search Toolbar */}
        <div className="bg-surface-container-lowest rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          {/* 文字搜尋欄位 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {(
              [
                { key: 'assetCode', label: t('dashboard.table.assetCode') },
                { key: 'assetName', label: t('dashboard.table.assetName') },
                { key: 'model',     label: t('dashboard.table.model') },
                { key: 'spec',      label: t('dashboard.table.specs') },
              ] as { key: keyof FilterState; label: string }[]
            ).map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <label className={labelCls}>{label}</label>
                <input
                  type="text"
                  className={inputCls}
                  value={inputs[key]}
                  onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
              </div>
            ))}
          </div>

          {/* 下拉選單 + 搜尋按鈕 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className={labelCls}>{t('dashboard.table.type')}</label>
              <select
                className={selectCls}
                value={inputs.category}
                onChange={e => setInputs(prev => ({ ...prev, category: e.target.value }))}
              >
                <option value="">{t('dashboard.employee.allCategories')}</option>
                {categories.map(c => (
                  <option key={c} value={c}>{t(`assets.type.${c}`, c)}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className={labelCls}>{t('dashboard.table.status')}</label>
              <select
                className={selectCls}
                value={inputs.status}
                onChange={e => setInputs(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="">{t('dashboard.filters.allStatus')}</option>
                {ASSET_STATUSES.map(s => (
                  <option key={s} value={s}>{t(`assets.status.${s}`, s)}</option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => { setInputs(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
                清空
              </button>
              <button
                onClick={handleSearch}
                className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold hover:opacity-90 transition-opacity shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">search</span>
                {t('common.search')}
              </button>
            </div>
          </div>
        </div>

        {/* Assets Table */}
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {assetsLoading ? (
            <div className="flex items-center justify-center p-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">inventory_2</span>
              <p className="text-sm text-on-surface-variant">
                {allAssets.length === 0
                  ? t('dashboard.employee.noAssignedAssets')
                  : t('dashboard.employee.noMatchingAssets')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-max w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    {[
                      ['assetCode', '資產編號'],
                      ['assetName', '資產名稱'],
                      ['status', '當前狀態'],
                      ['type', '分類'],
                      ['model', '型號'],
                      ['specs', '規格'],
                      ['custodian', '保管人'],
                      ['location', '辦公地點'],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {t(`dashboard.table.${key}`, label)}
                      </th>
                    ))}
                    <th className="px-5 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {t('dashboard.table.actions', '操作')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredAssets.map(asset => (
                    <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="text-xs font-mono font-bold text-primary bg-primary/5 px-2 py-1 rounded">
                          {asset.asset_code}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-on-surface whitespace-nowrap">
                        {asset.name}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_BADGE[asset.status] ?? 'bg-slate-100 text-slate-600'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {t(`assets.status.${asset.status}`, asset.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-on-surface-variant whitespace-nowrap">
                        {t(`assets.type.${asset.type}`, asset.type)}
                      </td>
                      <td className="px-5 py-4 text-sm text-on-surface-variant whitespace-nowrap">{asset.model}</td>
                      <td className="px-5 py-4 text-sm text-on-surface-variant whitespace-nowrap max-w-[280px] truncate" title={asset.specification}>
                        {asset.specification}
                      </td>
                      <td className="px-5 py-4 text-sm text-on-surface-variant whitespace-nowrap">{user?.name ?? '—'}</td>
                      <td className="px-5 py-4 text-sm text-on-surface-variant whitespace-nowrap">{asset.storage_location ?? '—'}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <button
                            onClick={() => blockedAssetIds.has(asset.id) ? setBlockedRepairAsset(asset) : setRepairModalAsset(asset)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">build</span>
                            申請維修
                          </button>
                          <button
                            onClick={() => setHistoryModalAsset(asset)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">history</span>
                            維修紀錄
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {blockedRepairAsset && (
        <BlockedRepairDialog asset={blockedRepairAsset} onClose={() => setBlockedRepairAsset(null)} />
      )}

      {repairModalAsset && (
        <NewRepairRequestModal
          asset={repairModalAsset}
          open
          onClose={() => setRepairModalAsset(null)}
          onSuccess={handleRepairSuccess}
        />
      )}

      {historyModalAsset && (
        <AssetRepairHistoryModal
          asset={historyModalAsset}
          open
          onClose={() => setHistoryModalAsset(null)}
        />
      )}
    </DashboardLayout>
  );
};

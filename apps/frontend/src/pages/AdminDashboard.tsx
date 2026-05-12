import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { Asset } from '../lib/api';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { useAssets } from '../modules/assets/hooks/useAssets';

export const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const { assets, loading } = useAssets({ keyword: searchTerm, status: statusFilter === 'ALL' ? undefined : statusFilter });

  // 加入空值保護的統計計算，對齊後端枚舉值
  const stats = {
    total: assets.length,
    available: assets.filter(a => a?.status === 'available').length,
    inUse: assets.filter(a => a?.status === 'in_use').length,
    maintenance: assets.filter(a => a?.status === 'maintenance').length,
  };

  if (loading) {
    return (
      <DashboardLayout activeTab="all">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="all">
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
              {t('auth.nav.allAssets')}
            </h1>
            <p className="text-on-surface-variant mt-1 font-medium">{t('dashboard.employee.assetManagementDesc')}</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-sm font-semibold rounded-md flex items-center gap-2 transition-colors">
              <span className="material-symbols-outlined text-lg">file_download</span>
              {t('auth.nav.exportData')}
            </button>
            <button 
              onClick={() => navigate('/all-assets/new')}
              className="px-4 py-2 bg-gradient-to-br from-primary to-primary-container text-on-primary text-sm font-bold rounded-md flex items-center gap-2 transition-transform active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">add_circle</span>
              {t('auth.nav.addNewAsset')}
            </button>
          </div>
        </div>

        {/* Bento Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard title={t('dashboard.stats.total')} value={stats.total} icon="inventory" colorScheme="primary" />
          <StatCard title={t('dashboard.stats.available')} value={stats.available} icon="timer" colorScheme="secondary" />
          <StatCard title={t('dashboard.stats.inUse')} value={stats.inUse} icon="person" colorScheme="tertiary" />
          <StatCard title={t('dashboard.stats.maintenance')} value={stats.maintenance} icon="build" colorScheme="error" />
        </div>

        {/* Filters */}
        <section className="bg-surface-container-low rounded-xl p-6 relative overflow-hidden border border-outline-variant/10">
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">{t('dashboard.filters.search')}</label>
              <input 
                className="w-full bg-surface-container-highest border-none rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" 
                placeholder={t('dashboard.filters.searchPlaceholder')} 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">{t('dashboard.filters.status')}</label>
              <select 
                className="w-full bg-surface-container-highest border-none rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary appearance-none outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">{t('dashboard.filters.allStatus')}</option>
                <option value="in_use">{t('assets.status.in_use')}</option>
                <option value="available">{t('assets.status.available')}</option>
                <option value="maintenance">{t('assets.status.maintenance')}</option>
                <option value="borrowed">{t('assets.status.borrowed')}</option>
              </select>
            </div>
          </div>
        </section>

        {/* Data Table */}
        <div className="bg-surface-container-lowest rounded-xl overflow-hidden flex flex-col shadow-sm border border-outline-variant/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-y-2 px-6 pb-4">
              <thead>
                <tr className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  <th className="px-4 py-3">{t('dashboard.table.assetCode')}</th>
                  <th className="px-4 py-3">{t('dashboard.table.assetName')}</th>
                  <th className="px-4 py-3 text-center">{t('dashboard.table.status')}</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {assets.length > 0 ? assets.map((asset) => (
                  <tr 
                    key={asset.id} 
                    onClick={() => navigate(`/assets/${asset.id}`)}
                    className="group hover:bg-surface-container-low transition-colors duration-200 cursor-pointer"
                  >
                    <td className="px-4 py-4 font-mono font-bold text-primary rounded-l-xl border-y border-l border-transparent group-hover:border-outline-variant/10">
                      {asset?.asset_code || 'N/A'}
                    </td>
                    <td className="px-4 py-4 border-y border-transparent group-hover:border-outline-variant/10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-outline shadow-inner">
                          <span className="material-symbols-outlined">laptop_mac</span>
                        </div>
                        <div>
                          <p className="font-bold text-on-surface">{asset?.name || 'Unknown Asset'}</p>
                          <p className="text-[10px] text-on-surface-variant uppercase font-medium">
                            {t(`assets.type.${asset?.type?.toLowerCase() || 'other'}`)} • {asset?.model || 'Generic'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 border-y border-transparent group-hover:border-outline-variant/10 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusStyle(asset?.status)}`}>
                        {t(`assets.status.${asset?.status || 'unknown'}`)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right rounded-r-xl border-y border-r border-transparent group-hover:border-outline-variant/10">
                      <button className="p-2 hover:bg-surface-container-highest rounded-full transition-colors text-outline">
                        <span className="material-symbols-outlined">more_vert</span>
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="py-20 text-center">
                      <div className="flex flex-col items-center opacity-40">
                        <span className="material-symbols-outlined text-7xl mb-4">database_off</span>
                        <h3 className="text-lg font-bold">{t('dashboard.employee.noAssets')}</h3>
                        <p className="text-xs">{t('dashboard.adjustFilters')}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

interface StatCardProps {
  title: string;
  value: number;
  icon: string;
  colorScheme: 'primary' | 'error' | 'secondary' | 'tertiary';
  fillIcon?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, colorScheme, fillIcon }) => {
  const colorMap = {
    primary: 'border-primary text-primary bg-primary-container/10',
    error: 'border-error text-error bg-error-container/10',
    secondary: 'border-secondary text-secondary bg-secondary-container/10',
    tertiary: 'border-tertiary text-tertiary bg-tertiary-fixed/10',
  };

  const scheme = colorMap[colorScheme] || colorMap.primary;

  return (
    <div className={`bg-surface-container-lowest p-6 rounded-xl shadow-sm border-b-4 ${scheme.split(' ')[0]} transition-all hover:-translate-y-1 hover:shadow-md`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-2 rounded-lg ${scheme.split(' ').slice(1).join(' ')}`}>
          <span className="material-symbols-outlined" style={{ fontVariationSettings: fillIcon ? "'FILL' 1" : "" }}>{icon}</span>
        </div>
        <span className="text-[10px] font-bold text-on-surface-variant tracking-widest uppercase">{title}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-4xl font-black text-on-surface tracking-tight">{value.toLocaleString()}</span>
      </div>
    </div>
  );
};

const getStatusStyle = (status: string | undefined) => {
  const s = status?.toLowerCase() || 'unknown';
  switch (s) {
    case 'available': return 'bg-green-100 text-green-700 border border-green-200';
    case 'in_use': return 'bg-blue-100 text-blue-700 border border-blue-200';
    case 'maintenance': return 'bg-amber-100 text-amber-700 border border-amber-200';
    case 'borrowed': return 'bg-indigo-100 text-indigo-700 border border-indigo-200';
    default: return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
};

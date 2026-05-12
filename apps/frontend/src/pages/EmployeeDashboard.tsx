import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAssets } from '../modules/assets/hooks/useAssets';
import { useTickets } from '../modules/ticketing/hooks/useTickets';

export const EmployeeDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { assets, loading: assetsLoading, stats: assetStats } = useAssets();
  const { tickets, loading: ticketsLoading, stats: ticketStats } = useTickets();

  const loading = assetsLoading || ticketsLoading;

  return (
    <DashboardLayout activeTab="assets">
      <div className="space-y-8">
        {/* Page Title & Stats Overview */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <nav className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
              <span>{t('auth.nav.myAssets')}</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-primary font-bold">{t('dashboard.employee.portfolio')}</span>
            </nav>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface font-headline">{t('dashboard.employee.myAssets')}</h1>
            <p className="text-on-surface-variant text-sm mt-1">{t('dashboard.employee.assetManagementDesc')}</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 min-w-[160px]">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700">
                <span className="material-symbols-outlined">inventory</span>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">{t('dashboard.employee.totalAssets')}</p>
                <p className="text-xl font-extrabold text-on-surface">{loading ? '--' : assetStats.total}</p>
              </div>
            </div>
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 min-w-[160px]">
              <div className="w-10 h-10 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary">
                <span className="material-symbols-outlined">build</span>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">{t('dashboard.employee.ongoingTickets')}</p>
                <p className="text-xl font-extrabold text-on-surface">{loading ? '--' : ticketStats.inProgress}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Assets Table View */}
          <section className="lg:col-span-2 bg-surface-container-lowest rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-on-surface">{t('dashboard.employee.assetList')}</h2>
            </div>
            
            {assetsLoading ? (
              <div className="flex-1 flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : assets.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mb-4">
                  <span className="material-symbols-outlined text-4xl">inventory_2</span>
                </div>
                <h3 className="text-xl font-bold text-on-surface mb-2">{t('dashboard.employee.noAssignedAssets')}</h3>
                <p className="text-on-surface-variant text-sm max-w-sm mx-auto">
                  {t('dashboard.employee.noAssignedAssetsDesc')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('dashboard.table.assetCode')}</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('dashboard.table.assetName')}</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{t('dashboard.table.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assets.map((asset) => (
                      <tr 
                        key={asset.id} 
                        onClick={() => navigate(`/assets/${asset.id}`)}
                        className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <span className="text-sm font-mono font-bold text-primary bg-primary/5 px-2 py-1 rounded">
                            {asset.asset_code}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-on-surface">{asset.name}</span>
                            <span className="text-[10px] text-slate-400">{asset.model}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            asset.status === 'available' ? 'bg-green-100 text-green-700' :
                            asset.status === 'in_use' ? 'bg-blue-100 text-blue-700' :
                            asset.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              asset.status === 'available' ? 'bg-green-500' :
                              asset.status === 'in_use' ? 'bg-blue-500' :
                              asset.status === 'maintenance' ? 'bg-amber-500' :
                              'bg-slate-500'
                            }`}></span>
                            {t(`assets.status.${asset.status}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Recent Tickets Section */}
          <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-on-surface">{t('dashboard.employee.recentRequests')}</h2>
              <button onClick={() => navigate('/repair-history')} className="text-xs font-bold text-primary hover:underline">{t('ticketing.backToList')}</button>
            </div>
            <div className="p-4 space-y-4">
              {ticketsLoading ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8 opacity-40">
                  <span className="material-symbols-outlined text-4xl mb-2">history</span>
                  <p className="text-xs">{t('dashboard.employee.noRequests')}</p>
                </div>
              ) : (
                tickets.slice(0, 5).map(ticket => (
                  <div 
                    key={ticket.id}
                    onClick={() => navigate(`/repair-history/${ticket.id}`)}
                    className="p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-all border border-transparent hover:border-slate-100 group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-mono font-bold text-slate-400">#TK-{(ticket.id ?? 0).toString().padStart(4, '0')}</span>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                        ticket.status === 'DONE' ? 'bg-green-500 text-white' :
                        ticket.status === 'IN_PROGRESS' ? 'bg-blue-500 text-white' :
                        'bg-amber-500 text-white'
                      }`}>
                        {t(`ticketing.status.${ticket.status}`)}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-1">{ticket.description}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{new Date(ticket.created_at).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Bento Style Banner */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-12">
          <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-blue-950 rounded-2xl p-8 text-white relative overflow-hidden shadow-xl">
            <div className="relative z-10 max-w-md">
              <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 inline-block">{t('dashboard.employee.support')}</span>
              <h3 className="text-2xl font-extrabold mb-2 font-headline">{t('dashboard.employee.healthCheck')}</h3>
              <p className="text-blue-100/70 text-sm mb-6">{t('dashboard.employee.healthCheckDesc')}</p>
              <button className="bg-white text-blue-900 px-6 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-blue-50 transition-all active:scale-95">{t('dashboard.employee.scheduleMaintenance')}</button>
            </div>
          </div>
          <div className="bg-tertiary-fixed rounded-2xl p-8 border border-tertiary/10 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-tertiary mb-6 shadow-sm">
                <span className="material-symbols-outlined text-3xl">verified_user</span>
              </div>
              <h3 className="text-xl font-extrabold text-on-tertiary-fixed font-headline leading-tight">{t('dashboard.employee.warrantyTitle')}</h3>
              <p className="text-on-tertiary-fixed-variant text-sm mt-2">{t('dashboard.employee.warrantyDesc')}</p>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

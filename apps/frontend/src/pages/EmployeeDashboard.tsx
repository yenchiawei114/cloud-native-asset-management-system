import React from 'react';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAssets } from '../modules/assets/hooks/useAssets';

export const EmployeeDashboard: React.FC = () => {
  const { assets, loading, stats } = useAssets();

  return (
    <DashboardLayout activeTab="assets">
      <div className="space-y-8">
        {/* Page Title & Stats Overview */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <nav className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
              <span>資產</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-primary font-bold">個人資產組合</span>
            </nav>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface font-headline">我的資產</h1>
            <p className="text-on-surface-variant text-sm mt-1">管理與追踪指派給您的企業硬體與資源。</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 min-w-[160px]">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700">
                <span className="material-symbols-outlined">inventory</span>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">資產總數</p>
                <p className="text-xl font-extrabold text-on-surface">{loading ? '--' : stats.total}</p>
              </div>
            </div>
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 min-w-[160px]">
              <div className="w-10 h-10 rounded-lg bg-tertiary-fixed flex items-center justify-center text-tertiary">
                <span className="material-symbols-outlined">build</span>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 leading-none mb-1">維修中</p>
                <p className="text-xl font-extrabold text-on-surface">{loading ? '--' : stats.inRepair}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Assets Table View */}
        <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px] flex flex-col">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h2 className="text-lg font-bold text-on-surface">資產清單</h2>
          </div>
          
          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : assets.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mb-4">
                <span className="material-symbols-outlined text-4xl">inventory_2</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface mb-2">尚無指派資產</h3>
              <p className="text-on-surface-variant text-sm max-w-sm mx-auto">
                目前您的帳號下沒有任何已領用的資產。如有疑問請洽 IT 部門。
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">資產編號</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">名稱</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">類型</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">狀態</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors group">
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
                      <td className="px-6 py-4 text-sm text-on-surface-variant uppercase">{asset.type}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                          asset.status === 'in_use' ? 'bg-green-100 text-green-700' :
                          asset.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            asset.status === 'in_use' ? 'bg-green-500' :
                            asset.status === 'maintenance' ? 'bg-amber-500' :
                            'bg-slate-500'
                          }`}></span>
                          {asset.status === 'in_use' ? '使用中' : asset.status === 'maintenance' ? '維修中' : asset.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button className="text-primary hover:bg-primary/5 p-2 rounded-lg transition-colors">
                          <span className="material-symbols-outlined text-lg">report_problem</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Bento Style Banner */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-12">
          <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-blue-950 rounded-2xl p-8 text-white relative overflow-hidden shadow-xl">
            <div className="relative z-10 max-w-md">
              <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 inline-block">主動支援</span>
              <h3 className="text-2xl font-extrabold mb-2 font-headline">年度硬體健檢</h3>
              <p className="text-blue-100/70 text-sm mb-6">您的硬體設備即將迎來定期效能檢查。請與 IT 部門安排時間。</p>
              <button className="bg-white text-blue-900 px-6 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-blue-50 transition-all active:scale-95">安排維護</button>
            </div>
          </div>
          <div className="bg-tertiary-fixed rounded-2xl p-8 border border-tertiary/10 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-tertiary mb-6 shadow-sm">
                <span className="material-symbols-outlined text-3xl">verified_user</span>
              </div>
              <h3 className="text-xl font-extrabold text-on-tertiary-fixed font-headline leading-tight">資產保固</h3>
              <p className="text-on-tertiary-fixed-variant text-sm mt-2">您的所有資產皆在保固有效期限內。</p>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
};

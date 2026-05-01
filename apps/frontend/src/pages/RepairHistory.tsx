import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useTickets } from '../modules/ticketing/hooks/useTickets';
import { NewRepairRequestForm } from '../modules/ticketing/components/NewRepairRequestForm';

export const RepairHistory: React.FC = () => {
  const { tickets, loading, stats, refresh } = useTickets();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'new' ? 'new' : 'list';

  const setView = (newView: 'list' | 'new') => {
    setSearchParams({ view: newView });
  };

  const handleSuccess = () => {
    refresh();
    setView('list');
  };

  return (
    <DashboardLayout activeTab="repair">
      <div className="max-w-6xl mx-auto px-4 py-4">
        {view === 'list' ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-on-surface font-headline">維修紀錄</h1>
                <p className="text-on-surface-variant text-sm mt-1">追蹤您所有設備的報修進度與維修歷史。</p>
              </div>
              <button 
                onClick={() => setView('new')}
                className="bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                建立新申請
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">總申請數</p>
                <p className="text-3xl font-black text-on-surface">{loading ? '--' : stats.total}</p>
              </div>
              <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">進行中</p>
                <p className="text-3xl font-black text-primary">{loading ? '--' : stats.inProgress}</p>
              </div>
              <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm border border-slate-100">
                <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">已完成</p>
                <p className="text-3xl font-black text-green-600">{loading ? '--' : (stats.total - stats.inProgress)}</p>
              </div>
            </div>

            {/* Table */}
            <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {loading ? (
                <div className="p-12 flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : tickets.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto mb-4">
                    <span className="material-symbols-outlined text-3xl">history_toggle_off</span>
                  </div>
                  <h3 className="text-lg font-bold text-on-surface">尚無維修紀錄</h3>
                  <p className="text-sm text-slate-400 mt-1">您目前沒有任何維修申請紀錄。</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">工單編號</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">設備資訊</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">申請日期</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">目前狀態</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tickets.map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="text-sm font-mono font-bold text-slate-700">#TK-{ticket.id.toString().padStart(6, '0')}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-on-surface">Asset #{ticket.asset_id}</span>
                              <span className="text-[10px] text-slate-400 truncate max-w-[200px]">{ticket.description}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {new Date(ticket.created_at).toLocaleDateString('zh-TW')}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                              ticket.status === 'DONE' ? 'bg-green-100 text-green-700' :
                              ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                              ticket.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                ticket.status === 'DONE' ? 'bg-green-500' :
                                ticket.status === 'IN_PROGRESS' ? 'bg-blue-500' :
                                ticket.status === 'CANCELLED' ? 'bg-slate-400' :
                                'bg-amber-500'
                              }`}></span>
                              {ticket.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Link 
                              to={`/repair-history/${ticket.id}`}
                              className="text-primary hover:underline text-sm font-bold"
                            >
                              查看詳情
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : (
          <NewRepairRequestForm 
            onCancel={() => setView('list')} 
            onSuccess={handleSuccess} 
          />
        )}
      </div>
    </DashboardLayout>
  );
};

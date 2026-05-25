import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAdminTickets } from '../modules/ticketing/hooks/useAdminTickets';
import { FeedbackDialog } from '../modules/core/components/FeedbackDialog';
import { useFeedback } from '../modules/core/hooks/useFeedback';
import { RepairRequest } from '../lib/api';
import { fmtDate, fmtNumber } from '../lib/locale';

export const TicketReviewPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const { tickets: rawTickets, allTickets, loading, approveTicket } = useAdminTickets(filter);
  
  const tickets = React.useMemo(() => {
    if (priorityFilter === 'ALL') return rawTickets;
    return rawTickets.filter(t => (t.priority || 'MEDIUM').toUpperCase() === priorityFilter);
  }, [rawTickets, priorityFilter]);

  const { feedbackState, showFeedback, closeFeedback } = useFeedback();

  React.useEffect(() => {
    document.title = t('ticketing.review.pageTitle');
  }, [t]);

  const handleApprove = async (ticket: RepairRequest) => {
    try {
      await approveTicket(ticket);
    } catch (err: any) {
      showFeedback({ title: t('ticketing.review.approveFailed'), message: err.message, type: 'error', onConfirm: closeFeedback });
    }
  };

  return (
    <DashboardLayout activeTab="tickets">
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header Section */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">
              {t('ticketing.allTicketsManagement')}
            </h1>
            <p className="text-on-surface-variant mt-2 font-medium">
              {t('ticketing.allTicketsSubtitle')}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-sm font-semibold hover:bg-surface-container-highest transition-colors">
              {t('auth.nav.exportData')}
            </button>
          </div>
        </div>

        {/* Bento Grid Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-surface-container-low p-6 rounded-2xl relative overflow-hidden group border border-outline-variant/10 shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold text-on-surface-variant">{t('ticketing.stats.monthlyTickets')}</p>
                <h3 className="text-4xl font-extrabold mt-2 text-on-surface">{fmtNumber(allTickets.length)}</h3>
              </div>
              <div className="p-3 bg-primary-container/10 rounded-xl">
                <span className="material-symbols-outlined text-primary">assignment</span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-green-600">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              <span>{t('ticketing.review.monthlyIncrease')}</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-2xl relative overflow-hidden group border border-outline-variant/10 shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold text-on-surface-variant">{t('ticketing.review.mttr')}</p>
                <h3 className="text-4xl font-extrabold mt-2 text-on-surface">{t('ticketing.review.mttrValue')}</h3>
              </div>
              <div className="p-3 bg-tertiary-container/10 rounded-xl">
                <span className="material-symbols-outlined text-tertiary">timer</span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-green-600">
              <span className="material-symbols-outlined text-sm">trending_down</span>
              <span>{t('ticketing.review.mttrImproved')}</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-2xl relative overflow-hidden group border border-outline-variant/10 shadow-sm transition-all hover:shadow-md">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold text-on-surface-variant">{t('ticketing.review.slaRate')}</p>
                <h3 className="text-4xl font-extrabold mt-2 text-on-surface">{t('ticketing.review.slaValue')}</h3>
              </div>
              <div className="p-3 bg-secondary-container/10 rounded-xl">
                <span className="material-symbols-outlined text-secondary">verified</span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-on-surface-variant">
              <span>{t('ticketing.review.slaTarget')}</span>
            </div>
            <div className="absolute bottom-0 left-0 h-1 bg-green-500 w-[98.5%]"></div>
          </div>
        </div>

        {/* Advanced Filter Section */}
        <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm mb-8 border border-outline-variant/10">
          <div className="flex items-center gap-2 mb-6">
            <span className="material-symbols-outlined text-primary">filter_list</span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">{t('ticketing.advancedFilter')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">{t('ticketing.ticketId')}</label>
              <input 
                className="w-full bg-surface-container-low border-none rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" 
                placeholder="TKT-0000" 
                type="text"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">{t('ticketing.department')}</label>
              <select className="w-full bg-surface-container-low border-none rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 appearance-none outline-none">
                <option>{t('dashboard.filters.allDepts')}</option>
                <option>{t('dashboard.filters.deptEngineering')}</option>
                <option>{t('dashboard.filters.deptOperations')}</option>
                <option>{t('dashboard.filters.deptDesign')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">{t('dashboard.filters.status')}</label>
              <select 
                className="w-full bg-surface-container-low border-none rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 appearance-none outline-none"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="ALL">{t('dashboard.filters.allStatus')}</option>
                <option value="OPEN">{t('ticketing.status.OPEN')}</option>
                <option value="IN_PROGRESS">{t('ticketing.status.IN_PROGRESS')}</option>
                <option value="DONE">{t('ticketing.status.DONE')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">{t('ticketing.priority')}</label>
              <div className="flex gap-1">
                {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(priorityFilter === p ? 'ALL' : p)}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${
                      priorityFilter === p
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-surface-container-highest text-on-surface-variant hover:bg-slate-300'
                    }`}
                  >
                    {t(`ticketing.priority.${p}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilter('ALL');
                  setPriorityFilter('ALL');
                }}
                className="w-full py-2.5 bg-on-surface text-surface rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
              >
                {t('ticketing.review.resetFilter')}
              </button>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-surface-container-lowest rounded-2xl shadow-sm overflow-hidden border border-outline-variant/10">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low">
                  <th className="text-left py-4 px-6 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.1em]">{t('ticketing.ticketId')}</th>
                  <th className="text-left py-4 px-6 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.1em]">{t('dashboard.table.assetName')}</th>
                  <th className="text-left py-4 px-6 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.1em]">{t('ticketing.requester')}</th>
                  <th className="text-left py-4 px-6 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.1em]">{t('ticketing.requestDate')}</th>
                  <th className="text-left py-4 px-6 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.1em]">{t('ticketing.priority')}</th>
                  <th className="text-left py-4 px-6 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.1em]">{t('dashboard.table.status')}</th>
                  <th className="text-left py-4 px-6 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.1em]">{t('ticketing.estimatedCompletion')}</th>
                  <th className="text-right py-4 px-6 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.1em]">{t('ticketing.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-transparent">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center">
                      <div className="animate-spin inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
                    </td>
                  </tr>
                ) : tickets.length > 0 ? tickets.map((ticket) => (
                  <tr 
                    key={ticket.id} 
                    onClick={() => navigate(`/repair-history/${ticket.id}`)}
                    className="hover:bg-surface-container-low transition-colors cursor-pointer group"
                  >
                    <td className="py-5 px-6">
                      <span className="text-xs font-bold text-primary">#TKT-{ticket.id.toString().padStart(4, '0')}</span>
                    </td>
                    <td className="py-5 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm">{getIcon(ticket.description || '')}</span>
                        </div>
                        <span className="text-sm font-semibold text-on-surface line-clamp-1">{ticket.description || t('ticketing.noDescription')}</span>
                      </div>
                    </td>
                    <td className="py-5 px-6 text-sm text-on-surface-variant">
                      User #{ticket.requester_id}
                    </td>
                    <td className="py-5 px-6 text-sm text-on-surface-variant">
                      {fmtDate(ticket.created_at)}
                    </td>
                    <td className="py-5 px-6">
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${getPriorityColor(ticket.priority || 'MEDIUM').bg} ${getPriorityColor(ticket.priority || 'MEDIUM').text}`}>
                        {ticket.priority || 'MEDIUM'}
                      </span>
                    </td>
                    <td className="py-5 px-6">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${getStatusStyles(ticket.status)}`}>
                        {t(`ticketing.status.${ticket.status}`)}
                      </span>
                    </td>
                    <td className="py-5 px-6 text-sm text-on-surface-variant font-medium">
                      {ticket.expected_completion_date ? fmtDate(ticket.expected_completion_date) : t('ticketing.notSet')}
                    </td>
                    <td className="py-5 px-6 text-right">
                      <div className="flex justify-end gap-2">
                        {ticket.status === 'OPEN' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleApprove(ticket); }}
                            className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
                            title={t('ticketing.review.startRepair')}
                          >
                            <span className="material-symbols-outlined text-lg">play_arrow</span>
                          </button>
                        )}
                        <button className="text-primary p-2 hover:bg-primary/10 rounded-full transition-colors">
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="py-20 text-center opacity-40">
                      <span className="material-symbols-outlined text-6xl mb-4">assignment_turned_in</span>
                      <p className="font-bold">{t('ticketing.noTickets')}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Placeholder */}
          <div className="px-6 py-4 bg-surface-container-low flex justify-between items-center border-t border-slate-200/10">
            <p className="text-xs text-on-surface-variant font-medium">
              {t('ticketing.review.showingResults', { count: tickets.length })}
            </p>
            <div className="flex gap-1">
              <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-highest transition-colors">
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <button className="w-8 h-8 flex items-center justify-center rounded bg-primary text-white text-xs font-bold">1</button>
              <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-highest transition-colors">
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <FeedbackDialog 
        {...feedbackState} 
        onConfirm={() => {
          if (feedbackState.type !== 'confirm') {
            closeFeedback();
          }
          feedbackState.onConfirm?.();
        }}
        onCancel={closeFeedback}
      />
    </DashboardLayout>
  );
};

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'OPEN': return 'bg-tertiary-container text-on-tertiary-container';
    case 'IN_PROGRESS': return 'bg-secondary-container text-on-secondary-container';
    case 'DONE': return 'bg-emerald-100 text-emerald-700';
    case 'CANCELLED': return 'bg-error-container text-on-error-container';
    default: return 'bg-surface-container-high text-outline';
  }
};

const getPriorityColor = (priority: string) => {
  const p = (priority || 'MEDIUM').toUpperCase();
  switch (p) {
    case 'URGENT': return { bg: 'bg-error-container', text: 'text-on-error-container', dot: 'bg-error' };
    case 'HIGH': return { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary' };
    case 'MEDIUM': return { bg: 'bg-secondary/10', text: 'text-secondary', dot: 'bg-secondary' };
    default: return { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' };
  }
};

const getIcon = (title: string) => {
  const t = title.toLowerCase();
  if (t.includes('空調') || t.includes('故障')) return 'construction';
  if (t.includes('印') || t.includes('紙')) return 'print';
  if (t.includes('機械') || t.includes('線')) return 'precision_manufacturing';
  if (t.includes('電') || t.includes('燈')) return 'bolt';
  return 'settings';
};

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { api, Asset, RepairRequest } from '../lib/api';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { fmtDate } from '../lib/locale';
import { AdminTicketDetailModal } from '../modules/ticketing/components/AdminTicketDetailModal';
import { ApproveTicketDialog } from '../modules/ticketing/components/ApproveTicketDialog';
import { ReturnTicketDialog } from '../modules/ticketing/components/ReturnTicketDialog';
import { CloseTicketDialog } from '../modules/ticketing/components/CloseTicketDialog';
import { NewRepairRequestModal } from '../modules/ticketing/components/NewRepairRequestModal';

interface TicketWithAttachment {
  request: RepairRequest;
  attachment: { id: number; file_url: string; file_name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  DONE: 'bg-green-100 text-green-700 border-green-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  RETURNED: 'bg-red-100 text-red-700 border-red-200',
  WAITING_LOANER_RETURN: 'bg-purple-100 text-purple-700 border-purple-200',
};

const ASSET_STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-700 border-green-200',
  in_use: 'bg-blue-100 text-blue-700 border-blue-200',
  maintenance: 'bg-amber-100 text-amber-700 border-amber-200',
  borrowed: 'bg-purple-100 text-purple-700 border-purple-200',
  deactivated: 'bg-slate-100 text-slate-400 border-slate-200',
};

export const AdminAssetRepairsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const assetId = Number(id);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [tickets, setTickets] = useState<TicketWithAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailTicket, setDetailTicket] = useState<RepairRequest | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<any[]>([]);
  const [detailRecord, setDetailRecord] = useState<any | null>(null);
  const [detailInspection, setDetailInspection] = useState<any | null>(null);
  const [approveTicket, setApproveTicket] = useState<RepairRequest | null>(null);
  const [returnId, setReturnId] = useState<number | null>(null);
  const [closeId, setCloseId] = useState<number | null>(null);
  const [newRepairOpen, setNewRepairOpen] = useState(false);
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false);

  const hasActiveTicket = tickets.some(({ request: req }) =>
    req.status === 'OPEN' || req.status === 'IN_PROGRESS' || req.status === 'WAITING_LOANER_RETURN'
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [assetData, ticketsData] = await Promise.all([
        api.getAsset(assetId),
        api.getAssetTickets(assetId),
      ]);
      setAsset(assetData);
      setTickets(ticketsData);
    } catch {
      navigate('/all-assets');
    } finally {
      setLoading(false);
    }
  }, [assetId, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openDetail = async (ticket: RepairRequest) => {
    setDetailTicket(ticket);
    setDetailRecord(null);
    setDetailInspection(null);

    const [atts, record, inspection] = await Promise.all([
      api.getTicketAttachments(ticket.id).catch(() => []),
      (ticket.status === 'IN_PROGRESS' || ticket.status === 'DONE' || ticket.status === 'WAITING_LOANER_RETURN')
        ? api.getTicketRecord(ticket.id).catch(() => null)
        : Promise.resolve(null),
      (ticket.status === 'DONE' || ticket.status === 'WAITING_LOANER_RETURN')
        ? api.getTicketInspection(ticket.id).catch(() => null)
        : Promise.resolve(null),
    ]);

    setDetailAttachments(atts);
    setDetailRecord(record);
    setDetailInspection(inspection);
  };

  const handleConfirmLoanerReturn = async (ticketId: number) => {
    if (!window.confirm(t('assets.repairs.confirmLoanerReturn'))) return;
    try {
      await api.confirmLoanerReturn(ticketId);
    } catch (err: any) {
      window.alert(`${t('assets.repairs.confirmFailed')}${err.message}`);
    } finally {
      fetchData();
    }
  };

  if (loading) {
    return (
      <DashboardLayout activeTab="all">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="all">
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <button onClick={() => navigate('/all-assets')} className="hover:text-primary transition-colors font-medium">
            {t('assets.repairs.management')}
          </button>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-on-surface font-semibold">{asset?.name ?? `${t('ticketing.assetLabel')} #${assetId}`} — {t('assets.repairs.title')}</span>
        </div>

        {/* Asset info header */}
        {asset && (
          <div className="bg-surface-container-low rounded-xl p-5 flex items-center justify-between border border-outline-variant/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center">
                <span className="material-symbols-outlined text-outline">build</span>
              </div>
              <div>
                <p className="font-bold text-on-surface text-lg">{asset.name}</p>
                <p className="text-xs font-mono text-on-surface-variant">{asset.asset_code}</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${ASSET_STATUS_COLORS[asset.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {t(`assets.status.${asset.status}`, { defaultValue: asset.status })}
            </span>
          </div>
        )}

        {/* Tickets table */}
        <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm border border-outline-variant/10">
          <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
            <h2 className="font-bold text-on-surface">{t('assets.repairs.title')}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-on-surface-variant font-medium">{tickets.length}{t('assets.repairs.countSuffix')}</span>
              {asset && asset.status !== 'deactivated' && asset.owner_id === user?.id && (
                <button
                  onClick={() => hasActiveTicket ? setBlockedDialogOpen(true) : setNewRepairOpen(true)}
                  className="px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-lg flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  <span className="material-symbols-outlined text-sm">add_circle</span>
                  {t('assets.repairs.createTicket')}
                </button>
              )}
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="py-20 text-center opacity-40">
              <span className="material-symbols-outlined text-6xl mb-3 block">build_circle</span>
              <p className="font-bold text-sm">{t('assets.repairs.empty')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                    <th className="px-4 py-3">{t('assets.repairs.headers.ticketId')}</th>
                    <th className="px-4 py-3">{t('assets.repairs.headers.status')}</th>
                    <th className="px-4 py-3">{t('assets.repairs.headers.requester')}</th>
                    <th className="px-4 py-3">{t('assets.repairs.headers.requestDate')}</th>
                    <th className="px-4 py-3">{t('assets.repairs.headers.description')}</th>
                    <th className="px-4 py-3 text-center">{t('assets.repairs.headers.loaner')}</th>
                    <th className="px-4 py-3 text-right">{t('assets.repairs.headers.actions')}</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-outline-variant/5">
                  {tickets.map(({ request: req }) => (
                    <tr key={req.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-primary text-xs">
                        #TKT-{String(req.id).padStart(4, '0')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[req.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {t(`ticketing.status.${req.status}`, { defaultValue: req.status })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {req.requester_name || `${t('ticketing.user')} #${req.requester_id}`}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                        {fmtDate(req.created_at)}
                      </td>
                      <td className="px-4 py-3 text-on-surface max-w-[200px] truncate">
                        {req.description}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {req.need_backup ? (
                          <span title={req.loaner_asset_id ? `${t('assets.repairs.loanerNeeded')} #${req.loaner_asset_id}` : t('assets.repairs.loanerNeeded')}>
                            <span className={`material-symbols-outlined text-sm ${req.loaner_asset_id ? 'text-green-500' : 'text-amber-500'}`}>
                              {req.loaner_asset_id ? 'check_circle' : 'pending'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-on-surface-variant/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <ActionBtn icon="info" label={t('assets.repairs.actions.detail')} onClick={() => openDetail(req)} />
                          {req.status === 'OPEN' && (
                            <>
                              <ActionBtn icon="check_circle" label={t('assets.repairs.actions.approve')} color="text-green-600" onClick={() => setApproveTicket(req)} />
                              <ActionBtn icon="undo" label={t('assets.repairs.actions.return')} color="text-red-500" onClick={() => setReturnId(req.id)} />
                            </>
                          )}
                          {req.status === 'IN_PROGRESS' && (
                            <ActionBtn icon="task_alt" label={t('assets.repairs.actions.close')} color="text-primary" onClick={() => setCloseId(req.id)} />
                          )}
                          {req.status === 'WAITING_LOANER_RETURN' &&
                            ((user?.id === req.handled_by && !req.loaner_return_lender_confirmed) ||
                             (user?.id === req.requester_id && !req.loaner_return_borrower_confirmed)) && (
                            <ActionBtn icon="keyboard_return" label={t('assets.repairs.actions.confirmReturn')} color="text-purple-600" onClick={() => handleConfirmLoanerReturn(req.id)} />
                          )}
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

      <AdminTicketDetailModal
        ticket={detailTicket}
        attachments={detailAttachments}
        record={detailRecord}
        inspection={detailInspection}
        onClose={() => { setDetailTicket(null); setDetailRecord(null); setDetailInspection(null); }}
      />
      <ApproveTicketDialog
        ticket={approveTicket}
        onClose={() => setApproveTicket(null)}
        onApproved={fetchData}
      />
      <ReturnTicketDialog
        ticketId={returnId}
        onClose={() => setReturnId(null)}
        onReturned={fetchData}
      />
      <CloseTicketDialog
        ticketId={closeId}
        onClose={() => setCloseId(null)}
        onClosed={fetchData}
      />
      {asset && (
        <NewRepairRequestModal
          asset={asset}
          open={newRepairOpen}
          onClose={() => setNewRepairOpen(false)}
          onSuccess={() => { setNewRepairOpen(false); fetchData(); }}
        />
      )}

      {blockedDialogOpen && asset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-500 text-2xl mt-0.5">warning</span>
              <div>
                <h3 className="text-base font-bold text-on-surface">{t('assets.repairs.blocked.title')}</h3>
                <p className="text-sm text-on-surface-variant mt-1">
                  {asset.name}（{asset.asset_code}）{t('assets.repairs.blocked.message')}
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={() => setBlockedDialogOpen(false)}
                className="px-5 py-2 bg-primary text-white text-sm font-bold rounded-lg hover:opacity-90 transition-opacity"
              >
                {t('assets.repairs.understood')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

const ActionBtn: React.FC<{
  icon: string;
  label: string;
  color?: string;
  onClick: () => void;
}> = ({ icon, label, color = 'text-on-surface-variant', onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className={`p-1.5 rounded-lg hover:bg-surface-container transition-colors ${color} flex items-center gap-1`}
  >
    <span className="material-symbols-outlined text-base">{icon}</span>
    <span className="text-xs font-medium hidden lg:inline">{label}</span>
  </button>
);

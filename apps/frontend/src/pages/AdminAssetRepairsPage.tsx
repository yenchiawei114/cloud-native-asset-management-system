import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { api, Asset, RepairRequest } from '../lib/api';
import { AdminTicketDetailModal } from '../modules/ticketing/components/AdminTicketDetailModal';
import { ApproveTicketDialog } from '../modules/ticketing/components/ApproveTicketDialog';
import { ReturnTicketDialog } from '../modules/ticketing/components/ReturnTicketDialog';
import { CloseTicketDialog } from '../modules/ticketing/components/CloseTicketDialog';

interface TicketWithAttachment {
  request: RepairRequest;
  attachment: { id: number; file_url: string; file_name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: '待審核', IN_PROGRESS: '維修中', DONE: '已完成', CANCELLED: '已取消', RETURNED: '已退回',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  DONE: 'bg-green-100 text-green-700 border-green-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  RETURNED: 'bg-red-100 text-red-700 border-red-200',
};

export const AdminAssetRepairsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const assetId = Number(id);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [tickets, setTickets] = useState<TicketWithAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  const [detailTicket, setDetailTicket] = useState<RepairRequest | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<any[]>([]);
  const [detailRecord, setDetailRecord] = useState<any | null>(null);
  const [detailInspection, setDetailInspection] = useState<any | null>(null);
  const [approveId, setApproveId] = useState<number | null>(null);
  const [returnId, setReturnId] = useState<number | null>(null);
  const [closeId, setCloseId] = useState<number | null>(null);

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
      // 若 404 導回列表
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
      (ticket.status === 'IN_PROGRESS' || ticket.status === 'DONE')
        ? api.getTicketRecord(ticket.id).catch(() => null)
        : Promise.resolve(null),
      ticket.status === 'DONE'
        ? api.getTicketInspection(ticket.id).catch(() => null)
        : Promise.resolve(null),
    ]);

    setDetailAttachments(atts);
    setDetailRecord(record);
    setDetailInspection(inspection);
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
            資產管理
          </button>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="text-on-surface font-semibold">{asset?.name ?? `資產 #${assetId}`} — 維修紀錄</span>
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
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[asset.status.toUpperCase()] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {asset.status === 'in_use' ? '使用中' : asset.status === 'available' ? '閒置' : asset.status === 'maintenance' ? '維修中' : asset.status === 'borrowed' ? '已借出' : asset.status}
            </span>
          </div>
        )}

        {/* Tickets table */}
        <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm border border-outline-variant/10">
          <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
            <h2 className="font-bold text-on-surface">維修申請紀錄</h2>
            <span className="text-xs text-on-surface-variant font-medium">{tickets.length} 筆</span>
          </div>

          {tickets.length === 0 ? (
            <div className="py-20 text-center opacity-40">
              <span className="material-symbols-outlined text-6xl mb-3 block">build_circle</span>
              <p className="font-bold text-sm">尚無維修申請紀錄</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                    <th className="px-4 py-3">工單編號</th>
                    <th className="px-4 py-3">狀態</th>
                    <th className="px-4 py-3">申請人</th>
                    <th className="px-4 py-3">申請日期</th>
                    <th className="px-4 py-3">故障描述</th>
                    <th className="px-4 py-3 text-center">備用機</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-outline-variant/5">
                  {tickets.map(({ request: t }) => (
                    <tr key={t.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-primary text-xs">
                        #TKT-{String(t.id).padStart(4, '0')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[t.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {STATUS_LABELS[t.status] ?? t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {t.requester_name || `用戶 #${t.requester_id}`}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                        {new Date(t.created_at).toLocaleDateString('zh-TW')}
                      </td>
                      <td className="px-4 py-3 text-on-surface max-w-[200px] truncate">
                        {t.description}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {t.need_backup ? (
                          <span className="material-symbols-outlined text-amber-500 text-sm">check_circle</span>
                        ) : (
                          <span className="text-on-surface-variant/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <ActionBtn icon="info" label="詳細資訊" onClick={() => openDetail(t)} />
                          {t.status === 'OPEN' && (
                            <>
                              <ActionBtn icon="check_circle" label="核准" color="text-green-600" onClick={() => setApproveId(t.id)} />
                              <ActionBtn icon="undo" label="退回" color="text-red-500" onClick={() => setReturnId(t.id)} />
                            </>
                          )}
                          {t.status === 'IN_PROGRESS' && (
                            <ActionBtn icon="task_alt" label="結案" color="text-primary" onClick={() => setCloseId(t.id)} />
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
        ticketId={approveId}
        onClose={() => setApproveId(null)}
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

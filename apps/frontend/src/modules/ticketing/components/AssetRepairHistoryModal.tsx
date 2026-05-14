import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Asset, RepairRequest } from '../../../lib/api';

interface Props {
  asset: Asset;
  tickets: RepairRequest[];
  ticketsLoading: boolean;
  open: boolean;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  RETURNED: 'bg-red-100 text-red-700',
};

export const AssetRepairHistoryModal: React.FC<Props> = ({
  asset,
  tickets,
  ticketsLoading,
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const assetTickets = useMemo(
    () =>
      tickets
        .filter(tk => tk.asset_id === asset.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [tickets, asset.id]
  );

  if (!open) return null;

  const handleRowClick = (ticketId: number) => {
    navigate(`/repair-history/${ticketId}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-on-surface">維修紀錄</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {asset.asset_code} · {asset.name}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-on-surface transition-colors p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {ticketsLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : assetTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">history</span>
              <p className="text-sm text-on-surface-variant">尚無維修申請紀錄</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100">
                  {['工單編號', '狀態', '申請日期', '故障描述', '備用機', ''].map((col, i) => (
                    <th key={i} className="px-5 py-3 text-[10px] font-bold text-slate-500 uppercase whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {assetTickets.map(ticket => (
                  <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <span className="text-xs font-mono font-bold text-primary">
                        #TK-{ticket.id.toString().padStart(4, '0')}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLES[ticket.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {t(`ticketing.status.${ticket.status}`)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-on-surface-variant whitespace-nowrap">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 text-sm text-on-surface max-w-[240px] truncate">
                      {ticket.description}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold ${ticket.need_backup ? 'text-primary' : 'text-on-surface-variant'}`}>
                        {ticket.need_backup ? '需要' : '不需要'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleRowClick(ticket.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                        詳細資訊
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

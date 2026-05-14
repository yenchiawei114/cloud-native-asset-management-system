import React from 'react';
import { RepairRequest } from '../../../lib/api';

interface Attachment {
  id: number;
  file_url: string;
  file_name: string;
  attachable_type?: string;
}

interface Props {
  ticket: RepairRequest | null;
  attachments?: Attachment[];
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: '待審核', IN_PROGRESS: '維修中', DONE: '已完成', CANCELLED: '已取消', RETURNED: '已退回',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
  RETURNED: 'bg-red-100 text-red-700',
};

export const AdminTicketDetailModal: React.FC<Props> = ({ ticket, attachments = [], onClose }) => {
  if (!ticket) return null;

  const reqPhotos = attachments.filter(a => !a.attachable_type || a.attachable_type === 'REPAIR_REQUEST');
  const processPhotos = attachments.filter(a => a.attachable_type === 'REPAIR_RECORD');

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <div>
            <span className="text-xs font-mono text-primary font-bold">#TKT-{String(ticket.id).padStart(4, '0')}</span>
            <h2 className="text-base font-bold text-on-surface mt-0.5">維修申請詳情</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[ticket.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {STATUS_LABELS[ticket.status] ?? ticket.status}
            </span>
          </div>

          <InfoRow label="申請人" value={ticket.requester_name || `用戶 #${ticket.requester_id}`} />
          <InfoRow label="申請日期" value={new Date(ticket.created_at).toLocaleDateString('zh-TW')} />
          <InfoRow label="備用機需求" value={ticket.need_backup ? `需要${ticket.backup_spec ? `（${ticket.backup_spec}）` : ''}` : '不需要'} />
          {ticket.expected_completion_date && (
            <InfoRow label="預計完成日期" value={new Date(ticket.expected_completion_date).toLocaleDateString('zh-TW')} />
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-on-surface-variant">故障描述</p>
            <p className="text-sm text-on-surface bg-surface-container-low rounded-lg px-3 py-2 whitespace-pre-wrap">
              {ticket.description}
            </p>
          </div>

          {ticket.status === 'RETURNED' && ticket.reject_reason && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-error">退回原因</p>
              <p className="text-sm text-error bg-error-container/20 rounded-lg px-3 py-2 whitespace-pre-wrap">
                {ticket.reject_reason}
              </p>
            </div>
          )}

          {reqPhotos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-on-surface-variant">申請附件照片</p>
              <div className="grid grid-cols-3 gap-2">
                {reqPhotos.map(a => (
                  <a key={a.id} href={a.file_url} target="_blank" rel="noopener noreferrer">
                    <img src={a.file_url} alt={a.file_name} className="w-full h-20 object-cover rounded-lg border border-outline-variant/20 hover:opacity-80 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {processPhotos.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-on-surface-variant">維修過程照片</p>
              <div className="grid grid-cols-3 gap-2">
                {processPhotos.map(a => (
                  <a key={a.id} href={a.file_url} target="_blank" rel="noopener noreferrer">
                    <img src={a.file_url} alt={a.file_name} className="w-full h-20 object-cover rounded-lg border border-outline-variant/20 hover:opacity-80 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between items-start gap-4">
    <span className="text-xs font-semibold text-on-surface-variant shrink-0">{label}</span>
    <span className="text-sm text-on-surface text-right">{value}</span>
  </div>
);

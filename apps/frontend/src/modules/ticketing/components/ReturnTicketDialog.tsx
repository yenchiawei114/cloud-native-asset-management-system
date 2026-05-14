import React, { useState } from 'react';
import { api } from '../../../lib/api';

interface Props {
  ticketId: number | null;
  onClose: () => void;
  onReturned: () => void;
}

export const ReturnTicketDialog: React.FC<Props> = ({ ticketId, onClose, onReturned }) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId || !reason.trim()) return;
    setError('');
    setSubmitting(true);
    try {
      await api.returnTicket(ticketId, reason.trim());
      onReturned();
      onClose();
      setReason('');
    } catch (err: any) {
      setError(err.message || '操作失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (ticketId === null) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <h2 className="text-base font-bold text-on-surface">退回維修申請</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-on-surface-variant">退回工單 <span className="font-bold text-primary">#TKT-{String(ticketId).padStart(4, '0')}</span>，申請人可修改後重新送出。</p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-on-surface-variant">退回原因 <span className="text-error">*</span></label>
            <textarea
              required
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none h-24"
              placeholder="請說明退回原因..."
            />
          </div>

          {error && <p className="text-sm text-error bg-error-container/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
              取消
            </button>
            <button type="submit" disabled={submitting || !reason.trim()} className="px-5 py-2 bg-error text-on-error text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
              {submitting ? '處理中...' : '確認退回'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

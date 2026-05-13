import React, { useState } from 'react';
import { Asset } from '../../../lib/api';
import { ticketService } from '../services/ticketService';
import { useAuth } from '../../auth/hooks/useAuth';

interface Props {
  asset: Asset;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewRepairRequestModal: React.FC<Props> = ({ asset, open, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [needBackup, setNeedBackup] = useState(false);
  const [backupSpec, setBackupSpec] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('請填寫故障描述');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await ticketService.createTicket({
        asset_id: asset.id,
        requester_id: user.id,
        description: description.trim(),
        need_backup: needBackup,
        backup_spec: needBackup ? backupSpec.trim() || null : null,
        expected_completion_date: null,
        pickup_location: null,
      });
      for (const file of files) {
        await ticketService.uploadAttachment(ticket.id, file);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || '提交失敗，請重試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-on-surface">建立維修申請</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {asset.asset_code} · {asset.name}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-on-surface transition-colors p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-on-surface">
              故障描述 <span className="text-error">*</span>
            </label>
            <textarea
              className="w-full bg-surface-container-low border-none rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none min-h-[100px]"
              placeholder="請描述設備出現的問題，例如：螢幕閃爍、無法開機..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 text-primary border-slate-300 rounded focus:ring-primary/20"
                checked={needBackup}
                onChange={e => setNeedBackup(e.target.checked)}
              />
              <span className="text-sm font-semibold text-on-surface">需要備用機</span>
            </label>
            {needBackup && (
              <input
                type="text"
                className="w-full bg-surface-container-low border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder="備用機規格需求，例如：32GB RAM, M1 Pro..."
                value={backupSpec}
                onChange={e => setBackupSpec(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-on-surface">附件上傳</label>
            <label className="block border-2 border-dashed border-slate-200 rounded-xl p-5 text-center hover:border-primary/40 transition-colors cursor-pointer">
              <input type="file" className="hidden" multiple accept="image/*" onChange={handleFileChange} />
              <span className="material-symbols-outlined text-3xl text-slate-300 block mb-1">cloud_upload</span>
              <p className="text-sm text-on-surface-variant">點擊或拖曳照片至此處</p>
            </label>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((file, i) => (
                  <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-slate-200">
                    <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-error bg-error/5 px-4 py-3 rounded-xl">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-lg shadow-sm shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {submitting ? '送出中...' : '送出申請'}
          </button>
        </div>
      </div>
    </div>
  );
};

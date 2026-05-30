import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [needBackup, setNeedBackup] = useState(false);
  const [backupSpec, setBackupSpec] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadDraft = async () => {
      setLoadingDraft(true);
      setDraftStatus('loading');
      try {
        const draft = await ticketService.getDraft(asset.id);
        if (cancelled) return;
        setDescription(draft.draft_data.description || '');
        setNeedBackup(draft.draft_data.need_backup || false);
        setBackupSpec(draft.draft_data.backup_spec || '');
        setDraftStatus('saved');
      } catch {
        if (cancelled) return;
        setDescription('');
        setNeedBackup(false);
        setBackupSpec('');
        setDraftStatus('idle');
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    };

    loadDraft();

    return () => {
      cancelled = true;
    };
  }, [asset.id, open]);

  useEffect(() => {
    if (!open || loadingDraft || submitting) return;
    if (!description.trim() && !needBackup && !backupSpec.trim()) return;

    setDraftStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await ticketService.saveDraft(asset.id, {
          description,
          need_backup: needBackup,
          backup_spec: needBackup ? backupSpec : null,
        });
        setDraftStatus('saved');
      } catch (err) {
        console.error('Failed to auto-save draft:', err);
        setDraftStatus('error');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [asset.id, backupSpec, description, loadingDraft, needBackup, open, submitting]);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError(t('ticketing.new.descriptionRequired'));
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
      try {
        await ticketService.deleteDraft(asset.id);
      } catch (err) {
        console.error('Failed to delete draft:', err);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || t('ticketing.new.submitFailed'));
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
            <h2 className="text-base font-bold text-on-surface">{t('ticketing.new.title')}</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {asset.asset_code} · {asset.name}
            </p>
          </div>
          <div className="ml-auto mr-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100 text-[11px] font-medium text-slate-500">
            {draftStatus === 'loading' && (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary border-t-transparent"></div>
                <span>{t('ticketing.draft.loading', '正在載入草稿...')}</span>
              </>
            )}
            {draftStatus === 'saving' && (
              <>
                <div className="animate-ping h-1.5 w-1.5 rounded-full bg-amber-500"></div>
                <span>{t('ticketing.draft.saving', '草稿儲存中...')}</span>
              </>
            )}
            {draftStatus === 'saved' && (
              <>
                <span className="material-symbols-outlined text-green-500 text-sm">check_circle</span>
                <span>{t('ticketing.draft.saved', '草稿已自動儲存')}</span>
              </>
            )}
            {draftStatus === 'error' && (
              <>
                <span className="material-symbols-outlined text-error text-sm">error</span>
                <span>{t('ticketing.draft.error', '草稿儲存失敗')}</span>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-on-surface transition-colors p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-on-surface">
              {t('ticketing.new.descriptionLabel')} <span className="text-error">*</span>
            </label>
            <textarea
              className="w-full bg-surface-container-low border-none rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none min-h-[100px]"
              placeholder={t('ticketing.new.descriptionPlaceholder')}
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
              <span className="text-sm font-semibold text-on-surface">{t('ticketing.new.needBackup')}</span>
            </label>
            {needBackup && (
              <input
                type="text"
                className="w-full bg-surface-container-low border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                placeholder={t('ticketing.new.backupSpecPlaceholder')}
                value={backupSpec}
                onChange={e => setBackupSpec(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-on-surface">{t('ticketing.new.attachments')}</label>
            <label className="block border-2 border-dashed border-slate-200 rounded-xl p-5 text-center hover:border-primary/40 transition-colors cursor-pointer">
              <input type="file" className="hidden" multiple accept="image/*" onChange={handleFileChange} />
              <span className="material-symbols-outlined text-3xl text-slate-300 block mb-1">cloud_upload</span>
              <p className="text-sm text-on-surface-variant">{t('ticketing.new.uploadHint')}</p>
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
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-primary text-white text-sm font-bold rounded-lg shadow-sm shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {submitting ? t('ticketing.new.submitting') : t('ticketing.new.submit')}
          </button>
        </div>
      </div>
    </div>
  );
};

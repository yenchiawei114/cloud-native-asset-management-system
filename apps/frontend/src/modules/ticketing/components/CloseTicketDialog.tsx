import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import type { Vendor } from '../../../lib/api';

interface Props {
  ticketId: number | null;
  onClose: () => void;
  onClosed: () => void;
}

export const CloseTicketDialog: React.FC<Props> = ({ ticketId, onClose, onClosed }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    issue_description: '',
    solution: '',
    vendor_id: '',
    cost: '',
  });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listVendors().then(setVendors).catch(() => {});
  }, []);

  const field = (key: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId) return;
    setError('');
    setSubmitting(true);
    try {
      await api.closeTicket(ticketId, {
        issue_description: form.issue_description,
        solution: form.solution,
        vendor_id: Number(form.vendor_id),
        cost: Number(form.cost) || 0,
      });

      if (photos.length > 0) {
        const record = await api.getTicketRecord(ticketId).catch(() => null);
        if (record?.id) {
          for (const photo of photos) {
            const fd = new FormData();
            fd.append('attachable_type', 'REPAIR_RECORD');
            fd.append('attachable_id', String(record.id));
            fd.append('file', photo);
            await api.uploadAttachment(fd).catch(() => {});
          }
        }
      }

      onClosed();
      onClose();
      setForm({ issue_description: '', solution: '', vendor_id: '', cost: '' });
      setPhotos([]);
    } catch (err: any) {
      setError(err.message || t('common.operationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (ticketId === null) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <h2 className="text-base font-bold text-on-surface">{t('ticketing.close.title')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-sm text-on-surface-variant">
            {t('ticketing.close.title')} <span className="font-bold text-primary">#TKT-{String(ticketId).padStart(4, '0')}</span>{t('ticketing.close.infoSuffix')}
          </p>

          <Field label={t('ticketing.close.issueAnalysis')} required>
            <textarea required value={form.issue_description} onChange={e => field('issue_description', e.target.value)}
              className={textareaCls} placeholder={t('ticketing.close.issueAnalysisPlaceholder')} />
          </Field>
          <Field label={t('ticketing.close.solutionResult')} required>
            <textarea required value={form.solution} onChange={e => field('solution', e.target.value)}
              className={textareaCls} placeholder={t('ticketing.close.solutionResultPlaceholder')} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('ticketing.close.vendor')} required>
              <select required value={form.vendor_id} onChange={e => field('vendor_id', e.target.value)}
                className={inputCls}>
                <option value="">{t('ticketing.close.vendorPlaceholder')}</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t('ticketing.close.totalCost')} required>
              <input required type="number" min="0" value={form.cost} onChange={e => field('cost', e.target.value)}
                className={inputCls} placeholder="0" />
            </Field>
          </div>

          <Field label={t('ticketing.close.processPhotos')}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={e => setPhotos(Array.from(e.target.files || []))}
              className="w-full text-sm text-on-surface-variant file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary-container file:text-on-primary-container hover:file:bg-primary/20 cursor-pointer"
            />
            {photos.length > 0 && (
              <p className="text-xs text-on-surface-variant mt-1">{t('ticketing.close.photosSelected', { count: photos.length })}</p>
            )}
          </Field>

          {error && <p className="text-sm text-error bg-error-container/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={submitting} className="px-5 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
              {submitting ? t('ticketing.close.submitting') : t('ticketing.close.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const inputCls = "w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none";
const textareaCls = "w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none resize-none h-20";

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-on-surface-variant">
      {label}{required && <span className="text-error ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

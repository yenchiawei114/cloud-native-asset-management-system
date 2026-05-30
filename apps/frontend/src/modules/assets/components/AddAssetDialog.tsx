import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, User, Vendor } from '../../../lib/api';
import { useAuth } from '../../auth/hooks/useAuth';
import { VendorCombobox } from '../../../components/VendorCombobox';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ASSET_TYPES = ['laptop', 'desktop', 'phone', 'tablet', 'server', 'network', 'other'];

export const AddAssetDialog: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user: authUser } = useAuth();
  const [form, setForm] = useState({
    asset_code: '',
    name: '',
    type: 'laptop',
    vendor: '',
    model: '',
    specification: '',
    purchase_date: '',
    purchase_price: '',
    activation_date: '',
    warranty_expiry: '',
    storage_location: '',
  });
  const [users, setUsers] = useState<User[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<User | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api.listUsers({ limit: 1000 }).then(data => {
      setUsers(data.items);
      if (authUser) {
        const self = data.items.find(u => u.id === authUser.id) ?? null;
        setSelectedOwner(self);
      }
    }).catch(() => {});
    api.listVendors().then(setVendors).catch(() => {});
  }, [open, authUser?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.createAsset({
        asset_code: form.asset_code,
        name: form.name,
        type: form.type,
        vendor: form.vendor,
        model: form.model,
        specification: form.specification,
        purchase_date: form.purchase_date,
        purchase_price: Number(form.purchase_price),
        status: 'available',
        owner_id: selectedOwner?.id ?? null,
        activation_date: form.activation_date,
        warranty_expiry: form.warranty_expiry,
        storage_location: null,
      });
      onCreated();
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message || t('assets.dialog.failedCreate'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      asset_code: '', name: '', type: 'laptop', vendor: '', model: '',
      specification: '', purchase_date: '', purchase_price: '',
      activation_date: '', warranty_expiry: '', storage_location: '',
    });
    if (authUser) {
      const self = users.find(u => u.id === authUser.id) ?? null;
      setSelectedOwner(self);
    } else {
      setSelectedOwner(null);
    }
    setError('');
  };

  const field = (key: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/20">
          <h2 className="text-lg font-bold text-on-surface">{t('assets.dialog.title')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('assets.dialog.assetName')} required>
              <input required value={form.name} onChange={e => field('name', e.target.value)}
                className={inputCls} placeholder="MacBook Pro 14" />
            </Field>
            <Field label={t('assets.dialog.assetCode')} required>
              <input required value={form.asset_code} onChange={e => field('asset_code', e.target.value)}
                className={inputCls} placeholder="A0000001" maxLength={10} />
            </Field>
            <Field label={t('assets.dialog.category')} required>
              <select required value={form.type} onChange={e => field('type', e.target.value)} className={inputCls}>
                {ASSET_TYPES.map(type => (
                  <option key={type} value={type}>{t(`assets.type.${type}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('assets.dialog.vendor')} required>
              <VendorCombobox
                vendors={vendors}
                value={form.vendor}
                onChange={(name) => field('vendor', name)}
                required
                inputCls={inputCls}
              />
            </Field>
            <Field label={t('assets.dialog.model')} required>
              <input required value={form.model} onChange={e => field('model', e.target.value)}
                className={inputCls} placeholder="MBP14-M3" />
            </Field>
            <Field label={t('assets.dialog.location')}>
              <input
                readOnly
                value={selectedOwner?.location ?? t('assets.dialog.autoLocation')}
                className={inputCls + ' cursor-not-allowed opacity-60'}
              />
            </Field>
          </div>

          <Field label={t('assets.dialog.specification')} required>
            <textarea required value={form.specification} onChange={e => field('specification', e.target.value)}
              className={inputCls + ' resize-none h-16'} placeholder="M3 Pro / 16GB / 512GB SSD" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('assets.dialog.purchaseDate')} required>
              <input required type="date" value={form.purchase_date} onChange={e => field('purchase_date', e.target.value)} className={inputCls} />
            </Field>
            <Field label={t('assets.dialog.purchaseAmount')} required>
              <input required type="number" min="0" value={form.purchase_price} onChange={e => field('purchase_price', e.target.value)} className={inputCls} />
            </Field>
            <Field label={t('assets.dialog.activationDate')} required>
              <input required type="date" value={form.activation_date} onChange={e => field('activation_date', e.target.value)} className={inputCls} />
            </Field>
            <Field label={t('assets.dialog.expiryDate')} required>
              <input required type="date" value={form.warranty_expiry} onChange={e => field('warranty_expiry', e.target.value)} className={inputCls} />
            </Field>
            <Field label={t('assets.dialog.assetStatus')}>
              <input readOnly value={t('assets.dialog.assetStatusValue')} className={inputCls + ' cursor-not-allowed opacity-60'} />
            </Field>
            <Field label={t('assets.dialog.custodian')}>
              <input
                readOnly
                value={selectedOwner ? `${selectedOwner.name}（${selectedOwner.employee_id}）` : t('common.loading')}
                className={inputCls + ' cursor-not-allowed opacity-60'}
              />
            </Field>
          </div>

          {error && <p className="text-sm text-error bg-error-container/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={submitting} className="px-5 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
              {submitting ? t('assets.dialog.submitting') : t('assets.dialog.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const inputCls = "w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none";

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-on-surface-variant">
      {label}{required && <span className="text-error ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

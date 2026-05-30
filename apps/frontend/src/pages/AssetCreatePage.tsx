import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAssets } from '../modules/assets/hooks/useAssets';
import { api, AssetCreatePayload, Vendor } from '../lib/api';
import { FeedbackDialog } from '../modules/core/components/FeedbackDialog';
import { useFeedback } from '../modules/core/hooks/useFeedback';
import { useAuth } from '../modules/auth/hooks/useAuth';

export const AssetCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const { createAsset } = useAssets();
  const { feedbackState, showFeedback, closeFeedback } = useFeedback();
  const { user: authUser } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);

  useEffect(() => {
    api.listVendors().then(setVendors).catch(() => {});
  }, []);

  React.useEffect(() => {
    document.title = t('assets.create.pageTitle');
  }, [t]);
  
  const today = new Date().toISOString().split('T')[0];
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const nextYearStr = nextYear.toISOString().split('T')[0];

  const [formData, setFormData] = useState<AssetCreatePayload>({
    asset_code: '',
    name: '',
    type: 'laptop',
    model: '',
    specification: '',
    vendor: '',
    purchase_date: today,
    purchase_price: 0,
    activation_date: today,
    warranty_expiry: nextYearStr,
    status: 'available',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createAsset(formData);
      showFeedback({
        title: t('assets.create.successTitle'),
        message: t('assets.create.successMsg'),
        type: 'success',
        onConfirm: () => navigate('/all-assets'),
      });
    } catch (err: any) {
      showFeedback({
        title: t('assets.create.failTitle'),
        message: err.message || t('profile.create.checkInputs'),
        type: 'error',
        onConfirm: closeFeedback,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout activeTab="all">
      <main className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <nav className="flex items-center gap-2 text-xs font-medium text-outline mb-2">
            <span className="hover:text-primary transition-colors cursor-pointer" onClick={() => navigate('/all-assets')}>{t('assets.create.breadcrumb')}</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary font-bold">{t('assets.create.title')}</span>
          </nav>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">{t('assets.create.title')}</h1>
          <p className="text-on-surface-variant mt-2 font-medium">{t('assets.create.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left Column: Form Sections */}
          <div className="lg:col-span-8 space-y-8">
            {/* Section 1: 基本規格 */}
            <section className="bg-surface-container-lowest p-10 rounded-[2rem] border border-outline-variant/10 shadow-sm space-y-8">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-8 bg-primary rounded-full"></span>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">{t('assets.create.basicSpecs')}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputGroup label={t('assets.create.assetName')} required>
                  <input required className={inputStyles} placeholder={t('assets.create.namePlaceholder')} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </InputGroup>
                <InputGroup label={t('assets.create.category')} required>
                  <select className={inputStyles} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                    <option value="laptop">{t('assets.type.laptop')}</option>
                    <option value="desktop">{t('assets.type.desktop')}</option>
                    <option value="phone">{t('assets.type.phone')}</option>
                    <option value="tablet">{t('assets.type.tablet')}</option>
                    <option value="server">{t('assets.type.server')}</option>
                    <option value="network">{t('assets.type.network')}</option>
                    <option value="other">{t('assets.type.other')}</option>
                  </select>
                </InputGroup>
                <InputGroup label={t('assets.create.vendor')} required>
                  <select required className={inputStyles} value={formData.vendor} onChange={e => setFormData({...formData, vendor: e.target.value})}>
                    <option value="">{t('assets.selectVendor')}</option>
                    {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                  </select>
                </InputGroup>
                <InputGroup label={t('assets.create.model')} required>
                  <input required className={inputStyles} placeholder={t('assets.create.modelPlaceholder')} value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} />
                </InputGroup>
                <div className="md:col-span-2">
                  <InputGroup label={t('assets.create.specification')} required>
                    <textarea required className={`${inputStyles} h-24 pt-4`} placeholder={t('assets.create.specPlaceholder')} value={formData.specification} onChange={e => setFormData({...formData, specification: e.target.value})} />
                  </InputGroup>
                </div>
              </div>
            </section>

            {/* Section 2: 採購與識別 */}
            <section className="bg-surface-container-lowest p-10 rounded-[2rem] border border-outline-variant/10 shadow-sm space-y-8">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-8 bg-primary rounded-full"></span>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">{t('assets.create.procurement')}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputGroup label={t('assets.create.assetCode')} required>
                  <input required maxLength={10} className={inputStyles} placeholder={t('assets.create.assetCodePlaceholder')} value={formData.asset_code} onChange={e => setFormData({...formData, asset_code: e.target.value.toUpperCase()})} />
                </InputGroup>
                <InputGroup label={t('assets.create.purchaseDate')} required>
                  <input required type="date" className={inputStyles} value={formData.purchase_date} onChange={e => setFormData({...formData, purchase_date: e.target.value})} />
                </InputGroup>
                <InputGroup label={t('assets.create.purchaseAmount')} required>
                  <input required type="number" className={inputStyles} placeholder="0" value={formData.purchase_price} onChange={e => setFormData({...formData, purchase_price: parseInt(e.target.value) || 0})} />
                </InputGroup>
                <InputGroup label={t('assets.create.assetStatus')} required>
                  <select className={inputStyles} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                    <option value="available">{t('assets.create.statusAvailable')}</option>
                    <option value="in_use">{t('assets.create.statusInUse')}</option>
                    <option value="maintenance">{t('assets.create.statusMaintenance')}</option>
                    <option value="borrowed">{t('assets.create.statusBorrowed')}</option>
                  </select>
                </InputGroup>
              </div>
            </section>

            {/* Section 3: 保固資訊 */}
            <section className="bg-surface-container-lowest p-10 rounded-[2rem] border border-outline-variant/10 shadow-sm space-y-8">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-8 bg-primary rounded-full"></span>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">{t('assets.create.warranty')}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputGroup label={t('assets.create.activationDate')} required>
                  <input required type="date" className={inputStyles} value={formData.activation_date} onChange={e => setFormData({...formData, activation_date: e.target.value})} />
                </InputGroup>
                <InputGroup label={t('assets.create.warrantyExpiry')} required>
                  <input required type="date" className={inputStyles} value={formData.warranty_expiry} onChange={e => setFormData({...formData, warranty_expiry: e.target.value})} />
                </InputGroup>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputGroup label={t('assets.create.locationAuto')}>
                  <div className={`${inputStyles} bg-surface-container-high cursor-not-allowed opacity-70`}>
                    {authUser?.location ?? t('assets.create.noLocation')}
                  </div>
                </InputGroup>
              </div>
              <p className="text-xs text-outline/70 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">info</span>
                {t('assets.create.locationInfo')}
              </p>
            </section>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-6 pt-10">
              <button
                type="button"
                onClick={() => navigate('/all-assets')}
                className="px-10 py-4 rounded-2xl text-sm font-black text-outline hover:bg-surface-container-high transition-all"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-14 py-4 rounded-2xl text-sm font-black text-white bg-gradient-to-br from-primary to-primary-container shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? t('assets.create.saving') : t('assets.create.submit')}
              </button>
            </div>
          </div>

          {/* Right Column: Insights */}
          <div className="lg:col-span-4 space-y-8">
            <section className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm sticky top-28">
              <div className="flex items-center gap-3 mb-8">
                <span className="material-symbols-outlined text-primary text-3xl">lightbulb</span>
                <h3 className="text-xl font-black">{t('assets.create.tips')}</h3>
              </div>
              <ul className="space-y-8">
                <InfoItem icon="verified" title={t('assets.create.tip1Title')} desc={t('assets.create.tip1Desc')} />
                <InfoItem icon="shield_with_heart" title={t('assets.create.tip2Title')} desc={t('assets.create.tip2Desc')} />
                <InfoItem icon="qr_code_2" title={t('assets.create.tip3Title')} desc={t('assets.create.tip3Desc')} />
              </ul>
            </section>
          </div>
        </form>
      </main>
      <FeedbackDialog 
        {...feedbackState} 
        onConfirm={() => {
          feedbackState.onConfirm?.();
          closeFeedback();
        }}
        onCancel={closeFeedback}
      />
    </DashboardLayout>
  );
};

const inputStyles = "w-full bg-surface-container-low border-none rounded-2xl px-6 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 transition-all placeholder:text-outline/40 placeholder:font-normal";

const InputGroup: React.FC<{ label: string, children: React.ReactNode, required?: boolean }> = ({ label, children, required }) => (
  <div className="flex flex-col space-y-3">
    <label className="text-[10px] font-black text-outline uppercase tracking-[0.2em] px-1">
      {label} {required && <span className="text-error">*</span>}
    </label>
    {children}
  </div>
);

const InfoItem: React.FC<{ icon: string, title: string, desc: string }> = ({ icon, title, desc }) => (
  <li className="flex gap-4">
    <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary flex-shrink-0">
      <span className="material-symbols-outlined text-xl">{icon}</span>
    </div>
    <div className="flex flex-col gap-1">
      <span className="text-sm font-black text-on-surface">{title}</span>
      <p className="text-xs text-outline leading-relaxed">{desc}</p>
    </div>
  </li>
);

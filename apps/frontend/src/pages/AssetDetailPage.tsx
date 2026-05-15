import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { useAssetDetail } from '../modules/assets/hooks/useAssetDetail';
import { FeedbackDialog } from '../modules/core/components/FeedbackDialog';
import { useFeedback } from '../modules/core/hooks/useFeedback';
import { api } from '../lib/api';

export const AssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { asset, history, loading, error, updateAsset, refresh } = useAssetDetail(id);
  const { feedbackState, showFeedback, closeFeedback } = useFeedback();

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  useEffect(() => {
    if (asset) {
      setForm({
        name: asset.name,
        type: asset.type,
        model: asset.model,
        specification: asset.specification,
        vendor: asset.vendor,
        purchase_date: asset.purchase_date,
        purchase_price: asset.purchase_price,
        warranty_expiry: (asset as any).warranty_expiry || '',
        activation_date: (asset as any).activation_date || ''
      });
    }
  }, [asset]);

  const handleToggleStatus = async () => {
    if (!asset) return;
    setIsTogglingStatus(true);
    try {
      await api.toggleAssetStatus(asset.id);
      await refresh();
    } catch (err: any) {
      showFeedback({ title: '切換失敗', message: err.message || '切換狀態失敗', type: 'error', onConfirm: closeFeedback });
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await updateAsset(form);
      setIsEditing(false);
      await refresh();
      showFeedback({ 
        title: t('common.saveSuccessTitle') || '更新成功', 
        message: t('common.saveSuccessMsg') || '資產資料已成功更新', 
        type: 'success', 
        onConfirm: closeFeedback 
      });
    } catch (err: any) {
      showFeedback({ title: '儲存失敗', message: err.message || '儲存失敗', type: 'error', onConfirm: closeFeedback });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout activeTab={isAdmin ? "all" : "assets"}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !asset) {
    return (
      <DashboardLayout activeTab={isAdmin ? "all" : "assets"}>
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <span className="material-symbols-outlined text-6xl text-error/50">error</span>
          <p className="text-on-surface-variant font-medium">{error || 'Asset not found'}</p>
          <button
            onClick={() => navigate(isAdmin ? '/all-assets' : '/dashboard')}
            className="px-6 py-2 bg-primary text-white rounded-lg font-bold"
          >
            返回列表
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab={isAdmin ? "all" : "assets"}>
      <div className="pt-4 px-2 pb-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Header Section */}
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-slate-500 font-mono text-sm">
              <button
                onClick={() => navigate(isAdmin ? '/all-assets' : '/dashboard')}
                className="hover:text-primary transition-colors flex items-center gap-1 mr-2 group"
              >
                <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
                {t('ticketing.backToList')}
              </button>
              <span className="opacity-30">|</span>
              <span>{t('assets.detail.assetCode')}</span>
              <span className="bg-surface-container-highest px-2 py-0.5 rounded text-on-surface-variant font-bold">#{asset.asset_code}</span>
            </div>
            {isEditing ? (
              <input
                className="text-4xl font-extrabold tracking-tight text-slate-900 bg-transparent border-b-2 border-primary focus:ring-0 px-0 py-1 w-full"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            ) : (
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{asset.name}</h1>
            )}
          </div>

          <div className="flex items-center gap-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                asset.status === 'available' ? 'bg-green-100 text-green-700' :
                asset.status === 'in_use' ? 'bg-blue-100 text-blue-700' :
                'bg-amber-100 text-amber-700'
              }`}>
              <span className={`w-2 h-2 rounded-full ${
                  asset.status === 'available' ? 'bg-green-500' :
                  asset.status === 'in_use' ? 'bg-blue-500' :
                  'bg-amber-500'
                }`}></span>
              {t(`assets.status.${asset.status}`)}
            </span>
            {isAdmin && !isEditing && asset.owner_id === user?.id && (asset.status === 'available' || asset.status === 'in_use') && (
              <button
                onClick={handleToggleStatus}
                disabled={isTogglingStatus}
                className="flex items-center gap-2 px-5 py-2.5 bg-surface-container-high text-on-surface rounded-lg font-bold shadow hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">swap_vert</span>
                {asset.status === 'available' ? '標記使用中' : '標記閒置'}
              </button>
            )}
            {isAdmin && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                {t('assets.detail.edit')}
              </button>
            )}
          </div>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-12 gap-6">
          {/* Section 1: Asset Identity (Left Column) */}
          <div className="col-span-12 lg:col-span-7 space-y-6">
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-slate-100">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">fingerprint</span>
                {t('assets.detail.identity')}
              </h3>
              <div className="flex flex-col md:flex-row gap-8">
                <div className="w-48 h-48 bg-surface-container rounded-lg overflow-hidden flex-shrink-0 relative group">
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                    <span className="material-symbols-outlined text-6xl">laptop_mac</span>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">{t('assets.detail.assetCode')}</label>
                    <p className="text-sm font-mono font-bold bg-slate-50 p-2 rounded">{asset.asset_code}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">{t('assets.detail.category')}</label>
                    {isEditing ? (
                      <select
                        className="w-full bg-surface-container-low border-none rounded-lg text-sm py-2.5 focus:ring-2 focus:ring-primary/20"
                        value={form.type}
                        onChange={e => setForm({ ...form, type: e.target.value })}
                      >
                        <option value="laptop">{t('assets.type.laptop')}</option>
                        <option value="desktop">{t('assets.type.desktop')}</option>
                        <option value="phone">{t('assets.type.phone')}</option>
                        <option value="tablet">{t('assets.type.tablet')}</option>
                        <option value="server">{t('assets.type.server')}</option>
                        <option value="network">{t('assets.type.network')}</option>
                        <option value="other">{t('assets.type.other')}</option>
                      </select>
                    ) : (
                      <p className="text-sm font-semibold p-2">{t(`assets.type.${asset.type}`)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">{t('assets.detail.model')}</label>
                    {isEditing ? (
                      <input
                        className="w-full bg-surface-container-low border-none rounded-lg text-sm py-2.5 focus:ring-2 focus:ring-primary/20"
                        value={form.model}
                        onChange={e => setForm({ ...form, model: e.target.value })}
                      />
                    ) : (
                      <p className="text-sm font-semibold p-2">{asset.model}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">{t('assets.detail.specs')}</label>
                    {isEditing ? (
                      <input
                        className="w-full bg-surface-container-low border-none rounded-lg text-sm py-2.5 focus:ring-2 focus:ring-primary/20"
                        value={form.specification}
                        onChange={e => setForm({ ...form, specification: e.target.value })}
                      />
                    ) : (
                      <p className="text-sm font-semibold p-2">{asset.specification}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Procurement & Warranty */}
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-slate-100">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">receipt_long</span>
                {t('assets.detail.procurement')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                <div className="p-4 rounded-xl bg-surface-container-low">
                  <span className="text-xs font-bold text-slate-400 block mb-1">{t('assets.detail.vendor')}</span>
                  {isEditing ? (
                    <input
                      className="w-full bg-transparent border-none p-0 text-sm font-semibold focus:ring-0"
                      value={form.vendor}
                      onChange={e => setForm({ ...form, vendor: e.target.value })}
                    />
                  ) : (
                    <span className="text-sm font-semibold">{asset.vendor}</span>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-surface-container-low">
                  <span className="text-xs font-bold text-slate-400 block mb-1">{t('assets.detail.purchaseDate')}</span>
                  {isEditing ? (
                    <input
                      className="w-full bg-transparent border-none p-0 text-sm font-semibold focus:ring-0"
                      type="date"
                      value={form.purchase_date}
                      onChange={e => setForm({ ...form, purchase_date: e.target.value })}
                    />
                  ) : (
                    <span className="text-sm font-semibold">{asset.purchase_date}</span>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-surface-container-low">
                  <span className="text-xs font-bold text-slate-400 block mb-1">{t('assets.detail.amount')}</span>
                  {isEditing ? (
                    <input
                      className="w-full bg-transparent border-none p-0 text-sm font-bold text-primary focus:ring-0"
                      type="number"
                      value={form.purchase_price}
                      onChange={e => setForm({ ...form, purchase_price: parseInt(e.target.value) || 0 })}
                    />
                  ) : (
                    <span className="text-sm font-bold text-primary">TWD {asset.purchase_price?.toLocaleString()}</span>
                  )}
                </div>
              </div>

              {/* Warranty Card */}
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary-container p-6 text-white shadow-xl">
                <div className="flex items-center justify-between relative z-10">
                  <div className="space-y-1">
                    <span className="text-xs font-medium opacity-80 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">verified_user</span>
                      {t('assets.detail.warranty')}
                    </span>
                    {isEditing ? (
                      <input
                        type="date"
                        className="bg-white/10 border-none rounded text-white font-bold focus:ring-0 w-full mt-1"
                        value={form.warranty_expiry}
                        onChange={e => setForm({ ...form, warranty_expiry: e.target.value })}
                      />
                    ) : (
                      <h4 className="text-xl font-bold">{t('assets.detail.validUntil')} {(asset as any).warranty_expiry || 'N/A'}</h4>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Assignment (Right Column) */}
          <div className="col-span-12 lg:col-span-5 space-y-6">
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-slate-100">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">person_search</span>
                {t('assets.detail.assignment')}
              </h3>
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-surface-container-low rounded-xl">
                  <div className="w-14 h-14 rounded-full border-4 border-white shadow-sm overflow-hidden bg-slate-200 flex items-center justify-center">
                    <span className="material-symbols-outlined text-slate-400">person</span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-400 block">{t('assets.detail.custodian')}</span>
                    <span className="text-lg font-bold">User ID: {asset.owner_id || 'N/A'}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2">{t('assets.detail.location')}</label>
                  <div className="flex items-center gap-2 px-4 py-3 bg-surface-container-low rounded-lg text-sm font-semibold">
                    <span className="material-symbols-outlined text-primary text-sm">location_on</span>
                    {asset.storage_location || 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Maintenance History */}
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">history</span>
                  {t('assets.detail.history')}
                </h3>
              </div>
              <div className="space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-slate-100">
                {history.length > 0 ? history.map((h) => (
                  <div key={h.id} className="relative pl-8">
                    <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 border-white ring-1 ${h.status === 'DONE' ? 'bg-green-50 ring-green-100' : 'bg-blue-50 ring-blue-100'
                      }`}>
                      <span className={`material-symbols-outlined text-[14px] ${h.status === 'DONE' ? 'text-green-600' : 'text-blue-600'
                        }`} style={{ fontVariationSettings: "'FILL' 1" }}>
                        {h.status === 'DONE' ? 'check_circle' : 'build'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold">{h.description}</span>
                        <span className="text-xs text-slate-400">{new Date(h.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{t(`ticketing.status.${h.status}`)}</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-slate-400 italic pl-4">{t('assets.detail.noHistory')}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Floating Footer Action (Admin Only) */}
        {isAdmin && isEditing && (
          <div className="fixed bottom-8 right-8 flex items-center gap-3 z-50">
            <button
              onClick={() => setIsEditing(false)}
              className="bg-surface-container-highest text-on-surface-variant px-6 py-3 rounded-full font-bold shadow-xl hover:bg-slate-300 transition-all"
            >
              {t('assets.detail.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSubmitting}
              className="bg-primary text-on-primary px-8 py-3 rounded-full font-bold shadow-2xl shadow-primary/40 hover:scale-105 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined">save</span>
              {isSubmitting ? t('assets.detail.saving') : t('assets.detail.save')}
            </button>
          </div>
        )}
      </div>
      <FeedbackDialog 
        {...feedbackState} 
        onConfirm={() => {
          if (feedbackState.type !== 'confirm') {
            closeFeedback();
          }
          feedbackState.onConfirm?.();
        }}
        onCancel={closeFeedback}
      />
    </DashboardLayout>
  );
};

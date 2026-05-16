import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAssets } from '../modules/assets/hooks/useAssets';
import { AssetCreatePayload } from '../lib/api';
import { FeedbackDialog } from '../modules/core/components/FeedbackDialog';
import { useFeedback } from '../modules/core/hooks/useFeedback';

export const AssetCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { createAsset } = useAssets();
  const { feedbackState, showFeedback, closeFeedback } = useFeedback();
  
  React.useEffect(() => {
    document.title = "新增資產 | Executive Architect";
  }, []);
  
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
        title: '資產新增成功', 
        message: '資產已成功錄入系統庫存。', 
        type: 'success', 
        onConfirm: () => navigate('/all-assets') 
      });
    } catch (err: any) {
      showFeedback({ 
        title: '新增失敗', 
        message: err.message || '請檢查輸入欄位', 
        type: 'error', 
        onConfirm: closeFeedback 
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
            <span className="hover:text-primary transition-colors cursor-pointer" onClick={() => navigate('/all-assets')}>資產管理</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary font-bold">新增資產設備</span>
          </nav>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface">新增資產設備</h1>
          <p className="text-on-surface-variant mt-2 font-medium">填寫詳細設備資訊以錄入系統庫存。</p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left Column: Form Sections */}
          <div className="lg:col-span-8 space-y-8">
            {/* Section 1: 基本規格 */}
            <section className="bg-surface-container-lowest p-10 rounded-[2rem] border border-outline-variant/10 shadow-sm space-y-8">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-8 bg-primary rounded-full"></span>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">基本規格 (Basic Specs)</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputGroup label="資產名稱" required>
                  <input required className={inputStyles} placeholder="例如：MacBook Pro 16吋" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </InputGroup>
                <InputGroup label="資產類別" required>
                  <select className={inputStyles} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                    <option value="laptop">筆記型電腦 (Laptop)</option>
                    <option value="desktop">桌上型電腦 (Desktop)</option>
                    <option value="phone">智慧型手機 (Phone)</option>
                    <option value="tablet">平板電腦 (Tablet)</option>
                    <option value="server">伺服器 (Server)</option>
                    <option value="network">網路設備 (Network)</option>
                    <option value="other">其他 (Other)</option>
                  </select>
                </InputGroup>
                <InputGroup label="品牌/廠商 (Vendor)" required>
                  <input required className={inputStyles} placeholder="例如：Apple, Dell" value={formData.vendor} onChange={e => setFormData({...formData, vendor: e.target.value})} />
                </InputGroup>
                <InputGroup label="型號 (Model)" required>
                  <input required className={inputStyles} placeholder="例如：M3 Max / A2991" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} />
                </InputGroup>
                <div className="md:col-span-2">
                  <InputGroup label="詳細規格 (Specification)" required>
                    <textarea required className={`${inputStyles} h-24 pt-4`} placeholder="例如：64GB RAM, 2TB SSD, Space Black" value={formData.specification} onChange={e => setFormData({...formData, specification: e.target.value})} />
                  </InputGroup>
                </div>
              </div>
            </section>

            {/* Section 2: 採購與識別 */}
            <section className="bg-surface-container-lowest p-10 rounded-[2rem] border border-outline-variant/10 shadow-sm space-y-8">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-8 bg-primary rounded-full"></span>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">採購與識別 (Procurement & ID)</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputGroup label="資產編號 (Asset Code)" required>
                  <input required maxLength={10} className={inputStyles} placeholder="10 碼唯一編號" value={formData.asset_code} onChange={e => setFormData({...formData, asset_code: e.target.value.toUpperCase()})} />
                </InputGroup>
                <InputGroup label="採購日期" required>
                  <input required type="date" className={inputStyles} value={formData.purchase_date} onChange={e => setFormData({...formData, purchase_date: e.target.value})} />
                </InputGroup>
                <InputGroup label="採購金額 (TWD)" required>
                  <input required type="number" className={inputStyles} placeholder="0" value={formData.purchase_price} onChange={e => setFormData({...formData, purchase_price: parseInt(e.target.value) || 0})} />
                </InputGroup>
                <InputGroup label="資產狀態" required>
                  <select className={inputStyles} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                    <option value="available">閒置可調撥 (Available)</option>
                    <option value="in_use">使用中 (In Use)</option>
                    <option value="maintenance">維修中 (Maintenance)</option>
                    <option value="borrowed">已借出 (Borrowed)</option>
                  </select>
                </InputGroup>
              </div>
            </section>

            {/* Section 3: 保固資訊 */}
            <section className="bg-surface-container-lowest p-10 rounded-[2rem] border border-outline-variant/10 shadow-sm space-y-8">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-8 bg-primary rounded-full"></span>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">保固資訊 (Warranty)</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <InputGroup label="啟用日期 (Activation Date)" required>
                  <input required type="date" className={inputStyles} value={formData.activation_date} onChange={e => setFormData({...formData, activation_date: e.target.value})} />
                </InputGroup>
                <InputGroup label="保固到期日 (Warranty Expiry)" required>
                  <input required type="date" className={inputStyles} value={formData.warranty_expiry} onChange={e => setFormData({...formData, warranty_expiry: e.target.value})} />
                </InputGroup>
              </div>
              <p className="text-xs text-outline/70 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">info</span>
                辦公地點將自動帶入管理員所屬部門，並隨保管人異動自動更新。
              </p>
            </section>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-6 pt-10">
              <button 
                type="button" 
                onClick={() => navigate('/all-assets')}
                className="px-10 py-4 rounded-2xl text-sm font-black text-outline hover:bg-surface-container-high transition-all"
              >
                取消
              </button>
              <button 
                type="submit" 
                disabled={loading}
                className="px-14 py-4 rounded-2xl text-sm font-black text-white bg-gradient-to-br from-primary to-primary-container shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? '錄入中...' : '確認新增資產'}
              </button>
            </div>
          </div>

          {/* Right Column: Insights */}
          <div className="lg:col-span-4 space-y-8">
            <section className="bg-surface-container-lowest p-8 rounded-[2rem] border border-outline-variant/10 shadow-sm sticky top-28">
              <div className="flex items-center gap-3 mb-8">
                <span className="material-symbols-outlined text-primary text-3xl">lightbulb</span>
                <h3 className="text-xl font-black">錄入須知</h3>
              </div>
              <ul className="space-y-8">
                <InfoItem icon="verified" title="編號規範" desc="請輸入正確的 10 碼資產編號，系統將自動檢測是否已有重複資產。" />
                <InfoItem icon="shield_with_heart" title="保固追蹤" desc="啟用日期通常為到貨日，保固到期日則依合約或原廠規定填寫。" />
                <InfoItem icon="qr_code_2" title="標籤生成" desc="新增成功後將自動生成專屬 QR Code 資產標籤。" />
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

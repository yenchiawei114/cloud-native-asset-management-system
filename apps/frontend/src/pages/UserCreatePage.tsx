import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useUsers } from '../modules/users/hooks/useUsers';
import { UserCreatePayload, Department, OfficeLocation, api } from '../lib/api';
import { FeedbackDialog } from '../modules/core/components/FeedbackDialog';
import { useFeedback } from '../modules/core/hooks/useFeedback';

export const UserCreatePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { createUser } = useUsers();
  const { feedbackState, showFeedback, closeFeedback } = useFeedback();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [officeLocations, setOfficeLocations] = useState<OfficeLocation[]>([]);
  const [formData, setFormData] = useState<UserCreatePayload>({
    employee_id: '',
    password: '',
    name: '',
    sex: 'MALE',
    department_id: 0,
    location: '',
    email: '',
    role: 'EMPLOYEE',
    hire_date: '',
  });

  useEffect(() => {
    api.getDepartments().then(setDepartments).catch(() => {});
    api.getOfficeLocations().then(setOfficeLocations).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createUser(formData);
      showFeedback({ 
        title: t('profile.create.success'), 
        message: '新使用者帳號已成功建立。', 
        type: 'success', 
        onConfirm: () => navigate('/users') 
      });
    } catch (err: any) {
      showFeedback({ 
        title: t('profile.create.failed'), 
        message: err.message || t('profile.create.checkInputs'), 
        type: 'error', 
        onConfirm: closeFeedback 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout activeTab="users">
      <main className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <nav className="flex items-center gap-2 text-xs font-medium text-outline mb-2">
            <span className="hover:text-primary transition-colors cursor-pointer" onClick={() => navigate('/users')}>{t('auth.nav.userManagement')}</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary font-bold">{t('profile.addUser')}</span>
          </nav>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-2">{t('profile.create.title')}</h1>
          <p className="text-on-surface-variant">{t('profile.create.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-8 space-y-6">
            {/* Section 1: 基本資料 */}
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-8">
                <span className="w-1.5 h-6 bg-primary rounded-full"></span>
                <h2 className="text-lg font-bold text-on-surface">{t('profile.basicInfo')}</h2>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div className="col-span-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">{t('profile.employeeId')} (9碼) <span className="text-error">*</span></label>
                  <input 
                    required
                    className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant px-4 py-3 text-on-surface rounded-t-lg transition-all focus:ring-0 focus:border-primary outline-none" 
                    placeholder="例如：E00000001" 
                    type="text"
                    value={formData.employee_id}
                    onChange={e => setFormData({...formData, employee_id: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">{t('profile.name')} <span className="text-error">*</span></label>
                  <input 
                    required
                    className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant px-4 py-3 text-on-surface rounded-t-lg transition-all focus:ring-0 focus:border-primary outline-none" 
                    placeholder="輸入全名" 
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">{t('profile.email')} <span className="text-error">*</span></label>
                  <input 
                    required
                    className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant px-4 py-3 text-on-surface rounded-t-lg transition-all focus:ring-0 focus:border-primary outline-none" 
                    placeholder="example@atlas.com" 
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">{t('profile.sex')} <span className="text-error">*</span></label>
                  <select
                    className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant px-4 py-3 text-on-surface rounded-t-lg transition-all focus:ring-0 focus:border-primary outline-none appearance-none"
                    value={formData.sex}
                    onChange={e => setFormData({...formData, sex: e.target.value as any})}
                  >
                    <option value="MALE">{t('profile.male')} (Male)</option>
                    <option value="FEMALE">{t('profile.female')} (Female)</option>
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">入職日期 <span className="text-error">*</span></label>
                  <input
                    required
                    className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant px-4 py-3 text-on-surface rounded-t-lg transition-all focus:ring-0 focus:border-primary outline-none"
                    type="date"
                    value={formData.hire_date ?? ''}
                    onChange={e => setFormData({...formData, hire_date: e.target.value || null})}
                  />
                </div>
              </div>
            </section>

            {/* Section 2: 帳號安全 */}
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-8">
                <span className="w-1.5 h-6 bg-primary rounded-full"></span>
                <h2 className="text-lg font-bold text-on-surface">{t('profile.create.accountSecurity')}</h2>
              </div>
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">{t('profile.create.defaultPassword')} <span className="text-error">*</span></label>
                  <input 
                    required
                    className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant px-4 py-3 text-on-surface rounded-t-lg transition-all focus:ring-0 focus:border-primary outline-none" 
                    placeholder="••••••••" 
                    type="password"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                  />
                  <p className="mt-2 text-[10px] text-outline italic">{t('profile.create.passwordTip')}</p>
                </div>
              </div>
            </section>

            {/* Section 3: 權限設定 */}
            <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-8">
                <span className="w-1.5 h-6 bg-primary rounded-full"></span>
                <h2 className="text-lg font-bold text-on-surface">{t('profile.create.roleAndDept')}</h2>
              </div>
              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-4 px-1">{t('profile.create.roleSelection')} <span className="text-error">*</span></label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <RoleOption
                      active={formData.role === 'EMPLOYEE'}
                      onClick={() => setFormData({...formData, role: 'EMPLOYEE'})}
                      icon="badge"
                      label={`${t('profile.employee')} (Employee)`}
                      desc={t('profile.employeeDesc')}
                    />
                    <RoleOption
                      active={formData.role === 'ADMIN'}
                      onClick={() => setFormData({...formData, role: 'ADMIN'})}
                      icon="admin_panel_settings"
                      label={`${t('profile.admin')} (Admin)`}
                      desc={t('profile.adminDesc')}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">部門 <span className="text-error">*</span></label>
                  <select
                    required
                    className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant px-4 py-3 text-on-surface rounded-t-lg transition-all focus:ring-0 focus:border-primary outline-none appearance-none"
                    value={formData.department_id || ''}
                    onChange={e => setFormData({...formData, department_id: parseInt(e.target.value) || 0})}
                  >
                    <option value="">請選擇部門</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2 px-1">辦公地點 <span className="text-error">*</span></label>
                  <select
                    required
                    className="w-full bg-surface-container-low border-0 border-b-2 border-outline-variant px-4 py-3 text-on-surface rounded-t-lg transition-all focus:ring-0 focus:border-primary outline-none appearance-none"
                    value={formData.location || ''}
                    onChange={e => setFormData({...formData, location: e.target.value})}
                  >
                    <option value="">請選擇辦公地點</option>
                    {officeLocations.map(loc => (
                      <option key={loc.id} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          </div>

          {/* Right Panel: Actions & Info */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <section className="bg-primary/5 rounded-xl p-8 border border-primary/10 sticky top-24">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-primary">info</span>
                <h2 className="text-lg font-bold text-on-surface">{t('profile.create.notice')}</h2>
              </div>
              <ul className="space-y-6 text-sm">
                <li className="flex gap-3">
                  <span className="material-symbols-outlined text-outline text-lg">mail</span>
                  <div className="space-y-1">
                    <p className="font-bold text-on-surface">{t('profile.create.autoNotify')}</p>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{t('profile.create.autoNotifyDesc')}</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="material-symbols-outlined text-outline text-lg">history</span>
                  <div className="space-y-1">
                    <p className="font-bold text-on-surface">{t('profile.create.auditNotice')}</p>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{t('profile.create.auditNoticeDesc')}</p>
                  </div>
                </li>
              </ul>
              <div className="mt-8 pt-8 border-t border-primary/10 flex flex-col gap-3">
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? t('profile.create.creating') : t('profile.create.createBtn')}
                </button>
                <button 
                  type="button"
                  onClick={() => navigate('/users')}
                  className="w-full py-3 text-on-surface-variant font-bold hover:bg-surface-container rounded-lg transition-all"
                >
                  {t('assets.detail.cancel')}
                </button>
              </div>
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

const RoleOption: React.FC<{ active: boolean, onClick: () => void, icon: string, label: string, desc: string }> = ({ active, onClick, icon, label, desc }) => (
  <div 
    onClick={onClick}
    className={`relative flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all group ${active ? 'border-primary bg-primary/5' : 'border-outline-variant hover:bg-surface-container-low'}`}
  >
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${active ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-outline'}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div>
        <p className={`font-bold text-sm ${active ? 'text-on-surface' : 'text-outline'}`}>{label}</p>
        <p className="text-[10px] text-on-surface-variant mt-0.5">{desc}</p>
      </div>
    </div>
    {active && (
      <div className="absolute top-4 right-4 text-primary">
        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
      </div>
    )}
  </div>
);

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { api, User } from '../lib/api';
import { FeedbackDialog } from '../modules/core/components/FeedbackDialog';
import { useFeedback } from '../modules/core/hooks/useFeedback';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { fmtDate, fmtDateTime } from '../lib/locale';

export const UserDetailPage: React.FC = () => {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { feedbackState, showFeedback, closeFeedback } = useFeedback();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<User>>({});
  const [, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (employeeId) {
      loadUser(employeeId);
    }
  }, [employeeId]);

  const loadUser = async (id: string) => {
    setLoading(true);
    try {
      const data = await api.getUser(id);
      setUser(data);
      setEditData(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load user');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !employeeId) return;
    setIsSubmitting(true);
    try {
      // 僅發送 UserCreatePayload 允許的欄位
      const payload = {
        name: editData.name,
        sex: editData.sex,
        department_id: editData.department_id,
        email: editData.email,
        role: editData.role
      };
      const updated = await api.updateUser(employeeId, payload as any);
      setUser(updated);
      setIsEditing(false);
      showFeedback({ title: t('users.detail.updateSuccess'), message: t('users.detail.updateSuccessMsg'), type: 'success', onConfirm: closeFeedback });
    } catch (err: any) {
      showFeedback({ title: t('users.detail.updateFailed'), message: err.message || t('users.detail.updateFailed'), type: 'error', onConfirm: closeFeedback });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmSave = () => {
    showFeedback({
      title: t('common.confirmSaveTitle') || '確認儲存變更？',
      message: t('common.confirmSaveMsg') || '您即將更新此使用者的個人資料。此動作將會被記錄在系統稽核日誌中。',
      type: 'confirm',
      onConfirm: async () => {
        await handleSave();
      },
      onCancel: closeFeedback
    });
  };

  const handleDelete = async () => {
    if (!employeeId) return;
    setIsSubmitting(true);
    try {
      await api.deleteUser(employeeId);
      showFeedback({
        title: t('users.detail.deleteSuccess'),
        message: t('users.detail.deleteSuccessMsg'),
        type: 'success',
        onConfirm: () => navigate('/users')
      });
    } catch (err: any) {
      showFeedback({ title: t('users.detail.deleteFailed'), message: err.message || t('users.detail.deleteFailed'), type: 'error', onConfirm: closeFeedback });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = () => {
    showFeedback({
      title: t('common.confirmDeleteTitle') || '確定要刪除使用者？',
      message: (t('common.confirmDeleteMsg') || '您即將刪除使用者「{name}」。此動作無法撤銷。').replace('{name}', user?.name || ''),
      type: 'confirm',
      onConfirm: async () => {
        await handleDelete();
      },
      onCancel: closeFeedback
    });
  };

  if (loading) {
    return (
      <DashboardLayout activeTab="users">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !user) {
    return (
      <DashboardLayout activeTab="users">
        <div className="p-8 text-center text-error">
          <p className="text-lg font-bold mb-4">{error || 'User not found'}</p>
          <button onClick={() => navigate('/users')} className="text-primary font-bold hover:underline">
            {t('common.back')}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="users">
      <main className="max-w-6xl mx-auto px-8 py-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => navigate('/users')}
              className="w-10 h-10 flex items-center justify-center hover:bg-surface-container-high rounded-full transition-all text-on-surface bg-surface-container-low"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <div>
              <nav className="flex text-[10px] font-bold text-outline uppercase tracking-widest mb-1 gap-2">
                <span>{t('auth.nav.userManagement')}</span>
                <span className="opacity-30">/</span>
                <span className="text-primary">{user.name}</span>
              </nav>
              <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">{user.name}</h1>
            </div>
          </div>
          
          <div className="flex gap-3 items-center">
            {/* 已離職 badge */}
            {!user.is_active && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-error/10 text-error text-xs font-black rounded-full border border-error/20">
                <span className="material-symbols-outlined text-xs">person_off</span>
                {t('users.detail.offboarded')}
              </span>
            )}

            {/* 停用帳號不顯示任何操作按鈕 */}
            {user.is_active && !isEditing && !(user.role === 'ADMIN' && user.employee_id !== currentUser?.employee_id) ? (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  {t('common.edit')}
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex items-center gap-2 px-5 py-2.5 bg-surface-container-high text-on-surface-variant text-sm font-bold rounded-xl hover:bg-surface-container-highest transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                  {t('common.delete')}
                </button>
              </>
            ) : user.is_active && isEditing ? (
              <>
                <button
                  onClick={confirmSave}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  {t('common.save')}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditData(user);
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-surface-container-high text-on-surface text-sm font-bold rounded-xl hover:bg-surface-container-highest transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                  {t('common.cancel')}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* User Profile Card */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-surface-container-lowest p-8 rounded-3xl shadow-sm border border-outline-variant/10 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-3xl font-black text-primary mb-6 ring-8 ring-primary/5">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-xl font-black text-on-surface mb-1">{user.name}</h2>
              <p className="text-xs font-bold text-outline uppercase tracking-widest mb-6">{user.role}</p>
              
              <div className="w-full space-y-4 pt-6 border-t border-outline-variant/10">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-outline font-medium">{t('profile.employeeId')}</span>
                  <span className="font-mono font-bold text-on-surface">{user.employee_id}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-outline font-medium">{t('profile.department')}</span>
                  <span className="font-bold text-on-surface">{user.department_id}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-outline font-medium">{t('users.detail.hireDateLabel')}</span>
                  <span className="font-bold text-on-surface">{user.hire_date ?? '—'}</span>
                </div>
                {user.termination_date && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-outline font-medium">{t('users.detail.terminationDateLabel')}</span>
                    <span className="font-bold text-error">{user.termination_date}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-outline font-medium">{t('users.detail.createdAtLabel')}</span>
                  <span className="font-bold text-on-surface">{fmtDate(user.created_at)}</span>
                </div>
              </div>
            </section>

            <section className="bg-surface-container-low/40 p-8 rounded-3xl border border-outline-variant/10">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-outline mb-6">{t('profile.accountSecurity')}</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${user.must_change_password ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div>
                  <span className="text-sm font-bold text-on-surface">
                    {user.must_change_password ? t('users.detail.passwordNeedsChange') : t('users.detail.passwordOk')}
                  </span>
                </div>
                {user.last_password_changed_at && (
                  <div className="text-[11px] text-outline">
                    {t('users.detail.lastPasswordChanged', { date: fmtDateTime(user.last_password_changed_at) })}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Edit Form / Details */}
          <div className="lg:col-span-8">
            <section className="bg-surface-container-lowest p-10 rounded-3xl shadow-sm border border-outline-variant/10 min-h-[500px]">
              <h2 className="text-2xl font-black tracking-tighter flex items-center gap-3 text-on-surface font-headline mb-10">
                <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>person_check</span>
                {t('users.detail.basicSettings')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                <FormField 
                  label={t('profile.name')} 
                  value={isEditing ? editData.name || '' : user.name}
                  isEditing={isEditing}
                  onChange={(val) => setEditData({ ...editData, name: val })}
                  icon="badge"
                />
                <FormField
                  label={t('profile.email')}
                  value={isEditing ? editData.email || '' : user.email}
                  isEditing={isEditing}
                  onChange={(val) => setEditData({ ...editData, email: val })}
                  icon="mail"
                />
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-outline flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">settings_accessibility</span>
                    {t('profile.gender')}
                  </label>
                  {isEditing ? (
                    <select
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={editData.sex}
                      onChange={(e) => setEditData({ ...editData, sex: e.target.value as any })}
                    >
                      <option value="MALE">{t('users.detail.sexMale')}</option>
                      <option value="FEMALE">{t('users.detail.sexFemale')}</option>
                    </select>
                  ) : (
                    <div className="p-4 bg-surface-container-low/30 rounded-xl text-sm font-bold text-on-surface">
                      {user.sex === 'MALE' ? t('users.detail.sexMale') : t('users.detail.sexFemale')}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-outline flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">manage_accounts</span>
                    {t('users.detail.roleLabel')}
                  </label>
                  {isEditing ? (
                    <select
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={editData.role}
                      onChange={(e) => setEditData({ ...editData, role: e.target.value as any })}
                    >
                      <option value="EMPLOYEE">{t('users.detail.roleEmployee')}</option>
                      <option value="ADMIN">{t('users.detail.roleAdmin')}</option>
                    </select>
                  ) : (
                    <div className="p-4 bg-surface-container-low/30 rounded-xl text-sm font-bold text-on-surface text-capitalize">
                      {user.role}
                    </div>
                  )}
                </div>

                <FormField 
                  label={t('profile.department')} 
                  value={isEditing ? editData.department_id?.toString() || '' : user.department_id.toString()}
                  isEditing={isEditing}
                  onChange={(val) => setEditData({ ...editData, department_id: parseInt(val) || 0 })}
                  icon="corporate_fare"
                  type="number"
                />
              </div>

              {isEditing && (
                <div className="mt-12 p-6 bg-primary/5 rounded-2xl border border-primary/10">
                  <div className="flex gap-4">
                    <span className="material-symbols-outlined text-primary">info</span>
                    <p className="text-xs text-primary font-medium leading-relaxed italic">
                      {t('users.detail.editingNote')}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Modals handled by FeedbackDialog */}
      </main>
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

const FormField: React.FC<{ 
  label: string, 
  value: string, 
  isEditing: boolean, 
  onChange: (val: string) => void,
  icon: string,
  type?: string
}> = ({ label, value, isEditing, onChange, icon, type = 'text' }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black uppercase tracking-widest text-outline flex items-center gap-2">
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </label>
    {isEditing ? (
      <input 
        type={type}
        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    ) : (
      <div className="p-4 bg-surface-container-low/30 rounded-xl text-sm font-bold text-on-surface">
        {value}
      </div>
    )}
  </div>
);


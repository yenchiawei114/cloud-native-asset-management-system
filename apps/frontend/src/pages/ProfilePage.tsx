import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { useProfile } from '../modules/users/hooks/useProfile';
import { api } from '../lib/api';

type StatusMsg = { type: 'success' | 'error'; text: string };

export const ProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { changePassword } = useProfile();

  // Email change
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<StatusMsg | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  // Password change (two-step)
  const [pwStep, setPwStep] = useState<1 | 2>(1);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwStatus, setPwStatus] = useState<StatusMsg | null>(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const handleVerifyOldPw = () => {
    if (!oldPw.trim()) {
      setPwStatus({ type: 'error', text: '請輸入舊密碼' });
      return;
    }
    setPwStatus(null);
    setPwStep(2);
  };

  const handleChangePassword = async () => {
    if (!newPw || !confirmPw) {
      setPwStatus({ type: 'error', text: '請輸入新密碼' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwStatus({ type: 'error', text: t('profile.passwordMatchError') });
      return;
    }
    setPwSubmitting(true);
    setPwStatus(null);
    const result = await changePassword(oldPw, newPw);
    setPwSubmitting(false);
    if (result.success) {
      setPwStatus({ type: 'success', text: '密碼已成功修改' });
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      setPwStep(1);
    } else {
      setPwStatus({ type: 'error', text: result.message || t('profile.passwordError') });
      setPwStep(1);
      setOldPw('');
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      setEmailStatus({ type: 'error', text: '請輸入有效的電子郵件' });
      return;
    }
    if (!user) return;
    setEmailSubmitting(true);
    setEmailStatus(null);
    try {
      await api.updateMyEmail(newEmail);
      setEmailStatus({ type: 'success', text: '電子郵件已更新' });
      setEditingEmail(false);
    } catch (err: any) {
      setEmailStatus({ type: 'error', text: err.message || '更新失敗' });
    } finally {
      setEmailSubmitting(false);
    }
  };

  return (
    <DashboardLayout activeTab="profile">
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface font-headline">
          {t('profile.title')}
        </h1>

        {/* Personal Info */}
        <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-primary text-lg">badge</span>
            {t('profile.basicInfo')}
          </h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <Field label={t('profile.name')} value={user?.name} />
            <Field label={t('profile.employeeId')} value={user?.employee_id} />
            <Field
              label={t('profile.role')}
              value={user?.role === 'ADMIN' ? t('profile.admin') : t('profile.employee')}
            />
            {/* Email field with inline edit */}
            <div className="space-y-1">
              <span className="text-[0.65rem] uppercase tracking-wider font-bold text-outline block">
                {t('profile.email')}
              </span>
              {editingEmail ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      className="flex-1 bg-surface-container-low border-none rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      autoFocus
                    />
                    <button
                      onClick={handleUpdateEmail}
                      disabled={emailSubmitting}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-primary rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
                    >
                      {emailSubmitting ? '儲存...' : '儲存'}
                    </button>
                    <button
                      onClick={() => { setEditingEmail(false); setEmailStatus(null); }}
                      className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                  </div>
                  {emailStatus && (
                    <p className={`text-xs ${emailStatus.type === 'success' ? 'text-green-600' : 'text-error'}`}>
                      {emailStatus.text}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-medium text-on-surface">{user?.email ?? '---'}</p>
                  <button
                    onClick={() => { setNewEmail(user?.email ?? ''); setEditingEmail(true); setEmailStatus(null); }}
                    className="text-xs font-bold text-primary hover:underline shrink-0"
                  >
                    修改
                  </button>
                </div>
              )}
              {!editingEmail && emailStatus && (
                <p className={`text-xs mt-1 ${emailStatus.type === 'success' ? 'text-green-600' : 'text-error'}`}>
                  {emailStatus.text}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Change Password */}
        <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-primary text-lg">lock_reset</span>
            {t('profile.changePassword')}
          </h2>

          {pwStatus && (
            <div
              className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
                pwStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {pwStatus.text}
            </div>
          )}

          {pwStep === 1 ? (
            <div className="space-y-4 max-w-sm">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-on-surface-variant">
                  {t('profile.currentPassword')}
                </label>
                <input
                  type="password"
                  className="w-full bg-surface-container-low border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="••••••••"
                  value={oldPw}
                  onChange={e => setOldPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOldPw()}
                />
              </div>
              <button
                onClick={handleVerifyOldPw}
                className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl shadow-sm shadow-primary/20 hover:opacity-90 transition-opacity"
              >
                驗證
              </button>
            </div>
          ) : (
            <div className="space-y-4 max-w-sm">
              <p className="text-xs text-green-600 font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                驗證通過，請設定新密碼
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-on-surface-variant">
                  {t('profile.newPassword')}
                </label>
                <input
                  type="password"
                  className="w-full bg-surface-container-low border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="••••••••"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-on-surface-variant">
                  {t('profile.confirmPassword')}
                </label>
                <input
                  type="password"
                  className="w-full bg-surface-container-low border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                  placeholder="••••••••"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleChangePassword}
                  disabled={pwSubmitting}
                  className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl shadow-sm shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {pwSubmitting ? '修改中...' : '確認修改'}
                </button>
                <button
                  onClick={() => {
                    setPwStep(1);
                    setOldPw('');
                    setNewPw('');
                    setConfirmPw('');
                    setPwStatus(null);
                  }}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <span className="text-[0.65rem] uppercase tracking-wider font-bold text-outline block">{label}</span>
      <p className="text-base font-medium text-on-surface">{value ?? '---'}</p>
    </div>
  );
}

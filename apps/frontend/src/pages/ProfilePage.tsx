import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { useProfile } from '../modules/users/hooks/useProfile';
import { api, Department, OfficeLocation } from '../lib/api';

type StatusMsg = { type: 'success' | 'error'; text: string };


export const ProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const { changePassword } = useProfile();

  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  const [departments, setDepartments] = useState<Department[]>([]);
  const [officeLocations, setOfficeLocations] = useState<OfficeLocation[]>([]);

  useEffect(() => {
    api.getDepartments().then(setDepartments).catch(() => {});
    api.getOfficeLocations().then(setOfficeLocations).catch(() => {});
  }, []);

  const deptName = departments.find(d => d.id === user?.department_id)?.name ?? '—';

  // 基本資料編輯（管理員限定）
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editData, setEditData] = useState({ name: '', email: '', sex: '', department_id: 0, location: '' });
  const [infoStatus, setInfoStatus] = useState<StatusMsg | null>(null);
  const [infoSubmitting, setInfoSubmitting] = useState(false);

  const startEditInfo = () => {
    setEditData({
      name: user?.name ?? '',
      email: user?.email ?? '',
      sex: user?.sex ?? 'MALE',
      department_id: user?.department_id ?? 0,
      location: user?.location ?? '',
    });
    setInfoStatus(null);
    setIsEditingInfo(true);
  };

  const cancelEditInfo = () => {
    setIsEditingInfo(false);
    setInfoStatus(null);
  };

  const handleSaveInfo = async () => {
    if (!user) return;
    if (!editData.name.trim()) {
      setInfoStatus({ type: 'error', text: t('profile.nameRequired') });
      return;
    }
    if (!editData.email || !editData.email.includes('@')) {
      setInfoStatus({ type: 'error', text: t('profile.emailInvalid') });
      return;
    }
    setInfoSubmitting(true);
    setInfoStatus(null);
    try {
      await api.updateUser(user.employee_id, {
        name: editData.name,
        email: editData.email,
        sex: editData.sex as 'MALE' | 'FEMALE',
        department_id: editData.department_id,
        location: editData.location || null,
      });
      await refreshUser();
      setInfoStatus({ type: 'success', text: t('profile.infoUpdated') });
      setIsEditingInfo(false);
    } catch (err: any) {
      setInfoStatus({ type: 'error', text: err.message || t('profile.updateFailed') });
    } finally {
      setInfoSubmitting(false);
    }
  };

  // 密碼修改（兩步驟）
  const [pwStep, setPwStep] = useState<1 | 2>(1);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwStatus, setPwStatus] = useState<StatusMsg | null>(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const handleVerifyOldPw = async () => {
    if (!oldPw.trim()) {
      setPwStatus({ type: 'error', text: t('profile.currentPassword') });
      return;
    }
    setPwSubmitting(true);
    setPwStatus(null);
    try {
      await api.verifyPassword(oldPw);
      setPwStep(2);
    } catch {
      setPwStatus({ type: 'error', text: t('profile.passwordWrong') });
      setOldPw('');
    } finally {
      setPwSubmitting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPw || !confirmPw) {
      setPwStatus({ type: 'error', text: t('profile.newPassword') });
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
      await refreshUser();
      setPwStatus({ type: 'success', text: t('profile.passwordUpdated') });
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

  return (
    <DashboardLayout activeTab="profile">
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface font-headline">
          {t('profile.title')}
        </h1>

        {/* 未更新密碼提醒 */}
        {user?.must_change_password && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <span className="material-symbols-outlined text-amber-500 mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            <div>
              <p className="text-sm font-bold text-amber-800">{t('profile.changePasswordWarningTitle')}</p>
              <p className="text-xs text-amber-700 mt-0.5">{t('profile.changePasswordWarningMsg')}</p>
            </div>
          </div>
        )}

        {/* 基本資料 */}
        <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">badge</span>
              {t('profile.basicInfo')}
            </h2>
            {isAdmin && !isEditingInfo && (
              <button
                onClick={startEditInfo}
                className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                {t('profile.editInfo')}
              </button>
            )}
          </div>

          {infoStatus && !isEditingInfo && (
            <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${infoStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {infoStatus.text}
            </div>
          )}

          {isEditingInfo ? (
            <div className="space-y-4">
              {infoStatus && (
                <div className={`px-4 py-3 rounded-xl text-sm font-medium ${infoStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {infoStatus.text}
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {/* 姓名 */}
                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider font-bold text-outline block">{t('profile.name')}</label>
                  <input
                    type="text"
                    className="w-full bg-surface-container-low border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    value={editData.name}
                    onChange={e => setEditData({ ...editData, name: e.target.value })}
                    autoFocus
                  />
                </div>
                {/* 員工編號（唯讀） */}
                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider font-bold text-slate-300 block">{t('profile.employeeId')}</label>
                  <p className="text-sm font-medium text-slate-400 px-3 py-2 bg-slate-50 rounded-lg cursor-not-allowed">{user?.employee_id}</p>
                </div>
                {/* 角色（唯讀） */}
                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider font-bold text-slate-300 block">{t('profile.role')}</label>
                  <p className="text-sm font-medium text-slate-400 px-3 py-2 bg-slate-50 rounded-lg cursor-not-allowed">
                    {user?.role === 'ADMIN' ? t('profile.admin') : t('profile.employee')}
                  </p>
                </div>
                {/* 性別 */}
                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider font-bold text-outline block">{t('profile.sex')}</label>
                  <select
                    className="w-full bg-surface-container-low border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    value={editData.sex}
                    onChange={e => setEditData({ ...editData, sex: e.target.value })}
                  >
                    <option value="MALE">{t('profile.sexMale')}</option>
                    <option value="FEMALE">{t('profile.sexFemale')}</option>
                  </select>
                </div>
                {/* 部門 */}
                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider font-bold text-outline block">{t('profile.department')}</label>
                  <select
                    className="w-full bg-surface-container-low border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    value={editData.department_id}
                    onChange={e => setEditData({ ...editData, department_id: Number(e.target.value) })}
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                {/* 辦公地點 */}
                <div className="space-y-1.5">
                  <label className="text-[0.65rem] uppercase tracking-wider font-bold text-outline block">{t('profile.officeLocation')}</label>
                  <select
                    className="w-full bg-surface-container-low border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    value={editData.location}
                    onChange={e => setEditData({ ...editData, location: e.target.value })}
                  >
                    <option value="">—</option>
                    {officeLocations.map(loc => (
                      <option key={loc.id} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
                </div>
                {/* 電子郵件 */}
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[0.65rem] uppercase tracking-wider font-bold text-outline block">{t('profile.email')}</label>
                  <input
                    type="email"
                    className="w-full bg-surface-container-low border-none rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    value={editData.email}
                    onChange={e => setEditData({ ...editData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveInfo}
                  disabled={infoSubmitting}
                  className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl shadow-sm shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {infoSubmitting ? t('common.saving') : t('common.save')}
                </button>
                <button
                  onClick={cancelEditInfo}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              <Field label={t('profile.name')} value={user?.name} />
              <Field label={t('profile.employeeId')} value={user?.employee_id} />
              <Field label={t('profile.role')} value={user?.role === 'ADMIN' ? t('profile.admin') : t('profile.employee')} />
              <Field label={t('profile.sex')} value={user?.sex === 'MALE' ? t('profile.sexMale') : user?.sex === 'FEMALE' ? t('profile.sexFemale') : user?.sex} />
              <Field label={t('profile.department')} value={deptName} />
              <Field label={t('profile.officeLocation')} value={user?.location ?? '—'} />
              <div className="space-y-1 col-span-2">
                <span className="text-[0.65rem] uppercase tracking-wider font-bold text-outline block">{t('profile.email')}</span>
                <p className="text-base font-medium text-on-surface">{user?.email ?? '---'}</p>
              </div>
            </div>
          )}
        </section>

        {/* 修改密碼 */}
        <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-primary text-lg">lock_reset</span>
            {t('profile.changePassword')}
          </h2>

          {pwStatus && (
            <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${pwStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
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
                disabled={pwSubmitting}
                className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl shadow-sm shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {pwSubmitting ? t('profile.verifying') : t('profile.verify')}
              </button>
            </div>
          ) : (
            <div className="space-y-4 max-w-sm">
              <p className="text-xs text-green-600 font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                {t('profile.verifySuccess')}
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
                  {pwSubmitting ? t('profile.updatingPassword') : t('profile.confirmChange')}
                </button>
                <button
                  onClick={() => { setPwStep(1); setOldPw(''); setNewPw(''); setConfirmPw(''); setPwStatus(null); }}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  {t('common.cancel')}
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

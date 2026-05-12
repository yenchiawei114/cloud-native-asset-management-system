import React from 'react';
import { useTranslation } from 'react-i18next';

interface ProfileInfoProps {
  user: any;
}

export const ProfileInfo: React.FC<ProfileInfoProps> = ({ user }) => {
  const { t } = useTranslation();
  
  return (
    <section className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-bold flex items-center gap-2 text-on-surface">
          <span className="material-symbols-outlined text-primary">badge</span>
          {t('profile.basicInfo')}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
        <div className="space-y-1">
          <label className="text-[0.65rem] uppercase tracking-wider font-bold text-outline font-label">{t('profile.name')}</label>
          <p className="text-lg font-medium text-on-surface">{user?.name || '---'}</p>
        </div>
        <div className="space-y-1">
          <label className="text-[0.65rem] uppercase tracking-wider font-bold text-outline font-label">{t('profile.employeeId')}</label>
          <p className="text-lg font-medium text-on-surface">{user?.employee_id || '---'}</p>
        </div>
        <div className="space-y-1">
          <label className="text-[0.65rem] uppercase tracking-wider font-bold text-outline font-label">{t('profile.email')}</label>
          <p className="text-lg font-medium text-on-surface">{user?.email || '---'}</p>
        </div>
        <div className="space-y-1">
          <label className="text-[0.65rem] uppercase tracking-wider font-bold text-outline font-label">{t('profile.role')}</label>
          <p className="text-lg font-medium text-on-surface uppercase">
            {user?.role === 'admin' ? t('profile.admin') : t('profile.employee')}
          </p>
        </div>
      </div>
    </section>
  );
};

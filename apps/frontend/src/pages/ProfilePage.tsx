import React from 'react';
import { DashboardLayout } from '../modules/dashboard/components/DashboardLayout';
import { useAuth } from '../modules/auth/hooks/useAuth';
import { useProfile } from '../modules/users/hooks/useProfile';
import { ProfileInfo } from '../modules/users/components/ProfileInfo';
import { PasswordForm } from '../modules/users/components/PasswordForm';
import { NotificationSettings } from '../modules/users/components/NotificationSettings';
import { useTranslation } from 'react-i18next';

export const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const { loading, changePassword } = useProfile();
  const { t } = useTranslation();
  
  const handlePasswordSubmit = async (oldPw: string, newPw: string) => {
    return await changePassword(oldPw, newPw);
  };

  return (
    <DashboardLayout activeTab="profile">
      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Page Header */}
        <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2 font-display">
            {t('profile.title')}
          </h1>
          <p className="text-on-surface-variant font-body">
            {t('profile.subtitle')}
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-8">
            <ProfileInfo user={user} />
            <PasswordForm onSubmit={handlePasswordSubmit} loading={loading} />
          </div>

          <div className="lg:col-span-5">
            <NotificationSettings onLogout={logout} />
          </div>
        </div>

        {/* Branding & Support */}
        <div className="mt-16 text-center opacity-40">
          <p className="text-xs font-label text-outline uppercase tracking-widest mb-4">Powered by Executive Architect v2.5.0</p>
        </div>
      </div>
    </DashboardLayout>
  );
};

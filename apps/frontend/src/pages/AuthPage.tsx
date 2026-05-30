import React from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '../modules/auth/components/AuthLayout';
import { LoginForm } from '../modules/auth/components/LoginForm';

export const AuthPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        <div className="flex border-b border-outline-variant/30 mb-8">
          <div className="pb-4 px-6 border-b-2 border-primary text-primary font-bold">
            {t('auth.loginTab')}
          </div>
        </div>

        <LoginForm />
      </div>
    </AuthLayout>
  );
};

import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
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
          <div className="flex-1 border-b border-outline-variant/30"></div>
          <button 
            onClick={() => {
              const newLng = i18n.language === 'zh-Hant' ? 'en' : 'zh-Hant';
              i18n.changeLanguage(newLng);
              localStorage.setItem('lng', newLng);
            }}
            className="pb-4 px-4 border-b border-outline-variant/30 text-xs font-bold text-slate-500 hover:text-primary transition-colors"
          >
            {i18n.language === 'zh-Hant' ? 'English' : '繁體中文'}
          </button>
        </div>

        <LoginForm />
      </div>
    </AuthLayout>
  );
};

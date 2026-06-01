import React from 'react';
import { useTranslation } from 'react-i18next';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('lng', lng);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface font-body text-on-surface">
      {/* Decorative Canvas (Left) */}
      <section className="hidden md:flex md:w-1/2 lg:w-3/5 bg-primary overflow-hidden relative items-center justify-center p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-container opacity-90 z-10"></div>
        <div className="relative z-20 max-w-lg">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <span className="text-on-primary-container font-headline font-black text-4xl tracking-tighter">
                {t('auth.layout.brand')}
              </span>
              <div className="h-1 w-24 bg-tertiary-fixed mt-4"></div>
            </div>
            {/* Language Switcher Overlay */}
          </div>
          <h1 className="font-headline text-5xl font-extrabold text-on-primary leading-tight mb-6">
            {t('auth.layout.headline')}
          </h1>
        </div>
      </section>

      {/* Interactive Canvas (Right) */}
      <section className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 lg:p-24 relative bg-surface-container-lowest">
        {/* Top Right Controls */}
        <div className="absolute top-8 right-8 flex items-center gap-4 z-40">
          <div className="flex bg-surface-container rounded-full p-1 border border-outline-variant/30">
            <button 
              onClick={() => handleLanguageChange('en-US')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                i18n.language === 'en-US' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              EN
            </button>
            <button 
              onClick={() => handleLanguageChange('zh-TW')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                i18n.language === 'zh-TW' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              繁中
            </button>
          </div>
        </div>
        
        {children}
      </section>
    </div>
  );
};

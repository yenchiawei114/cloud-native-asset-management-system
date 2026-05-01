import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PasswordFormProps {
  onSubmit: (oldPw: string, newPw: string) => Promise<{ success: boolean; message?: string }>;
  loading: boolean;
}

export const PasswordForm: React.FC<PasswordFormProps> = ({ onSubmit, loading }) => {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('profile.passwordMatchError') });
      return;
    }

    const result = await onSubmit(currentPassword, newPassword);
    if (result.success) {
      setMessage({ type: 'success', text: t('profile.passwordSuccess') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      const translatedMsg = t(`apiErrors.${result.message}`);
      setMessage({ 
        type: 'error', 
        text: translatedMsg !== `apiErrors.${result.message}` ? translatedMsg : (result.message || t('profile.passwordError'))
      });
    }
  };

  return (
    <section className="bg-surface-container-low rounded-xl p-8 border border-slate-100">
      <h2 className="text-xl font-bold flex items-center gap-2 mb-8 text-on-surface">
        <span className="material-symbols-outlined text-primary">lock_reset</span>
        {t('profile.changePassword')}
      </h2>
      {message && (
        <div className={`mb-6 p-4 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-top-1 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}
      <form className="space-y-6 max-w-md" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-sm font-medium text-on-surface-variant">{t('profile.currentPassword')}</label>
          <input 
            className="w-full bg-surface-container-highest border-none rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary transition-all outline-none" 
            placeholder="••••••••" 
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-on-surface-variant">{t('profile.newPassword')}</label>
          <input 
            className="w-full bg-surface-container-highest border-none rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary transition-all outline-none" 
            placeholder={t('profile.newPassword')} 
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-on-surface-variant">{t('profile.confirmPassword')}</label>
          <input 
            className="w-full bg-surface-container-highest border-none rounded-lg p-3 text-on-surface focus:ring-2 focus:ring-primary transition-all outline-none" 
            placeholder={t('profile.confirmPassword')} 
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button 
          disabled={loading}
          className="bg-gradient-to-br from-primary to-primary-container text-white px-8 py-3 rounded-lg font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-50" 
          type="submit"
        >
          {loading ? t('profile.updating') : t('profile.updatePassword')}
        </button>
      </form>
    </section>
  );
};

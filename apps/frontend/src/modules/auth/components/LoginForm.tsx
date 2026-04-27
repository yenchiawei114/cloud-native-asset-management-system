import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '../../core/design-system/TextField';
import { Button } from '../../core/design-system/Button';
import { useAuth } from '../hooks/useAuth';

export const LoginForm: React.FC = () => {
  const { t } = useTranslation();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(employeeId, password);
    } catch {
      // 錯誤已由 hook 處理，此處可做額外 UI 反饋（如果需要）
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="mb-10 text-center md:text-left">
        <h2 className="font-headline text-3xl font-bold text-on-surface mb-2">
          {t('auth.title')}
        </h2>
        <p className="text-on-surface-variant">
          {t('auth.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-error/10 text-error text-sm p-4 rounded-lg border border-error/20">
            {error}
          </div>
        )}

        <TextField 
          label={t('auth.idEmail')} 
          icon="badge" 
          placeholder={t('auth.idEmailPlaceholder')} 
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          required
        />

        <TextField 
          label={t('auth.password')} 
          icon="lock_open" 
          type="password" 
          placeholder={t('auth.passwordPlaceholder')} 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <Button icon="arrow_forward" type="submit" disabled={loading}>
          {loading ? '...' : t('auth.enterControlCenter')}
        </Button>
      </form>
    </div>
  );
};

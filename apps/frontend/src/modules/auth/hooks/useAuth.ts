import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { authService } from '../services/authService';
import { api } from '../../../lib/api';

export const useAuth = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (authService.isAuthenticated()) {
        try {
          const profile = await api.getMe();
          setUser(profile);
        } catch (err) {
          authService.logout();
        }
      }
      setInitialized(true);
    };
    init();
  }, []);

  const login = async (employeeId: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await authService.login(employeeId, password);
      const profile = await api.getMe();
      setUser(profile);
      
      if (profile.role === 'admin') {
        window.location.href = '/status';
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      // 根據錯誤類型顯示友善提示
      let message = t('auth.loginError');
      if (err.message?.includes('401')) {
        message = t('auth.loginInvalid');
      } else if (err.message?.includes('Failed to fetch')) {
        message = t('errors.network');
      }
      
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  return {
    login,
    logout,
    loading,
    error,
    user,
    initialized,
    isAuthenticated: authService.isAuthenticated()
  };
};

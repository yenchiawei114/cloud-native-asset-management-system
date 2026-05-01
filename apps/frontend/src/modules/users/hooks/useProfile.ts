import { useState, useEffect } from 'react';
import { userService } from '../services/userService';

export const useProfile = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<any[]>([]);

  const fetchPreferences = async () => {
    try {
      const data = await userService.getNotificationPreferences();
      setPreferences(data);
    } catch (err: any) {
      console.error('Failed to fetch preferences', err);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  const changePassword = async (oldPassword: string, newPassword: string) => {
    setLoading(true);
    setError(null);
    try {
      await userService.changePassword(oldPassword, newPassword);
      return { success: true };
    } catch (err: any) {
      setError(err.message || '密碼更新失敗');
      return { success: false, message: err.message };
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (type: string, value: string) => {
    try {
      await userService.updateNotificationPreference(type, value);
      await fetchPreferences();
    } catch (err: any) {
      console.error('Failed to update preference', err);
    }
  };

  return {
    loading,
    error,
    preferences,
    changePassword,
    updatePreference,
    refreshPreferences: fetchPreferences
  };
};

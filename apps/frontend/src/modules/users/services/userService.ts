import { api } from '../../../lib/api';

export const userService = {
  getProfile: async () => {
    return await api.getMe();
  },
  
  changePassword: async (oldPassword: string, newPassword: string) => {
    return await api.changePassword({
      current_password: oldPassword,
      new_password: newPassword
    });
  },

  getNotificationPreferences: async () => {
    return await api.getNotificationPreferences();
  },

  updateNotificationPreference: async (type: string, value: string) => {
    return await api.updateNotificationPreference({ type, value });
  }
};

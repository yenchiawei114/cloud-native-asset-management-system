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
    // Calling list_my_notification_preferences (GET /api/users/me/notification-preferences)
    // I should add this to api.ts as well
    return await api.getNotificationPreferences();
  },

  updateNotificationPreference: async (type: string, value: string) => {
    // Calling upsert_my_notification_preference (PUT /api/users/me/notification-preferences)
    // I should add this to api.ts as well
    return await api.updateNotificationPreference({ type, value });
  }
};

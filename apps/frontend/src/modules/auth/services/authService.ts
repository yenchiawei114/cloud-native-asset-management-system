import { api } from '../../../lib/api';

/**
 * Auth 服務層：處理與外部 API 的通訊以及資料持久化（如 Token）。
 * 同時也負責處理資料格式的轉換，讓 UI 層只需關心業務邏輯。
 */
export const authService = {
  /**
   * 執行登入並儲存憑證
   */
  async login(employee_id: string, password: string) {
    const res = await api.login({ employee_id, password });
    if (res.access_token) {
      localStorage.setItem('token', res.access_token);
    }
    return res;
  },

  /**
   * 登出並清除憑證
   */
  logout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
  },

  /**
   * 檢查目前是否有憑證
   */
  isAuthenticated() {
    return !!localStorage.getItem('token');
  },

  /**
   * 取得目前的 Token
   */
  getToken() {
    return localStorage.getItem('token');
  }
};

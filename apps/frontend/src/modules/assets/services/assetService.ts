import { api } from '../../../lib/api';

/**
 * Assets 服務層：處理資產相關的業務邏輯。
 */
export const assetService = {
  /**
   * 取得資產清單。
   * 後端會根據登入角色自動過濾：
   * - 一般員工：僅回傳自己的資產。
   * - 管理員：回傳全部，或透過 employeeId 過濾。
   */
  async getMyAssets(employeeId?: string) {
    return await api.listAssets(employeeId ? { owner_employee_id: employeeId } : undefined);
  },

  /**
   * 取得資產統計數據
   */
  async getAssetStats(employeeId?: string) {
    const assets = await this.getMyAssets(employeeId);
    return {
      total: assets.length,
      inRepair: assets.filter(a => a.status === 'UNDER_REPAIR').length,
    };
  }
};

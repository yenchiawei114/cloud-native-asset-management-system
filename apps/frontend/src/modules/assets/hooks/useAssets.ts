import { useState, useEffect, useCallback } from 'react';
import { assetService } from '../services/assetService';
import { Asset } from '../../../lib/api';
import { useAuth } from '../../auth/hooks/useAuth';

/**
 * useAssets Hook：管理資產清單狀態
 */
export const useAssets = () => {
  useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      // 後端已實作自動過濾，一般員工直接 call listAssets 即可取得自己的資產
      const data = await assetService.getMyAssets();
      setAssets(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const stats = {
    total: assets.length,
    inRepair: assets.filter(a => a.status === 'UNDER_REPAIR').length,
  };

  return { assets, loading, error, stats, refresh: fetchAssets };
};

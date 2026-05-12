import { useState, useEffect, useMemo } from 'react';
import { api, Asset, AssetCreatePayload } from '../../../lib/api';

export const useAssets = (params?: { keyword?: string; status?: string }) => {
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      // 後端目前僅支援按員工 ID 篩選，不支援 keyword/status 篩選
      const data = await api.listAssets();
      setAllAssets(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch assets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []); // 初始載入一次

  // 客戶端篩選
  const assets = useMemo(() => {
    return allAssets.filter(asset => {
      const matchesKeyword = !params?.keyword || 
        asset.name.toLowerCase().includes(params.keyword.toLowerCase()) ||
        asset.asset_code.toLowerCase().includes(params.keyword.toLowerCase());
      
      const matchesStatus = !params?.status || params.status === 'ALL' || 
        asset.status === params.status;
        
      return matchesKeyword && matchesStatus;
    });
  }, [allAssets, params?.keyword, params?.status]);

  const createAsset = async (payload: AssetCreatePayload) => {
    try {
      const newAsset = await api.createAsset(payload);
      await fetchAssets();
      return newAsset;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create asset');
    }
  };

  const deleteAsset = async (id: number) => {
    try {
      await api.deleteAsset(id);
      await fetchAssets();
      return true;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to delete asset');
    }
  };

  // 動態計算統計
  const stats = useMemo(() => {
    return {
      total: allAssets.length,
      inRepair: allAssets.filter(a => a.status === 'maintenance').length,
      available: allAssets.filter(a => a.status === 'available').length,
      inUse: allAssets.filter(a => a.status === 'in_use').length,
    };
  }, [allAssets]);

  return { assets, loading, error, stats, refresh: fetchAssets, createAsset, deleteAsset };
};

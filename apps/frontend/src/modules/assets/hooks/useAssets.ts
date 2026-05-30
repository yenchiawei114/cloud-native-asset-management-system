import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, Asset, AssetCreatePayload } from '../../../lib/api';

const PAGE_LIMIT = 50;

interface UseAssetsParams {
  keyword?: string;
  status?: string;
  asset_code_q?: string;
  name_q?: string;
  model_q?: string;
  spec_q?: string;
  vendor_q?: string;
  owner_q?: string;
  office_location_q?: string;
  asset_type?: string;
}

export const useAssets = (params?: UseAssetsParams) => {
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const paramsKey = JSON.stringify(params);

  const fetchAssets = useCallback(async (currentSkip = skip) => {
    setLoading(true);
    try {
      const data = await api.listAssets({
        keyword: params?.keyword,
        asset_code_q: params?.asset_code_q,
        name_q: params?.name_q,
        model_q: params?.model_q,
        spec_q: params?.spec_q,
        vendor_q: params?.vendor_q,
        owner_q: params?.owner_q,
        office_location_q: params?.office_location_q,
        asset_type: params?.asset_type,
        status: params?.status !== 'ALL' ? params?.status : undefined,
        skip: currentSkip,
        limit: PAGE_LIMIT,
      });
      setAllAssets(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch assets');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, skip]);

  // 當搜尋參數變動時重置到第一頁
  useEffect(() => {
    setSkip(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  useEffect(() => {
    fetchAssets(skip);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, skip]);

  const onPageChange = (newSkip: number) => {
    setSkip(newSkip);
  };

  const createAsset = async (payload: AssetCreatePayload) => {
    try {
      const newAsset = await api.createAsset(payload);
      await fetchAssets(skip);
      return newAsset;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create asset');
    }
  };

  const stats = useMemo(() => ({
    total: allAssets.length,
    inRepair: allAssets.filter(a => a.status === 'maintenance').length,
    available: allAssets.filter(a => a.status === 'available').length,
    inUse: allAssets.filter(a => a.status === 'in_use').length,
  }), [allAssets]);

  return {
    assets: allAssets,
    total,
    skip,
    limit: PAGE_LIMIT,
    loading,
    error,
    stats,
    refresh: () => fetchAssets(skip),
    createAsset,
    onPageChange,
  };
};

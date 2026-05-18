import { useState, useEffect, useMemo } from 'react';
import { api, Asset, AssetCreatePayload } from '../../../lib/api';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const paramsKey = JSON.stringify(params);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const data = await api.listAssets({
        asset_code_q: params?.asset_code_q,
        name_q: params?.name_q,
        model_q: params?.model_q,
        spec_q: params?.spec_q,
        vendor_q: params?.vendor_q,
        owner_q: params?.owner_q,
        office_location_q: params?.office_location_q,
        asset_type: params?.asset_type,
        status: params?.status !== 'ALL' ? params?.status : undefined,
      });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  const assets = useMemo(() => {
    if (!params?.keyword) return allAssets;
    const kw = params.keyword.toLowerCase();
    return allAssets.filter(a =>
      a.name.toLowerCase().includes(kw) ||
      a.asset_code.toLowerCase().includes(kw)
    );
  }, [allAssets, params?.keyword]);

  const createAsset = async (payload: AssetCreatePayload) => {
    try {
      const newAsset = await api.createAsset(payload);
      await fetchAssets();
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

  return { assets, loading, error, stats, refresh: fetchAssets, createAsset };
};

import { useState, useEffect, useCallback } from 'react';
import { api, Asset, RepairRequest } from '../../../lib/api';

export const useAssetDetail = (assetId: string | undefined) => {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAsset(parseInt(assetId));
      setAsset(data);
      
      // Fetch maintenance history (tickets related to this asset)
      // Since backend doesn't have a direct filter for asset_id in listTickets, 
      // and we might be an employee who can only see their own tickets,
      // we'll fetch all tickets if admin, or user tickets if employee, and filter client-side.
      // But for a professional app, let's assume we can at least try to get them.
      try {
        const allTickets = await api.listTickets();
        const assetHistory = allTickets.filter(t => t.asset_id === parseInt(assetId));
        setHistory(assetHistory);
      } catch (e) {
        console.warn('Failed to fetch maintenance history:', e);
      }
      
    } catch (err: any) {
      setError(err.message || 'Failed to load asset details');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateAsset = async (payload: any) => {
    if (!asset) return;
    try {
      const updated = await api.updateAsset(asset.id, payload);
      setAsset(updated);
      return updated;
    } catch (err: any) {
      throw err;
    }
  };

  return { asset, history, loading, error, refresh: fetchData, updateAsset };
};

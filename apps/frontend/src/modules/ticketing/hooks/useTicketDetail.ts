import { useState, useEffect, useCallback } from 'react';
import { api, RepairRequest, Asset } from '../../../lib/api';

export const useTicketDetail = (ticketId: string | undefined) => {
  const [ticket, setTicket] = useState<RepairRequest | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [record, setRecord] = useState<any | null>(null);
  const [inspection, setInspection] = useState<any | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);

    try {
      const tidNum = parseInt(ticketId);

      // 1. 基本資訊
      const ticketData = await api.getTicket(tidNum);
      setTicket(ticketData);

      // 2. 資產資訊
      const assetData = await api.getAsset(ticketData.asset_id);
      setAsset(assetData);

      // 3. 維修紀錄
      let recordData = null;
      try {
        recordData = await api.getTicketRecord(tidNum);
        setRecord(recordData);
      } catch (e: any) {
        // Normal if not exists
      }

      // 4. 驗收結果
      let inspectionData = null;
      try {
        inspectionData = await api.getTicketInspection(tidNum);
        setInspection(inspectionData);
      } catch (e: any) {
        // Normal if not exists
      }

      // 5. 附件過濾
      try {
        const allAttachs = await api.getTicketAttachments(tidNum);
        const filtered = allAttachs.filter((a: any) => 
          (a.attachable_type === 'REPAIR_REQUEST' && a.attachable_id === tidNum) ||
          (recordData && a.attachable_type === 'REPAIR_RECORD' && a.attachable_id === recordData.id) ||
          (inspectionData && a.attachable_type === 'REPAIR_INSPECTION' && a.attachable_id === inspectionData.id)
        );
        setAttachments(filtered);
      } catch (e: any) {
        console.warn('Failed to fetch attachments:', e);
      }

    } catch (err: any) {
      setError(err.message || 'Failed to load ticket details');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ticket, asset, record, inspection, attachments, loading, error, refresh: fetchData };
};

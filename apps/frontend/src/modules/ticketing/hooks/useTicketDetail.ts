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
      // 1. 抓取報修單基本資訊
      const ticketData = await api.getTicket(parseInt(ticketId));
      setTicket(ticketData);

      // 2. 抓取關聯資產資訊
      const assetData = await api.getAsset(ticketData.asset_id);
      setAsset(assetData);

      // 3. 抓取維修紀錄 (可能為 404，代表尚未開始維修)
      try {
        const recordData = await api.getTicketRecord(parseInt(ticketId));
        setRecord(recordData);
      } catch (e: any) {
        if (!e.message.includes('404')) {
          console.warn('Failed to fetch repair record:', e);
        }
      }

      // 4. 抓取驗收結果 (可能為 404)
      try {
        const inspectionData = await api.getTicketInspection(parseInt(ticketId));
        setInspection(inspectionData);
      } catch (e: any) {
        // 只有管理員能看驗收，員工看會 403，目前我們先忽略員工端權限錯誤
        if (!e.message.includes('404') && !e.message.includes('403')) {
          console.warn('Failed to fetch inspection:', e);
        }
      }

      // 5. 抓取附件
      try {
        const attachs = await api.getTicketAttachments(parseInt(ticketId));
        setAttachments(attachs);
      } catch (e: any) {
        if (!e.message.includes('403')) { // 忽略目前員工權限不足的問題
          console.warn('Failed to fetch attachments:', e);
        }
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

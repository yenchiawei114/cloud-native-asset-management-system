import { useState, useEffect } from 'react';
import { api, AuditLog } from '../../../lib/api';

interface UseAuditLogsParams {
  target_type?: string;
  action?: string;
  from_datetime?: string;
  to_datetime?: string;
  user_id?: number;
  page?: number;
  page_size?: number;
}

export const useAuditLogs = (params: UseAuditLogsParams = {}) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const response = await api.listAuditLogs(params);
        setLogs(response.items);
        setTotal(response.total);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [JSON.stringify(params)]);

  return { logs, total, loading, error };
};

import { useState, useEffect } from 'react';
import { api, AuditLog } from '../../../lib/api';

export const useAuditDetail = (logId: number) => {
  const [log, setLog] = useState<AuditLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!logId) return;

    const fetchDetail = async () => {
      setLoading(true);
      try {
        const data = await api.getAuditLog(logId);
        setLog(data);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [logId]);

  return { log, loading, error };
};

import { useState, useEffect, useMemo } from 'react';
import { api, Ticket } from '../../../lib/api';

export const useAdminTickets = (statusFilter?: string) => {
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState({ pending: 0, completed_week: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const ticketData = await api.listTickets();
      const validTickets = Array.isArray(ticketData) ? ticketData : [];
      setAllTickets(validTickets);
      
      // 動態計算統計數據
      setStats({
        pending: validTickets.filter(t => t.status === 'OPEN').length,
        completed_week: validTickets.filter(t => t.status === 'DONE').length
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const tickets = useMemo(() => {
    if (!statusFilter || statusFilter === 'ALL') return allTickets;
    return allTickets.filter(t => t.status === statusFilter);
  }, [allTickets, statusFilter]);

  const approveTicket = async (id: number) => {
    try {
      await api.approveTicket(id, 'IN_PROGRESS');
      await fetchData();
      return true;
    } catch (err: any) {
      throw new Error(err.message || 'Approval failed');
    }
  };

  const rejectTicket = async (id: number, reason: string) => {
    try {
      await api.rejectTicket(id, reason);
      await fetchData();
      return true;
    } catch (err: any) {
      throw new Error(err.message || 'Rejection failed');
    }
  };

  return { tickets, allTickets, stats, loading, error, refresh: fetchData, approveTicket, rejectTicket };
};

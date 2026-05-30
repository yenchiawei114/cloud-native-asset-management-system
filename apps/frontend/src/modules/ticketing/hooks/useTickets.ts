import { useState, useEffect, useCallback } from 'react';
import { ticketService } from '../services/ticketService';
import { RepairRequest } from '../../../lib/api';
import { useAuth } from '../../auth/hooks/useAuth';

export const useTickets = () => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<RepairRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await ticketService.getMyTickets(user.employee_id);
      setTickets(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const stats = {
    total: tickets.length,
    inProgress: tickets.filter(t => t.status === 'IN_PROGRESS' || t.status === 'OPEN').length,
  };

  return { tickets, loading, error, stats, refresh: fetchTickets };
};

import { api, RepairRequest } from '../../../lib/api';

export const ticketService = {
  async getMyTickets(employeeId: string): Promise<RepairRequest[]> {
    return await api.listMyTickets(employeeId);
  },

  async getTicketStats(employeeId: string) {
    const tickets = await this.getMyTickets(employeeId);
    return {
      total: tickets.length,
      inProgress: tickets.filter(t => t.status === 'IN_PROGRESS' || t.status === 'OPEN').length,
    };
  },

  async createTicket(payload: any) {
    return await api.createTicket(payload);
  },

  async uploadAttachment(ticketId: number, file: File) {
    const formData = new FormData();
    formData.append('attachable_type', 'REPAIR_REQUEST');
    formData.append('attachable_id', ticketId.toString());
    formData.append('file', file);
    return await api.uploadAttachment(formData);
  }
};

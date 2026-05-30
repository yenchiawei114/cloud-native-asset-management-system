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

  async uploadAttachment(id: number, file: File, type: string = 'REPAIR_REQUEST') {
    const formData = new FormData();
    formData.append('attachable_type', type);
    formData.append('attachable_id', id.toString());
    formData.append('file', file);
    return await api.uploadAttachment(formData);
  },

  async saveDraft(assetId: number, payload: any) {
    return await api.saveTicketDraft(assetId, payload);
  },

  async getDraft(assetId: number) {
    return await api.getTicketDraft(assetId);
  },

  async deleteDraft(assetId: number) {
    return await api.deleteTicketDraft(assetId);
  }
};

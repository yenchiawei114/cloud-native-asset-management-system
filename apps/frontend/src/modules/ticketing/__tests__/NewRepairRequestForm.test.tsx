import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NewRepairRequestForm } from '../components/NewRepairRequestForm';
import { ticketService } from '../services/ticketService';
import { useAssets } from '../../assets/hooks/useAssets';
import { useAuth } from '../../auth/hooks/useAuth';

// Mock hook dependencies
vi.mock('../../assets/hooks/useAssets', () => ({
  useAssets: vi.fn(),
}));

vi.mock('../../auth/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/ticketService', () => ({
  ticketService: {
    getDraft: vi.fn(),
    saveDraft: vi.fn(),
    deleteDraft: vi.fn(),
    createTicket: vi.fn(),
    uploadAttachment: vi.fn(),
  },
}));

describe('NewRepairRequestForm Draft Feature', () => {
  const mockAssets = [
    { id: 101, asset_code: 'AST-101', name: 'MacBook Pro', type: 'LAPTOP' },
    { id: 102, asset_code: 'AST-102', name: 'Dell XPS', type: 'LAPTOP' },
  ];

  const mockUser = {
    id: 42,
    name: 'Test User',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useAssets as any).mockReturnValue({
      assets: mockAssets,
      loading: false,
    });

    (useAuth as any).mockReturnValue({
      user: mockUser,
    });
  });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('should load draft when asset is selected', async () => {
    const draftPayload = {
      draft_data: {
        description: 'Screen flickering issue',
        need_backup: true,
        backup_spec: '16GB RAM Laptop',
      },
    };

    (ticketService.getDraft as any).mockResolvedValue(draftPayload);
    (ticketService.saveDraft as any).mockResolvedValue({ success: true });

    render(<NewRepairRequestForm onCancel={vi.fn()} onSuccess={vi.fn()} />);

    // Select an asset
    fireEvent.click(screen.getByText('MacBook Pro'));

    // Should trigger getDraft
    await waitFor(() => {
      expect(ticketService.getDraft).toHaveBeenCalledWith(101);
    });

    // Wait for the inputs to be populated from the draft
    await waitFor(() => {
      expect((screen.getByPlaceholderText('ticketing.form.descriptionPlaceholder') as HTMLTextAreaElement).value).toBe('Screen flickering issue');
    });

    // Wait 2200ms for the triggered auto-save to finish and return status to 'saved'
    await sleep(2200);

    const checkbox = screen.getByLabelText('ticketing.form.needBackup') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    const backupInput = screen.getByPlaceholderText('ticketing.form.backupSpecPlaceholder') as HTMLInputElement;
    expect(backupInput.value).toBe('16GB RAM Laptop');

    // Confirm that the status shows "Draft loaded/saved" key
    expect(screen.getByText('ticketing.draft.saved')).toBeInTheDocument();
  });

  it('should auto-save draft after debounce delay when form input changes', async () => {
    // Return 404 to simulate no existing draft
    (ticketService.getDraft as any).mockRejectedValue(new Error('404'));
    (ticketService.saveDraft as any).mockResolvedValue({ success: true });

    render(<NewRepairRequestForm onCancel={vi.fn()} onSuccess={vi.fn()} />);

    // Select an asset
    fireEvent.click(screen.getByText('MacBook Pro'));

    // Wait for draft check to complete (gets 404)
    await waitFor(() => {
      expect(ticketService.getDraft).toHaveBeenCalled();
    });

    // Enter a description
    const descTextarea = screen.getByPlaceholderText('ticketing.form.descriptionPlaceholder');
    fireEvent.change(descTextarea, { target: { value: 'Keyboard not working' } });

    // Wait 2200ms to trigger debounced auto-save
    await sleep(2200);

    expect(ticketService.saveDraft).toHaveBeenCalledWith(101, {
      description: 'Keyboard not working',
      need_backup: false,
      backup_spec: null,
    });
  });

  it('should create ticket and delete draft upon successful submit', async () => {
    // Return 404 to simulate no existing draft
    (ticketService.getDraft as any).mockRejectedValue(new Error('404'));
    (ticketService.createTicket as any).mockResolvedValue({ id: 999 });
    (ticketService.deleteDraft as any).mockResolvedValue({ success: true });

    render(<NewRepairRequestForm onCancel={vi.fn()} onSuccess={vi.fn()} />);

    // Select asset and fill form
    fireEvent.click(screen.getByText('MacBook Pro'));

    // Wait for initial load sequence
    await waitFor(() => {
      expect(ticketService.getDraft).toHaveBeenCalled();
    });

    const descTextarea = screen.getByPlaceholderText('ticketing.form.descriptionPlaceholder');
    fireEvent.change(descTextarea, { target: { value: 'Liquid spill' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: 'ticketing.form.submit' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(ticketService.createTicket).toHaveBeenCalledWith({
        asset_id: 101,
        requester_id: 42,
        description: 'Liquid spill',
        need_backup: false,
        backup_spec: null,
        expected_completion_date: null,
        pickup_location: null,
      });
    });

    // Should delete draft
    expect(ticketService.deleteDraft).toHaveBeenCalledWith(101);
  });
});

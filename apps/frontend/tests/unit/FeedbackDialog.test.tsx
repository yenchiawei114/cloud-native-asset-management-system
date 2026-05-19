import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../src/i18n';
import { FeedbackDialog, FeedbackDialogProps } from '../../src/modules/core/components/FeedbackDialog';

// Mock the Button component to isolate FeedbackDialog testing
vi.mock('../../src/modules/core/design-system/Button', () => ({
    Button: ({ onClick, children, className }: any) => (
        <button onClick={onClick} className={className}>
            {children}
        </button>
    ),
}));

/**
 * Helper function to render FeedbackDialog with i18n provider
 * (required because component uses useTranslation hook)
 */
const renderDialog = (props: Partial<FeedbackDialogProps> = {}) => {
    const defaultProps: FeedbackDialogProps = {
        isOpen: true,
        title: 'Test Title',
        message: 'Test Message',
        onConfirm: vi.fn(),
        ...props,
    };

    return render(
        <I18nextProvider i18n={i18n}>
            <FeedbackDialog {...defaultProps} />
        </I18nextProvider>
    );
};

describe('FeedbackDialog', () => {
    describe('Visibility', () => {
        it('should not render when isOpen is false', () => {
            renderDialog({ isOpen: false });

            expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
        });

        it('should render when isOpen is true', () => {
            renderDialog({ isOpen: true });

            expect(screen.getByText('Test Title')).toBeInTheDocument();
            expect(screen.getByText('Test Message')).toBeInTheDocument();
        });
    });

    describe('Content Rendering', () => {
        it('should display title and message', () => {
            renderDialog({
                title: 'Success Operation',
                message: 'Your changes have been saved',
            });

            expect(screen.getByText('Success Operation')).toBeInTheDocument();
            expect(screen.getByText('Your changes have been saved')).toBeInTheDocument();
        });

        it('should render with default confirm button text', () => {
            renderDialog();

            // Note: The actual text depends on i18n translation for 'common.confirm'
            // This test assumes i18n is properly loaded
            const confirmButton = screen.getByRole('button', { name: /confirm/i });
            expect(confirmButton).toBeInTheDocument();
        });

        it('should render with custom button text when provided', () => {
            renderDialog({
                confirmText: 'Delete Permanently',
                cancelText: 'Keep It',
            });

            expect(screen.getByText('Delete Permanently')).toBeInTheDocument();
        });
    });

    describe('Dialog Types', () => {
        it('should render success dialog with green icon', () => {
            renderDialog({ type: 'success' });

            const icon = screen.getByText('check_circle');
            expect(icon).toHaveClass('text-green-500');
        });

        it('should render error dialog with red icon', () => {
            renderDialog({ type: 'error' });

            const icon = screen.getByText('error');
            expect(icon).toHaveClass('text-red-500');
        });

        it('should render info dialog with blue icon (default)', () => {
            renderDialog({ type: 'info' });

            const icon = screen.getByText('info');
            expect(icon).toHaveClass('text-blue-500');
        });

        it('should render confirm dialog with warning icon', () => {
            renderDialog({ type: 'confirm' });

            const icon = screen.getByText('help');
            expect(icon).toHaveClass('text-amber-500');
        });
    });

    describe('User Interactions', () => {
        it('should call onConfirm when confirm button is clicked', async () => {
            const user = userEvent.setup();
            const onConfirm = vi.fn();

            renderDialog({ onConfirm });

            const confirmButton = screen.getByRole('button', { name: /confirm/i });
            await user.click(confirmButton);

            expect(onConfirm).toHaveBeenCalledOnce();
        });

        it('should call onCancel when cancel button is clicked in confirm type', async () => {
            const user = userEvent.setup();
            const onCancel = vi.fn();

            renderDialog({
                type: 'confirm',
                onCancel,
                cancelText: 'Cancel',
            });

            const cancelButton = screen.getByRole('button', { name: /cancel/i });
            await user.click(cancelButton);

            expect(onCancel).toHaveBeenCalledOnce();
        });

        it('should not show cancel button for non-confirm dialogs', () => {
            renderDialog({
                type: 'success',
                onCancel: vi.fn(),
                cancelText: 'Cancel',
            });

            // Cancel button should not exist for success type
            expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
        });

        it('should show cancel button only for confirm type', () => {
            renderDialog({
                type: 'confirm',
                onCancel: vi.fn(),
                cancelText: 'No, Cancel',
                confirmText: 'Yes, Delete',
            });

            expect(screen.getByRole('button', { name: /no, cancel/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /yes, delete/i })).toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('should handle missing onCancel callback in confirm dialog', async () => {
            const user = userEvent.setup();
            // Note: onCancel is optional, but confirm type still shows cancel button
            renderDialog({
                type: 'confirm',
                onCancel: undefined,
                cancelText: 'Cancel',
            });

            const cancelButton = screen.getByRole('button', { name: /cancel/i });
            // Should not crash when clicked
            await user.click(cancelButton);
            expect(cancelButton).toBeInTheDocument();
        });

        it('should render with very long message text', () => {
            const longMessage = 'A'.repeat(500);
            renderDialog({ message: longMessage });

            expect(screen.getByText(longMessage)).toBeInTheDocument();
        });

        it('should handle rapid multiple clicks on confirm button', async () => {
            const user = userEvent.setup();
            const onConfirm = vi.fn();

            renderDialog({ onConfirm });

            const confirmButton = screen.getByRole('button', { name: /confirm/i });
            await user.click(confirmButton);
            await user.click(confirmButton);

            // Both clicks should register (component doesn't prevent double-click)
            expect(onConfirm).toHaveBeenCalledTimes(2);
        });
    });

    describe('Accessibility', () => {
        it('should have proper button semantics', () => {
            renderDialog({ type: 'confirm', cancelText: 'No', confirmText: 'Yes' });

            const buttons = screen.getAllByRole('button');
            expect(buttons.length).toBe(2); // cancel + confirm
        });

        it('should have text content for screen readers', () => {
            renderDialog({
                title: 'Important Action',
                message: 'This is an important message',
            });

            // Dialog content is readable
            expect(screen.getByText('Important Action')).toBeVisible();
            expect(screen.getByText('This is an important message')).toBeVisible();
        });
    });
});

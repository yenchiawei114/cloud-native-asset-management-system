import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../src/modules/core/design-system/Button';

describe('Button', () => {
    it('renders its children', () => {
        render(<Button>Click me</Button>);

        expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
    });

    it('invokes onClick when pressed', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();

        render(<Button onClick={onClick}>Click me</Button>);

        await user.click(screen.getByRole('button', { name: /click me/i }));

        expect(onClick).toHaveBeenCalledTimes(1);
    });
});

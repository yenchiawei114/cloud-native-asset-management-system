import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { TextField } from '../../../src/modules/core/design-system/TextField';

describe('TextField', () => {
    it('renders the label and input', () => {
        render(<TextField label="Employee ID" placeholder="Enter ID" />);

        expect(screen.getByText('Employee ID')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter ID')).toBeInTheDocument();
    });

    it('renders the icon when provided', () => {
        render(<TextField label="Search" icon="search" placeholder="Find users" />);

        expect(screen.getByText('search')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Find users')).toHaveClass('pl-12');
    });

    it('forwards refs to the input element', () => {
        const inputRef = createRef<HTMLInputElement>();

        render(<TextField label="Name" ref={inputRef} />);

        expect(inputRef.current).toBeInstanceOf(HTMLInputElement);
        expect(inputRef.current).toHaveClass('pl-4');
    });

    it('passes standard input props through to the input', async () => {
        const user = userEvent.setup();
        const handleChange = vi.fn();

        render(<TextField label="Email" type="email" onChange={handleChange} placeholder="Enter email" />);

        const input = screen.getByPlaceholderText('Enter email');
        await user.type(input, 'a@b.com');

        expect(handleChange).toHaveBeenCalled();
        expect(input).toHaveValue('a@b.com');
    });

    it('uses the default input padding when no icon is provided', () => {
        render(<TextField label="Department" placeholder="Sales" />);

        expect(screen.getByPlaceholderText('Sales')).toHaveClass('pl-4');
    });
});
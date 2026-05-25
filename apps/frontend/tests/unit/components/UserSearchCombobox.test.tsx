import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'

import { UserSearchCombobox } from '../../../src/modules/core/components/UserSearchCombobox'
import { api } from '../../../src/lib/api'

vi.mock('../../../src/lib/api', () => ({
    api: {
        listUsers: vi.fn(),
    },
}))

const mockedListUsers = vi.mocked(api.listUsers, { partial: true })

const mockUsers = [
    {
        id: 1,
        name: 'John Doe',
        employee_id: 'EMP001',
    },
    {
        id: 2,
        name: 'Jane Smith',
        employee_id: 'EMP002',
    },
]

describe('UserSearchCombobox', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('renders label', () => {
        render(
            <UserSearchCombobox
                label="Assignee"
                selectedUser={null}
                onSelect={vi.fn()}
            />
        )

        expect(screen.getByText('Assignee')).toBeInTheDocument()
    })

    test('updates input value when typing', async () => {
        render(
            <UserSearchCombobox
                label="User"
                selectedUser={null}
                onSelect={vi.fn()}
            />
        )

        const input = screen.getByRole('textbox')

        await userEvent.type(input, 'john')

        expect(input).toHaveValue('john')
    })

    test('searches users and shows dropdown results', async () => {
        mockedListUsers.mockResolvedValue({ items: mockUsers, total: 2, skip: 0, limit: 10 } as any)

        render(
            <UserSearchCombobox
                label="User"
                selectedUser={null}
                onSelect={vi.fn()}
            />
        )

        const input = screen.getByRole('textbox')

        await userEvent.type(input, 'john')

        await waitFor(() => {
            expect(mockedListUsers).toHaveBeenCalledWith({ keyword: 'john', limit: 10 })
        }, { timeout: 1000 })

        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    })

    test('selects a user from dropdown', async () => {
        mockedListUsers.mockResolvedValue({ items: mockUsers, total: 2, skip: 0, limit: 10 } as any)

        const onSelect = vi.fn()

        render(
            <UserSearchCombobox
                label="User"
                selectedUser={null}
                onSelect={onSelect}
            />
        )

        const input = screen.getByRole('textbox')

        await userEvent.type(input, 'john')

        await waitFor(() => {
            expect(screen.getByText('John Doe')).toBeInTheDocument()
        }, { timeout: 1000 })

        await userEvent.click(screen.getByText('John Doe'))

        expect(onSelect).toHaveBeenCalledWith(mockUsers[0])
    })

    test('clears selected user', async () => {
        const onSelect = vi.fn()

        render(
            <UserSearchCombobox
                label="User"
                selectedUser={{
                    id: 1,
                    name: 'John Doe',
                    employee_id: 'EMP001',
                }}
                onSelect={onSelect}
            />
        )

        const clearButton = screen.getByRole('button')

        await userEvent.click(clearButton)

        expect(onSelect).toHaveBeenCalledWith(null)
    })

    test('syncs input text when selected user is cleared externally', async () => {
        const onSelect = vi.fn()

        const { rerender } = render(
            <UserSearchCombobox
                label="User"
                selectedUser={{
                    id: 1,
                    name: 'John Doe',
                    employee_id: 'EMP001',
                }}
                onSelect={onSelect}
            />
        )

        expect(screen.getByRole('textbox')).toHaveValue('John Doe（EMP001）')
        expect(screen.getByRole('button')).toBeInTheDocument()

        rerender(
            <UserSearchCombobox
                label="User"
                selectedUser={null}
                onSelect={onSelect}
            />
        )

        expect(screen.getByRole('textbox')).toHaveValue('')
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    test('keeps typed text when the current selection is cleared by typing', async () => {
        const onSelect = vi.fn()

        const { rerender } = render(
            <UserSearchCombobox
                label="User"
                selectedUser={{
                    id: 1,
                    name: 'John Doe',
                    employee_id: 'EMP001',
                }}
                onSelect={onSelect}
            />
        )

        const input = screen.getByRole('textbox')

        await userEvent.type(input, 'a')

        expect(onSelect).toHaveBeenCalledWith(null)
        expect(input).toHaveValue('John Doe（EMP001）a')

        rerender(
            <UserSearchCombobox
                label="User"
                selectedUser={null}
                onSelect={onSelect}
            />
        )

        expect(screen.getByRole('textbox')).toHaveValue('John Doe（EMP001）a')
    })

    test('closes dropdown when clicking outside', async () => {
        mockedListUsers.mockResolvedValue({ items: mockUsers, total: 2, skip: 0, limit: 10 } as any)

        render(
            <div>
                <UserSearchCombobox
                    label="User"
                    selectedUser={null}
                    onSelect={vi.fn()}
                />

                <button>outside</button>
            </div>
        )

        const input = screen.getByRole('textbox')

        await userEvent.type(input, 'john')

        await waitFor(() => {
            expect(screen.getByText('John Doe')).toBeInTheDocument()
        }, { timeout: 1000 })

        await userEvent.click(screen.getByText('outside'))

        await waitFor(() => {
            expect(screen.queryByText('John Doe')).not.toBeInTheDocument()
        })
    })

    test('handles API error gracefully', async () => {
        mockedListUsers.mockRejectedValue(new Error('API Error'))

        render(
            <UserSearchCombobox
                label="User"
                selectedUser={null}
                onSelect={vi.fn()}
            />
        )

        const input = screen.getByRole('textbox')

        await userEvent.type(input, 'john')

        await waitFor(() => {
            expect(mockedListUsers).toHaveBeenCalled()
        }, { timeout: 1000 })

        expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })
})
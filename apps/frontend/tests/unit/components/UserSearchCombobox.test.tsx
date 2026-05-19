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
        mockedListUsers.mockResolvedValue(mockUsers as any)

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
            expect(mockedListUsers).toHaveBeenCalledWith('john')
        }, { timeout: 1000 })

        expect(screen.getByText('John Doe')).toBeInTheDocument()
        expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    })

    test('selects a user from dropdown', async () => {
        mockedListUsers.mockResolvedValue(mockUsers as any)

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

    test('closes dropdown when clicking outside', async () => {
        mockedListUsers.mockResolvedValue(mockUsers as any)

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
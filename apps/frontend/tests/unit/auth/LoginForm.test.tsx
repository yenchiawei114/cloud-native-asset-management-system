import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const mockLogin = vi.fn()

vi.mock('../../../src/modules/auth/hooks/useAuth', () => ({
    useAuth: () => ({
        login: mockLogin,
        loading: false,
        error: null,
        logout: vi.fn(),
        refreshUser: vi.fn(),
        user: null,
        initialized: true,
        isAuthenticated: false,
    }),
}))

import { LoginForm } from '../../../src/modules/auth/components/LoginForm'

describe('LoginForm', () => {
    it('submit login form', async () => {
        const user = userEvent.setup()

        render(<LoginForm />)

        await user.type(screen.getByPlaceholderText('auth.idEmailPlaceholder'), 'a@test.com')
        await user.type(screen.getByPlaceholderText('auth.passwordPlaceholder'), '123456')

        await user.click(screen.getByRole('button', { name: /auth\.enterControlCenter/i }))

        expect(mockLogin).toHaveBeenCalledWith('a@test.com', '123456')
    })
})
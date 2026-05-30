import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mockAuthState = {
    error: 'NETWORK_ERROR' as string | null,
}

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            const translations: Record<string, string> = {
                'auth.title': 'Welcome Back',
                'auth.subtitle': 'Please authenticate to enter your workspace.',
                'auth.enterControlCenter': 'Enter Control Center',
                'apiErrors.NETWORK_ERROR': 'Network connection failed. Please try again.',
            }

            return translations[key] ?? key
        },
    }),
}))

vi.mock('../../../src/modules/auth/hooks/useAuth', () => ({
    useAuth: () => ({
        login: vi.fn(),
        loading: false,
        error: mockAuthState.error,
        logout: vi.fn(),
        refreshUser: vi.fn(),
        user: null,
        initialized: true,
        isAuthenticated: false,
    }),
}))

import { LoginForm } from '../../../src/modules/auth/components/LoginForm'

describe('LoginForm integration', () => {
    it('renders translated text when translation exists', () => {
        mockAuthState.error = 'NETWORK_ERROR'

        render(<LoginForm />)

        expect(screen.getByText('Welcome Back')).toBeInTheDocument()
        expect(screen.getByText('Please authenticate to enter your workspace.')).toBeInTheDocument()
        expect(screen.getByText('Network connection failed. Please try again.')).toBeInTheDocument()
        expect(screen.getByRole('button')).toHaveTextContent('Enter Control Center')
    })

    it('renders raw error text when translation is missing', () => {
        mockAuthState.error = 'UNKNOWN_ERROR'

        render(<LoginForm />)

        expect(screen.getByText('UNKNOWN_ERROR')).toBeInTheDocument()
        expect(screen.queryByText('Network connection failed. Please try again.')).not.toBeInTheDocument()
    })
})

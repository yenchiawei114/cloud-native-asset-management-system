import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProfileInfo } from '../../../src/modules/users/components/ProfileInfo'

// mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

describe('ProfileInfo', () => {
    it('renders profile details', () => {
        render(
            <ProfileInfo
                user={{
                    name: 'Jane Doe',
                    employee_id: 'E12345',
                    email: 'jane.doe@example.com',
                    role: 'ADMIN',
                }}
            />,
        )

        // labels
        expect(screen.getByText('profile.basicInfo')).toBeInTheDocument()
        expect(screen.getByText('profile.name')).toBeInTheDocument()
        expect(screen.getByText('profile.employeeId')).toBeInTheDocument()
        expect(screen.getByText('profile.email')).toBeInTheDocument()
        expect(screen.getByText('profile.role')).toBeInTheDocument()

        // values
        expect(screen.getByText('Jane Doe')).toBeInTheDocument()
        expect(screen.getByText('E12345')).toBeInTheDocument()
        expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument()

        // role
        expect(screen.getByText('profile.admin')).toBeInTheDocument()
    })

    it('renders employee role correctly', () => {
        render(
            <ProfileInfo
                user={{
                    name: 'John Smith',
                    employee_id: 'EMP001',
                    email: 'john@example.com',
                    role: 'EMPLOYEE',
                }}
            />,
        )

        expect(screen.getByText('profile.employee')).toBeInTheDocument()
    })

    it('renders fallback values when user data is missing', () => {
        render(
            <ProfileInfo
                user={{
                    role: 'EMPLOYEE',
                }}
            />,
        )

        const fallbacks = screen.getAllByText('---')

        expect(fallbacks).toHaveLength(3)
    })

    it('renders fallback values when user is null', () => {
        render(<ProfileInfo user={null} />)

        const fallbacks = screen.getAllByText('---')

        expect(fallbacks).toHaveLength(3)

        expect(screen.getByText('profile.employee')).toBeInTheDocument()
    })
})
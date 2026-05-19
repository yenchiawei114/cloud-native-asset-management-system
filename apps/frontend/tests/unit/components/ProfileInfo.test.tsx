import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProfileInfo } from '../../../src/modules/users/components/ProfileInfo.tsx'

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

        expect(screen.getByText('Jane Doe')).toBeInTheDocument()
        expect(screen.getByText('E12345')).toBeInTheDocument()
        expect(screen.getByText('jane.doe@example.com')).toBeInTheDocument()
        expect(screen.getByText('profile.admin')).toBeInTheDocument()
    })
})

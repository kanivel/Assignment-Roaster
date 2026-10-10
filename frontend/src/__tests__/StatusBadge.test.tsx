import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusBadge } from '../components/ui/StatusBadge'
import { SUBMISSION_STATUSES } from '../types'
import { renderWithProviders } from './test-utils'

describe('StatusBadge', () => {
  it.each(SUBMISSION_STATUSES)('renders the %s status', (status) => {
    renderWithProviders(<StatusBadge status={status} />)
    const badge = screen.getByText(new RegExp(status, 'i'))
    expect(badge).toHaveAttribute('data-status', status)
  })
})

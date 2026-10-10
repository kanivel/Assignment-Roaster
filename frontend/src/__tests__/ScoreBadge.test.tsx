import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ScoreBadge } from '../components/ui/ScoreBadge'
import { getScoreTier } from '../lib/score'
import { renderWithProviders } from './test-utils'

describe('getScoreTier', () => {
  it('maps scores to colour tiers', () => {
    expect(getScoreTier(0)).toBe('low')
    expect(getScoreTier(3)).toBe('low')
    expect(getScoreTier(4)).toBe('mid')
    expect(getScoreTier(6)).toBe('mid')
    expect(getScoreTier(7)).toBe('high')
    expect(getScoreTier(10)).toBe('high')
  })
})

describe('ScoreBadge', () => {
  it('renders the score with a /10 suffix and tier attribute', () => {
    renderWithProviders(<ScoreBadge score={8} />)
    const badge = screen.getByLabelText('Score 8 out of 10')
    expect(badge).toHaveTextContent('8/10')
    expect(badge).toHaveAttribute('data-tier', 'high')
  })

  it('clamps out-of-range scores', () => {
    renderWithProviders(<ScoreBadge score={14} showMax={false} />)
    expect(screen.getByLabelText('Score 10 out of 10')).toHaveTextContent('10')
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Scene from './Scene'

describe('journey scene', () => {
  it('shows arrival only when progress reaches the destination', () => {
    const { rerender } = render(<Scene progress={75} durationMinutes={60} title="Final exams" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('75 percent')
    expect(screen.queryByText('Welcome to the last stop.')).not.toBeInTheDocument()
    rerender(<Scene progress={100} durationMinutes={60} title="Final exams" />)
    expect(screen.getByText('Welcome to the last stop.')).toBeInTheDocument()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Compartment from './Compartment'

const journey = {
  id: 7,
  title: 'Final exams',
  starting_station: 'Departure',
  destination_station: 'Success',
  duration_minutes: 60,
  status: 'active',
}

describe('carriage dashboard', () => {
  it('places journey controls and destinations inside the scene', () => {
    const onAction = vi.fn()
    render(
      <MemoryRouter>
        <Compartment journey={journey} progress={50} remaining={1800} onAction={onAction} />
      </MemoryRouter>,
    )
    expect(screen.getByText('00:30:00')).toBeInTheDocument()
    expect(screen.getByText('Departure')).toBeInTheDocument()
    expect(screen.getByText('Success')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /OPEN DIARY/i })).toHaveAttribute('href', '/diary')
    expect(screen.getByRole('link', { name: /VIEW STATISTICS/i })).toHaveAttribute(
      'href',
      '/statistics',
    )
    fireEvent.click(screen.getByRole('button', { name: /PAUSE/i }))
    expect(onAction).toHaveBeenCalledWith('pause')
  })

  it('shows a distinct arrival and another departure', () => {
    render(
      <MemoryRouter>
        <Compartment journey={{ ...journey, status: 'completed' }} progress={100} remaining={0} />
      </MemoryRouter>,
    )
    expect(screen.getByText("You've arrived.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /NEW TRIP/i })).toHaveAttribute('href', '/journeys/new')
  })
})

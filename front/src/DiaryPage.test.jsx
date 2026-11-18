import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DiaryPage } from './OtherPages'
import { api } from './api'

vi.mock('./api', () => ({ api: { get: vi.fn() } }))

describe('diary search', () => {
  it('ignores an older response when a newer query has completed', async () => {
    let resolveOld
    api.get.mockImplementation((path) => {
      if (path === '/journeys/') return Promise.resolve({ results: [], next: null })
      if (path === '/diary/')
        return new Promise((resolve) => {
          resolveOld = resolve
        })
      return Promise.resolve({
        results: [
          {
            id: 2,
            title: 'New result',
            content: 'new',
            journey_title: 'Trip',
            created_at: '2026-11-18T10:00:00Z',
            updated_at: '2026-11-18T10:00:00Z',
          },
        ],
        next: null,
      })
    })
    render(
      <MemoryRouter>
        <DiaryPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(resolveOld).toBeTypeOf('function'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search diary entries' }), {
      target: { value: 'new' },
    })
    await screen.findByText('New result')
    await act(async () =>
      resolveOld({
        results: [
          {
            id: 1,
            title: 'Old result',
            content: 'old',
            journey_title: 'Trip',
            created_at: '2026-11-18T10:00:00Z',
            updated_at: '2026-11-18T10:00:00Z',
          },
        ],
        next: null,
      }),
    )
    expect(screen.queryByText('Old result')).not.toBeInTheDocument()
    expect(screen.getByText('New result')).toBeInTheDocument()
  })
})

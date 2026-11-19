import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, Protected } from './Auth'
import { CreateJourney } from './JourneyPages'
import { StatisticsPage } from './OtherPages'
import MusicPlayer from './MusicPlayer'
import { api } from './api'

vi.mock('./api', () => ({ api: { restore: vi.fn(), post: vi.fn(), get: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

describe('critical frontend flows', () => {
  it('opens the local carriage without sign-in', async () => {
    api.restore.mockResolvedValue({ id: 1, first_name: 'Traveler' })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <Protected>
                  <div>Private carriage</div>
                </Protected>
              }
            />
            <Route path="/login" element={<div>Sign in required</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText(/Preparing the platform/)).toBeInTheDocument()
    expect(await screen.findByText('Private carriage')).toBeInTheDocument()
    expect(screen.queryByText('Sign in required')).not.toBeInTheDocument()
  })

  it('submits a valid duration and opens the carriage', async () => {
    api.post.mockResolvedValue({ id: 1 })
    render(
      <MemoryRouter initialEntries={['/journeys/new']}>
        <Routes>
          <Route path="/journeys/new" element={<CreateJourney />} />
          <Route path="/dashboard" element={<div>Carriage opened</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('Journey name'), { target: { value: 'Study hour' } })
    fireEvent.change(screen.getByLabelText('Destination station'), {
      target: { value: 'Finished' },
    })
    fireEvent.change(screen.getByLabelText('Hours'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Minutes'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: /Begin journey/i }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/journeys/',
        expect.objectContaining({
          title: 'Study hour',
          destination_station: 'Finished',
          duration_minutes: 75,
        }),
      ),
    )
    expect(await screen.findByText('Carriage opened')).toBeInTheDocument()
  })

  it('shows persisted travel time instead of planned duration', async () => {
    api.get.mockResolvedValue({
      total_journeys: 1,
      completed_journeys: 1,
      active_journeys: 0,
      diary_entries: 0,
      total_duration_minutes: 60,
      average_duration_minutes: 60,
      total_travel_seconds: 120,
      completed_travel_seconds: 120,
      completion_rate: 100,
      recent_activity: [],
    })
    render(
      <MemoryRouter>
        <StatisticsPage />
      </MemoryRouter>,
    )
    expect(await screen.findAllByText('00:02:00')).toHaveLength(2)
    expect(screen.getByText('Total travel time')).toBeInTheDocument()
  })

  it('plays, switches and pauses original radio tracks', async () => {
    api.get.mockResolvedValue({ preferred_volume: 45 })
    class FakeAudioContext {
      destination = {}
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createGain() {
        return { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }
      }
      createOscillator() {
        return {
          frequency: { value: 0 },
          connect: (target) => target,
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
        }
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext)
    render(<MusicPlayer open onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play music' }))
    expect(await screen.findByRole('button', { name: 'Pause music' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next track' }))
    expect(await screen.findByTitle('Night Carriage')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pause music' }))
    expect(screen.getByRole('button', { name: 'Play music' })).toBeInTheDocument()
  })
})

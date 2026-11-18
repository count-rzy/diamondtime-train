import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TrainAudioProvider, TrainSoundStatus } from './TrainAudio'
import { TrainAudioEngine } from './train-audio'
import { api } from './api'

vi.mock('./api', () => ({ api: { get: vi.fn(), patch: vi.fn() } }))
vi.mock('./train-audio', () => ({
  TrainAudioEngine: vi.fn(
    class {
      start = vi.fn().mockResolvedValue(true)
      configure = vi.fn()
      close = vi.fn().mockResolvedValue()
      suspend = vi.fn().mockResolvedValue()
    },
  ),
}))
const preferences = {
  language: 'en',
  ambience_enabled: true,
  ambience_volume: 30,
  ambience_muted: false,
}
beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(async (path) =>
    path === '/settings/' ? preferences : { results: [] },
  )
  api.patch.mockImplementation(async (_, values) => ({ ...preferences, ...values }))
})
describe('browser audio authorization and cleanup', () => {
  it('starts only from the sound control and permits retry after a rejected resume', async () => {
    const view = render(
      <TrainAudioProvider>
        <TrainSoundStatus />
      </TrainAudioProvider>,
    )
    await screen.findByRole('button', { name: 'Enable train sounds' })
    const engine = TrainAudioEngine.mock.results.at(-1).value
    expect(engine.start).not.toHaveBeenCalled()
    fireEvent.pointerDown(window)
    fireEvent.keyDown(window, { key: 'a' })
    expect(engine.start).not.toHaveBeenCalled()
    engine.start.mockRejectedValueOnce(new Error('NotAllowedError'))
    fireEvent.click(screen.getByRole('button', { name: 'Enable train sounds' }))
    await screen.findByText(/Audio is unavailable/)
    expect(engine.start).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Enable train sounds' }))
    await screen.findByText('Train sounds on')
    expect(engine.start).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(engine.close).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(window)
    expect(engine.start).toHaveBeenCalledTimes(2)
  })
  it('updates ambience independently and refreshes journey transitions', async () => {
    render(
      <TrainAudioProvider>
        <TrainSoundStatus />
      </TrainAudioProvider>,
    )
    await screen.findByRole('button', { name: 'Enable train sounds' })
    fireEvent.click(screen.getByRole('button', { name: 'Enable train sounds' }))
    await screen.findByText('Train sounds on')
    fireEvent.click(screen.getByRole('button', { name: 'Mute train ambience' }))
    await screen.findByText('Train sounds muted')
    expect(api.patch).toHaveBeenCalledWith('/settings/', {
      ambience_enabled: true,
      ambience_muted: true,
    })
    const engine = TrainAudioEngine.mock.results.at(-1).value
    api.get.mockResolvedValue({ results: [{ id: 7, status: 'paused' }] })
    fireEvent(window, new Event('lasttrain:journey-updated'))
    await waitFor(() =>
      expect(engine.configure).toHaveBeenLastCalledWith(
        { id: 7, status: 'paused' },
        expect.objectContaining({ ambience_muted: true }),
      ),
    )
    api.get.mockRejectedValue(new Error('Failed to fetch'))
    fireEvent(window, new Event('lasttrain:journey-updated'))
    await screen.findByText(/Audio is unavailable/)
    expect(engine.suspend).toHaveBeenCalledTimes(1)
  })
})

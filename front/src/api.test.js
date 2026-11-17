import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('Local API CSRF handshake', () => {
  it('uses the CSRF token returned by the API when its cookie is not readable', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ csrf_token: 'csrf-from-api' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access: 'access', user: { id: 1 } }),
      })
    vi.stubGlobal('fetch', fetch)
    const { api } = await import('./api')
    await api.post('/journeys/', { title: 'Local journey' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][1].headers['X-CSRFToken']).toBe('csrf-from-api')
    expect(fetch.mock.calls[1][1].credentials).toBe('same-origin')
  })
})

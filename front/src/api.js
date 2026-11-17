import { apiError, getLanguage } from './i18n'
const base = '/api'
let csrfToken = null
let csrfPromise = null
async function parse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(apiError(data))
  return data
}
async function csrf() {
  if (!csrfToken) {
    csrfPromise ||= fetch(`${base}/auth/csrf/`, { credentials: 'same-origin' })
      .then(parse)
      .then((data) => {
        csrfToken = data.csrf_token
      })
      .finally(() => {
        csrfPromise = null
      })
    await csrfPromise
  }
}
export const api = {
  async request(path, options = {}) {
    const method = options.method || 'GET'
    if (method !== 'GET') await csrf()
    return parse(
      await fetch(`${base}${path}`, {
        ...options,
        credentials: 'same-origin',
        headers: {
          'Accept-Language': getLanguage(),
          ...(options.body && !(options.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(method !== 'GET' ? { 'X-CSRFToken': csrfToken } : {}),
          ...options.headers,
        },
      }),
    )
  },
  get: (path) => api.request(path),
  post: async (path, data) => {
    const result = await api.request(path, { method: 'POST', body: JSON.stringify(data) })
    if (path.startsWith('/journeys/')) window.dispatchEvent(new Event('lasttrain:journey-updated'))
    return result
  },
  patch: (path, data) => api.request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => api.request(path, { method: 'DELETE' }),
  upload: (path, file) => {
    const body = new FormData()
    body.append('file', file)
    return api.request(path, { method: 'POST', body })
  },
  restore: () => api.get('/me/'),
}

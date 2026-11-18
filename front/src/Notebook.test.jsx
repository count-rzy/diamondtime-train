import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Notebook from './Notebook'
import { api } from './api'

vi.mock('./api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

const journey = { id: 4, title: 'Night train', status: 'active' }
const entry = {
  id: 9,
  journey: 4,
  journey_title: 'Night train',
  title: 'Window',
  content: 'First note',
  created_at: '2026-11-18T10:00:00Z',
  updated_at: '2026-11-18T10:00:00Z',
}

describe('carriage notebook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ results: [entry], next: null })
  })

  it('creates and edits entries using the diary API and restores focus', async () => {
    api.post.mockResolvedValue({ ...entry, id: 10, title: 'New page', content: 'Привет' })
    api.patch.mockResolvedValue({ ...entry, content: 'Updated' })
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(<Notebook journey={journey} onClose={onClose} />)
    await screen.findByRole('button', { name: /Window/ })
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'New page' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Your reflection' }), {
      target: { value: 'Привет' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/diary/', {
        title: 'New page',
        content: 'Привет',
        journey: 4,
      }),
    )
    await screen.findByText('Entry saved.')
    fireEvent.click(screen.getByRole('button', { name: /Window/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Your reflection' }), {
      target: { value: 'Updated' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/diary/9/',
        expect.objectContaining({ content: 'Updated' }),
      ),
    )
    await screen.findByText('Entry saved.')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('keeps unsaved text when saving fails', async () => {
    api.post.mockRejectedValue(new Error('Offline'))
    render(<Notebook journey={journey} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Draft' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Your reflection' }), {
      target: { value: 'Keep me' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    await screen.findByText('Offline')
    expect(screen.getByRole('textbox', { name: 'Your reflection' })).toHaveValue('Keep me')
  })

  it('deletes an entry only after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    api.delete.mockResolvedValue({})
    render(<Notebook journey={journey} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Window/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Window' }))
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Window' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/diary/9/'))
    vi.restoreAllMocks()
  })
})

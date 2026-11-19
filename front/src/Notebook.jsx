import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, Plus, Search, Trash2, X } from 'lucide-react'
import { api } from './api'
import { formatDate, t, useLanguage } from './i18n'

const blank = (journey) => ({ title: '', content: '', journey: journey?.id || '' })
const pagePath = (url) => {
  if (!url) return null
  const parsed = new URL(url, window.location.origin)
  return parsed.pathname.replace(/^\/api/, '') + parsed.search
}

export default function Notebook({ journey, onClose }) {
  useLanguage()
  const [entries, setEntries] = useState([])
  const [next, setNext] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(() => blank(journey))
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const dialog = useRef(null)
  const opener = useRef(document.activeElement)
  const requestId = useRef(0)

  async function load(path, append = false) {
    const current = ++requestId.current
    setLoading(true)
    try {
      const data = await api.get(path)
      if (current !== requestId.current) return
      setEntries((old) => (append ? [...old, ...data.results] : data.results))
      setNext(pagePath(data.next))
      setError('')
    } catch (failure) {
      if (current === requestId.current) setError(failure.message)
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(
      () => load(`/diary/${search ? `?search=${encodeURIComponent(search)}` : ''}`),
      250,
    )
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const previous = document.activeElement
    const shell = document.querySelector('.app-shell')
    const scene = document.querySelector('.compartment')
    const sidebar = shell?.querySelector('.sidebar')
    const header = shell?.querySelector('.mobile-header')
    const radio = shell?.querySelector('.music-player')
    const siblings = [scene, sidebar, header, radio].filter(Boolean)
    siblings.forEach((element) => {
      element.inert = true
    })
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector('input')?.focus()
    return () => {
      siblings.forEach((element) => {
        element.inert = false
      })
      document.body.style.overflow = ''
      opener.current?.focus?.() || previous?.focus?.()
    }
  }, [])

  useEffect(() => {
    if (!dirty) return
    const guard = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])

  function close() {
    if (busy) return
    if (dirty && !window.confirm(t('ui.discard_your_unsaved_changes'))) return
    onClose()
  }

  useEffect(() => {
    const escape = (event) => {
      if (event.key !== 'Escape') return
      if (document.fullscreenElement) return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [busy, dirty, onClose])

  function choose(entry) {
    if (busy || (dirty && !window.confirm(t('ui.discard_your_unsaved_changes')))) return
    setSelected(entry)
    setDraft(
      entry
        ? { title: entry.title, content: entry.content, journey: entry.journey }
        : blank(journey),
    )
    setDirty(false)
    setError('')
    setNotice('')
    dialog.current?.querySelector('.notebook-title')?.focus()
  }

  function change(field, value) {
    setDraft((old) => ({ ...old, [field]: value }))
    setDirty(true)
    setNotice('')
  }

  async function save(event) {
    event.preventDefault()
    if (!draft.journey || busy) return
    setBusy(true)
    setError('')
    try {
      const payload = { title: draft.title, content: draft.content, journey: Number(draft.journey) }
      const saved = selected
        ? await api.patch(`/diary/${selected.id}/`, payload)
        : await api.post('/diary/', payload)
      setSelected(saved)
      setDraft({ title: saved.title, content: saved.content, journey: saved.journey })
      setDirty(false)
      setNotice(t('ui.entry_saved'))
      await load(`/diary/${search ? `?search=${encodeURIComponent(search)}` : ''}`)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!selected || busy || !window.confirm(t('diary.delete_confirm', { title: selected.title })))
      return
    setBusy(true)
    setError('')
    try {
      await api.delete(`/diary/${selected.id}/`)
      setSelected(null)
      setDraft(blank(journey))
      setDirty(false)
      setNotice(t('ui.entry_deleted'))
      await load(`/diary/${search ? `?search=${encodeURIComponent(search)}` : ''}`)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  function keyDown(event) {
    if (event.key !== 'Tab') return
    const focusable = [...dialog.current.querySelectorAll('button,input,textarea')].filter(
      (item) => !item.disabled && !item.closest('[hidden]'),
    )
    const first = focusable[0],
      last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div
      className="notebook-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={dialog}
        className="notebook-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('notebook.title')}
        onKeyDown={keyDown}
      >
        <div className="notebook-toolbar">
          <span>
            <BookOpen size={18} /> {t('notebook.title')}
          </span>
          <button type="button" onClick={close} aria-label={t('ui.close_editor')}>
            <X size={19} />
          </button>
        </div>
        <div className="notebook-book">
          <aside className="notebook-page notebook-index">
            <label className="notebook-search">
              <Search size={15} />
              <input
                aria-label={t('ui.search_diary_entries')}
                placeholder={t('ui.search_your_notes')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="notebook-new"
              onClick={() => choose(null)}
              disabled={!journey}
            >
              <Plus size={15} /> {t('ui.new_entry')}
            </button>
            <div className="notebook-list" aria-label={t('ui.diary_entries')}>
              {entries.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={selected?.id === entry.id ? 'selected' : ''}
                  onClick={() => choose(entry)}
                >
                  <strong>{entry.title}</strong>
                  <small>
                    {formatDate(entry.created_at)} · {entry.journey_title}
                  </small>
                </button>
              ))}
              {!entries.length && !loading && <p>{t('ui.no_notes_found')}</p>}
              {next && (
                <button type="button" onClick={() => load(next, true)} disabled={loading}>
                  {t('notebook.older')}
                </button>
              )}
            </div>
          </aside>
          <form className="notebook-page notebook-writing" onSubmit={save}>
            <div className="notebook-page-top">
              <span>{selected ? formatDate(selected.created_at, true) : t('ui.a_new_page')}</span>
              <span>{selected?.journey_title || journey?.title || ''}</span>
            </div>
            <input
              className="notebook-title"
              aria-label={t('ui.title')}
              placeholder={t('ui.what_happened_today')}
              value={draft.title}
              onChange={(event) => change('title', event.target.value)}
              maxLength={120}
              required
              disabled={!draft.journey}
            />
            <textarea
              className="notebook-content"
              aria-label={t('ui.your_reflection')}
              placeholder={t('ui.the_view_from_your_window')}
              value={draft.content}
              onChange={(event) => change('content', event.target.value)}
              maxLength={10000}
              required
              disabled={!draft.journey}
            />
            <div className="notebook-footer">
              <span role="status">
                {error ||
                  notice ||
                  (busy
                    ? t('ui.saving')
                    : dirty
                      ? t('notebook.unsaved')
                      : selected
                        ? `${t('ui.updated')} ${formatDate(selected.updated_at, true)}`
                        : '')}
              </span>
              {selected && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  aria-label={t('diary.delete', { title: selected.title })}
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button type="submit" disabled={busy || !draft.journey || !dirty}>
                <Check size={16} /> {t('ui.save_entry')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function OverlayFrame({ title, onClose, children, kind = '' }) {
  const dialog = useRef(null)
  const close = useRef(null)
  useEffect(() => {
    const opener = document.activeElement
    const background = [
      document.querySelector('.sidebar'),
      document.querySelector('.mobile-header'),
      document.querySelector('.compartment'),
      document.querySelector('.content:not(:has(.compartment))'),
    ].filter(Boolean)
    const previous = background.map((element) => element.inert)
    const scroll = document.querySelector('.shell-main')
    const oldBodyOverflow = document.body.style.overflow
    const oldShellOverflow = scroll?.style.overflow
    background.forEach((element) => {
      element.inert = true
    })
    document.body.style.overflow = 'hidden'
    if (scroll) scroll.style.overflow = 'hidden'
    close.current?.focus()
    return () => {
      background.forEach((element, index) => {
        element.inert = previous[index]
      })
      document.body.style.overflow = oldBodyOverflow
      if (scroll) scroll.style.overflow = oldShellOverflow
      opener?.focus?.()
    }
  }, [])

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      // The first Escape exits fullscreen; preserve this dialog and any draft.
      if (document.fullscreenElement) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    if (event.key !== 'Tab') return
    const items = [
      ...dialog.current.querySelectorAll('a,button,input,select,textarea,[tabindex="0"]'),
    ].filter((item) => !item.disabled && item.getClientRects().length)
    const first = items[0],
      last = items.at(-1)
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
      className="object-overlay-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialog}
        className={`object-overlay-dialog ${kind}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
      >
        <div className="object-overlay-toolbar">
          <strong>{title}</strong>
          <button ref={close} type="button" onClick={onClose} aria-label={`Close ${title}`}>
            <X size={19} />
          </button>
        </div>
        <div className="object-overlay-scroll">{children}</div>
      </section>
    </div>
  )
}

import { t, useLanguage, formatDate, formatDuration, translateMessage } from './i18n'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { api } from './api'
import DataManagement from './DataManagement'
import { getLanguage, setLanguage, formatNumber } from './i18n'
import { useTrainAudio } from './TrainAudio'
import { useAuth } from './Auth'
import { formatTime } from './journey'

export function DiaryPage() {
  useLanguage()

  const [entries, setEntries] = useState([])
  const [next, setNext] = useState(null)
  const [journeys, setJourneys] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({ title: '', content: '', journey: '' })
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const modalRef = useRef(null)
  const dirtyRef = useRef(false)
  async function load(query = '', path = null, append = false) {
    setLoading(true)
    try {
      const data = await api.get(
        path || `/diary/${query ? `?search=${encodeURIComponent(query)}` : ''}`,
      )
      setEntries((old) => (append ? [...old, ...data.results] : data.results))
      setNext(
        data.next
          ? new URL(data.next).pathname.replace('/api', '') + new URL(data.next).search
          : null,
      )
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    let cancelled = false
    async function loadJourneyChoices() {
      try {
        let path = '/journeys/'
        const choices = []
        while (path) {
          const page = await api.get(path)
          choices.push(...page.results)
          path = page.next
            ? new URL(page.next, window.location.origin).pathname.replace(/^\/api/, '') +
              new URL(page.next, window.location.origin).search
            : null
        }
        if (!cancelled) setJourneys(choices)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    loadJourneyChoices()
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    const id = setTimeout(() => load(search), 300)
    return () => clearTimeout(id)
  }, [search])
  useEffect(() => {
    if (!dirty) return
    const guard = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  useEffect(() => {
    if (!editing) return
    const previous = document.activeElement
    const dialog = modalRef.current
    dialog?.querySelector('select')?.focus()
    function onKey(event) {
      if (event.key === 'Escape') {
        if (!dirtyRef.current || window.confirm(t('ui.discard_your_unsaved_changes'))) {
          setEditing(null)
          setDirty(false)
        }
      }
      if (event.key === 'Tab' && dialog) {
        const controls = [...dialog.querySelectorAll('button,input,textarea,select')].filter(
          (element) => !element.disabled,
        )
        if (event.shiftKey && document.activeElement === controls[0]) {
          event.preventDefault()
          controls.at(-1)?.focus()
        } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
          event.preventDefault()
          controls[0]?.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [editing])
  function open(entry = null) {
    if (dirty && !window.confirm(t('ui.discard_your_unsaved_changes'))) return
    setEditing(entry?.id || 'new')
    setDraft(
      entry
        ? { title: entry.title, content: entry.content, journey: String(entry.journey) }
        : { title: '', content: '', journey: String(journeys[0]?.id || '') },
    )
    setDirty(false)
    setNotice('')
  }
  function close() {
    if (dirty && !window.confirm(t('ui.discard_your_unsaved_changes'))) return
    setEditing(null)
    setDirty(false)
  }
  function change(key, value) {
    setDraft((old) => ({ ...old, [key]: value }))
    setDirty(true)
  }
  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = { ...draft, journey: Number(draft.journey) }
      if (editing === 'new') await api.post('/diary/', payload)
      else await api.patch(`/diary/${editing}/`, payload)
      setEditing(null)
      setDirty(false)
      setNotice(t('ui.entry_saved'))
      await load(search)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  async function remove(entry) {
    if (!window.confirm(t('diary.delete_confirm', { title: entry.title }))) return
    try {
      await api.delete(`/diary/${entry.id}/`)
      setNotice(t('ui.entry_deleted'))
      await load(search)
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('ui.words_from_the_road')}</span>
          <h1>
            {t('ui.travel_diary')}
            <span className="heading-star">✦</span>
          </h1>
          <p>{t('ui.the_thoughts_you_collect_along_the_way_are_part_of_the_journey')}</p>
        </div>
        <button className="button secondary" onClick={() => open()} disabled={!journeys.length}>
          <Plus size={16} />
          {t('ui.new_entry')}{' '}
        </button>
      </div>
      {notice && (
        <p className="success-box" role="status">
          {translateMessage(notice)}
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {translateMessage(error)}
        </p>
      )}
      <div className="diary-search input-icon">
        <Search size={17} />
        <input
          aria-label={t('ui.search_diary_entries')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('ui.search_your_notes')}
        />
      </div>
      {editing && (
        <div className="modal-backdrop">
          <div
            ref={modalRef}
            className="panel diary-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editing === 'new' ? t('ui.new_diary_entry') : t('ui.edit_diary_entry')}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{t('ui.field_notes')}</span>
                <h2>{editing === 'new' ? t('ui.a_new_page') : t('ui.edit_this_page')}</h2>
              </div>
              <button className="icon-button" onClick={close} aria-label={t('ui.close_editor')}>
                <X size={20} />
              </button>
            </div>
            <form className="form-stack" onSubmit={save}>
              <label>
                <span>{t('ui.journey')}</span>
                <select
                  value={draft.journey}
                  onChange={(event) => change('journey', event.target.value)}
                  required
                >
                  {journeys.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('ui.title')}</span>
                <input
                  value={draft.title}
                  onChange={(event) => change('title', event.target.value)}
                  maxLength="120"
                  required
                  placeholder={t('ui.what_happened_today')}
                />
              </label>
              <label>
                <span>{t('ui.your_reflection')}</span>
                <textarea
                  value={draft.content}
                  onChange={(event) => change('content', event.target.value)}
                  maxLength="10000"
                  required
                  rows="8"
                  placeholder={t('ui.the_view_from_your_window')}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="button subtle" onClick={close}>
                  {t('ui.cancel')}{' '}
                </button>
                <button className="button primary" disabled={busy}>
                  {busy ? t('ui.saving') : t('ui.save_entry')} <Check size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {entries.length ? (
        <div className="diary-grid">
          {entries.map((entry) => (
            <article className="panel diary-entry" key={entry.id}>
              <div className="entry-top">
                <span className="eyebrow">
                  {entry.journey_title} · {formatDate(entry.created_at)}
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label={t('diary.edit', { title: entry.title })}
                    onClick={() => open(entry)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t('diary.delete', { title: entry.title })}
                    onClick={() => remove(entry)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <h2>{entry.title}</h2>
              <p>{entry.content}</p>
              <small>
                {t('ui.updated')} {formatDate(entry.updated_at, true)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        !loading && (
          <div className="panel empty-state">
            <BookOpen size={32} />
            <h2>{search ? t('ui.no_notes_found') : t('ui.an_empty_page_full_of_possibility')}</h2>
            <p>
              {search
                ? t('ui.try_a_different_search')
                : journeys.length
                  ? t('ui.write_a_note_from_your_journey')
                  : t('ui.start_a_journey_to_open_your_diary')}
            </p>
            {journeys.length ? (
              <button className="button primary" onClick={() => open()}>
                {t('ui.write_an_entry')} <ArrowRight size={16} />
              </button>
            ) : (
              <Link className="button primary" to="/journeys/new">
                {t('ui.begin_a_journey')}{' '}
              </Link>
            )}
          </div>
        )
      )}
      {loading && <p className="muted">{t('ui.opening_your_journal')}</p>}
      {next && !loading && (
        <button className="button secondary load-more" onClick={() => load(search, next, true)}>
          {t('ui.load_more_entries')}{' '}
        </button>
      )}
    </>
  )
}

function Metric({ label, value, detail }) {
  return (
    <div className="panel metric">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

export function StatisticsPage() {
  useLanguage()

  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api
      .get('/statistics/')
      .then(setStats)
      .catch((err) => setError(err.message))
  }, [])
  const hours = formatDuration
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('ui.your_journey_in_numbers')}</span>
          <h1>
            {t('ui.miles_traveled')}
            <span className="heading-star">✦</span>
          </h1>
          <p>{t('ui.a_little_perspective_on_how_far_you_ve_come')}</p>
        </div>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {translateMessage(error)}
        </p>
      )}
      {!stats ? (
        <p className="muted">{t('ui.gathering_your_journey_records')}</p>
      ) : stats.total_journeys === 0 ? (
        <div className="panel empty-state">
          <h2>{t('ui.every_record_starts_at_zero')}</h2>
          <p>{t('ui.begin_a_journey_and_this_page_will_grow_with_you')}</p>
          <Link to="/journeys/new" className="button primary">
            {t('ui.create_a_journey')}{' '}
          </Link>
        </div>
      ) : (
        <>
          <div className="metrics-grid">
            <Metric
              label={t('ui.total_journeys')}
              value={formatNumber(stats.total_journeys)}
              detail={t('ui.every_departure_counts')}
            />
            <Metric
              label={t('ui.completed')}
              value={formatNumber(stats.completed_journeys)}
              detail={t('ui.destinations_reached')}
            />
            <Metric
              label={t('ui.active')}
              value={formatNumber(stats.active_journeys)}
              detail={t('ui.trains_on_the_line')}
            />
            <Metric
              label={t('ui.diary_entries')}
              value={formatNumber(stats.diary_entries)}
              detail={t('ui.moments_remembered')}
            />
          </div>
          <div className="stats-columns">
            <section className="panel chart-panel">
              <span className="eyebrow">{t('ui.at_a_glance')}</span>
              <h2>{t('ui.time_on_the_tracks')}</h2>
              <div className="bar-row">
                <div>
                  <span>{t('ui.total_travel_time')}</span>
                  <strong>{formatTime(stats.total_travel_seconds)}</strong>
                </div>
                <div className="chart-track">
                  <span style={{ width: '100%' }} />
                </div>
              </div>
              <div className="bar-row">
                <div>
                  <span>{t('ui.completed_travel_time')}</span>
                  <strong>{formatTime(stats.completed_travel_seconds)}</strong>
                </div>
                <div className="chart-track gold">
                  <span
                    style={{
                      width: `${stats.total_travel_seconds ? (stats.completed_travel_seconds / stats.total_travel_seconds) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="chart-foot">
                <div>
                  <small>{t('ui.average_journey')}</small>
                  <strong>{hours(Math.round(stats.average_duration_minutes))}</strong>
                </div>
                <div>
                  <small>{t('ui.completion_rate')}</small>
                  <strong>{formatNumber(stats.completion_rate)}%</strong>
                </div>
              </div>
            </section>
            <section className="panel activity-panel">
              <span className="eyebrow">{t('ui.latest_miles')}</span>
              <h2>{t('ui.recent_activity')}</h2>
              {stats.recent_activity.map((item, i) => (
                <div className="activity-item" key={i}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.type === 'diary' ? t('ui.diary_entry') : t('ui.journey')} ·{' '}
                      {formatDate(item.at)}
                    </small>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </>
  )
}

export function SettingsPage() {
  useLanguage()
  const trainAudio = useTrainAudio()

  const { user, updateUser } = useAuth()
  const [settings, setSettings] = useState(null)
  const [profile, setProfile] = useState({
    first_name: user?.first_name || '',
    email: user?.email || '',
  })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api
      .get('/settings/')
      .then(setSettings)
      .catch((err) => setError(err.message))
  }, [])
  async function saveProfile(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api.patch('/me/', profile)
      updateUser(data)
      setNotice(t('ui.profile_saved'))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  async function changeSetting(key, value) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    if (key === 'language') setLanguage(value)
    setError('')
    try {
      const data = await api.patch('/settings/', { [key]: value })
      setSettings(data)
      window.dispatchEvent(new CustomEvent('lasttrain:settings-updated', { detail: data }))
      setNotice(t('ui.preferences_saved'))
    } catch (err) {
      setSettings(settings)
      if (key === 'language') setLanguage(settings.language || 'ru')
      setError(err.message)
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('ui.make_it_yours')}</span>
          <h1>
            {t('ui.settings')}
            <span className="heading-star">✦</span>
          </h1>
          <p>{t('ui.a_few_comforts_for_the_road_ahead')}</p>
        </div>
      </div>
      {notice && (
        <p className="success-box" role="status">
          {translateMessage(notice)}
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {translateMessage(error)}
        </p>
      )}
      <div className="settings-grid">
        <section className="panel">
          <span className="eyebrow">{t('ui.your_profile')}</span>
          <h2>{t('ui.traveler_details')}</h2>
          <form className="form-stack" onSubmit={saveProfile}>
            <label>
              <span>{t('ui.username')}</span>
              <input value={user?.username || ''} disabled />
            </label>
            <label>
              <span>{t('ui.display_name')}</span>
              <input
                value={profile.first_name}
                onChange={(event) =>
                  setProfile((old) => ({ ...old, first_name: event.target.value }))
                }
                maxLength="150"
                placeholder={t('ui.what_should_we_call_you')}
              />
            </label>
            <label>
              <span>{t('ui.email')}</span>
              <input
                type="email"
                value={profile.email}
                onChange={(event) => setProfile((old) => ({ ...old, email: event.target.value }))}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {t('ui.save_profile')} <Check size={16} />
            </button>
          </form>
          <DataManagement />
        </section>
        <section className="panel">
          <span className="eyebrow">{t('ui.your_experience')}</span>
          <h2>{t('ui.onboard_comforts')}</h2>
          {settings ? (
            <div className="preferences">
              <label className="toggle-row">
                <span>
                  <strong>{t('language.label')}</strong>
                  <small>{t('language.hint')}</small>
                </span>
                <select
                  aria-label={t('language.label')}
                  value={getLanguage()}
                  onChange={(event) => changeSetting('language', event.target.value)}
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </label>
              <section className="audio-preferences">
                <h3>{t('audio.section')}</h3>
                <p>{t('audio.hint')}</p>
                {['ambience_enabled', 'ambience_muted', 'train_horn', 'weather_sounds'].map(
                  (key, index) => (
                    <label className="toggle-row" key={key}>
                      <span>
                        <strong>
                          {t(['audio.enabled', 'audio.mute', 'audio.horn', 'audio.weather'][index])}
                        </strong>
                      </span>
                      <input
                        type="checkbox"
                        checked={!!settings[key]}
                        onChange={(event) => changeSetting(key, event.target.checked)}
                      />
                    </label>
                  ),
                )}
                <label className="volume-setting">
                  <span>
                    <strong>{t('audio.volume')}</strong>
                  </span>
                  <input
                    aria-label={t('audio.volume')}
                    type="range"
                    min="0"
                    max="100"
                    value={settings.ambience_volume ?? 30}
                    onChange={(event) =>
                      setSettings((old) => ({
                        ...old,
                        ambience_volume: Number(event.target.value),
                      }))
                    }
                    onPointerUp={(event) =>
                      changeSetting('ambience_volume', Number(event.currentTarget.value))
                    }
                    onKeyUp={(event) =>
                      changeSetting('ambience_volume', Number(event.currentTarget.value))
                    }
                  />
                  <output>{settings.ambience_volume ?? 30}%</output>
                </label>
                {trainAudio && trainAudio.state !== 'active' && (
                  <button className="button secondary" onClick={trainAudio.unlock}>
                    {t('audio.unlock')}
                  </button>
                )}
                {trainAudio?.state === 'unavailable' && (
                  <p role="alert">{t('audio.unavailable')}</p>
                )}
              </section>
              <label className="toggle-row">
                <span>
                  <strong>{t('ui.visual_atmosphere')}</strong>
                  <small>{t('ui.follow_the_journey_or_keep_your_favorite_light')}</small>
                </span>
                <select
                  aria-label={t('ui.visual_atmosphere')}
                  value={settings.atmosphere || 'journey'}
                  onChange={(e) => changeSetting('atmosphere', e.target.value)}
                >
                  {['journey', 'dawn', 'morning', 'afternoon', 'sunset', 'twilight', 'night'].map(
                    (value) => (
                      <option key={value} value={value}>
                        {t('atmosphere.' + value)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="toggle-row">
                <span>
                  <strong>{t('ui.crisp_pixels')}</strong>
                  <small>{t('ui.nearest_neighbor_artwork_rendering')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.crisp_pixels !== false}
                  onChange={(e) => changeSetting('crisp_pixels', e.target.checked)}
                />
              </label>

              <label className="toggle-row">
                <span>
                  <strong>{t('ui.reduce_motion')}</strong>
                  <small>{t('ui.keep_the_scenery_still_and_comfortable')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.reduced_motion}
                  onChange={(event) => changeSetting('reduced_motion', event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>
                  <strong>{t('ui.ambient_particles')}</strong>
                  <small>{t('ui.show_fireflies_and_little_lights_in_the_landscape')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.ambient_particles}
                  onChange={(event) => changeSetting('ambient_particles', event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>
                  <strong>{t('ui.weather_effects')}</strong>
                  <small>{t('ui.show_rain_across_the_carriage_windows')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.weather_effects}
                  onChange={(event) => changeSetting('weather_effects', event.target.checked)}
                />
              </label>
              <label className="toggle-row">
                <span>
                  <strong>{t('ui.animation_intensity')}</strong>
                  <small>{t('ui.choose_the_pace_of_moving_scenery')}</small>
                </span>
                <select
                  value={settings.animation_intensity}
                  onChange={(event) => changeSetting('animation_intensity', event.target.value)}
                >
                  <option value="full">{t('ui.full')}</option>
                  <option value="gentle">{t('ui.gentle')}</option>
                </select>
              </label>
              <label className="volume-setting">
                <span>
                  <strong>{t('ui.default_music_volume')}</strong>
                  <small>{t('ui.applied_when_you_open_the_player')}</small>
                </span>
                <input
                  aria-label={t('ui.default_music_volume')}
                  type="range"
                  min="0"
                  max="100"
                  value={settings.preferred_volume}
                  onChange={(event) =>
                    setSettings((old) => ({ ...old, preferred_volume: Number(event.target.value) }))
                  }
                  onPointerUp={() => changeSetting('preferred_volume', settings.preferred_volume)}
                  onKeyUp={() => changeSetting('preferred_volume', settings.preferred_volume)}
                />
                <output>{settings.preferred_volume}%</output>
              </label>
            </div>
          ) : (
            <p className="muted">{t('ui.loading_preferences')}</p>
          )}
        </section>
      </div>
    </>
  )
}

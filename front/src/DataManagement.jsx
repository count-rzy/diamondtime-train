import { t, useLanguage, translateMessage, plural } from './i18n'
import { useEffect, useState } from 'react'
import { api } from './api'

export default function DataManagement() {
  useLanguage()

  const [data, setData] = useState(null)
  const [profiles, setProfiles] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api
      .get('/local/data/')
      .then(setData)
      .catch((err) => setMessage(err.message))
    api
      .get('/local/profiles/')
      .then(setProfiles)
      .catch((err) => setMessage(err.message))
  }, [])
  async function backup() {
    setBusy(true)
    try {
      const result = await api.post('/local/backup/', {})
      setMessage({
        key: 'data.backup_saved',
        values: { path: result.directory + '/' + result.filename },
      })
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }
  async function selectProfile(id) {
    if (
      !window.confirm(t('ui.open_this_stored_profile_all_existing_journeys_and_notes_will_be_kept'))
    )
      return
    try {
      await api.post('/local/profiles/', { id: Number(id) })
      window.location.assign('/dashboard')
    } catch (err) {
      setMessage(err.message)
    }
  }
  return (
    <section className="data-management">
      <span className="eyebrow">{t('ui.local_edition')}</span>
      <h2>{t('ui.your_data')}</h2>
      <p>
        {t('ui.stored_on_this_computer')} <code>{data?.directory || t('ui.loading')}</code>
      </p>
      <button className="button secondary" disabled={busy} onClick={backup}>
        {busy ? t('ui.creating_backup') : t('ui.create_backup')}
      </button>
      <a className="button secondary" href="/api/local/export/" download>
        {t('ui.export_journeys_diary')}{' '}
      </a>
      <p>
        {t('ui.to_restore_stop_last_train_run')} <code>restore.bat</code>
        {t('ui.select_a_backup_zip_and_type_restore_a_safety_backup_is_kept')}{' '}
      </p>
      <p>{t('ui.keep_a_backup_outside_this_project_before_replacing_or_deleting_its_folder')}</p>
      {profiles?.profiles.length > 1 && (
        <label>
          <strong>{t('ui.stored_profiles')}</strong>
          <p>
            {t(
              'ui.previous_accounts_were_preserved_select_whose_records_to_open_no_password_is_needed_on_this_computer',
            )}{' '}
          </p>
          <select
            aria-label={t('ui.stored_profiles')}
            value={profiles.selected}
            onChange={(event) => selectProfile(event.target.value)}
          >
            {profiles.profiles.map((item) => (
              <option key={item.id} value={item.id}>
                {t('data.profile_records', {
                  name: item.name,
                  journeys: plural('count.journeys', item.journeys),
                  notes: plural('count.notes', item.diary),
                })}
              </option>
            ))}
          </select>
        </label>
      )}
      {message && (
        <p role="status">
          {typeof message === 'object' ? t(message.key, message.values) : translateMessage(message)}
        </p>
      )}
    </section>
  )
}

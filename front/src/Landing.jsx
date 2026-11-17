import { t, useLanguage } from './i18n'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from './Auth'
import Compartment from './Compartment'

export default function Landing() {
  useLanguage()

  const { user } = useAuth()
  return (
    <main className="landing living-landing">
      <header className="landing-header">
        <Link to="/" className="brand">
          ✦ LAST TRAIN
        </Link>
        <nav>
          <a href="#the-journey">{t('ui.the_journey_2')}</a>
          <Link to={user ? '/dashboard' : '/login'}>
            {user ? t('ui.my_carriage') : t('ui.sign_in')}
          </Link>
          <Link className="button primary small" to={user ? '/dashboard' : '/register'}>
            {user ? t('ui.enter_carriage') : t('ui.get_started')}
          </Link>
        </nav>
      </header>
      <section className="landing-carriage" aria-label={t('ui.a_glimpse_inside_last_train')}>
        <Compartment preview progress={38} settings={{ ambient_particles: true }} />
        <div className="landing-intro">
          <span className="eyebrow">{t('ui.the_world_moves_when_you_do')}</span>
          <h1>
            {t('ui.find_your_focus')} <br />
            <em>
              {t('ui.somewhere')} <br />
              {t('ui.along_the_way')}{' '}
            </em>
          </h1>
          <p>
            {t(
              'ui.a_living_train_journey_for_the_time_you_choose_to_spend_well_set_your_destination_settle_in_and_let_the_miles_unfold',
            )}{' '}
          </p>
          <Link className="button primary" to={user ? '/dashboard' : '/register'}>
            {t('ui.take_your_seat_2')} <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <section id="the-journey" className="landing-features">
        <div>
          <span className="eyebrow">{t('ui.01_depart')}</span>
          <h2>{t('ui.choose_a_destination')}</h2>
          <p>
            {t(
              'ui.name_the_work_ahead_a_real_clock_starts_when_you_depart_and_your_train_travels_with_it',
            )}{' '}
          </p>
        </div>
        <div>
          <span className="eyebrow">{t('ui.02_travel')}</span>
          <h2>{t('ui.watch_the_world_change')}</h2>
          <p>
            {t(
              'ui.mountains_forests_weather_and_light_move_through_the_windows_as_you_make_progress',
            )}{' '}
          </p>
        </div>
        <div>
          <span className="eyebrow">{t('ui.03_arrive')}</span>
          <h2>{t('ui.keep_your_story')}</h2>
          <p>
            {t(
              'ui.write_in_your_travel_journal_and_revisit_every_mile_when_your_train_reaches_the_station',
            )}{' '}
          </p>
        </div>
      </section>
      <footer className="landing-footer">
        ✦ LAST TRAIN <span>{t('ui.made_for_the_miles_that_matter')}</span>
      </footer>
    </main>
  )
}

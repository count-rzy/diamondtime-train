import { t, useLanguage } from './i18n'
import {
  BrowserRouter,
  Navigate,
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  History,
  Home,
  Menu,
  MapPinned,
  Plus,
  Settings,
  TrainFront,
  X,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { AuthPage, AuthProvider, Protected, useAuth } from './Auth'
import { CreateJourney, HistoryPage } from './JourneyPages'
import Dashboard from './Dashboard'
import Atlas from './Atlas'
import { DiaryPage, StatisticsPage, SettingsPage } from './OtherPages'
import MusicPlayer from './MusicPlayer'
import Scene from './Scene'
import { TrainAudioProvider, TrainSoundStatus } from './TrainAudio'

const links = () => [
  { to: '/dashboard', icon: Home, text: t('ui.overview') },
  { to: '/journeys/new', icon: Plus, text: t('ui.new_journey') },
  { to: '/diary', icon: BookOpen, text: t('ui.travel_diary') },
  { to: '/atlas', icon: MapPinned, text: t('rail.atlas') },
  { to: '/statistics', icon: BarChart3, text: t('ui.statistics') },
  { to: '/history', icon: History, text: t('ui.journey_history') },
  { to: '/settings', icon: Settings, text: t('ui.settings') },
]

function Shell() {
  useLanguage()

  const { user } = useAuth()
  const location = useLocation()
  const immersive = location.pathname === '/dashboard'
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className={`app-shell ${immersive ? 'immersive-shell' : ''}`}>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-top">
          <Link to="/dashboard" className="brand" onClick={() => setMenuOpen(false)}>
            ✦ LAST TRAIN
          </Link>
          <button
            className="icon-button close-menu"
            aria-label={t('ui.close_menu')}
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-caption">{t('ui.the_journey')}</div>
        <nav aria-label={t('ui.main_navigation')}>
          {links().map(({ to, icon: Icon, text }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} strokeWidth={1.8} />
              {text}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <TrainSoundStatus />
          <div className="rail-note">
            <TrainFront size={22} />
            <span>
              {t('ui.one_quiet_mile')} <br />
              {t('ui.at_a_time')}{' '}
            </span>
          </div>
          <div className="user-chip">
            <div className="avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <div>
              <strong>{user?.first_name || user?.username}</strong>
              <small>{t('ui.traveler')}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="shell-main">
        <header className="mobile-header">
          <button
            className="icon-button"
            aria-label={t('ui.open_menu')}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          <Link to="/dashboard" className="brand">
            ✦ LAST TRAIN
          </Link>
        </header>
        <main className={`content ${immersive ? 'immersive-content' : ''}`}>
          <Outlet />
        </main>
        <MusicPlayer inWorld={immersive} />
      </div>
      {menuOpen && (
        <button
          aria-label={t('ui.close_menu')}
          className="menu-scrim"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  )
}

function NotFound() {
  useLanguage()

  return (
    <main className="not-found">
      <Scene progress={100} title={t('ui.end_of_the_line')} />
      <div>
        <span className="eyebrow">{t('ui.404_wrong_platform')}</span>
        <h1>{t('ui.this_train_doesn_t_stop_here')}</h1>
        <p>{t('ui.let_s_get_you_back_on_track')}</p>
        <Link to="/" className="button primary">
          {t('ui.return_home')}{' '}
        </Link>
      </div>
    </main>
  )
}

function AppRoutes() {
  useLanguage()

  const routes = [
    ['/dashboard', Dashboard],
    ['/journeys/new', CreateJourney],
    ['/diary', DiaryPage],
    ['/atlas', Atlas],
    ['/statistics', StatisticsPage],
    ['/history', HistoryPage],
    ['/settings', SettingsPage],
  ]
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route
        element={
          <Protected>
            <Shell />
          </Protected>
        }
      >
        {routes.map(([path, Page]) => (
          <Route key={path} path={path} element={<Page />} />
        ))}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  useLanguage()
  useEffect(() => {
    const visibility = () => {
      document.documentElement.dataset.hidden = String(document.hidden)
    }
    document.addEventListener('visibilitychange', visibility)
    visibility()
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <TrainAudioProvider>
          <AppRoutes />
        </TrainAudioProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

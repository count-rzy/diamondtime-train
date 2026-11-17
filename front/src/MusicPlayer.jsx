import { t, useLanguage, translateMessage } from './i18n'
import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ListMusic,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { api } from './api'

const ambient = () => [
  {
    title: t('ui.signal_lights'),
    artist: t('ui.last_train_ambient_original'),
    notes: [146.83, 220, 293.66],
    duration: 120,
  },
  {
    title: t('ui.night_carriage'),
    artist: t('ui.last_train_ambient_original'),
    notes: [110, 164.81, 220],
    duration: 120,
  },
  {
    title: t('ui.first_light'),
    artist: t('ui.last_train_ambient_original'),
    notes: [174.61, 261.63, 349.23],
    duration: 120,
  },
]

export default function MusicPlayer({ inWorld = false }) {
  useLanguage()

  const [expanded, setExpanded] = useState(false)
  const [playlist, setPlaylist] = useState('ambient')
  const [files, setFiles] = useState([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [volume, setVolume] = useState(45)
  const [muted, setMuted] = useState(false)
  const [repeat, setRepeat] = useState('all')
  const [position, setPosition] = useState(0)
  const [error, setError] = useState('')
  const engine = useRef({ context: null, nodes: [], media: null, started: 0, offset: 0 })
  const advanceRef = useRef(null)
  const filesRef = useRef([])
  const startGeneration = useRef(0)
  const tracks = playlist === 'ambient' ? ambient() : files
  const track = tracks[index]
  const duration = track?.duration || 0

  function stop() {
    startGeneration.current += 1
    const current = engine.current
    current.nodes.forEach((node) => {
      try {
        node.stop?.()
      } catch {
        /* already stopped */
      }
      try {
        node.disconnect()
      } catch {
        /* disconnected */
      }
    })
    current.nodes = []
    if (current.media) {
      current.media.onended = null
      current.media.onerror = null
      current.media.pause()
      current.media.removeAttribute('src')
      current.media.load()
      current.media = null
    }
    current.master?.disconnect()
    current.master = null
  }

  const start = (at = position) => startTrack(track, at)

  function pause() {
    const at =
      engine.current.media?.currentTime ??
      engine.current.offset + (performance.now() - engine.current.started) / 1000
    setPosition(duration ? Math.min(duration, at) : at)
    stop()
    setPlaying(false)
  }

  function advance(direction, ended = false) {
    if (!tracks.length) {
      stop()
      setPlaying(false)
      return
    }
    const next = ended && repeat === 'one' ? index : index + direction
    if (next >= tracks.length && repeat === 'off') {
      stop()
      setPlaying(false)
      setPosition(0)
      return
    }
    const target = (next + tracks.length) % tracks.length
    stop()
    setPosition(0)
    setIndex(target)
    if (playing || ended) startTrack(tracks[target], 0)
  }

  advanceRef.current = advance

  async function startTrack(selected, at) {
    if (!selected) return
    stop()
    setStarting(true)
    const generation = startGeneration.current
    try {
      if (selected.url) {
        const audio = new Audio(selected.url)
        audio.volume = muted ? 0 : volume / 100
        audio.currentTime = at
        audio.onended = () => advanceRef.current?.(1, true)
        audio.onerror = () => {
          stop()
          setPlaying(false)
          setError(t('ui.this_audio_file_is_missing_or_cannot_be_decoded_choose_another_track'))
        }
        engine.current.media = audio
        await audio.play()
      } else {
        const context = engine.current.context || new AudioContext()
        engine.current.context = context
        await context.resume()
        if (generation !== startGeneration.current) return
        const master = context.createGain()
        master.gain.value = (muted ? 0 : volume / 100) * 0.13
        master.connect(context.destination)
        engine.current.master = master
        selected.notes.forEach((note, i) => {
          const oscillator = context.createOscillator(),
            gain = context.createGain()
          oscillator.type = i === 0 ? 'sine' : 'triangle'
          oscillator.frequency.value = note
          gain.gain.value = i === 0 ? 0.34 : 0.1
          oscillator.connect(gain).connect(master)
          oscillator.start()
          engine.current.nodes.push(oscillator, gain)
        })
      }
      if (generation !== startGeneration.current) return
      engine.current.started = performance.now()
      engine.current.offset = at
      setPosition(at)
      setPlaying(true)
      setError('')
    } catch {
      if (generation !== startGeneration.current) return
      stop()
      setPlaying(false)
      setError(t('ui.audio_could_not_start'))
    } finally {
      if (
        generation === startGeneration.current ||
        (!engine.current.media && !engine.current.master)
      )
        setStarting(false)
    }
  }

  useEffect(() => {
    if (engine.current.media) engine.current.media.volume = muted ? 0 : volume / 100
    if (engine.current.master)
      engine.current.master.gain.setTargetAtTime(
        (muted ? 0 : volume / 100) * 0.13,
        engine.current.context.currentTime,
        0.08,
      )
  }, [volume, muted])
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      if (document.hidden) return
      const at =
        engine.current.media?.currentTime ??
        engine.current.offset + (performance.now() - engine.current.started) / 1000
      if (!engine.current.media && at >= duration) {
        advance(1, true)
        return
      }
      setPosition(at)
    }, 250)
    return () => clearInterval(id)
  }, [playing, duration, index, repeat, playlist])
  useEffect(() => {
    let hiddenAt = 0
    const visibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now()
        engine.current.context?.suspend().catch(() => {})
        engine.current.media?.pause()
      } else if (playing && hiddenAt) {
        engine.current.started += performance.now() - hiddenAt
        hiddenAt = 0
        const resumed = engine.current.media?.play() || engine.current.context?.resume()
        resumed?.catch(() => {
          stop()
          setPlaying(false)
          setError(t('ui.audio_could_not_start'))
        })
      }
    }
    const hide = () => {
      stop()
      setPlaying(false)
    }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', hide)
    window.addEventListener('lasttrain:server-unavailable', hide)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('lasttrain:server-unavailable', hide)
    }
  }, [playing])
  useEffect(() => {
    filesRef.current = files
  }, [files])
  useEffect(
    () => () => {
      stop()
      filesRef.current.forEach((file) => URL.revokeObjectURL(file.url))
      engine.current.context?.close().catch(() => {})
      engine.current.context = null
    },
    [],
  )
  function choosePlaylist(value) {
    stop()
    setPlaying(false)
    setPosition(0)
    setIndex(0)
    setPlaylist(value)
  }
  async function addFiles(event) {
    const picked = [...event.target.files]
    event.target.value = ''
    setError('')
    setStarting(true)
    try {
      for (const file of picked) {
        const library = await api.upload('/audio/', file)
        setFiles(library)
      }
      choosePlaylist('local')
    } catch (err) {
      setError(err.message)
    } finally {
      setStarting(false)
    }
  }
  useEffect(() => {
    api
      .get('/audio/')
      .then((data) => {
        if (Array.isArray(data)) setFiles(data)
      })
      .catch((err) => setError(err.message))
  }, [])
  async function toggleMute() {
    const next = !muted
    setMuted(next)
    try {
      const saved = await api.patch('/settings/', { music_muted: next })
      window.dispatchEvent(new CustomEvent('lasttrain:settings-updated', { detail: saved }))
    } catch (err) {
      setError(err.message)
      setMuted(!next)
    }
  }
  async function persistVolume(event) {
    try {
      const saved = await api.patch('/settings/', {
        preferred_volume: Number(event.currentTarget.value),
      })
      window.dispatchEvent(new CustomEvent('lasttrain:settings-updated', { detail: saved }))
    } catch (err) {
      setError(err.message)
    }
  }
  const currentTime = Math.floor(position)
  const display = (secs) =>
    `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`
  const knownDuration =
    duration ||
    (Number.isFinite(engine.current.media?.duration) ? engine.current.media.duration : 0)
  useEffect(() => {
    let mounted = true
    api
      .get('/settings/')
      .then((data) => {
        if (mounted) {
          setVolume(data.preferred_volume)
          setMuted(!!data.music_muted)
        }
      })
      .catch(() => {})
    const updated = (event) => {
      setVolume(event.detail.preferred_volume)
      setMuted(!!event.detail.music_muted)
    }
    window.addEventListener('lasttrain:settings-updated', updated)
    return () => {
      mounted = false
      window.removeEventListener('lasttrain:settings-updated', updated)
    }
  }, [])
  return (
    <div
      data-caption={t('audio.radio')}
      className={`music-player ${expanded ? 'expanded' : ''} ${inWorld ? 'in-world' : ''}`}
    >
      <div className="player-main">
        <button
          className="album-art"
          aria-label={t('ui.expand_music_player')}
          onClick={() => setExpanded(!expanded)}
        >
          <Music2 size={22} />
        </button>
        <div className="track-info">
          <strong title={track?.title}>{track?.title || t('ui.add_local_audio')}</strong>
          <small>
            {starting
              ? t('ui.loading_audio')
              : (track?.url ? t('ui.your_local_library') : track?.artist) ||
                t('ui.your_local_library')}
          </small>
          {error && <small role="alert">{translateMessage(error)}</small>}
        </div>
        <div className="player-controls">
          <button
            className="icon-button"
            aria-label={t('ui.previous_track')}
            onClick={() => advance(-1)}
            disabled={!track || starting}
          >
            <SkipBack size={17} />
          </button>
          <button
            className="play-button"
            aria-label={playing ? t('ui.pause_music') : t('ui.play_music')}
            onClick={() => (playing ? pause() : start())}
            disabled={!track || starting}
          >
            {playing ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <button
            className="icon-button"
            aria-label={t('ui.next_track')}
            onClick={() => advance(1)}
            disabled={!track || starting}
          >
            <SkipForward size={17} />
          </button>
        </div>
        <div className="player-progress">
          <span>{display(currentTime)}</span>
          <input
            aria-label={t('ui.playback_position')}
            type="range"
            min="0"
            max={Math.max(1, knownDuration)}
            value={Math.min(position, knownDuration || 1)}
            onChange={(event) => {
              const at = Number(event.target.value)
              setPosition(at)
              if (playing) start(at)
            }}
          />
          <span>{display(knownDuration)}</span>
        </div>
        <div className="player-volume">
          <button
            className="icon-button"
            aria-label={muted ? t('ui.unmute') : t('ui.mute')}
            onClick={toggleMute}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <input
            type="range"
            aria-label={t('ui.music_volume')}
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            onPointerUp={persistVolume}
            onKeyUp={persistVolume}
          />
        </div>
        <button
          className="icon-button expand-button"
          aria-label={expanded ? t('ui.collapse_music_player') : t('ui.expand_music_player')}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={19} /> : <ChevronUp size={19} />}
        </button>
      </div>
      {expanded && (
        <div className="player-extra">
          <div className="expanded-audio-controls">
            <label>
              {t('ui.playback_position')}{' '}
              <input
                aria-label={t('ui.expanded_playback_position')}
                type="range"
                min="0"
                max={Math.max(1, knownDuration)}
                value={Math.min(position, knownDuration || 1)}
                onChange={(event) => {
                  const at = Number(event.target.value)
                  setPosition(at)
                  if (playing) start(at)
                }}
              />
              <small>
                {display(position)} / {display(knownDuration)}
              </small>
            </label>
            <label>
              {t('ui.volume')}{' '}
              <input
                aria-label={t('ui.expanded_music_volume')}
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                onPointerUp={persistVolume}
                onKeyUp={persistVolume}
              />
            </label>
            <button className="button secondary" onClick={toggleMute}>
              {muted ? t('ui.unmute_radio') : t('ui.mute_radio')}
            </button>
          </div>
          <div className="playlist-heading">
            <ListMusic size={17} />
            <strong>{t('ui.playlist')}</strong>
            <select
              aria-label={t('ui.playlist_2')}
              value={playlist}
              onChange={(event) => choosePlaylist(event.target.value)}
            >
              <option value="ambient">{t('ui.original_ambient')}</option>
              <option value="local">{t('ui.local_files')}</option>
            </select>
            <label className="file-button">
              {t('ui.add_audio')}{' '}
              <input
                type="file"
                accept=".mp3,.wav,.ogg,.flac"
                disabled={starting}
                multiple
                onChange={addFiles}
              />
            </label>
            <button
              className="icon-button repeat-button"
              aria-label={t('audio.repeat', { mode: t('audio.repeat_' + repeat) })}
              title={t('audio.repeat', { mode: t('audio.repeat_' + repeat) })}
              onClick={() => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}
            >
              {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
            <small>{t('audio.repeat_' + repeat)}</small>
          </div>
          <div className="playlist-tracks">
            {tracks.length ? (
              tracks.map((item, i) => (
                <button
                  key={i}
                  className={i === index ? 'selected' : ''}
                  onClick={() => {
                    setIndex(i)
                    setPosition(0)
                    if (playing) startTrack(item, 0)
                  }}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <strong>{item.title}</strong>
                  <small>{item.url ? t('ui.your_local_library') : item.artist}</small>
                </button>
              ))
            ) : (
              <p>{t('ui.add_audio_files_from_your_device_to_play_them_here')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

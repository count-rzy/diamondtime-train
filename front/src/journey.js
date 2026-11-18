import { t as translate } from './i18n'
export function progressFromRemaining(journey, elapsedSinceFetch = 0) {
  if (!journey) return 0
  if (journey.status === 'completed') return 100
  if (journey.status === 'paused' || journey.status === 'break') return journey.progress
  const total = journey.duration_minutes * 60
  return Math.min(
    100,
    Math.max(
      0,
      ((total - Math.max(0, journey.remaining_seconds - elapsedSinceFetch)) / total) * 100,
    ),
  )
}

export function remainingFromSnapshot(journey, elapsedSinceFetch = 0) {
  if (!journey) return 0
  return Math.max(
    0,
    Math.ceil(journey.remaining_seconds - (journey.status === 'active' ? elapsedSinceFetch : 0)),
  )
}

export function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function journeyStage(progress) {
  if (progress >= 100) return translate('stage.arrival')
  if (progress >= 82) return translate('stage.final_approach')
  if (progress >= 60) return translate('stage.far_country')
  if (progress >= 40) return translate('stage.midway')
  if (progress >= 20) return translate('stage.open_country')
  return translate('stage.departure')
}

const palettes = [
  {
    skyTop: '#111a33',
    skyBottom: '#d5866d',
    mountain: '#4b496b',
    far: '#292e4e',
    forest: '#202b40',
    ground: '#14232c',
    stars: 0.65,
    moon: 0.15,
    glow: 0.6,
    name: 'Dawn',
  },
  {
    skyTop: '#4376a0',
    skyBottom: '#efbd88',
    mountain: '#708da0',
    far: '#456a7c',
    forest: '#345a60',
    ground: '#203e43',
    stars: 0,
    moon: 0,
    glow: 0.18,
    name: 'Morning',
  },
  {
    skyTop: '#3c75a2',
    skyBottom: '#b7d5cd',
    mountain: '#728e9d',
    far: '#477587',
    forest: '#315c61',
    ground: '#24454a',
    stars: 0,
    moon: 0,
    glow: 0.1,
    name: 'Afternoon',
  },
  {
    skyTop: '#302f65',
    skyBottom: '#f69a69',
    mountain: '#5b5779',
    far: '#3b4368',
    forest: '#293d52',
    ground: '#1b303b',
    stars: 0.18,
    moon: 0,
    glow: 0.8,
    name: 'Sunset',
  },
  {
    skyTop: '#151d42',
    skyBottom: '#9a6386',
    mountain: '#3a4166',
    far: '#263553',
    forest: '#1a2e43',
    ground: '#152936',
    stars: 0.75,
    moon: 0.4,
    glow: 1,
    name: 'Twilight',
  },
  {
    skyTop: '#0a1530',
    skyBottom: '#283653',
    mountain: '#293754',
    far: '#1b2c44',
    forest: '#14283b',
    ground: '#10202d',
    stars: 1,
    moon: 1,
    glow: 1,
    name: 'Night',
  },
]

function mixHex(a, b, t) {
  const x = a.match(/\w\w/g).map((v) => parseInt(v, 16))
  const y = b.match(/\w\w/g).map((v) => parseInt(v, 16))
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

export function atmosphere(progress, durationMinutes = 60) {
  const position = (Math.max(0, Math.min(100, progress)) / 100) * (palettes.length - 1)
  const first = Math.floor(position)
  const next = Math.min(first + 1, palettes.length - 1)
  const t = position - first
  const a = palettes[first],
    b = palettes[next]
  return {
    stage: a.name.toLowerCase(),
    nextStage: b.name.toLowerCase(),
    stageMix: t,
    skyTop: mixHex(a.skyTop, b.skyTop, t),
    skyBottom: mixHex(a.skyBottom, b.skyBottom, t),
    mountain: mixHex(a.mountain, b.mountain, t),
    far: mixHex(a.far, b.far, t),
    forest: mixHex(a.forest, b.forest, t),
    ground: mixHex(a.ground, b.ground, t),
    stars: a.stars + (b.stars - a.stars) * t,
    moon: a.moon + (b.moon - a.moon) * t,
    glow: a.glow + (b.glow - a.glow) * t,
    name: translate('atmosphere.' + palettes[Math.round(position)].name.toLowerCase()),
  }
}

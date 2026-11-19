// All route, scenery and event positions derive from productive journey time.
const regions = [
  {
    id: 'forest',
    km: 5,
    scene: 'forest',
    points: [
      [40, 215],
      [190, 224],
      [330, 250],
      [480, 188],
      [640, 205],
      [790, 245],
      [940, 215],
    ],
  },
  {
    id: 'mountain',
    km: 7,
    scene: 'valley',
    points: [
      [40, 215],
      [190, 192],
      [345, 147],
      [480, 183],
      [650, 228],
      [800, 202],
      [940, 215],
    ],
  },
  {
    id: 'lake',
    km: 8,
    scene: 'lake',
    points: [
      [40, 215],
      [180, 238],
      [340, 265],
      [490, 255],
      [630, 210],
      [790, 190],
      [940, 215],
    ],
  },
  {
    id: 'bridge',
    km: 6,
    scene: 'bridge',
    points: [
      [40, 215],
      [190, 186],
      [350, 180],
      [500, 182],
      [670, 186],
      [800, 205],
      [940, 215],
    ],
  },
  {
    id: 'tunnel',
    km: 7,
    scene: 'tunnel',
    points: [
      [40, 215],
      [180, 218],
      [330, 220],
      [490, 220],
      [660, 221],
      [790, 218],
      [940, 215],
    ],
  },
  {
    id: 'village',
    km: 5,
    scene: 'village',
    points: [
      [40, 215],
      [185, 198],
      [330, 190],
      [480, 222],
      [650, 260],
      [800, 238],
      [940, 215],
    ],
  },
  {
    id: 'industry',
    km: 6,
    scene: 'industry',
    points: [
      [40, 215],
      [180, 230],
      [330, 235],
      [480, 200],
      [650, 185],
      [800, 198],
      [940, 215],
    ],
  },
  {
    id: 'city',
    km: 9,
    scene: 'city',
    points: [
      [40, 215],
      [180, 195],
      [330, 186],
      [480, 220],
      [650, 245],
      [800, 235],
      [940, 215],
    ],
  },
]

export function hashSeed(seed = '') {
  let hash = 2166136261
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return hash >>> 0
}

export function buildRoute(journey, totalMeters = journey?.duration_minutes * 100) {
  if (!journey) return []
  const total = Math.max(1, totalMeters)
  const offset = hashSeed(journey.route_seed || String(journey.id)) % regions.length
  const result = []
  for (let start = 0, index = 0; start < total; index++) {
    const region = regions[(offset + index) % regions.length]
    const end = Math.min(total, start + region.km * 1000)
    result.push({ ...region, index, start, end })
    start = end
  }
  return result
}

export function pointOnTrack(points, fraction) {
  const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  let remaining = Math.max(0, Math.min(1, fraction)) * total
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const part = lengths[i] ? remaining / lengths[i] : 0
      return [
        points[i][0] + (points[i + 1][0] - points[i][0]) * part,
        points[i][1] + (points[i + 1][1] - points[i][1]) * part,
      ]
    }
    remaining -= lengths[i]
  }
  return points.at(-1)
}

const regionEvents = {
  forest: ['birds', 'signal', 'freight'],
  mountain: ['viaduct', 'fog', 'signal'],
  lake: ['bridge', 'birds', 'fog'],
  bridge: ['bridge', 'passenger'],
  tunnel: ['signal', 'maintenance'],
  village: ['village', 'crossing'],
  industry: ['freight', 'maintenance', 'signal'],
  city: ['passenger', 'signal', 'crossing'],
}

export function deriveWorld(journey, elapsedSinceFetch = 0, eventsEnabled = true) {
  if (!journey) return null
  const duration = journey.duration_minutes * 60
  const moving = journey.status === 'active'
  const productiveSeconds = Math.max(
    0,
    Math.min(duration, (journey.elapsed_seconds || 0) + (moving ? elapsedSinceFetch : 0)),
  )
  const distanceMeters = (productiveSeconds * 100) / 60
  // Route boundaries never change when the status changes. A completed trip
  // may have been ended early, but its planned route remains the same route.
  const totalMeters = Math.max(1, journey.duration_minutes * 100)
  const route = buildRoute(journey, totalMeters)
  const region = route.find((part) => distanceMeters < part.end) || route.at(-1)
  const regionFraction = region ? (distanceMeters - region.start) / (region.end - region.start) : 0
  const progress =
    journey.status === 'completed' ? 100 : duration ? (productiveSeconds / duration) * 100 : 0
  const arriving = journey.status === 'completed'
  const slot = Math.floor(distanceMeters / 2400)
  const seed = hashSeed(journey.route_seed || String(journey.id))
  const eventStart = slot * 2400 + 600 + (seed % 900)
  const choices = regionEvents[region?.id] || []
  const event =
    eventsEnabled &&
    moving &&
    !arriving &&
    distanceMeters >= eventStart &&
    distanceMeters < eventStart + 260
      ? choices[(seed + slot) % choices.length]
      : null
  return {
    route,
    region,
    regionFraction: Math.max(0, Math.min(1, regionFraction)),
    productiveSeconds,
    distanceMeters,
    totalMeters,
    remainingMeters: arriving ? 0 : Math.max(0, totalMeters - distanceMeters),
    progress,
    moving,
    arriving,
    event,
  }
}

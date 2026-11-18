import { hashSeed, pointOnTrack } from './world'

const WIDTH = 500
const HEIGHT = 210

function random(seed) {
  let state = seed || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function atlasTrack(points) {
  let track = points
  for (let pass = 0; pass < 3; pass++) {
    const next = [track[0]]
    for (let index = 0; index < track.length - 1; index++) {
      const [ax, ay] = track[index]
      const [bx, by] = track[index + 1]
      next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25])
      next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75])
    }
    next.push(track.at(-1))
    track = next
  }
  return track
}

function path(ctx, points, width, color) {
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1])
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = width
  ctx.strokeStyle = color
  ctx.stroke()
}

function steppedHill(ctx, x, y, size, colors) {
  for (let level = 0; level < 5; level++) {
    ctx.fillStyle = colors[level % colors.length]
    ctx.fillRect(x - size + level * 5, y + level * 5, (size - level * 5) * 2, 5)
  }
  ctx.fillStyle = '#c5c3a8'
  ctx.fillRect(x - 5, y + 1, 10, 3)
}

function tree(ctx, x, y, rand) {
  const height = 5 + Math.floor(rand() * 5)
  ctx.fillStyle = '#101f29'
  ctx.fillRect(x, y + height - 2, 2, 4)
  ctx.fillStyle = rand() > 0.5 ? '#315d56' : '#254b4c'
  ctx.fillRect(x - 3, y + 3, 8, 3)
  ctx.fillRect(x - 2, y, 6, 4)
  ctx.fillStyle = '#5a7668'
  ctx.fillRect(x, y + 1, 2, 2)
}

function building(ctx, x, y, size, color) {
  ctx.fillStyle = '#14232d'
  ctx.fillRect(x - 2, y - 2, size + 4, size + 5)
  ctx.fillStyle = color
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = '#b98e69'
  ctx.fillRect(x + 2, y + 3, 2, 2)
  ctx.fillRect(x + size - 4, y + 3, 2, 2)
  ctx.fillStyle = '#614638'
  ctx.fillRect(x - 3, y - 4, size + 6, 3)
}

function terrain(ctx, region, seed) {
  const rand = random(hashSeed(`${seed}:${region.id}`))
  const wet = region.id === 'lake' || region.id === 'bridge'
  const mountain = region.id === 'mountain' || region.id === 'tunnel'
  const urban = region.id === 'city' || region.id === 'industry'
  ctx.fillStyle = '#273b3a'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  for (let y = 0; y < HEIGHT; y += 8) {
    for (let x = 0; x < WIDTH; x += 8) {
      const n = rand()
      ctx.fillStyle = n < 0.35 ? '#30483f' : n < 0.72 ? '#344b42' : '#3e5549'
      ctx.fillRect(x, y, 8, 8)
      if (rand() > 0.74) {
        ctx.fillStyle = '#536653'
        ctx.fillRect(x + 2, y + 3, 3, 2)
      }
    }
  }
  // Pixelated contour marks make the ground read as a surveyed map.
  ctx.fillStyle = '#718474'
  for (let index = 0; index < 42; index++) {
    const x = Math.floor(rand() * 60) * 8
    const y = Math.floor(rand() * 25) * 8
    ctx.fillRect(x, y, 8 + Math.floor(rand() * 4) * 8, 1)
  }
  if (wet) {
    ctx.fillStyle = '#152f42'
    for (let y = 0; y < HEIGHT; y += 4) {
      const center =
        region.id === 'lake' ? 265 + Math.sin(y / 32) * 23 : 245 + Math.sin(y / 24) * 18
      const width = region.id === 'lake' ? 90 : 34
      ctx.fillRect(Math.floor((center - width) / 4) * 4, y, width * 2, 4)
    }
    for (let index = 0; index < 90; index++) {
      const x = 185 + Math.floor(rand() * 160)
      const y = Math.floor(rand() * HEIGHT)
      ctx.fillStyle = rand() > 0.5 ? '#426879' : '#315368'
      ctx.fillRect(x, y, 3 + Math.floor(rand() * 8), 1)
    }
  }
  if (mountain) {
    for (let index = 0; index < 12; index++) {
      const x = Math.floor(rand() * 500)
      const y = index % 2 ? 145 + Math.floor(rand() * 50) : 4 + Math.floor(rand() * 35)
      steppedHill(ctx, x, y, 13 + Math.floor(rand() * 13), ['#536461', '#68736d', '#394d4d'])
    }
  }
  if (urban || region.id === 'village') {
    const count = urban ? 65 : 28
    for (let index = 0; index < count; index++) {
      const x = 20 + Math.floor(rand() * 455)
      const y = Math.floor(rand() * 188)
      const size = urban ? 7 + Math.floor(rand() * 10) : 8 + Math.floor(rand() * 5)
      building(ctx, x, y, size, urban ? '#53636b' : '#756b59')
    }
  }
  const trees = urban ? 90 : mountain ? 130 : wet ? 150 : 260
  for (let index = 0; index < trees; index++) {
    const x = 10 + Math.floor(rand() * 480)
    const y = 8 + Math.floor(rand() * 188)
    if (wet && x > 170 && x < 345) continue
    tree(ctx, x, y, rand)
  }
  if (region.id === 'industry') {
    for (const x of [105, 155, 352]) {
      building(ctx, x, 35, 23, '#45545a')
      ctx.fillStyle = '#263540'
      ctx.fillRect(x + 5, 12, 5, 22)
      ctx.fillStyle = '#7c877e'
      ctx.fillRect(x + 6, 8, 3, 4)
    }
  }
}

function trackLength(points) {
  return points.slice(1).reduce((sum, point, index) => {
    const before = points[index]
    return sum + Math.hypot(point[0] - before[0], point[1] - before[1])
  }, 0)
}

function railway(ctx, points, fraction, region) {
  const pixels = points.map(([x, y]) => [x / 2, y / 2])
  path(ctx, pixels, 14, '#18252b')
  path(ctx, pixels, 11, '#755e4c')
  path(ctx, pixels, 8, '#a0785d')
  const total = trackLength(pixels)
  for (let distance = 0; distance <= total; distance += 7) {
    const [x, y] = pointOnTrack(pixels, distance / total)
    const [aheadX, aheadY] = pointOnTrack(pixels, Math.min(1, (distance + 1) / total))
    const angle = Math.atan2(aheadY - y, aheadX - x) + Math.PI / 2
    const dx = Math.cos(angle) * 6
    const dy = Math.sin(angle) * 6
    path(
      ctx,
      [
        [x - dx, y - dy],
        [x + dx, y + dy],
      ],
      2,
      '#322b2b',
    )
  }
  for (const offset of [-2.6, 2.6]) {
    const shifted = pixels.map((point, index) => {
      const previous = pixels[Math.max(0, index - 1)]
      const next = pixels[Math.min(pixels.length - 1, index + 1)]
      const length = Math.hypot(next[0] - previous[0], next[1] - previous[1]) || 1
      return [
        point[0] - ((next[1] - previous[1]) / length) * offset,
        point[1] + ((next[0] - previous[0]) / length) * offset,
      ]
    })
    path(ctx, shifted, 1.5, '#d1c6a1')
  }
  const traveled = [pixels[0]]
  let covered = 0
  for (let index = 1; index < pixels.length; index++) {
    covered += Math.hypot(
      pixels[index][0] - pixels[index - 1][0],
      pixels[index][1] - pixels[index - 1][1],
    )
    if (covered > total * fraction) break
    traveled.push(pixels[index])
  }
  traveled.push(pointOnTrack(pixels, fraction))
  if (traveled.length > 1) path(ctx, traveled, 2, '#edbf76')
  if (region.id === 'bridge' || region.id === 'lake') {
    const [x, y] = pointOnTrack(pixels, 0.5)
    ctx.fillStyle = '#172938'
    for (const side of [-1, 1]) {
      ctx.fillRect(x - 24, y + side * 11, 48, 3)
      for (const dx of [-18, 0, 18]) ctx.fillRect(x + dx, y + side * 12, 3, 10)
    }
  }
  if (region.id === 'tunnel' || region.id === 'mountain') {
    const [x, y] = pointOnTrack(pixels, 0.5)
    ctx.fillStyle = '#68726b'
    ctx.fillRect(x - 16, y - 12, 32, 24)
    ctx.fillStyle = '#1a252b'
    ctx.fillRect(x - 12, y - 7, 24, 14)
    path(ctx, pixels, 2, '#d3b27d')
  }
  for (const fraction of [0.1, 0.88]) {
    const [x, y] = pointOnTrack(pixels, fraction)
    ctx.fillStyle = '#263844'
    ctx.fillRect(x - 12, y - 15, 24, 5)
    ctx.fillStyle = '#d4a876'
    ctx.fillRect(x - 10, y - 14, 20, 2)
    ctx.fillStyle = '#14242b'
    ctx.fillRect(x + 14, y - 17, 2, 15)
    ctx.fillStyle = '#dbad68'
    ctx.fillRect(x + 13, y - 17, 4, 4)
  }
}

export function drawAtlasMap(canvas, region, seed, fraction) {
  if (!canvas || !region) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = WIDTH
  canvas.height = HEIGHT
  ctx.imageSmoothingEnabled = false
  terrain(ctx, region, seed)
  railway(ctx, atlasTrack(region.points), fraction, region)
  ctx.fillStyle = '#d0ac75'
  for (let x = 0; x < WIDTH; x += 25) {
    ctx.fillRect(x, 0, 1, 3)
    ctx.fillRect(x, HEIGHT - 3, 1, 3)
  }
}

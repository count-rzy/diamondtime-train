import { describe, expect, it } from 'vitest'
import { atlasTrack, drawAtlasMap } from './atlas-map'
import { buildRoute, pointOnTrack } from './world'

const journey = { id: 7, route_seed: 'atlas-test', duration_minutes: 180 }

describe('railway atlas geometry', () => {
  it('preserves the seeded route endpoints and places the train on its curved track', () => {
    const regions = buildRoute(journey)
    expect(regions.length).toBeGreaterThan(1)
    for (const region of regions) {
      const track = atlasTrack(region.points)
      expect(track[0]).toEqual(region.points[0])
      expect(track.at(-1)).toEqual(region.points.at(-1))
      expect(track.length).toBeGreaterThan(region.points.length)
      const [x, y] = pointOnTrack(track, 0.5)
      expect(x).toBeGreaterThan(track[0][0])
      expect(x).toBeLessThan(track.at(-1)[0])
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(420)
    }
    expect(buildRoute(journey)).toEqual(regions)
  })

  it('draws a stable pixel map for the same saved seed', () => {
    function render(seed) {
      const operations = []
      const ctx = {
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {
          operations.push(['stroke', this.strokeStyle, this.lineWidth])
        },
        fillRect(...box) {
          operations.push(['rect', this.fillStyle, ...box])
        },
      }
      const canvas = { getContext: () => ctx }
      drawAtlasMap(canvas, buildRoute(journey)[0], seed, 0.4)
      expect([canvas.width, canvas.height]).toEqual([500, 210])
      expect(ctx.imageSmoothingEnabled).toBe(false)
      return operations
    }
    expect(render('same-seed')).toEqual(render('same-seed'))
    expect(render('other-seed')).not.toEqual(render('same-seed'))
  })
})

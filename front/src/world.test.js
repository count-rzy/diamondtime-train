import { describe, expect, it } from 'vitest'
import { buildRoute, deriveWorld, pointOnTrack } from './world'

const journey = {
  id: 5,
  route_seed: 'fixed-route',
  duration_minutes: 1800,
  elapsed_seconds: 0,
  status: 'active',
}

describe('railway world', () => {
  it('keeps a stable connected route and converts only productive time to distance', () => {
    const route = buildRoute(journey)
    expect(route).toEqual(buildRoute(journey))
    expect(route.length).toBeGreaterThan(10)
    expect(route[0].start).toBe(0)
    expect(route.at(-1).end).toBe(180000)
    for (let index = 1; index < route.length; index++) {
      expect(route[index].start).toBe(route[index - 1].end)
      expect(route[index].points[0][1]).toBe(route[index - 1].points.at(-1)[1])
    }
    expect(deriveWorld(journey, 600).distanceMeters).toBe(1000)
    expect(
      deriveWorld({ ...journey, status: 'break', elapsed_seconds: 600 }, 1000).distanceMeters,
    ).toBe(1000)
    expect(
      deriveWorld({ ...journey, status: 'paused', elapsed_seconds: 600 }, 1000).distanceMeters,
    ).toBe(1000)
  })

  it('moves the train by normalized track distance and reaches the destination', () => {
    const points = [
      [0, 0],
      [100, 0],
      [100, 300],
    ]
    expect(pointOnTrack(points, 0.5)).toEqual([100, 100])
    expect(pointOnTrack(points, 1)).toEqual([100, 300])
    const completed = deriveWorld({ ...journey, status: 'completed', elapsed_seconds: 1200 })
    expect(completed.remainingMeters).toBe(0)
    expect(completed.progress).toBe(100)
    expect(completed.distanceMeters).toBe(2000)
    expect(completed.totalMeters).toBe(180000)
    expect(completed.region).toEqual(deriveWorld({ ...journey, elapsed_seconds: 1200 }).region)
  })

  it('schedules stable events only during travel', () => {
    const current = { ...journey, elapsed_seconds: 1000 }
    expect(deriveWorld(current).event).toBe(deriveWorld(current).event)
    expect(deriveWorld({ ...current, status: 'break' }).event).toBe(null)
    expect(deriveWorld(current, 0, false).event).toBe(null)
  })

  it.each([1, 2, 15, 1800])(
    'keeps short and long trip scenery monotonic for %i minutes',
    (minutes) => {
      const trip = { ...journey, duration_minutes: minutes }
      const indices = [0, 0.8, 0.95, 1].map(
        (part) => deriveWorld(trip, minutes * 60 * part).region.index,
      )
      expect(indices).toEqual([...indices].sort((a, b) => a - b))
      expect(deriveWorld(trip, minutes * 60).region).toEqual(
        deriveWorld(trip, minutes * 60 + 30).region,
      )
      expect(
        deriveWorld({ ...trip, status: 'completed', elapsed_seconds: minutes * 60 }).arriving,
      ).toBe(true)
    },
  )

  it('holds region and event schedule during pause and station break', () => {
    const active = deriveWorld({ ...journey, elapsed_seconds: 600 }, 0)
    for (const status of ['paused', 'break']) {
      const held = deriveWorld({ ...journey, status, elapsed_seconds: 600 }, 5000)
      expect(held.region.index).toBe(active.region.index)
      expect(held.distanceMeters).toBe(active.distanceMeters)
      expect(held.event).toBeNull()
      expect(held.moving).toBe(false)
    }
  })
})

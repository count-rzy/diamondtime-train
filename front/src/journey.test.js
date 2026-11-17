import { describe, expect, it } from 'vitest'
import {
  atmosphere,
  formatTime,
  journeyStage,
  progressFromRemaining,
  remainingFromSnapshot,
} from './journey'

describe('journey clock', () => {
  const journey = { duration_minutes: 60, remaining_seconds: 1800, progress: 50, status: 'active' }
  it('advances from a server snapshot without resetting on render', () => {
    expect(progressFromRemaining(journey, 900)).toBe(75)
    expect(remainingFromSnapshot(journey, 900)).toBe(900)
    expect(formatTime(900)).toBe('00:15:00')
  })
  it('holds time while paused and arrives at completion', () => {
    expect(remainingFromSnapshot({ ...journey, status: 'paused' }, 900)).toBe(1800)
    expect(progressFromRemaining({ ...journey, status: 'completed' })).toBe(100)
  })
  it('changes visual phase with journey progress', () => {
    expect(atmosphere(0).name).toBe('Dawn')
    expect(atmosphere(50).name).toBe('Sunset')
    expect(atmosphere(15).skyTop).not.toBe(atmosphere(80).skyTop)
    expect(atmosphere(100, 60).name).toBe('Night')
    expect(atmosphere(100, 2880).name).toBe('Night')
  })
  it('names the approach and arrival from progress', () => {
    expect(journeyStage(25)).toBe('Open country')
    expect(journeyStage(50)).toBe('Midway')
    expect(journeyStage(75)).toBe('Far country')
    expect(journeyStage(100)).toBe('Arrival')
  })
})

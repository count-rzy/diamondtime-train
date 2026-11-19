import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PixelWorld from './PixelWorld'
import { atmosphere } from './journey'

const palette = atmosphere(20, 60)
const originalImage = globalThis.Image

afterEach(() => {
  globalThis.Image = originalImage
  vi.useRealTimers()
})

it('keeps the outgoing scenery until the incoming image loads and then cleans it up', () => {
  vi.useFakeTimers()
  const pending = []
  globalThis.Image = class {
    constructor() {
      pending.push(this)
    }
    complete = false
    naturalWidth = 0
  }
  const props = { palette, progress: 20, particles: false, scene: 'forest' }
  const { container, rerender } = render(<PixelWorld {...props} />)
  rerender(<PixelWorld {...props} scene="tunnel" />)
  expect(container.querySelector('.rail-region-art').getAttribute('href')).toBe(
    '/art/rail-forest.png',
  )
  expect(pending.at(-1).src).toBe('/art/rail-tunnel-v3.png')
  act(() => pending.at(-1).onload())
  expect(container.querySelector('.rail-scene-exit image').getAttribute('href')).toBe(
    '/art/rail-forest.png',
  )
  expect(container.querySelector('.rail-scene-enter image').getAttribute('href')).toBe(
    '/art/rail-tunnel-v3.png',
  )
  act(() => vi.advanceTimersByTime(500))
  expect(container.querySelector('.rail-scene-exit')).toBeNull()
  expect(container.querySelector('.rail-region-art').getAttribute('href')).toBe(
    '/art/rail-tunnel-v3.png',
  )
})

it('ignores a superseded image load', () => {
  const pending = []
  globalThis.Image = class {
    constructor() {
      pending.push(this)
    }
    complete = false
    naturalWidth = 0
  }
  const props = { palette, progress: 20, particles: false, scene: 'forest' }
  const { container, rerender } = render(<PixelWorld {...props} />)
  rerender(<PixelWorld {...props} scene="tunnel" />)
  const obsolete = pending.at(-1)
  rerender(<PixelWorld {...props} scene="lake" />)
  act(() => obsolete.onload?.())
  expect(container.querySelector('.rail-region-art').getAttribute('href')).toBe(
    '/art/rail-forest.png',
  )
  act(() => pending.at(-1).onload())
  expect(container.querySelector('.rail-scene-enter image').getAttribute('href')).toBe(
    '/art/rail-lake.png',
  )
})

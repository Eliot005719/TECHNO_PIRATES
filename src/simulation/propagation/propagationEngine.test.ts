import { describe, expect, it } from 'vitest'
import { referencePathLoss, rssiAt } from './pathLoss'
import { coverageAt, coverageGrid } from './propagationEngine'
import { wallLoss } from './wallAttenuation'
import type { PropagationSettings, Transmitter, Wall } from './propagationTypes'

const settings: PropagationSettings = {
  scaleMetersPerUnit: 1,
  exponent: 3,
  receiverGainDbi: 0,
  mode: 'combined',
  selectedApId: 'ap-1',
  resolution: 20,
  bodyAttenuationDb: 9,
  wallAttenuation: { partition: 3.5, exterior: 12, glass: 2.5, concrete: 15, brick: 10 }
}

const ap1: Transmitter = {
  id: 'ap-1',
  x: -5,
  z: 0,
  frequencyGHz: 5,
  powerDbm: 18,
  active: true
}

const ap2: Transmitter = {
  id: 'ap-2',
  x: 10,
  z: 0,
  frequencyGHz: 5,
  powerDbm: 18,
  active: true
}

describe('RF path loss', () => {
  it('uses the 1-meter free-space reference loss in MHz', () => {
    expect(referencePathLoss(2.4)).toBeCloseTo(40.054, 3)
  })

  it('applies distance, exponent, gain, wall loss, and the signal floor', () => {
    const baseline = rssiAt(1, 2.4, 18, 2, 1, 0, 0)
    const withLosses = rssiAt(10, 2.4, 18, 2, 1, 10, 3)
    expect(baseline).toBeCloseTo(18 - referencePathLoss(2.4), 5)
    expect(withLosses).toBeCloseTo(18 + 3 - referencePathLoss(2.4) - 20 - 10, 5)
    expect(rssiAt(0, 2.4, 18, 2, 1, 0)).toBe(-20)
    expect(rssiAt(100_000, 2.4, 18, 2, 1, 0)).toBe(-100)
  })

  it.each([0, -2.4, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])(
    'rejects invalid frequency %s',
    frequency => {
      expect(() => referencePathLoss(frequency)).toThrow(RangeError)
    }
  )

  it('rejects invalid path-loss inputs instead of returning NaN', () => {
    expect(() => rssiAt(-1, 5, 18, 3, 1, 0)).toThrow(RangeError)
    expect(() => rssiAt(1, 5, 18, 0, 1, 0)).toThrow(RangeError)
    expect(() => rssiAt(1, 5, 18, 3, 0, 0)).toThrow(RangeError)
    expect(() => rssiAt(1, 5, 18, 3, 1, Number.NaN)).toThrow(RangeError)
  })

  it('uses receiver height in the 3D propagation distance', () => {
    const atReceiverHeight = coverageAt(
      { x: 0, z: 0, y: 0.8 },
      [{ ...ap1, x: 0, z: 0, y: 2.8 }],
      [],
      settings
    )
    const sameHeight = coverageAt(
      { x: 0, z: 0, y: 2.8 },
      [{ ...ap1, x: 0, z: 0, y: 2.8 }],
      [],
      settings
    )
    expect(atReceiverHeight.rssi).toBeLessThan(sameHeight.rssi)
  })
})

describe('wall attenuation', () => {
  const partition: Wall = {
    id: 'partition',
    a: { x: 0, z: -1 },
    b: { x: 0, z: 1 },
    material: 'partition'
  }

  it('counts proper intersections and endpoint contacts, but not parallel misses', () => {
    expect(wallLoss({ x: -1, z: 0 }, { x: 1, z: 0 }, [partition])).toBe(3.5)
    expect(wallLoss({ x: -1, z: 2 }, { x: 1, z: 2 }, [partition])).toBe(0)
    expect(wallLoss({ x: -1, z: 1 }, { x: 0, z: 1 }, [partition])).toBe(3.5)
    const alongWall: Wall = {
      id: 'along',
      a: { x: 0, z: 0 },
      b: { x: 1, z: 0 },
      material: 'glass'
    }
    expect(wallLoss({ x: -1, z: 0 }, { x: 2, z: 0 }, [alongWall])).toBe(2.5)
    expect(wallLoss({ x: 2, z: 0 }, { x: 3, z: 0 }, [alongWall])).toBe(0)
  })

  it('uses configured attenuation and rejects invalid geometry', () => {
    expect(wallLoss(
      { x: -1, z: 0 },
      { x: 1, z: 0 },
      [partition],
      { partition: 7 }
    )).toBe(7)
    expect(() => wallLoss(
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      [{ ...partition, a: { x: Number.NaN, z: 0 } }]
    )).toThrow(RangeError)
    expect(() => wallLoss(
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      [partition],
      { partition: -1 }
    )).toThrow(RangeError)
  })

  it('counts exact duplicate wall geometry once even when IDs differ', () => {
    expect(wallLoss(
      { x: -1, z: 0 },
      { x: 1, z: 0 },
      [partition, { ...partition, id: 'duplicate', a: partition.b, b: partition.a }]
    )).toBe(3.5)
  })
})

describe('coverage selection and human obstruction', () => {
  const receiver = { x: -4.5, z: 0, y: 0.8 }

  it('selects by calculated received signal, regardless of transmitter order', () => {
    const coverage = coverageAt(receiver, [ap2, ap1], [], settings)
    expect(coverage.strongestApId).toBe('ap-1')
    expect(coverage).toMatchObject({ rssi: expect.any(Number), category: expect.any(String) })
  })

  it('falls back immediately when the strongest AP is deactivated', () => {
    const fallback = coverageAt(
      receiver,
      [{ ...ap1, active: false }, { ...ap2, x: -4 }],
      [],
      settings
    )
    expect(fallback.strongestApId).toBe('ap-2')
  })

  it('keeps individual mode scoped to the selected active AP', () => {
    const individualSettings = { ...settings, mode: 'individual' as const, selectedApId: 'ap-2' }
    const selected = coverageAt(receiver, [ap1, ap2], [], individualSettings)
    const offline = coverageAt(
      receiver,
      [ap1, { ...ap2, active: false }],
      [],
      individualSettings
    )
    expect(selected.strongestApId).toBe('ap-2')
    expect(offline.rssi).toBe(-100)
    expect(offline.strongestApId).toBeNull()
  })

  it('returns a finite noise-floor result when all transmitters are offline', () => {
    const coverage = coverageAt(receiver, [{ ...ap1, active: false }, { ...ap2, active: false }], [], settings)
    expect(coverage.rssi).toBe(-100)
    expect(coverage.category).toBe('none')
    expect(coverage.strongestApId).toBeNull()
    expect(Object.values(coverage).every(value =>
      typeof value !== 'number' || Number.isFinite(value)
    )).toBe(true)
  })

  it('models a radius-aware ray obstruction and supports multiple humans', () => {
    const clear = coverageAt({ x: 5, z: 0, y: 0.8 }, [ap1], [], settings)
    const blocked = coverageAt(
      { x: 5, z: 0, y: 0.8 },
      [ap1],
      [],
      settings,
      [{ id: 'h1', x: 0, z: 0, radius: 0.35 }]
    )
    const twoBodies = coverageAt(
      { x: 5, z: 0, y: 0.8 },
      [ap1],
      [],
      settings,
      [
        { id: 'h1', x: 0, z: 0, radius: 0.35 },
        { id: 'h2', x: 2, z: 0, radius: 0.35 }
      ]
    )
    const offRay = coverageAt(
      { x: 5, z: 0, y: 0.8 },
      [ap1],
      [],
      settings,
      [{ id: 'h1', x: 0, z: 2, radius: 0.35 }]
    )

    expect(blocked.rssi).toBeCloseTo(clear.rssi - 9, 5)
    expect(twoBodies.rssi).toBeCloseTo(clear.rssi - 18, 5)
    expect(offRay.rssi).toBe(clear.rssi)
    expect(blocked.humanObstructionLoss).toBe(9)
  })

  it('keeps combined mode as best-server selection, not power summation', () => {
    const strongest = coverageAt(receiver, [ap1], [], settings)
    const combined = coverageAt(receiver, [{ ...ap1, id: 'ap-3' }, ap1], [], settings)
    expect(combined.rssi).toBe(strongest.rssi)
    expect(combined.strongestApId).toBe('ap-1')
  })

  it('rejects malformed points, transmitters, and human obstacles', () => {
    expect(() => coverageAt({ x: Number.NaN, z: 0 }, [ap1], [], settings)).toThrow(RangeError)
    expect(() => coverageAt(receiver, [{ ...ap1, frequencyGHz: 0 }], [], settings)).toThrow(RangeError)
    expect(() => coverageAt(
      receiver,
      [ap1],
      [],
      settings,
      [{ id: 'h1', x: 0, z: 0, radius: -1 }]
    )).toThrow(RangeError)
  })
})

describe('coverage grid', () => {
  it('generates exactly one valid center sample per cell, including boundary cells', () => {
    const grid = coverageGrid(
      { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      [ap1, ap2],
      [],
      settings
    )
    const coordinates = new Set(grid.map(cell => `${cell.x},${cell.z}`))

    expect(grid).toHaveLength(400)
    expect(coordinates.size).toBe(400)
    expect(Math.min(...grid.map(cell => cell.x))).toBe(-9.5)
    expect(Math.max(...grid.map(cell => cell.x))).toBe(9.5)
    expect(Math.min(...grid.map(cell => cell.z))).toBe(-9.5)
    expect(Math.max(...grid.map(cell => cell.z))).toBe(9.5)
    expect(grid.every(cell =>
      Number.isFinite(cell.rssi) &&
      Number.isFinite(cell.wallLoss) &&
      ['strong', 'moderate', 'weak', 'none'].includes(cell.category)
    )).toBe(true)
  })

  it('rejects degenerate bounds and invalid resolutions', () => {
    expect(() => coverageGrid(
      { minX: 1, maxX: 1, minZ: 0, maxZ: 1 },
      [ap1],
      [],
      settings
    )).toThrow(RangeError)
    expect(() => coverageGrid(
      { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },
      [ap1],
      [],
      { ...settings, resolution: 0 }
    )).toThrow(RangeError)
  })

  it('warms up and records multiple 400-cell benchmark samples', () => {
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
    const walls: Wall[] = [
      { id: 'wall-1', a: { x: 0, z: -8 }, b: { x: 0, z: 8 }, material: 'partition' },
      { id: 'wall-2', a: { x: -8, z: 0 }, b: { x: 8, z: 0 }, material: 'glass' },
      { id: 'wall-3', a: { x: -8, z: -4 }, b: { x: 8, z: -4 }, material: 'exterior' }
    ]
    const transmitters = [ap1, ap2, { ...ap1, id: 'ap-3', x: 0, z: 8 }]
    const humans = [{ id: 'h1', x: 0, z: 1, radius: 0.35 }]

    coverageGrid(bounds, transmitters, walls, settings, humans)
    coverageGrid(bounds, transmitters, walls, settings, humans)

    const samples: number[] = []
    for (let sample = 0; sample < 7; sample += 1) {
      const start = performance.now()
      const grid = coverageGrid(bounds, transmitters, walls, settings, humans)
      samples.push(performance.now() - start)
      expect(grid).toHaveLength(400)
    }
    const average = samples.reduce((sum, duration) => sum + duration, 0) / samples.length
    console.info(`400-cell propagation benchmark (ms): ${samples.map(value => value.toFixed(2)).join(', ')}; avg ${average.toFixed(2)}`)
  })
})

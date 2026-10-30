import type { Point2, Wall, WallAttenuation } from './propagationTypes'

export const attenuation: WallAttenuation = {
  partition: 3.5,
  glass: 2.5,
  exterior: 12,
  concrete: 15,
  brick: 10
}

export type PreparedWall = {
  ax: number
  az: number
  bx: number
  bz: number
  loss: number
}

export type PreparedWalls = PreparedWall[]

const isFinitePoint = (point: Point2): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.z)

function orientation(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number
): number {
  const firstProduct = (bx - ax) * (cz - az)
  const secondProduct = (bz - az) * (cx - ax)
  const value = firstProduct - secondProduct
  const tolerance = Number.EPSILON * 16 *
    (Math.abs(firstProduct) + Math.abs(secondProduct))
  return Math.abs(value) <= tolerance ? 0 : value
}

function onSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number
): boolean {
  const epsilon = Number.EPSILON * 16 *
    Math.max(1, Math.abs(ax), Math.abs(az), Math.abs(bx), Math.abs(bz), Math.abs(px), Math.abs(pz))
  return px >= Math.min(ax, bx) - epsilon &&
    px <= Math.max(ax, bx) + epsilon &&
    pz >= Math.min(az, bz) - epsilon &&
    pz <= Math.max(az, bz) + epsilon
}

function segmentsIntersect(
  a: Point2,
  b: Point2,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): boolean {
  const abC = orientation(a.x, a.z, b.x, b.z, cx, cz)
  const abD = orientation(a.x, a.z, b.x, b.z, dx, dz)
  const cdA = orientation(cx, cz, dx, dz, a.x, a.z)
  const cdB = orientation(cx, cz, dx, dz, b.x, b.z)

  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
      ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) {
    return true
  }

  return (abC === 0 && onSegment(a.x, a.z, b.x, b.z, cx, cz)) ||
    (abD === 0 && onSegment(a.x, a.z, b.x, b.z, dx, dz)) ||
    (cdA === 0 && onSegment(cx, cz, dx, dz, a.x, a.z)) ||
    (cdB === 0 && onSegment(cx, cz, dx, dz, b.x, b.z))
}

export function prepareWalls(
  walls: readonly Wall[],
  configuredAttenuation?: Partial<WallAttenuation>
): PreparedWalls {
  const losses = {
    partition: configuredAttenuation?.partition ?? attenuation.partition,
    exterior: configuredAttenuation?.exterior ?? attenuation.exterior,
    glass: configuredAttenuation?.glass ?? attenuation.glass,
    concrete: configuredAttenuation?.concrete ?? attenuation.concrete,
    brick: configuredAttenuation?.brick ?? attenuation.brick
  }

  for (const [material, loss] of Object.entries(losses)) {
    if (!Number.isFinite(loss) || loss < 0) {
      throw new RangeError(`Wall attenuation for ${material} must be finite and non-negative`)
    }
  }

  const uniqueWalls = new Map<string, PreparedWall>()
  for (const wall of walls) {
    if (!isFinitePoint(wall.a) || !isFinitePoint(wall.b)) {
      throw new RangeError(`Wall ${wall.id} must have finite endpoint coordinates`)
    }
    if (!Object.hasOwn(losses, wall.material)) {
      throw new RangeError(`Wall ${wall.id} has an unsupported material`)
    }
    const forwardFirst = wall.a.x < wall.b.x ||
      (wall.a.x === wall.b.x && wall.a.z <= wall.b.z)
    const ax = forwardFirst ? wall.a.x : wall.b.x
    const az = forwardFirst ? wall.a.z : wall.b.z
    const bx = forwardFirst ? wall.b.x : wall.a.x
    const bz = forwardFirst ? wall.b.z : wall.a.z
    const key = `${ax},${az}:${bx},${bz}`
    const existing = uniqueWalls.get(key)
    const loss = losses[wall.material]
    if (!existing || loss > existing.loss) {
      uniqueWalls.set(key, {
        ax,
        az,
        bx,
        bz,
        loss
      })
    }
  }
  return Array.from(uniqueWalls.values())
}

export function preparedWallLoss(
  from: Point2,
  to: Point2,
  walls: readonly PreparedWall[]
): number {
  let totalLoss = 0
  for (let index = 0; index < walls.length; index += 1) {
    const wall = walls[index]
    if (segmentsIntersect(from, to, wall.ax, wall.az, wall.bx, wall.bz)) {
      totalLoss += wall.loss
    }
  }
  return totalLoss
}

export function wallLoss(
  from: Point2,
  to: Point2,
  walls: readonly Wall[],
  configuredAttenuation?: Partial<WallAttenuation>
): number {
  if (!isFinitePoint(from) || !isFinitePoint(to)) {
    throw new RangeError('Wall intersection endpoints must be finite')
  }
  return preparedWallLoss(from, to, prepareWalls(walls, configuredAttenuation))
}

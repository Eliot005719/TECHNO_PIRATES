import { referencePathLoss, rssiAt } from './pathLoss'
import { prepareWalls, preparedWallLoss, type PreparedWall, type PreparedWalls } from './wallAttenuation'
import type {
  CoverageCell,
  HumanObstacle,
  Point2,
  Point3,
  PropagationSettings,
  Transmitter,
  Wall
} from './propagationTypes'

type ValidatedTransmitter = Transmitter & { y: number; source: Point2 }

const isFinitePoint = (point: Point3): boolean =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.z) &&
  (point.y === undefined || Number.isFinite(point.y))

function validateSettings(settings: PropagationSettings): void {
  if (!Number.isFinite(settings.scaleMetersPerUnit) || settings.scaleMetersPerUnit <= 0) {
    throw new RangeError('scaleMetersPerUnit must be finite and greater than zero')
  }
  if (!Number.isFinite(settings.exponent) || settings.exponent <= 0) {
    throw new RangeError('exponent must be finite and greater than zero')
  }
  if (!Number.isFinite(settings.receiverGainDbi)) {
    throw new RangeError('receiverGainDbi must be finite')
  }
  if (settings.mode !== 'combined' && settings.mode !== 'individual') {
    throw new RangeError('mode must be "combined" or "individual"')
  }
  if (typeof settings.selectedApId !== 'string') {
    throw new TypeError('selectedApId must be a string')
  }
  if (!Number.isSafeInteger(settings.resolution) || settings.resolution <= 0) {
    throw new RangeError('resolution must be a positive safe integer')
  }
  if (settings.bodyAttenuationDb !== undefined &&
      (!Number.isFinite(settings.bodyAttenuationDb) || settings.bodyAttenuationDb < 0)) {
    throw new RangeError('bodyAttenuationDb must be finite and non-negative')
  }
}

function validatePoint(point: Point3): void {
  if (!isFinitePoint(point)) {
    throw new RangeError('Receiver coordinates must be finite')
  }
}

function prepareHumans(humans?: HumanObstacle | readonly HumanObstacle[]): readonly HumanObstacle[] {
  if (!humans) return []
  const list = Array.isArray(humans) ? humans : [humans]
  for (const human of list) {
    if (typeof human.id !== 'string' || !human.id ||
        !Number.isFinite(human.x) || !Number.isFinite(human.z) ||
        !Number.isFinite(human.radius) || human.radius < 0) {
      throw new RangeError('Human obstacles need an id, finite coordinates, and a finite non-negative radius')
    }
  }
  return list
}

function prepareTransmitters(
  aps: readonly Transmitter[],
  settings: PropagationSettings
): ValidatedTransmitter[] {
  const active: ValidatedTransmitter[] = []
  for (const ap of aps) {
    if (typeof ap.active !== 'boolean') {
      throw new TypeError(`Transmitter ${ap.id} must have a boolean active state`)
    }
    if (!ap.active || (settings.mode === 'individual' && ap.id !== settings.selectedApId)) {
      continue
    }
    if (!ap.id || !Number.isFinite(ap.x) || !Number.isFinite(ap.z) ||
        (ap.y !== undefined && !Number.isFinite(ap.y)) ||
        !Number.isFinite(ap.powerDbm) ||
        (ap.gainDbi !== undefined && !Number.isFinite(ap.gainDbi))) {
      throw new RangeError(`Active transmitter ${ap.id || '(unknown)'} has invalid coordinates or power`)
    }
    referencePathLoss(ap.frequencyGHz)
    active.push({ ...ap, y: ap.y ?? 0, source: { x: ap.x, z: ap.z } })
  }
  return active
}

function pointHumanDistanceSquared(
  start: Point2,
  end: Point2,
  human: HumanObstacle
): number {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const segmentLengthSquared = dx * dx + dz * dz
  const projection = segmentLengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((human.x - start.x) * dx + (human.z - start.z) * dz) / segmentLengthSquared))
  const nearestX = start.x + projection * dx
  const nearestZ = start.z + projection * dz
  const offsetX = human.x - nearestX
  const offsetZ = human.z - nearestZ
  return offsetX * offsetX + offsetZ * offsetZ
}

function humanLossOnPath(
  from: Point2,
  to: Point2,
  humans: readonly HumanObstacle[],
  bodyAttenuationDb: number
): number {
  let totalLoss = 0
  for (let index = 0; index < humans.length; index += 1) {
    const human = humans[index]
    if (pointHumanDistanceSquared(from, to, human) <= human.radius * human.radius) {
      totalLoss += bodyAttenuationDb
    }
  }
  return totalLoss
}

function categoryFor(rssi: number): CoverageCell['category'] {
  if (rssi > -58) return 'strong'
  if (rssi > -70) return 'moderate'
  if (rssi > -82) return 'weak'
  return 'none'
}

function calculateCoverage(
  point: Point3,
  transmitters: readonly ValidatedTransmitter[],
  walls: readonly PreparedWall[],
  settings: PropagationSettings,
  humans: readonly HumanObstacle[]
): CoverageCell {
  if (transmitters.length === 0) {
    return {
      x: point.x,
      z: point.z,
      rssi: -100,
      strongestApId: null,
      wallLoss: 0,
      humanObstructionLoss: 0,
      category: 'none'
    }
  }

  const receiverY = point.y ?? 0.8
  let bestAp: ValidatedTransmitter | null = null
  let bestRssi = -Infinity
  let bestWallLoss = 0
  let bestHumanLoss = 0

  for (let index = 0; index < transmitters.length; index += 1) {
    const ap = transmitters[index]
    const wallAttenuation = preparedWallLoss(ap.source, point, walls)
    const humanAttenuation = humanLossOnPath(ap.source, point, humans, settings.bodyAttenuationDb ?? 0)
    const distance = Math.hypot(
      point.x - ap.x,
      point.z - ap.z,
      receiverY - ap.y
    )
    const rssi = rssiAt(
      distance,
      ap.frequencyGHz,
      ap.powerDbm,
      settings.exponent,
      settings.scaleMetersPerUnit,
      wallAttenuation + humanAttenuation,
      settings.receiverGainDbi,
      ap.gainDbi ?? 0
    )

    if (
      rssi > bestRssi ||
      (rssi === bestRssi && bestAp !== null && ap.id.localeCompare(bestAp.id) < 0)
    ) {
      bestAp = ap
      bestRssi = rssi
      bestWallLoss = wallAttenuation
      bestHumanLoss = humanAttenuation
    }
  }

  return {
    x: point.x,
    z: point.z,
    rssi: bestRssi,
    strongestApId: bestAp?.id ?? null,
    wallLoss: bestWallLoss,
    humanObstructionLoss: bestHumanLoss,
    category: categoryFor(bestRssi)
  }
}

function prepareCoverageInputs(
  aps: readonly Transmitter[],
  walls: readonly Wall[],
  settings: PropagationSettings,
  humans?: HumanObstacle | readonly HumanObstacle[]
): { transmitters: ValidatedTransmitter[]; walls: PreparedWalls; humans: readonly HumanObstacle[] } {
  validateSettings(settings)
  return {
    transmitters: prepareTransmitters(aps, settings),
    walls: prepareWalls(walls, settings.wallAttenuation),
    humans: prepareHumans(humans)
  }
}

/**
 * Computes strongest-server or selected-AP coverage at a single 3D receiver point.
 * The existing "combined" mode is strongest-server selection, not RF power summation.
 */
export function coverageAt(
  point: Point3,
  aps: readonly Transmitter[],
  walls: readonly Wall[],
  settings: PropagationSettings,
  humans?: HumanObstacle | readonly HumanObstacle[]
): CoverageCell {
  validatePoint(point)
  const prepared = prepareCoverageInputs(aps, walls, settings, humans)
  return calculateCoverage(point, prepared.transmitters, prepared.walls, settings, prepared.humans)
}

/**
 * Generates one coverage sample at the center of each equal-sized grid cell.
 */
export function coverageGrid(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  aps: readonly Transmitter[],
  walls: readonly Wall[],
  settings: PropagationSettings,
  humans?: HumanObstacle | readonly HumanObstacle[]
): CoverageCell[] {
  const { minX, maxX, minZ, maxZ } = bounds
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || minX >= maxX || minZ >= maxZ) {
    throw new RangeError('Coverage bounds must be finite and have positive width and height')
  }
  const prepared = prepareCoverageInputs(aps, walls, settings, humans)
  const resolution = settings.resolution
  const stepX = (maxX - minX) / resolution
  const stepZ = (maxZ - minZ) / resolution
  const cellCount = resolution * resolution
  if (!Number.isFinite(stepX) || !Number.isFinite(stepZ) ||
      !Number.isSafeInteger(cellCount) || cellCount > 0xFFFFFFFF) {
    throw new RangeError('Coverage grid dimensions exceed supported numeric limits')
  }
  const cells = new Array<CoverageCell>(cellCount)
  let index = 0

  for (let xIndex = 0; xIndex < resolution; xIndex += 1) {
    const x = minX + (xIndex + 0.5) * stepX
    for (let zIndex = 0; zIndex < resolution; zIndex += 1) {
      const z = minZ + (zIndex + 0.5) * stepZ
      const point = { x, z }
      const cell = calculateCoverage(point, prepared.transmitters, prepared.walls, settings, prepared.humans)
      cell.cellWidth = stepX
      cell.cellDepth = stepZ
      cells[index] = cell
      index += 1
    }
  }
  return cells
}

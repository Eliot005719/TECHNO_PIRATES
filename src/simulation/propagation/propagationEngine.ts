import { rssiAt } from './pathLoss'
import { wallLoss } from './wallAttenuation'
import type { CoverageCell, Point2, PropagationSettings, Transmitter, Wall } from './propagationTypes'

/**
 * Computes coverage at a single 2D location.
 * Evaluates path loss from active APs, wall attenuation, and simplified human body shadowing.
 * Note: Human body attenuation is an illustrative simulation assumption (shadowing effect ~2.5 dB).
 */
export function coverageAt(
  point: Point2,
  aps: Transmitter[],
  walls: Wall[],
  settings: PropagationSettings,
  humans?: Point2 | Point2[]
): CoverageCell {
  const humanList: Point2[] = Array.isArray(humans) ? humans : humans ? [humans] : []
  const bodyLossDb = settings.bodyAttenuationDb ?? 2.5
  
  // Check if any human is within immediate proximity (self-shadowing / obstacle radius of 1.2m)
  const isHumanNearby = humanList.some(h => Math.hypot(point.x - h.x, point.z - h.z) < 1.2)
  const humanLoss = isHumanNearby ? bodyLossDb : 0

  const activeTransmitters = aps.filter(
    a => a.active && (settings.mode === 'combined' || a.id === settings.selectedApId)
  )

  if (activeTransmitters.length === 0) {
    return {
      x: point.x,
      z: point.z,
      rssi: -100,
      strongestApId: null,
      wallLoss: 0,
      humanObstructionLoss: humanLoss,
      category: 'none'
    }
  }

  const candidates = activeTransmitters.map(ap => {
    const loss = wallLoss({ x: ap.x, z: ap.z }, point, walls)
    const distanceUnits = Math.hypot(point.x - ap.x, point.z - ap.z)
    const rssi = rssiAt(
      distanceUnits,
      ap.frequencyGHz,
      ap.powerDbm,
      settings.exponent,
      settings.scaleMetersPerUnit,
      loss + humanLoss,
      settings.receiverGainDbi
    )
    return { ap, rssi, loss }
  })

  // Select strongest active AP signal
  candidates.sort((a, b) => b.rssi - a.rssi)
  const best = candidates[0]
  const rssi = best ? best.rssi : -100

  let category: 'strong' | 'moderate' | 'weak' | 'none' = 'none'
  if (rssi > -58) category = 'strong'
  else if (rssi > -70) category = 'moderate'
  else if (rssi > -82) category = 'weak'

  return {
    x: point.x,
    z: point.z,
    rssi,
    strongestApId: best ? best.ap.id : null,
    wallLoss: best ? best.loss : 0,
    humanObstructionLoss: humanLoss,
    category
  }
}

/**
 * Generates or recalculates the coverage grid across a rectangular floor region.
 */
export function coverageGrid(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  aps: Transmitter[],
  walls: Wall[],
  settings: PropagationSettings,
  humans?: Point2 | Point2[]
): CoverageCell[] {
  const cells: CoverageCell[] = []
  const stepX = (bounds.maxX - bounds.minX) / settings.resolution
  const stepZ = (bounds.maxZ - bounds.minZ) / settings.resolution

  for (let x = bounds.minX + stepX / 2; x <= bounds.maxX; x += stepX) {
    for (let z = bounds.minZ + stepZ / 2; z <= bounds.maxZ; z += stepZ) {
      cells.push(coverageAt({ x, z }, aps, walls, settings, humans))
    }
  }
  return cells
}

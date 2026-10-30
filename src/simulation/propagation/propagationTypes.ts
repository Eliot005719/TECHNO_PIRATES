export type Point2 = { x: number; z: number }
export type Point3 = Point2 & { y?: number }

export type HumanObstacle = Point2 & { id: string; radius: number }

export type WallAttenuation = {
  partition: number
  exterior: number
  glass: number
  concrete: number
  brick: number
}

export type Wall = {
  id: string
  a: Point2
  b: Point2
  material: 'partition' | 'exterior' | 'glass' | 'concrete' | 'brick'
}

export type Transmitter = {
  id: string
  x: number
  z: number
  y?: number
  frequencyGHz: number
  powerDbm: number
  gainDbi?: number
  active: boolean
}

export type PropagationSettings = {
  scaleMetersPerUnit: number
  exponent: number
  receiverGainDbi: number
  mode: 'individual' | 'combined'
  selectedApId: string
  resolution: number
  bodyAttenuationDb?: number
  wallAttenuation?: Partial<WallAttenuation>
  heatmapOpacity?: number
}

export type CoverageCell = Point3 & {
  rssi: number
  strongestApId: string | null
  category: 'strong' | 'moderate' | 'weak' | 'none'
  wallLoss: number
  humanObstructionLoss?: number
  cellWidth?: number
  cellDepth?: number
}

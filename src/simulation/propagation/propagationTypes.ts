export type Point2 = { x: number; z: number }

export type Wall = {
  id: string
  a: Point2
  b: Point2
  material: 'partition' | 'exterior' | 'glass'
}

export type Transmitter = {
  id: string
  x: number
  z: number
  frequencyGHz: number
  powerDbm: number
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
}

export type CoverageCell = Point2 & {
  rssi: number
  strongestApId: string | null
  category: 'strong' | 'moderate' | 'weak' | 'none'
  wallLoss: number
  humanObstructionLoss?: number
}

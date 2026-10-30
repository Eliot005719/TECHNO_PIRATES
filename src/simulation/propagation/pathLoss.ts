function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`)
  }
}

function requirePositive(name: string, value: number): void {
  requireFinite(name, value)
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`)
  }
}

export function referencePathLoss(frequencyGHz: number): number {
  requirePositive('frequencyGHz', frequencyGHz)
  const frequencyMHz = frequencyGHz * 1000
  requirePositive('frequencyMHz', frequencyMHz)
  return 20 * Math.log10(frequencyMHz) - 27.55
}

export function rssiAt(
  distanceUnits: number,
  frequencyGHz: number,
  powerDbm: number,
  exponent: number,
  scale: number,
  wallLoss: number,
  receiverGain = 0,
  transmitterGain = 0
): number {
  requireFinite('distanceUnits', distanceUnits)
  requireFinite('powerDbm', powerDbm)
  requirePositive('exponent', exponent)
  requirePositive('scale', scale)
  requireFinite('wallLoss', wallLoss)
  requireFinite('receiverGain', receiverGain)
  requireFinite('transmitterGain', transmitterGain)
  if (distanceUnits < 0) {
    throw new RangeError('distanceUnits must not be negative')
  }
  if (wallLoss < 0) {
    throw new RangeError('wallLoss must not be negative')
  }

  const distanceMeters = Math.max(0.2, distanceUnits * scale)
  requireFinite('distanceMeters', distanceMeters)
  const pathLoss = referencePathLoss(frequencyGHz) +
    10 * exponent * Math.log10(distanceMeters)
  const rssi = powerDbm + transmitterGain + receiverGain - pathLoss - wallLoss
  return Math.max(-100, Math.min(-20, rssi))
}

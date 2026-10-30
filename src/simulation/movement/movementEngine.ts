export interface Waypoint {
  x: number
  z: number
  room: string
  description?: string
}

export interface RouteDefinition {
  id: string
  name: string
  description: string
  waypoints: Waypoint[]
}

export interface Agent {
  id: string
  name: string
  color: string
  route: string
  index: number
  progress: number
  x: number
  y: number
  z: number
  buildingId: string
  room: string
  roomName: string
  floor: string
  speed: number
  active: boolean
  state: 'idle' | 'moving' | 'paused' | 'stopped'
  trail: [number, number][]
  loopsCompleted: number
}

/**
 * Three verified routes through Building 410.
 * Waypoints navigate through doorways (x=0, z=0 for storage; x=0, z=-6 for seminar)
 * without intersecting interior or exterior partition walls.
 */
export const routes: Record<string, RouteDefinition> = {
  route_1: {
    id: 'route_1',
    name: 'Route 1: Hallway → Storage Room → Hallway',
    description: 'Circulates from the central hallway through the storage door, around the shelving racks, and returns.',
    waypoints: [
      { x: -6.0, z: 2.0, room: 'lobby', description: 'Hallway north corridor' },
      { x: -2.0, z: 0.0, room: 'lobby', description: 'Hallway outside Storage door' },
      { x: 1.5, z: 0.0, room: 'storage_room_01', description: 'Storage entry doorway' },
      { x: 5.5, z: 0.0, room: 'storage_room_01', description: 'Storage central aisle' },
      { x: 8.5, z: 2.0, room: 'storage_room_01', description: 'Storage shelving lane' },
      { x: 5.5, z: 2.5, room: 'storage_room_01', description: 'Storage return aisle' },
      { x: 1.5, z: 0.0, room: 'storage_room_01', description: 'Storage exit doorway' },
      { x: -2.0, z: 0.0, room: 'lobby', description: 'Hallway outside Storage door' },
      { x: -6.0, z: -0.5, room: 'lobby', description: 'Hallway lobby node' }
    ]
  },
  route_2: {
    id: 'route_2',
    name: 'Route 2: Hallway → Seminar Room → Hallway',
    description: 'Enters the seminar classroom through the southern doorway, traverses the seating row, and returns to the hallway.',
    waypoints: [
      { x: -6.0, z: -3.0, room: 'lobby', description: 'Hallway corridor' },
      { x: -2.0, z: -6.0, room: 'lobby', description: 'Hallway outside Seminar door' },
      { x: 1.5, z: -6.0, room: 'classroom_a', description: 'Seminar room doorway' },
      { x: 5.0, z: -6.0, room: 'classroom_a', description: 'Seminar room aisle' },
      { x: 8.5, z: -6.0, room: 'classroom_a', description: 'Seminar room presentation zone' },
      { x: 5.0, z: -5.5, room: 'classroom_a', description: 'Seminar room exit path' },
      { x: 1.5, z: -6.0, room: 'classroom_a', description: 'Seminar exit doorway' },
      { x: -2.0, z: -6.0, room: 'lobby', description: 'Hallway outside Seminar door' },
      { x: -6.0, z: -5.0, room: 'lobby', description: 'Hallway south corridor' }
    ]
  },
  route_3: {
    id: 'route_3',
    name: 'Route 3: Hallway → Storage Room → Seminar Room',
    description: 'Enters the storage room, exits back into the hallway, and enters the seminar classroom through its sanctioned door.',
    waypoints: [
      { x: -6.0, z: 1.0, room: 'lobby', description: 'Hallway start' },
      { x: -2.0, z: 0.0, room: 'lobby', description: 'Hallway outside Storage door' },
      { x: 1.5, z: 0.0, room: 'storage_room_01', description: 'Enter Storage door' },
      { x: 6.0, z: 1.0, room: 'storage_room_01', description: 'Storage inspection point' },
      { x: 1.5, z: 0.0, room: 'storage_room_01', description: 'Exit Storage door' },
      { x: -2.0, z: 0.0, room: 'lobby', description: 'Hallway between doorways' },
      { x: -2.0, z: -6.0, room: 'lobby', description: 'Hallway outside Seminar door' },
      { x: 1.5, z: -6.0, room: 'classroom_a', description: 'Enter Seminar door' },
      { x: 6.0, z: -6.0, room: 'classroom_a', description: 'Seminar classroom center' },
      { x: 1.5, z: -6.0, room: 'classroom_a', description: 'Exit Seminar door' },
      { x: -2.0, z: -6.0, room: 'lobby', description: 'Hallway corridor' },
      { x: -6.0, z: -2.0, room: 'lobby', description: 'Hallway central corridor' }
    ]
  }
}

// Aliases for backward compatibility
export const routeA = routes.route_1
export const routeB = routes.route_2
export const routeC = routes.route_3

export const routeAliases: Record<string, string> = {
  A: 'route_1',
  B: 'route_2',
  C: 'route_3',
  route_1: 'route_1',
  route_2: 'route_2',
  route_3: 'route_3'
}

/**
 * Resolves current room from 2D coordinates within Building 410.
 */
export function detectRoom(x: number, z: number): { id: string; name: string } {
  if (x < 0) {
    return { id: 'lobby', name: 'Welcome Lobby / Hallway' }
  } else if (z >= -4) {
    return { id: 'storage_room_01', name: 'Storage Room' }
  } else {
    return { id: 'classroom_a', name: 'Seminar Room' }
  }
}

/**
 * Time-based movement step. Advances agent toward next waypoint based on elapsed delta-time (dt)
 * and speed in meters/sec, independent of display frame rate.
 */
export function advance(
  agent: Agent,
  dtSeconds: number,
  speedMultiplier: number = 1.0,
  maxTrailLength: number = 60
): Agent {
  if (!agent.active || agent.state !== 'moving') {
    return agent
  }

  const routeKey = routeAliases[agent.route] || 'route_1'
  const routeDef = routes[routeKey] || routes.route_1
  const waypoints = routeDef.waypoints

  const currentWaypoint = waypoints[agent.index % waypoints.length]
  const nextIndex = (agent.index + 1) % waypoints.length
  const targetWaypoint = waypoints[nextIndex]

  const dx = targetWaypoint.x - agent.x
  const dz = targetWaypoint.z - agent.z
  const distanceToTarget = Math.hypot(dx, dz)

  const effectiveSpeed = agent.speed * speedMultiplier
  const moveDistance = effectiveSpeed * dtSeconds

  // Update trail only if agent moved significantly (> 0.2m) to avoid excessive point density
  const lastTrailPoint = agent.trail[agent.trail.length - 1]
  const distFromLastTrail = lastTrailPoint
    ? Math.hypot(agent.x - lastTrailPoint[0], agent.z - lastTrailPoint[1])
    : Infinity

  const newTrail = [...agent.trail]
  if (distFromLastTrail > 0.2) {
    newTrail.push([agent.x, agent.z])
    if (newTrail.length > maxTrailLength) {
      newTrail.shift()
    }
  }

  if (distanceToTarget <= moveDistance || distanceToTarget < 0.05) {
    // Reached current target waypoint
    const completedLoop = nextIndex === 0
    const newRoomInfo = detectRoom(targetWaypoint.x, targetWaypoint.z)

    return {
      ...agent,
      x: targetWaypoint.x,
      z: targetWaypoint.z,
      index: nextIndex,
      progress: 0,
      room: newRoomInfo.id,
      roomName: newRoomInfo.name,
      trail: newTrail,
      loopsCompleted: completedLoop ? agent.loopsCompleted + 1 : agent.loopsCompleted
    }
  }

  // Linear progression toward target waypoint
  const ratio = moveDistance / distanceToTarget
  const nextX = agent.x + dx * ratio
  const nextZ = agent.z + dz * ratio
  const newRoomInfo = detectRoom(nextX, nextZ)

  return {
    ...agent,
    x: nextX,
    z: nextZ,
    room: newRoomInfo.id,
    roomName: newRoomInfo.name,
    trail: newTrail
  }
}

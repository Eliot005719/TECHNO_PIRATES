import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { campusBuildings, rooms } from '../data/visual-geometry'
import { wifiNodes, type WifiNode } from '../data/wifi-mesh'
import { coverageAt, coverageGrid } from '../simulation/propagation/propagationEngine'
import type { CoverageCell, PropagationSettings, Transmitter, Wall } from '../simulation/propagation/propagationTypes'
import { advance, routes, type Agent, type RouteDefinition } from '../simulation/movement/movementEngine'
import type { AgentSignalRecord, AppSettings, EventItem, PageId, SimulationMode } from '../types/campus'
import type { MeshOptions } from '../components/Scene'

const DEFAULT_SETTINGS: AppSettings = {
  updateIntervalMs: 250,
  defaultBuildingId: '410',
  defaultFloorId: 'Floor 1',
  defaultRoomId: 'storage_room_01',
  defaultHeatmapVisible: true,
  defaultPropagationMode: 'combined',
  defaultSpeed: 1.4,
  showTrails: true,
  maxTrailLength: 60,
  bodyAttenuationDb: 2.5
}

const createDefaultPropagationSettings = (
  mode: PropagationSettings['mode'],
  bodyAttenuationDb: number
): PropagationSettings => ({
  scaleMetersPerUnit: 1.0,
  exponent: 3.0,
  receiverGainDbi: 0,
  mode,
  selectedApId: 'ap-410-storage',
  resolution: 18,
  bodyAttenuationDb,
  wallAttenuation: { partition: 3.5, exterior: 12.0, glass: 2.5, concrete: 15, brick: 10 },
  heatmapOpacity: 0.44
})

const LOCAL_STORAGE_KEY = 'campus-sentinel-settings'

const AGENT_COLORS = ['#e05f86', '#4d9bc8', '#2ecc71', '#e67e22', '#9b59b6', '#1abc9c']

export const buildingWalls: Wall[] = [
  { id: 'west', a: { x: -10, z: -8 }, b: { x: -10, z: 8 }, material: 'exterior' },
  { id: 'east', a: { x: 12, z: -8 }, b: { x: 12, z: 8 }, material: 'exterior' },
  { id: 'north', a: { x: -10, z: -8 }, b: { x: 12, z: -8 }, material: 'exterior' },
  { id: 'south', a: { x: -10, z: 8 }, b: { x: 12, z: 8 }, material: 'exterior' },
  { id: 'corridor_north', a: { x: 0, z: -8 }, b: { x: 0, z: -3 }, material: 'partition' },
  { id: 'corridor_south', a: { x: 0, z: 0 }, b: { x: 0, z: 8 }, material: 'partition' },
  { id: 'storage_seminar_divider', a: { x: 1, z: -4 }, b: { x: 12, z: -4 }, material: 'partition' }
]

interface CampusContextType {
  // Navigation
  page: PageId
  setPage: (p: PageId) => void
  sceneMode: SimulationMode
  setSceneMode: (m: SimulationMode) => void
  selectedBuildingId: string
  setSelectedBuildingId: (id: string) => void
  selectedFloorId: string
  setSelectedFloorId: (id: string) => void
  selectedRoomId: string
  setSelectedRoomId: (id: string) => void
  selectedApId: string
  setSelectedApId: (id: string) => void
  selectedAgentId: string
  setSelectedAgentId: (id: string) => void
  cutaway: boolean
  setCutaway: (c: boolean | ((prev: boolean) => boolean)) => void

  // Mesh
  nodes: WifiNode[]
  toggleNodeActive: (id: string) => void
  meshOptions: MeshOptions
  setMeshOptions: React.Dispatch<React.SetStateAction<MeshOptions>>

  // Propagation
  propSettings: PropagationSettings
  setPropSettings: React.Dispatch<React.SetStateAction<PropagationSettings>>
  heatmapVisible: boolean
  setHeatmapVisible: (v: boolean | ((prev: boolean) => boolean)) => void
  coverage: CoverageCell[]
  localCoverage: CoverageCell[]
  inspectedCoverage: CoverageCell
  updateNodePower: (id: string, powerDbm: number) => void
  updateNodeGain: (id: string, gainDbi: number) => void
  updateNodeBand: (id: string, band: WifiNode['band']) => void

  // Movement
  agents: Agent[]
  movementState: 'idle' | 'moving' | 'paused' | 'stopped'
  addAgent: () => void
  removeAgent: (id: string) => void
  updateAgent: (id: string, partial: Partial<Agent>) => void
  startMovement: () => void
  pauseMovement: () => void
  resumeMovement: () => void
  stopMovement: () => void
  resetMovement: () => void
  clearTrails: () => void
  toggleTrails: () => void

  // Signal Telemetry History
  signalHistory: Record<string, AgentSignalRecord[]>
  clearSignalHistory: (agentId?: string) => void

  // Event Log
  events: EventItem[]
  addEvent: (
    type: EventItem['type'],
    category: EventItem['category'],
    title: string,
    description: string,
    relatedId?: string
  ) => void
  clearEvents: () => void

  // Settings
  settings: AppSettings
  updateSettings: (partial: Partial<AppSettings>) => void
  saveSettings: () => void
  resetSettings: () => void

  // Actions
  enterBuilding: (buildingId?: string) => void
  exitToCampus: () => void
}

const CampusContext = createContext<CampusContextType | null>(null)

export const CampusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Settings state with localStorage initialization
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
      }
    } catch (e) {
      console.warn('Failed to parse saved settings, falling back to defaults', e)
    }
    return DEFAULT_SETTINGS
  })

  // 2. Navigation State
  const [page, setPage] = useState<PageId>('overview')
  const [sceneMode, setSceneMode] = useState<SimulationMode>('campus')
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(settings.defaultBuildingId)
  const [selectedFloorId, setSelectedFloorId] = useState<string>(settings.defaultFloorId)
  const [selectedRoomId, setSelectedRoomId] = useState<string>(settings.defaultRoomId)
  const [selectedApId, setSelectedApIdState] = useState<string>('ap-410-storage')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('agent-01')
  const [cutaway, setCutaway] = useState<boolean>(false)

  // 3. Mesh Nodes & Visual Options
  const [nodes, setNodes] = useState<WifiNode[]>(
    wifiNodes.map(node => ({
      ...node,
      powerDbm: node.powerDbm ?? 18,
      gainDbi: node.gainDbi ?? 0
    }))
  )
  const [meshOptions, setMeshOptions] = useState<MeshOptions>({
    visible: true,
    labels: true,
    links: true,
    scope: 'campus',
    ceilings: true,
    furniture: true
  })

  // 4. Propagation Settings
  const [propSettings, setPropSettings] = useState<PropagationSettings>(() =>
    createDefaultPropagationSettings(settings.defaultPropagationMode, settings.bodyAttenuationDb)
  )
  const previousPropSettings = useRef(propSettings)
  const [heatmapVisible, setHeatmapVisibleState] = useState<boolean>(settings.defaultHeatmapVisible)

  // 5. Movement & Agents
  const [agents, setAgents] = useState<Agent[]>([
    {
      id: 'agent-01',
      name: 'Agent Alpha (Staff)',
      color: AGENT_COLORS[0],
      route: 'route_1',
      index: 0,
      progress: 0,
      x: -6,
      y: 0,
      z: 2,
      buildingId: '410',
      room: 'lobby',
      roomName: 'Welcome Lobby / Hallway',
      floor: 'Floor 1',
      speed: 1.4,
      active: true,
      state: 'idle',
      trail: [[-6, 2]],
      loopsCompleted: 0
    },
    {
      id: 'agent-02',
      name: 'Agent Beta (Student)',
      color: AGENT_COLORS[1],
      route: 'route_2',
      index: 0,
      progress: 0,
      x: -6,
      y: 0,
      z: -3,
      buildingId: '410',
      room: 'lobby',
      roomName: 'Welcome Lobby / Hallway',
      floor: 'Floor 1',
      speed: 1.2,
      active: true,
      state: 'idle',
      trail: [[-6, -3]],
      loopsCompleted: 0
    }
  ])
  const [movementState, setMovementState] = useState<'idle' | 'moving' | 'paused' | 'stopped'>('idle')

  // 6. Signal Telemetry History (time-series per agent)
  const [signalHistory, setSignalHistory] = useState<Record<string, AgentSignalRecord[]>>({})

  // 7. Event System
  const [events, setEvents] = useState<EventItem[]>([
    {
      id: 'evt-init',
      timestamp: new Date().toLocaleTimeString(),
      type: 'system',
      category: 'system',
      title: 'Digital Twin Online',
      description: 'Campus Sentinel initialized with 5 buildings, 5 Wi-Fi APs, and 2 agents.',
      relatedId: 'system'
    }
  ])

  // Helper to add events
  const addEvent = (
    type: EventItem['type'],
    category: EventItem['category'],
    title: string,
    description: string,
    relatedId?: string
  ) => {
    const newEvent: EventItem = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      category,
      title,
      description,
      relatedId
    }
    setEvents(prev => [newEvent, ...prev].slice(0, 200))
  }

  useEffect(() => {
    const previous = previousPropSettings.current
    const changedSettings = (Object.keys(propSettings) as (keyof PropagationSettings)[])
      .filter(key => previous[key] !== propSettings[key])
    if (changedSettings.length > 0) {
      addEvent(
        'propagation_changed',
        'propagation',
        'Propagation Settings Changed',
        `Updated: ${changedSettings.join(', ')}.`,
        selectedApId
      )
      previousPropSettings.current = propSettings
    }
  }, [propSettings, selectedApId])

  const setSelectedApId = (id: string) => {
    setSelectedApIdState(id)
    setPropSettings(previous => ({ ...previous, selectedApId: id }))
  }

  const setHeatmapVisible = (value: boolean | ((previous: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(heatmapVisible) : value
    if (next !== heatmapVisible) {
      addEvent(
        'heatmap_toggled',
        'propagation',
        next ? 'Heatmap Activated' : 'Heatmap Deactivated',
        `3D propagation heatmap switched ${next ? 'on' : 'off'}.`,
        selectedBuildingId
      )
      setHeatmapVisibleState(next)
    }
  }

  const clearEvents = () => {
    setEvents([])
  }

  // Active Transmitters representation
  const transmitters: Transmitter[] = useMemo(() => {
    return nodes.map(n => ({
      id: n.id,
      x: n.position[0],
      y: n.position[1],
      z: n.position[2],
      frequencyGHz: n.band === '6 GHz' ? 6.0 : 5.0,
      powerDbm: n.powerDbm ?? 18,
      gainDbi: n.gainDbi ?? 0,
      active: n.active
    }))
  }, [nodes])

  // Active humans for propagation obstruction (illustrative assumption)
  const activeHumanPoints = useMemo(() => {
    return agents.filter(a => a.active).map(a => ({ id: a.id, x: a.x, z: a.z, radius: 0.35 }))
  }, [agents])

  const roomContains = (x: number, z: number) => rooms.some(room =>
    x >= room.position[0] - room.size[0] / 2 &&
    x <= room.position[0] + room.size[0] / 2 &&
    z >= room.position[2] - room.size[2] / 2 &&
    z <= room.position[2] + room.size[2] / 2
  )

  // Floor 1 heatmap is clipped to the configured room footprints and remains
  // cached while agents move.
  const coverage = useMemo(() => {
    const bounds = {
      minX: Math.min(...rooms.map(room => room.position[0] - room.size[0] / 2)),
      maxX: Math.max(...rooms.map(room => room.position[0] + room.size[0] / 2)),
      minZ: Math.min(...rooms.map(room => room.position[2] - room.size[2] / 2)),
      maxZ: Math.max(...rooms.map(room => room.position[2] + room.size[2] / 2))
    }
    return coverageGrid(bounds, transmitters, buildingWalls, propSettings)
      .filter(cell => roomContains(cell.x, cell.z))
  }, [transmitters, propSettings])

  // Recalculate only small neighborhoods around moving occupants; the complete
  // room heatmap above is not regenerated on each movement interval.
  const localCoverage = useMemo(() => {
    const cells = new Map<string, CoverageCell>()
    for (const agent of agents) {
      if (!agent.active) continue
      const radius = 1.5
      const localCells = coverageGrid(
        {
          minX: agent.x - radius,
          maxX: agent.x + radius,
          minZ: agent.z - radius,
          maxZ: agent.z + radius
        },
        transmitters,
        buildingWalls,
        propSettings,
        activeHumanPoints
      )
      for (const cell of localCells) {
        if (roomContains(cell.x, cell.z)) {
          cells.set(`${cell.x.toFixed(3)},${cell.z.toFixed(3)}`, cell)
        }
      }
    }
    return Array.from(cells.values())
  }, [agents, transmitters, propSettings, activeHumanPoints])

  // Inspected coverage at selected point or room
  const inspectedCoverage = useMemo(() => {
    const selectedAgent = page === 'movement' ? agents.find(a => a.id === selectedAgentId) : undefined
    const targetPoint = selectedAgent
      ? { x: selectedAgent.x, y: selectedAgent.y, z: selectedAgent.z }
      : selectedRoomId === 'classroom_a'
      ? { x: 5, z: -6 }
      : selectedRoomId === 'storage_room_01'
      ? { x: 5, z: 1 }
      : { x: -5, z: 0 }

    return coverageAt(targetPoint, transmitters, buildingWalls, propSettings, activeHumanPoints)
  }, [page, agents, selectedAgentId, selectedRoomId, transmitters, propSettings, activeHumanPoints])

  const updateNodePower = (id: string, powerDbm: number) => {
    if (!Number.isFinite(powerDbm) || powerDbm < 0 || powerDbm > 30) {
      throw new RangeError('Simulated AP transmit power must be between 0 and 30 dBm')
    }
    const node = nodes.find(candidate => candidate.id === id)
    if (!node) return
    setNodes(previous => previous.map(candidate =>
      candidate.id === id ? { ...candidate, powerDbm } : candidate
    ))
    addEvent(
      'propagation_changed',
      'propagation',
      `Transmit Power Changed: ${node.name}`,
      `${id} transmit power set to ${powerDbm.toFixed(1)} dBm.`,
      id
    )
  }

  const updateNodeGain = (id: string, gainDbi: number) => {
    if (!Number.isFinite(gainDbi) || gainDbi < -10 || gainDbi > 20) {
      throw new RangeError('Simulated AP antenna gain must be between -10 and 20 dBi')
    }
    const node = nodes.find(candidate => candidate.id === id)
    if (!node) return
    setNodes(previous => previous.map(candidate =>
      candidate.id === id ? { ...candidate, gainDbi } : candidate
    ))
    addEvent(
      'propagation_changed',
      'propagation',
      `Antenna Gain Changed: ${node.name}`,
      `${id} transmit antenna gain set to ${gainDbi.toFixed(1)} dBi.`,
      id
    )
  }

  const updateNodeBand = (id: string, band: WifiNode['band']) => {
    if (band !== '5 GHz' && band !== '6 GHz') {
      throw new RangeError('Access point band must be 5 GHz or 6 GHz')
    }
    const node = nodes.find(candidate => candidate.id === id)
    if (!node || node.band === band) return
    setNodes(previous => previous.map(candidate =>
      candidate.id === id ? { ...candidate, band } : candidate
    ))
    addEvent(
      'propagation_changed',
      'propagation',
      `Frequency Band Changed: ${node.name}`,
      `${id} frequency changed to ${band}.`,
      id
    )
  }

  // Toggle AP Active Status
  const toggleNodeActive = (id: string) => {
    const node = nodes.find(candidate => candidate.id === id)
    if (!node) return
    const nextActive = !node.active
    setNodes(previous => previous.map(candidate =>
      candidate.id === id ? { ...candidate, active: nextActive } : candidate
    ))
    addEvent(
      nextActive ? 'ap_enabled' : 'ap_disabled',
      'mesh',
      nextActive ? `AP Enabled: ${node.name}` : `AP Disabled: ${node.name}`,
      `Transmitter ${node.id} switched to ${nextActive ? 'active' : 'offline'}.`,
      node.id
    )
  }

  // Navigation actions
  const enterBuilding = (buildingId = '410') => {
    setSelectedBuildingId(buildingId)
    setSceneMode('interior')
    setMeshOptions(o => ({ ...o, scope: 'building' }))
    if (page === 'campus' || page === 'overview') {
      setPage('indoor')
    }
    addEvent(
      'system',
      'system',
      `Entered Building ${buildingId}`,
      `Camera transitioned to interior layout for Building ${buildingId}.`,
      buildingId
    )
  }

  const exitToCampus = () => {
    setSceneMode('campus')
    setMeshOptions(o => ({ ...o, scope: 'campus' }))
    setCutaway(false)
    if (page === 'indoor') {
      setPage('campus')
    }
  }

  // Agent Management
  const addAgent = () => {
    let newIndex = 1
    let id = `agent-${String(newIndex).padStart(2, '0')}`
    while (agents.some(agent => agent.id === id)) {
      newIndex += 1
      id = `agent-${String(newIndex).padStart(2, '0')}`
    }
    const color = AGENT_COLORS[(newIndex - 1) % AGENT_COLORS.length]
    const routeKeys = Object.keys(routes)
    const assignedRoute = routeKeys[(newIndex - 1) % routeKeys.length]
    const routeDef = routes[assignedRoute]
    const startWaypoint = routeDef.waypoints[0]

    const newAgent: Agent = {
      id,
      name: `Agent ${String.fromCharCode(64 + newIndex)}`,
      color,
      route: assignedRoute,
      index: 0,
      progress: 0,
      x: startWaypoint.x,
      y: 0,
      z: startWaypoint.z,
      buildingId: '410',
      room: startWaypoint.room,
      roomName: startWaypoint.room === 'storage_room_01' ? 'Storage Room' : startWaypoint.room === 'classroom_a' ? 'Seminar Room' : 'Welcome Lobby / Hallway',
      floor: 'Floor 1',
      speed: settings.defaultSpeed,
      active: true,
      state: movementState === 'moving' ? 'moving' : 'idle',
      trail: [[startWaypoint.x, startWaypoint.z]],
      loopsCompleted: 0
    }

    setAgents(prev => [...prev, newAgent])
    setSelectedAgentId(id)
    addEvent(
      'agent_added',
      'movement',
      `Agent Added: ${id}`,
      `New agent created on ${routeDef.name} with speed ${newAgent.speed} m/s.`,
      id
    )
  }

  const removeAgent = (id: string) => {
    if (agents.length <= 1) {
      alert('At least one agent must remain in the simulation.')
      return
    }
    const remaining = agents.filter(agent => agent.id !== id)
    if (remaining.length === agents.length) return
    setAgents(remaining)
    setSignalHistory(previous => {
      const next = { ...previous }
      delete next[id]
      return next
    })
    if (selectedAgentId === id) setSelectedAgentId(remaining[0].id)
    addEvent('agent_removed', 'movement', `Agent Removed: ${id}`, `Removed ${id} from active simulation.`, id)
  }

  const updateAgent = (id: string, partial: Partial<Agent>) => {
    const currentAgent = agents.find(agent => agent.id === id)
    if (!currentAgent) return
    const routeChanged = partial.route !== undefined && partial.route !== currentAgent.route
    const activeChanged = partial.active !== undefined && partial.active !== currentAgent.active
    const speedChanged = partial.speed !== undefined && partial.speed !== currentAgent.speed
    const route = routeChanged ? routes[partial.route!] || routes.route_1 : undefined
    const startWaypoint = route?.waypoints[0]
    setAgents(previous => previous.map(agent => {
      if (agent.id !== id) return agent
      return {
        ...agent,
        ...partial,
        ...(activeChanged ? {
          state: !partial.active
            ? 'stopped' as const
            : movementState === 'moving'
            ? 'moving' as const
            : movementState === 'paused'
            ? 'paused' as const
            : 'idle' as const
        } : {}),
        ...(startWaypoint ? {
          index: 0,
          progress: 0,
          x: startWaypoint.x,
          z: startWaypoint.z,
          room: startWaypoint.room,
          roomName: startWaypoint.room === 'storage_room_01'
            ? 'Storage Room'
            : startWaypoint.room === 'classroom_a'
            ? 'Seminar Room'
            : 'Welcome Lobby / Hallway',
          trail: settings.showTrails ? [[startWaypoint.x, startWaypoint.z] as [number, number]] : []
        } : {})
      }
    }))
    if (route) {
      addEvent('route_changed', 'movement', `Route Changed: ${id}`, `${id} reassigned to ${route.name}.`, id)
      if (startWaypoint && startWaypoint.room !== currentAgent.room) {
        addEvent(
          'room_entered',
          'movement',
          `${currentAgent.name} Entered ${startWaypoint.room}`,
          `Route change moved the agent from ${currentAgent.room} to ${startWaypoint.room}.`,
          id
        )
      }
    }
    if (activeChanged) {
      addEvent(
        partial.active ? 'agent_started' : 'agent_stopped',
        'movement',
        partial.active ? `${currentAgent.name} Activated` : `${currentAgent.name} Deactivated`,
        `${id} ${partial.active ? 'joined' : 'left'} the movement simulation.`,
        id
      )
    }
    if (speedChanged) {
      addEvent(
        'movement',
        'movement',
        `Movement Speed Changed: ${id}`,
        `${id} speed set to ${partial.speed!.toFixed(1)} m/s.`,
        id
      )
    }
  }

  const startMovement = () => {
    setMovementState('moving')
    setAgents(prev => prev.map(a => (a.active ? { ...a, state: 'moving' } : a)))
    addEvent('agent_started', 'movement', 'Movement Started', 'Human agents initiated waypoint traversal.', selectedAgentId)
  }

  const pauseMovement = () => {
    setMovementState('paused')
    setAgents(prev => prev.map(a => (a.active ? { ...a, state: 'paused' } : a)))
    addEvent('agent_paused', 'movement', 'Movement Paused', 'Agent movements paused.', selectedAgentId)
  }

  const resumeMovement = () => {
    setMovementState('moving')
    setAgents(prev => prev.map(a => (a.active ? { ...a, state: 'moving' } : a)))
    addEvent('agent_resumed', 'movement', 'Movement Resumed', 'Agent movements resumed.', selectedAgentId)
  }

  const stopMovement = () => {
    setMovementState('stopped')
    setAgents(prev => prev.map(a => ({ ...a, state: 'stopped' })))
    addEvent('agent_stopped', 'movement', 'Movement Stopped', 'Agent simulation stopped.', selectedAgentId)
  }

  const resetMovement = () => {
    setMovementState('idle')
    setSignalHistory({})
    setAgents(prev =>
      prev.map(a => {
        const routeDef = routes[a.route] || routes.route_1
        const startWp = routeDef.waypoints[0]
        return {
          ...a,
          index: 0,
          progress: 0,
          x: startWp.x,
          z: startWp.z,
          room: startWp.room,
          roomName: startWp.room === 'storage_room_01' ? 'Storage Room' : startWp.room === 'classroom_a' ? 'Seminar Room' : 'Welcome Lobby / Hallway',
          state: 'idle',
          trail: [[startWp.x, startWp.z]],
          loopsCompleted: 0
        }
      })
    )
    addEvent('agent_reset', 'movement', 'Agents Reset', 'All agents restored to initial waypoints.', 'movement')
  }

  const clearTrails = () => {
    setAgents(prev => prev.map(a => ({ ...a, trail: [[a.x, a.z]] })))
    addEvent('system', 'movement', 'Trails Cleared', 'Movement trajectory trails reset.', 'trails')
  }

  const toggleTrails = () => {
    const nextVal = !settings.showTrails
    setSettings(s => ({ ...s, showTrails: nextVal }))
    addEvent(
      'system',
      'movement',
      nextVal ? 'Trails Enabled' : 'Trails Hidden',
      `Agent trajectory visualization toggled ${nextVal ? 'on' : 'off'}.`,
      'trails'
    )
  }

  const clearSignalHistory = (agentId?: string) => {
    if (agentId) {
      setSignalHistory(prev => ({ ...prev, [agentId]: [] }))
    } else {
      setSignalHistory({})
    }
  }

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }))
    if (partial.bodyAttenuationDb !== undefined) {
      setPropSettings(previous => ({
        ...previous,
        bodyAttenuationDb: partial.bodyAttenuationDb
      }))
    }
  }

  const saveSettings = () => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings))
      addEvent(
        'settings_saved',
        'system',
        'Settings Saved',
        'Configuration persisted successfully to local storage.',
        'settings'
      )
    } catch (e) {
      console.error('Error saving settings to localStorage', e)
    }
  }

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS)
    setSelectedBuildingId(DEFAULT_SETTINGS.defaultBuildingId)
    setSelectedFloorId(DEFAULT_SETTINGS.defaultFloorId)
    setSelectedRoomId(DEFAULT_SETTINGS.defaultRoomId)
    setSelectedApId('ap-410-storage')
    setHeatmapVisible(DEFAULT_SETTINGS.defaultHeatmapVisible)
    setSceneMode('campus')
    setMeshOptions(previous => ({ ...previous, scope: 'campus' }))
    setNodes(wifiNodes.map(node => ({
      ...node,
      powerDbm: node.powerDbm ?? 18,
      gainDbi: node.gainDbi ?? 0
    })))
    setPropSettings(createDefaultPropagationSettings(
      DEFAULT_SETTINGS.defaultPropagationMode,
      DEFAULT_SETTINGS.bodyAttenuationDb
    ))
    localStorage.removeItem(LOCAL_STORAGE_KEY)
    addEvent('system', 'system', 'Settings Reset', 'Configuration restored to default simulation parameters.', 'settings')
  }

  // 8. Controlled Simulation Loop
  // Updates agent positions, checks room changes, computes real propagation RSSI,
  // and updates signal history
  const agentsRef = useRef(agents)
  agentsRef.current = agents
  useEffect(() => {
    if (movementState !== 'moving') return

    const intervalMs = settings.updateIntervalMs
    const dtSeconds = intervalMs / 1000

    const timer = setInterval(() => {
      const currentAgents = agentsRef.current
      const updatedAgents = currentAgents.map(agent =>
        agent.active && agent.state === 'moving'
          ? advance(agent, dtSeconds, 1.0, settings.maxTrailLength)
          : agent
      )
      const tickHumanPoints = updatedAgents
        .filter(agent => agent.active)
        .map(agent => ({ id: agent.id, x: agent.x, z: agent.z, radius: 0.35 }))
      const timestamp = Date.now()
      const timeLabel = new Date(timestamp).toLocaleTimeString()

      currentAgents.forEach((agent, index) => {
        const advanced = updatedAgents[index]
        if (!agent.active || agent.state !== 'moving') return

        // Room change detection
        if (advanced.room !== agent.room) {
          addEvent(
            'room_entered',
            'movement',
            `${agent.name} Entered ${advanced.roomName}`,
            `Transitioned from ${agent.room} to ${advanced.roomName}.`,
            agent.id
          )
        }

        // Loop completion detection
        if (advanced.loopsCompleted > agent.loopsCompleted) {
          addEvent(
            'route_completed',
            'movement',
            `${agent.name} Completed Route`,
            `Completed cycle on route ${routes[agent.route]?.name || agent.route}.`,
            agent.id
          )
        }

        // Calculate real propagation estimate at agent position
        const signal = coverageAt(
          { x: advanced.x, y: advanced.y, z: advanced.z },
          transmitters,
          buildingWalls,
          propSettings,
          tickHumanPoints
        )

        // Record real telemetry history
        setSignalHistory(prevHistory => {
          const list = prevHistory[agent.id] || []
          const record: AgentSignalRecord = {
            timestamp,
            timeLabel,
            agentId: agent.id,
            buildingId: agent.buildingId,
            floor: agent.floor,
            x: advanced.x,
            y: advanced.y,
            z: advanced.z,
            room: advanced.room,
            roomName: advanced.roomName,
            strongestApId: signal.strongestApId,
            rssi: signal.rssi,
            category: signal.category
          }
          return {
            ...prevHistory,
            [agent.id]: [...list, record].slice(-100) // keep last 100 points
          }
        })

      })

      setAgents(updatedAgents)
    }, intervalMs)

    return () => clearInterval(timer)
  }, [movementState, settings.updateIntervalMs, settings.maxTrailLength, transmitters, propSettings])

  return (
    <CampusContext.Provider
      value={{
        page,
        setPage,
        sceneMode,
        setSceneMode,
        selectedBuildingId,
        setSelectedBuildingId,
        selectedFloorId,
        setSelectedFloorId,
        selectedRoomId,
        setSelectedRoomId,
        selectedApId,
        setSelectedApId,
        selectedAgentId,
        setSelectedAgentId,
        cutaway,
        setCutaway,
        nodes,
        toggleNodeActive,
        meshOptions,
        setMeshOptions,
        propSettings,
        setPropSettings,
        heatmapVisible,
        setHeatmapVisible,
        coverage,
        localCoverage,
        inspectedCoverage,
        updateNodePower,
        updateNodeGain,
        updateNodeBand,
        agents,
        movementState,
        addAgent,
        removeAgent,
        updateAgent,
        startMovement,
        pauseMovement,
        resumeMovement,
        stopMovement,
        resetMovement,
        clearTrails,
        toggleTrails,
        signalHistory,
        clearSignalHistory,
        events,
        addEvent,
        clearEvents,
        settings,
        updateSettings,
        saveSettings,
        resetSettings,
        enterBuilding,
        exitToCampus
      }}
    >
      {children}
    </CampusContext.Provider>
  )
}

export function useCampus() {
  const context = useContext(CampusContext)
  if (!context) {
    throw new Error('useCampus must be used within a CampusProvider')
  }
  return context
}

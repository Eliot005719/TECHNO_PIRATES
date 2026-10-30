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
  defaultRoomId: 'storage_room_01',
  defaultHeatmapVisible: true,
  defaultPropagationMode: 'combined',
  defaultSpeed: 1.4,
  showTrails: true,
  maxTrailLength: 60,
  bodyAttenuationDb: 2.5
}

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
  inspectedCoverage: CoverageCell

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
  const [selectedFloorId, setSelectedFloorId] = useState<string>('Floor 1')
  const [selectedRoomId, setSelectedRoomId] = useState<string>(settings.defaultRoomId)
  const [selectedApId, setSelectedApId] = useState<string>('ap-410-storage')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('agent-01')
  const [cutaway, setCutaway] = useState<boolean>(false)

  // 3. Mesh Nodes & Visual Options
  const [nodes, setNodes] = useState<WifiNode[]>(wifiNodes)
  const [meshOptions, setMeshOptions] = useState<MeshOptions>({
    visible: true,
    labels: true,
    links: true,
    scope: 'campus',
    ceilings: true,
    furniture: true
  })

  // 4. Propagation Settings
  const [propSettings, setPropSettings] = useState<PropagationSettings>({
    scaleMetersPerUnit: 1.0,
    exponent: 3.0,
    receiverGainDbi: 0,
    mode: settings.defaultPropagationMode,
    selectedApId: 'ap-410-storage',
    resolution: 18,
    bodyAttenuationDb: settings.bodyAttenuationDb
  })
  const [heatmapVisible, setHeatmapVisible] = useState<boolean>(settings.defaultHeatmapVisible)

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
      z: 2,
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
      z: -3,
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

  const clearEvents = () => {
    setEvents([])
  }

  // Active Transmitters representation
  const transmitters: Transmitter[] = useMemo(() => {
    return nodes.map(n => ({
      id: n.id,
      x: n.position[0],
      z: n.position[2],
      frequencyGHz: n.band === '6 GHz' ? 6.0 : 5.0,
      powerDbm: 18.0,
      active: n.active
    }))
  }, [nodes])

  // Active humans for propagation obstruction (illustrative assumption)
  const activeHumanPoints = useMemo(() => {
    return agents.filter(a => a.active).map(a => ({ x: a.x, z: a.z }))
  }, [agents])

  // Coverage Grid calculation across Building 410 floor plan
  // Cached when static, updated when APs change, propSettings change, or agents move
  const coverage = useMemo(() => {
    // Floor 1 bounds covering Hallway, Storage, and Seminar
    const bounds = { minX: -9.5, maxX: 11.5, minZ: -7.5, maxZ: 7.5 }
    return coverageGrid(bounds, transmitters, buildingWalls, propSettings, activeHumanPoints)
  }, [transmitters, propSettings, activeHumanPoints])

  // Inspected coverage at selected point or room
  const inspectedCoverage = useMemo(() => {
    const selectedAgent = agents.find(a => a.id === selectedAgentId)
    const targetPoint = selectedAgent
      ? { x: selectedAgent.x, z: selectedAgent.z }
      : selectedRoomId === 'classroom_a'
      ? { x: 5, z: -6 }
      : selectedRoomId === 'storage_room_01'
      ? { x: 5, z: 1 }
      : { x: -5, z: 0 }

    return coverageAt(targetPoint, transmitters, buildingWalls, propSettings, activeHumanPoints)
  }, [agents, selectedAgentId, selectedRoomId, transmitters, propSettings, activeHumanPoints])

  // Toggle AP Active Status
  const toggleNodeActive = (id: string) => {
    setNodes(prev =>
      prev.map(n => {
        if (n.id === id) {
          const nextActive = !n.active
          addEvent(
            nextActive ? 'ap_enabled' : 'ap_disabled',
            'mesh',
            nextActive ? `AP Enabled: ${n.name}` : `AP Disabled: ${n.name}`,
            `Transmitter ${n.id} switched to ${nextActive ? 'active' : 'offline'}.`,
            n.id
          )
          return { ...n, active: nextActive }
        }
        return n
      })
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
    const newIndex = agents.length + 1
    const id = `agent-${String(newIndex).padStart(2, '0')}`
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
      z: startWaypoint.z,
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
    setAgents(prev => {
      const remaining = prev.filter(a => a.id !== id)
      if (selectedAgentId === id && remaining.length > 0) {
        setSelectedAgentId(remaining[0].id)
      }
      return remaining
    })
    addEvent('agent_removed', 'movement', `Agent Removed: ${id}`, `Removed ${id} from active simulation.`, id)
  }

  const updateAgent = (id: string, partial: Partial<Agent>) => {
    setAgents(prev =>
      prev.map(a => {
        if (a.id === id) {
          const updated = { ...a, ...partial }
          if (partial.route && partial.route !== a.route) {
            // Reset position to route start when route changes
            const routeDef = routes[partial.route] || routes.route_1
            const startWp = routeDef.waypoints[0]
            updated.index = 0
            updated.x = startWp.x
            updated.z = startWp.z
            updated.trail = settings.showTrails ? [[startWp.x, startWp.z]] : []
            addEvent(
              'movement',
              'movement',
              `Route Changed: ${id}`,
              `${id} reassigned to ${routeDef.name}.`,
              id
            )
          }
          return updated
        }
        return a
      })
    )
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
    localStorage.removeItem(LOCAL_STORAGE_KEY)
    addEvent('system', 'system', 'Settings Reset', 'Configuration restored to default simulation parameters.', 'settings')
  }

  // 8. Controlled Simulation Loop
  // Updates agent positions, checks room changes, computes real propagation RSSI,
  // and updates signal history
  const agentsRef = useRef(agents)
  agentsRef.current = agents
  const movementStateRef = useRef(movementState)
  movementStateRef.current = movementState

  useEffect(() => {
    if (movementState !== 'moving') return

    const intervalMs = settings.updateIntervalMs
    const dtSeconds = intervalMs / 1000

    const timer = setInterval(() => {
      const currentAgents = agentsRef.current
      const updatedAgents: Agent[] = []
      const timestamp = Date.now()
      const timeLabel = new Date(timestamp).toLocaleTimeString()

      currentAgents.forEach(agent => {
        if (!agent.active || agent.state !== 'moving') {
          updatedAgents.push(agent)
          return
        }

        const prevRoom = agent.room
        const prevLoops = agent.loopsCompleted
        const advanced = advance(agent, dtSeconds, 1.0, settings.maxTrailLength)

        // Room change detection
        if (advanced.room !== prevRoom) {
          addEvent(
            'room_entered',
            'movement',
            `${agent.name} Entered ${advanced.roomName}`,
            `Transitioned from ${prevRoom} to ${advanced.roomName}.`,
            agent.id
          )
        }

        // Loop completion detection
        if (advanced.loopsCompleted > prevLoops) {
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
          { x: advanced.x, z: advanced.z },
          transmitters,
          buildingWalls,
          propSettings,
          activeHumanPoints
        )

        // Record real telemetry history
        setSignalHistory(prevHistory => {
          const list = prevHistory[agent.id] || []
          const record: AgentSignalRecord = {
            timestamp,
            timeLabel,
            agentId: agent.id,
            x: advanced.x,
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

        updatedAgents.push(advanced)
      })

      setAgents(updatedAgents)
    }, intervalMs)

    return () => clearInterval(timer)
  }, [movementState, settings.updateIntervalMs, settings.maxTrailLength, transmitters, propSettings, activeHumanPoints])

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
        inspectedCoverage,
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


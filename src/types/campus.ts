import type { Agent } from '../simulation/movement/movementEngine'
import type { WifiNode } from '../data/wifi-mesh'
import type { CoverageCell, PropagationSettings } from '../simulation/propagation/propagationTypes'

export type PageId =
  | 'overview'
  | 'campus'
  | 'indoor'
  | 'mesh'
  | 'propagation'
  | 'movement'
  | 'events'
  | 'settings'

export type SimulationMode = 'campus' | 'interior'

export interface EventItem {
  id: string
  timestamp: string
  type:
    | 'ap_enabled'
    | 'ap_disabled'
    | 'propagation_changed'
    | 'heatmap_toggled'
    | 'agent_started'
    | 'agent_paused'
    | 'agent_resumed'
    | 'agent_stopped'
    | 'agent_reset'
    | 'room_entered'
    | 'route_completed'
    | 'agent_added'
    | 'agent_removed'
    | 'settings_saved'
    | 'system'
    | 'movement'
    | string
  category: 'mesh' | 'propagation' | 'movement' | 'system'
  title: string
  description: string
  relatedId?: string
}

export interface AgentSignalRecord {
  timestamp: number
  timeLabel: string
  agentId: string
  x: number
  z: number
  room: string
  roomName: string
  strongestApId: string | null
  rssi: number
  category: 'strong' | 'moderate' | 'weak' | 'none'
}

export interface AppSettings {
  updateIntervalMs: number
  defaultBuildingId: string
  defaultRoomId: string
  defaultHeatmapVisible: boolean
  defaultPropagationMode: 'combined' | 'individual'
  defaultSpeed: number
  showTrails: boolean
  maxTrailLength: number
  bodyAttenuationDb: number
}

import React from 'react'
import { useCampus } from '../../context/CampusContext'
import { campusBuildings, rooms } from '../../data/visual-geometry'

export const OverviewPanel: React.FC = () => {
  const {
    selectedBuildingId,
    selectedFloorId,
    selectedRoomId,
    nodes,
    selectedApId,
    meshOptions,
    propSettings,
    heatmapVisible,
    inspectedCoverage,
    agents,
    movementState,
    enterBuilding,
    exitToCampus,
    sceneMode,
    startMovement,
    pauseMovement,
    setPage,
    events
  } = useCampus()

  const selectedBuilding = campusBuildings.find(b => b.id === selectedBuildingId)
  const selectedRoom = rooms.find(r => r.id === selectedRoomId)
  const activeNodesCount = nodes.filter(n => n.active).length
  const inactiveNodesCount = nodes.length - activeNodesCount
  const selectedAp = nodes.find(n => n.id === selectedApId)

  // Occupied rooms
  const occupiedRooms = Array.from(new Set(agents.filter(a => a.active).map(a => a.roomName)))

  return (
    <div className="dashboard-overview">
      <div className="section-title">
        <span className="eyebrow">MONITORING CONSOLE</span>
        <h2>System Overview</h2>
        <p className="muted">
          Unified telemetry across 3D digital twin geometry, virtual Wi-Fi mesh, RF propagation, and multi-agent human movement.
        </p>
      </div>

      {/* Quick Navigation Quick Bar */}
      <div className="quick-actions-bar">
        {sceneMode === 'campus' ? (
          <button className="primary" onClick={() => enterBuilding('410')}>
            Enter Building 410 Interior ➔
          </button>
        ) : (
          <button className="secondary" onClick={exitToCampus}>
            ⬅ Return to Campus Orbit
          </button>
        )}
        {movementState !== 'moving' ? (
          <button className="btn-action" onClick={startMovement}>
            ▶ Start Agents
          </button>
        ) : (
          <button className="btn-action" onClick={pauseMovement}>
            ⏸ Pause Agents
          </button>
        )}
      </div>

      {/* 1. Campus Geometry KPI */}
      <div className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-icon">🏛</span>
          <div>
            <h4>Campus & Spatial Model</h4>
            <span className="kpi-sub">Stage 1 & Stage 2 Geometry</span>
          </div>
        </div>
        <div className="kpi-grid">
          <div className="kpi-item">
            <span className="label">Total Buildings</span>
            <span className="value">{campusBuildings.length}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Active Building</span>
            <span className="value accent">{selectedBuilding ? selectedBuilding.name : `Building ${selectedBuildingId}`}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Current Floor</span>
            <span className="value">{selectedFloorId}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Monitored Zone</span>
            <span className="value">{selectedRoom ? selectedRoom.name : 'All Zones'}</span>
          </div>
        </div>
      </div>

      {/* 2. Wi-Fi Network Information */}
      <div className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-icon">📶</span>
          <div>
            <h4>Virtual Wi-Fi Mesh Network</h4>
            <span className="kpi-sub">Stage 3 Access Points</span>
          </div>
          <button className="btn-text-link" onClick={() => setPage('mesh')}>
            Details ↗
          </button>
        </div>
        <div className="kpi-grid">
          <div className="kpi-item">
            <span className="label">Total Access Points</span>
            <span className="value">{nodes.length}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Operational APs</span>
            <span className="value online">{activeNodesCount} Active</span>
          </div>
          <div className="kpi-item">
            <span className="label">Offline APs</span>
            <span className="value offline">{inactiveNodesCount} Inactive</span>
          </div>
          <div className="kpi-item">
            <span className="label">Selected AP</span>
            <span className="value">{selectedAp ? selectedAp.name : selectedApId}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Network Status</span>
            <span className={`value ${activeNodesCount > 0 ? 'online' : 'offline'}`}>
              {activeNodesCount > 0 ? 'Operational' : 'All APs Offline'}
            </span>
          </div>
          <div className="kpi-item">
            <span className="label">Topology Scope</span>
            <span className="value capitalize">{meshOptions.scope}</span>
          </div>
        </div>
      </div>

      {/* 3. Wi-Fi Propagation Information */}
      <div className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-icon">📡</span>
          <div>
            <h4>Wi-Fi Propagation Engine</h4>
            <span className="kpi-sub">Stage 4 Log-Distance Model</span>
          </div>
          <button className="btn-text-link" onClick={() => setPage('propagation')}>
            Details ↗
          </button>
        </div>
        <div className="kpi-grid">
          <div className="kpi-item">
            <span className="label">Coverage Mode</span>
            <span className="value">
              {propSettings.mode === 'combined' ? 'Strongest Active AP (Best Server)' : 'Individual AP'}
            </span>
          </div>
          <div className="kpi-item">
            <span className="label">Heatmap Status</span>
            <span className="value">{heatmapVisible ? 'Active Display' : 'Hidden'}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Selected Location RSSI</span>
            <span className="value bold">{inspectedCoverage.rssi.toFixed(1)} dBm</span>
          </div>
          <div className="kpi-item">
            <span className="label">Strongest AP</span>
            <span className="value">{inspectedCoverage.strongestApId || 'None'}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Coverage Tier</span>
            <span className={`badge-tier tier-${inspectedCoverage.category}`}>
              {inspectedCoverage.category.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Human Movement Information */}
      <div className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-icon">🚶</span>
          <div>
            <h4>Multi-Agent Movement</h4>
            <span className="kpi-sub">Stage 5 Dynamic Simulation</span>
          </div>
          <button className="btn-text-link" onClick={() => setPage('movement')}>
            Details ↗
          </button>
        </div>
        <div className="kpi-grid">
          <div className="kpi-item">
            <span className="label">Configured Agents</span>
            <span className="value">{agents.length}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Active Agents</span>
            <span className="value">{agents.filter(a => a.active).length}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Simulation Status</span>
            <span className="value capitalize status-pill">{movementState}</span>
          </div>
          <div className="kpi-item">
            <span className="label">Occupied Rooms</span>
            <span className="value text-wrap">
              {occupiedRooms.length > 0 ? occupiedRooms.join(', ') : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Simulation Events Ticker */}
      <div className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-icon">📋</span>
          <div>
            <h4>Recent Audit Events</h4>
            <span className="kpi-sub">Chronological interaction stream</span>
          </div>
          <button className="btn-text-link" onClick={() => setPage('events')}>
            All Events ↗
          </button>
        </div>
        <div className="mini-event-list">
          {events.slice(0, 4).map(e => (
            <div key={e.id} className="mini-event-item">
              <span className="mini-event-time">{e.timestamp}</span>
              <span className="mini-event-title">{e.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import React from 'react'
import { useCampus } from '../../context/CampusContext'
import { rooms } from '../../data/visual-geometry'

export const IndoorPanel: React.FC = () => {
  const {
    selectedRoomId,
    setSelectedRoomId,
    cutaway,
    setCutaway,
    meshOptions,
    setMeshOptions,
    exitToCampus,
    inspectedCoverage,
    nodes,
    agents
  } = useCampus()

  const selectedRoom = rooms.find(r => r.id === selectedRoomId)
  const roomNodes = nodes.filter(n => n.building === '410')
  const agentsInRoom = agents.filter(a => a.room === selectedRoomId && a.active)

  return (
    <div className="panel-container">
      <div className="section-title">
        <span className="eyebrow">INDOOR EXPLORER</span>
        <h2>Building 410 — Level 1</h2>
        <p className="muted">
          Interior layout with architectural circulation, doorways, furniture fixtures, and Wi-Fi infrastructure.
        </p>
      </div>

      <button className="secondary" onClick={exitToCampus} style={{ marginBottom: 14 }}>
        ⬅ Return to Campus Orbit
      </button>

      {/* Room Directory */}
      <h4>Architectural Spaces</h4>
      <div className="list">
        {rooms.map(r => {
          const count = agents.filter(a => a.room === r.id && a.active).length
          return (
            <button
              key={r.id}
              className={`list-item-btn ${selectedRoomId === r.id ? 'selected' : ''}`}
              onClick={() => setSelectedRoomId(r.id)}
            >
              <div className="list-item-info">
                <span className="item-title">{r.name}</span>
                <span className="item-sub">
                  Type: {r.type} · Dimensions: {r.size[0]}×{r.size[2]}m
                </span>
              </div>
              {count > 0 && <span className="badge-agent-count">{count} {count === 1 ? 'agent' : 'agents'}</span>}
            </button>
          )
        })}
      </div>

      {selectedRoom && (
        <div className="detail-card">
          <h4>{selectedRoom.name}</h4>
          <dl className="property-list">
            <div>
              <dt>Spatial Bounds</dt>
              <dd>
                {selectedRoom.size[0]}m × {selectedRoom.size[2]}m (Height: {selectedRoom.size[1]}m)
              </dd>
            </div>
            <div>
              <dt>Current Occupancy</dt>
              <dd>
                {agentsInRoom.length > 0
                  ? agentsInRoom.map(a => a.name).join(', ')
                  : 'No active occupants'}
              </dd>
            </div>
            <div>
              <dt>Local Simulated RSSI</dt>
              <dd>
                <b>{inspectedCoverage.rssi.toFixed(1)} dBm</b> ({inspectedCoverage.category})
              </dd>
            </div>
            <div>
              <dt>Strongest Access Point</dt>
              <dd>{inspectedCoverage.strongestApId || 'None detected'}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Architectural Cutaway & Display Controls */}
      <div className="controls-section">
        <h4>Interior View Controls</h4>
        <div className="controls">
          <button
            className={cutaway ? 'selected' : ''}
            onClick={() => setCutaway(c => !c)}
          >
            Cutaway View {cutaway ? 'Active' : 'Off'}
          </button>
          <button
            className={meshOptions.furniture ? 'selected' : ''}
            onClick={() => setMeshOptions(o => ({ ...o, furniture: !o.furniture }))}
          >
            Furniture {meshOptions.furniture ? 'Shown' : 'Hidden'}
          </button>
        </div>
        <small className="muted" style={{ display: 'block', marginTop: 8 }}>
          Cutaway removes the south facade and storage wall for full architectural visibility.
        </small>
      </div>

      {/* Building 410 APs */}
      <div className="ap-summary-box">
        <h4>Installed Access Points</h4>
        {roomNodes.map(ap => (
          <div key={ap.id} className="ap-summary-row">
            <span className={`status-dot ${ap.active ? 'online' : 'offline'}`} />
            <span className="ap-summary-name">{ap.name}</span>
            <span className="ap-summary-band">{ap.band}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


import React from 'react'
import { useCampus } from '../../context/CampusContext'
import { routes } from '../../simulation/movement/movementEngine'
import { RssiChart } from '../charts/RssiChart'

export const MovementPanel: React.FC = () => {
  const {
    agents,
    selectedAgentId,
    setSelectedAgentId,
    movementState,
    startMovement,
    pauseMovement,
    resumeMovement,
    stopMovement,
    resetMovement,
    addAgent,
    removeAgent,
    updateAgent,
    clearTrails,
    toggleTrails,
    settings,
    updateSettings,
    signalHistory,
    clearSignalHistory,
    inspectedCoverage
  } = useCampus()

  const selectedAgent = agents.find(a => a.id === selectedAgentId) || agents[0]
  const currentAgentHistory = selectedAgent ? signalHistory[selectedAgent.id] || [] : []

  return (
    <div className="panel-container">
      <div className="section-title">
        <span className="eyebrow">STAGE 5 HUMAN MOVEMENT</span>
        <h2>Multi-Agent Simulation</h2>
        <p className="muted">
          Autonomous simulated occupants navigating doorways and corridors while dynamically measuring and perturbing local RF signal.
        </p>
      </div>

      {/* Main Simulation Control Deck */}
      <div className="simulation-control-deck">
        <div className="deck-buttons">
          {movementState === 'idle' || movementState === 'stopped' ? (
            <button className="primary" onClick={startMovement}>
              ▶ Start Traversal
            </button>
          ) : movementState === 'paused' ? (
            <button className="primary" onClick={resumeMovement}>
              ▶ Resume Traversal
            </button>
          ) : (
            <button className="secondary" onClick={pauseMovement}>
              ⏸ Pause
            </button>
          )}

          <button
            className="secondary"
            onClick={stopMovement}
            disabled={movementState === 'idle' || movementState === 'stopped'}
          >
            ⏹ Stop
          </button>
          <button className="secondary" onClick={resetMovement}>
            ↺ Reset
          </button>
        </div>

        <div className="deck-status-row">
          <span>
            Status: <b className="capitalize">{movementState}</b>
          </span>
          <span>
            Active: <b>{agents.filter(a => a.active).length} / {agents.length}</b>
          </span>
          <button className="btn-tiny" onClick={addAgent} title="Add another human agent">
            + Add Agent
          </button>
        </div>
      </div>

      {/* Agent Selector List */}
      <h4>Configured Agents ({agents.length})</h4>
      <div className="list">
        {agents.map(a => {
          const isSelected = selectedAgent?.id === a.id
          return (
            <div
              key={a.id}
              className={`agent-card-item ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedAgentId(a.id)}
            >
              <div className="agent-item-top">
                <div className="agent-color-dot" style={{ backgroundColor: a.color }} />
                <div className="agent-item-names">
                  <span className="agent-id-text">{a.id}</span>
                  <span className="agent-full-name">{a.name}</span>
                </div>
                <span className={`status-badge-sm ${a.state}`}>{a.state}</span>
              </div>
              <div className="agent-item-meta">
                <span>📍 {a.roomName}</span>
                <span>⚡ {a.speed.toFixed(1)} m/s</span>
                <span>🔄 Loop: {a.loopsCompleted}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected Agent Inspector */}
      {selectedAgent && (
        <div className="detail-card">
          <div className="agent-inspector-head">
            <div className="agent-color-dot" style={{ backgroundColor: selectedAgent.color }} />
            <div>
              <h4>{selectedAgent.name} ({selectedAgent.id})</h4>
              <span className="muted">{selectedAgent.floor}</span>
            </div>
            {agents.length > 1 && (
              <button
                className="btn-tiny btn-danger"
                style={{ marginLeft: 'auto' }}
                onClick={() => removeAgent(selectedAgent.id)}
                title="Remove this agent"
              >
                Remove
              </button>
            )}
          </div>

          <div className="agent-controls-form">
            {/* Route Selector */}
            <div className="control-group">
              <label className="input-label">Assigned Doorway Route</label>
              <select
                className="select-input"
                value={selectedAgent.route}
                onChange={e => updateAgent(selectedAgent.id, { route: e.target.value })}
              >
                {Object.values(routes).map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Speed Slider */}
            <div className="control-group">
              <div className="slider-header">
                <label className="input-label">Movement Speed</label>
                <span className="slider-val">{selectedAgent.speed.toFixed(1)} m/s</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={selectedAgent.speed}
                onChange={e => updateAgent(selectedAgent.id, { speed: parseFloat(e.target.value) })}
                className="range-input"
              />
            </div>

            {/* Active Toggle */}
            <div className="checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={selectedAgent.active}
                  onChange={e => updateAgent(selectedAgent.id, { active: e.target.checked })}
                />
                Active in Simulation
              </label>
            </div>
          </div>

          {/* Real-time Agent Telemetry Grid */}
          <dl className="property-list">
            <div>
              <dt>Current Building / Floor</dt>
              <dd>Building {selectedAgent.buildingId} · {selectedAgent.floor}</dd>
            </div>
            <div>
              <dt>Current Room</dt>
              <dd>{selectedAgent.roomName}</dd>
            </div>
            <div>
              <dt>Position (X, Y, Z)</dt>
              <dd>
                {selectedAgent.x.toFixed(2)}, {selectedAgent.y.toFixed(2)}, {selectedAgent.z.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>Route / Movement</dt>
              <dd>{routes[selectedAgent.route]?.name ?? selectedAgent.route} · {selectedAgent.state}</dd>
            </div>
            <div>
              <dt>Strongest AP</dt>
              <dd>{inspectedCoverage.strongestApId || 'None'}</dd>
            </div>
            <div>
              <dt>Simulated RSSI</dt>
              <dd className="bold" style={{ color: selectedAgent.color }}>
                {inspectedCoverage.rssi.toFixed(1)} dBm ({inspectedCoverage.category})
              </dd>
            </div>
            <div>
              <dt>Loops Finished</dt>
              <dd>{selectedAgent.loopsCompleted} completed</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Movement Trails Section */}
      <div className="controls-section">
        <h4>Movement Trajectory Trails</h4>
        <div className="controls">
          <button
            className={settings.showTrails ? 'selected' : ''}
            onClick={toggleTrails}
          >
            Trails {settings.showTrails ? 'SHOWN' : 'HIDDEN'}
          </button>
          <button onClick={clearTrails}>Clear Trails</button>
        </div>
      </div>

      {/* Real Time-Series Signal Telemetry Chart */}
      <div className="detail-card">
        <div className="card-header-with-actions">
          <h4>Propagation RSSI History</h4>
          <span className="badge-agent-tag" style={{ borderColor: selectedAgent?.color }}>
            {selectedAgent?.id}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '2px 0 8px' }}>
          Real time-series output computed dynamically from Stage 4 log-distance propagation model.
        </p>

        {selectedAgent && (
          <RssiChart
            data={currentAgentHistory}
            agentId={selectedAgent.id}
            agentColor={selectedAgent.color}
            onClear={() => clearSignalHistory(selectedAgent.id)}
          />
        )}
      </div>
    </div>
  )
}

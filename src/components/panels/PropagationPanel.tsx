import React from 'react'
import { useCampus } from '../../context/CampusContext'
import { rooms } from '../../data/visual-geometry'

export const PropagationPanel: React.FC = () => {
  const {
    propSettings,
    setPropSettings,
    heatmapVisible,
    setHeatmapVisible,
    cutaway,
    setCutaway,
    selectedRoomId,
    setSelectedRoomId,
    inspectedCoverage,
    nodes,
    selectedApId,
    setSelectedApId,
    addEvent,
    settings
  } = useCampus()

  const selectedRoom = rooms.find(r => r.id === selectedRoomId)
  const activeNodes = nodes.filter(n => n.active)

  const handleModeChange = (mode: 'combined' | 'individual') => {
    setPropSettings(p => ({ ...p, mode }))
    addEvent(
      'propagation_changed',
      'propagation',
      'Coverage Mode Updated',
      `Switched propagation display to ${mode} mode.`
    )
  }

  const handleExponentChange = (exponent: number) => {
    setPropSettings(p => ({ ...p, exponent }))
    addEvent(
      'propagation_changed',
      'propagation',
      'Path-Loss Exponent Changed',
      `Exponent set to ${exponent.toFixed(1)}.`
    )
  }

  const handleToggleHeatmap = () => {
    const nextVal = !heatmapVisible
    setHeatmapVisible(nextVal)
    addEvent(
      'heatmap_toggled',
      'propagation',
      nextVal ? 'Heatmap Displayed' : 'Heatmap Hidden',
      `3D planar propagation heatmap was toggled ${nextVal ? 'on' : 'off'}.`
    )
  }

  return (
    <div className="panel-container">
      <div className="section-title">
        <span className="eyebrow">WI-FI PROPAGATION ENGINE</span>
        <h2>Stage 4 RF Heatmap</h2>
        <p className="muted">
          Frequency-aware log-distance path loss with interior wall attenuation and human obstacle shadowing.
        </p>
      </div>

      {/* Main Heatmap Toggle & Cutaway */}
      <div className="controls-section" style={{ marginTop: 0 }}>
        <h4>Visualization Controls</h4>
        <div className="controls">
          <button
            className={heatmapVisible ? 'selected' : ''}
            onClick={handleToggleHeatmap}
          >
            Heatmap {heatmapVisible ? 'ACTIVE' : 'OFF'}
          </button>
          <button
            className={cutaway ? 'selected' : ''}
            onClick={() => setCutaway(c => !c)}
          >
            Cutaway {cutaway ? 'ACTIVE' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Coverage Mode Selection */}
      <div className="control-group">
        <label className="input-label">Coverage Calculation Mode</label>
        <div className="segmented-control">
          <button
            className={propSettings.mode === 'combined' ? 'active' : ''}
            onClick={() => handleModeChange('combined')}
          >
            Combined (Strongest Active AP)
          </button>
          <button
            className={propSettings.mode === 'individual' ? 'active' : ''}
            onClick={() => handleModeChange('individual')}
          >
            Individual AP
          </button>
        </div>
      </div>

      {/* AP Selector for Individual Mode */}
      {propSettings.mode === 'individual' && (
        <div className="control-group">
          <label className="input-label">Select Transmitter to Inspect</label>
          <select
            className="select-input"
            value={propSettings.selectedApId}
            onChange={e => {
              const id = e.target.value
              setSelectedApId(id)
              setPropSettings(p => ({ ...p, selectedApId: id }))
              addEvent(
                'propagation_changed',
                'propagation',
                'Inspected AP Changed',
                `Inspecting individual RF coverage for AP ${id}.`
              )
            }}
          >
            {nodes.map(n => (
              <option key={n.id} value={n.id} disabled={!n.active}>
                {n.name} ({n.id}) {!n.active ? '[OFFLINE]' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Path-Loss Exponent Slider */}
      <div className="control-group">
        <div className="slider-header">
          <label className="input-label">Path-Loss Exponent (γ)</label>
          <span className="slider-val">{propSettings.exponent.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="2.0"
          max="4.0"
          step="0.2"
          value={propSettings.exponent}
          onChange={e => handleExponentChange(parseFloat(e.target.value))}
          className="range-input"
        />
        <div className="slider-markers">
          <span>2.0 (Free Space)</span>
          <span>3.0 (Office/Partitions)</span>
          <span>4.0 (Dense Obstacles)</span>
        </div>
      </div>

      {/* Signal Strength Legend */}
      <div className="legend-card">
        <h4>RF Signal Strength Tiers</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-swatch swatch-strong" />
            <span className="legend-tier">Strong</span>
            <span className="legend-range">&gt; -58 dBm</span>
            <small className="legend-desc">Optimal throughput & high reliability</small>
          </div>
          <div className="legend-item">
            <span className="legend-swatch swatch-moderate" />
            <span className="legend-tier">Moderate</span>
            <span className="legend-range">-58 to -70 dBm</span>
            <small className="legend-desc">Standard performance for voice/video</small>
          </div>
          <div className="legend-item">
            <span className="legend-swatch swatch-weak" />
            <span className="legend-tier">Weak</span>
            <span className="legend-range">-70 to -82 dBm</span>
            <small className="legend-desc">Low data rate, vulnerable to packet loss</small>
          </div>
          <div className="legend-item">
            <span className="legend-swatch swatch-none" />
            <span className="legend-tier">None / Below Floor</span>
            <span className="legend-range">&le; -82 dBm</span>
            <small className="legend-desc">Unserviceable coverage zone</small>
          </div>
        </div>
      </div>

      {/* Spatial Inspection Reading */}
      <div className="detail-card">
        <h4>Zone Signal Telemetry</h4>
        <div className="room-selector-pills">
          {rooms.map(r => (
            <button
              key={r.id}
              className={`pill-btn ${selectedRoomId === r.id ? 'active' : ''}`}
              onClick={() => setSelectedRoomId(r.id)}
            >
              {r.name}
            </button>
          ))}
        </div>

        <dl className="property-list">
          <div>
            <dt>Inspected Room</dt>
            <dd>{selectedRoom ? selectedRoom.name : selectedRoomId}</dd>
          </div>
          <div>
            <dt>Estimated RSSI</dt>
            <dd className="bold" style={{ fontSize: 16 }}>
              {inspectedCoverage.rssi.toFixed(1)} dBm
            </dd>
          </div>
          <div>
            <dt>Signal Quality</dt>
            <dd>
              <span className={`badge-tier tier-${inspectedCoverage.category}`}>
                {inspectedCoverage.category.toUpperCase()}
              </span>
            </dd>
          </div>
          <div>
            <dt>Strongest Active AP</dt>
            <dd>{inspectedCoverage.strongestApId || 'None available'}</dd>
          </div>
          <div>
            <dt>Wall Loss on Path</dt>
            <dd>{inspectedCoverage.wallLoss.toFixed(1)} dB</dd>
          </div>
          <div>
            <dt>Human Shadowing</dt>
            <dd>{inspectedCoverage.humanObstructionLoss ? `${inspectedCoverage.humanObstructionLoss.toFixed(1)} dB` : 'None'}</dd>
          </div>
        </dl>
      </div>

      {/* Attenuation Parameters */}
      <div className="side-note" style={{ marginTop: 12 }}>
        <b>Simulation Assumption Notice</b>
        <p>
          Partition attenuation: 3 dB · Exterior wall: 10 dB · Glass: 2 dB.
          Human body shadowing: {settings.bodyAttenuationDb} dB within 1.2m.
          Illustrative computational model only; not certified RF site survey data.
        </p>
      </div>
    </div>
  )
}


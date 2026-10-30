import React from 'react'
import { useCampus } from '../../context/CampusContext'
import { campusBuildings, rooms } from '../../data/visual-geometry'
import type { WallAttenuation } from '../../simulation/propagation/propagationTypes'

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
    selectedBuildingId,
    setSelectedBuildingId,
    selectedFloorId,
    setSelectedFloorId,
    inspectedCoverage,
    nodes,
    selectedApId,
    setSelectedApId,
    updateNodePower,
    updateNodeGain,
    enterBuilding,
    setSceneMode,
    settings
  } = useCampus()

  const selectedRoom = rooms.find(r => r.id === selectedRoomId)
  const selectedNode = nodes.find(node => node.id === selectedApId)
  const wallAttenuation = {
    partition: propSettings.wallAttenuation?.partition ?? 3.5,
    exterior: propSettings.wallAttenuation?.exterior ?? 12,
    glass: propSettings.wallAttenuation?.glass ?? 2.5,
    concrete: propSettings.wallAttenuation?.concrete ?? 15,
    brick: propSettings.wallAttenuation?.brick ?? 10
  }
  const wallMaterials: { key: keyof WallAttenuation; label: string }[] = [
    { key: 'partition', label: 'Interior partition' },
    { key: 'concrete', label: 'Concrete' },
    { key: 'brick', label: 'Brick' },
    { key: 'glass', label: 'Glass partition' },
    { key: 'exterior', label: 'Exterior wall' }
  ]

  const handleModeChange = (mode: 'combined' | 'individual') => {
    setPropSettings(p => ({ ...p, mode }))
  }

  const handleExponentChange = (exponent: number) => {
    setPropSettings(p => ({ ...p, exponent }))
  }

  const handleToggleHeatmap = () => {
    const nextVal = !heatmapVisible
    setHeatmapVisible(nextVal)
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
        <label className="input-label">Building, Floor and Room</label>
        <select
          className="select-input"
          value={selectedBuildingId}
          onChange={event => {
            const buildingId = event.target.value
            setSelectedBuildingId(buildingId)
            if (buildingId === '410') {
              enterBuilding('410')
            } else {
              setSceneMode('campus')
            }
          }}
        >
          {campusBuildings.map(building => (
            <option key={building.id} value={building.id}>
              Building {building.id} — {building.name}
            </option>
          ))}
        </select>
        <select
          className="select-input"
          value={selectedFloorId}
          onChange={event => setSelectedFloorId(event.target.value)}
          disabled={selectedBuildingId !== '410'}
        >
          <option value="Floor 1">Floor 1 (available interior model)</option>
        </select>
      </div>

      <div className="control-group">
        <label className="input-label">Coverage Calculation Mode</label>
        <div className="segmented-control">
          <button
            className={propSettings.mode === 'combined' ? 'active' : ''}
            onClick={() => handleModeChange('combined')}
          >
            Strongest Active AP (Best Server)
          </button>
          <button
            className={propSettings.mode === 'individual' ? 'active' : ''}
            onClick={() => handleModeChange('individual')}
          >
            Individual AP
          </button>
        </div>
      </div>

      {/* AP Selector */}
      <div className="control-group">
          <label className="input-label">Selected Access Point</label>
          <select
            className="select-input"
            value={selectedApId}
            onChange={e => {
                const id = e.target.value
                setSelectedApId(id)
              }}
          >
            {nodes.map(n => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.id}) {!n.active ? '[OFFLINE]' : ''}
              </option>
            ))}
          </select>
          {selectedNode && (
            <small className="muted">
              {selectedNode.band} · {selectedNode.powerDbm ?? 18} dBm · {selectedNode.active ? 'Active' : 'Offline'}
            </small>
          )}
      </div>

      {selectedNode && (
        <div className="control-group">
          <div className="slider-header">
            <label className="input-label">Transmit Power — {selectedNode.id}</label>
            <span className="slider-val">{(selectedNode.powerDbm ?? 18).toFixed(1)} dBm</span>
          </div>
          <input
            type="range"
            min="0"
            max="30"
            step="0.5"
            value={selectedNode.powerDbm ?? 18}
            onChange={event => updateNodePower(selectedNode.id, parseFloat(event.target.value))}
            className="range-input"
          />
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

      <div className="control-group">
        <div className="slider-header">
          <label className="input-label">Heatmap Opacity</label>
          <span className="slider-val">{Math.round((propSettings.heatmapOpacity ?? 0.44) * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="0.8"
          step="0.05"
          value={propSettings.heatmapOpacity ?? 0.44}
          onChange={event => setPropSettings(p => ({ ...p, heatmapOpacity: parseFloat(event.target.value) }))}
          className="range-input"
        />
      </div>

      <div className="control-group">
        <div className="slider-header">
          <label className="input-label">Receiver Gain</label>
          <span className="slider-val">{propSettings.receiverGainDbi.toFixed(1)} dBi</span>
        </div>
        <input
          type="range"
          min="-5"
          max="10"
          step="0.5"
          value={propSettings.receiverGainDbi}
          onChange={event => setPropSettings(p => ({ ...p, receiverGainDbi: parseFloat(event.target.value) }))}
          className="range-input"
        />
      </div>

      {selectedNode && (
        <div className="control-group">
          <div className="slider-header">
            <label className="input-label">Transmit Antenna Gain</label>
            <span className="slider-val">{(selectedNode.gainDbi ?? 0).toFixed(1)} dBi</span>
          </div>
          <input
            type="range"
            min="-10"
            max="20"
            step="0.5"
            value={selectedNode.gainDbi ?? 0}
            onChange={event => updateNodeGain(selectedNode.id, parseFloat(event.target.value))}
            className="range-input"
          />
        </div>
      )}

      <div className="control-group">
        <label className="input-label">Material Attenuation (illustrative dB)</label>
        {wallMaterials.map(material => (
          <div className="slider-header" key={material.key}>
            <label className="input-label">{material.label}</label>
            <span className="slider-val">{wallAttenuation[material.key].toFixed(1)}</span>
            <input
              type="range"
              min="0"
              max="30"
              step="0.5"
              value={wallAttenuation[material.key]}
              onChange={event => {
                const value = parseFloat(event.target.value)
                setPropSettings(previous => ({
                  ...previous,
                  wallAttenuation: { ...wallAttenuation, [material.key]: value }
                }))
              }}
              className="range-input"
            />
          </div>
        ))}
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
            <dt>Selected AP</dt>
            <dd>{selectedNode ? `${selectedNode.name} (${selectedNode.id})` : 'None'}</dd>
          </div>
          {selectedNode && (
            <>
              <div>
                <dt>AP Frequency</dt>
                <dd>{selectedNode.band}</dd>
              </div>
              <div>
                <dt>Configured Transmit Power</dt>
                <dd>{(selectedNode.powerDbm ?? 18).toFixed(1)} dBm</dd>
              </div>
              <div>
                <dt>Transmit Antenna Gain</dt>
                <dd>{(selectedNode.gainDbi ?? 0).toFixed(1)} dBi</dd>
              </div>
            </>
          )}
          <div>
            <dt>Coverage Mode</dt>
            <dd>{propSettings.mode === 'combined' ? 'Strongest Active AP (Best Server)' : 'Individual AP'}</dd>
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
          Partition attenuation: {wallAttenuation.partition.toFixed(1)} dB ·
          Exterior wall: {wallAttenuation.exterior.toFixed(1)} dB ·
          Glass: {wallAttenuation.glass.toFixed(1)} dB.
          Human body shadowing: {settings.bodyAttenuationDb} dB per body intersected by the RF path.
          Illustrative computational model only; not certified RF site survey data.
        </p>
      </div>
    </div>
  )
}

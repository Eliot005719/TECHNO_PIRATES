import React, { useState } from 'react'
import { useCampus } from '../../context/CampusContext'
import { campusBuildings, rooms } from '../../data/visual-geometry'

export const SettingsPanel: React.FC = () => {
  const { settings, updateSettings, saveSettings, resetSettings } = useCampus()
  const [savedNotice, setSavedNotice] = useState(false)

  const handleSave = () => {
    saveSettings()
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 3000)
  }

  return (
    <div className="panel-container">
      <div className="section-title">
        <span className="eyebrow">CONFIGURATION</span>
        <h2>Simulation Settings</h2>
        <p className="muted">
          Adjust persistent simulation intervals, default views, and RF computational assumptions stored locally in browser storage.
        </p>
      </div>

      {savedNotice && (
        <div className="save-alert">
          ✓ Configuration successfully persisted to local storage.
        </div>
      )}

      <div className="settings-form">
        {/* Simulation Update Interval */}
        <div className="control-group">
          <label className="input-label">Simulation Update Interval (ms)</label>
          <select
            className="select-input"
            value={settings.updateIntervalMs}
            onChange={e => updateSettings({ updateIntervalMs: parseInt(e.target.value, 10) })}
          >
            <option value={100}>100 ms (High fidelity - 10 Hz)</option>
            <option value={250}>250 ms (Standard - 4 Hz)</option>
            <option value={500}>500 ms (Conservative - 2 Hz)</option>
            <option value={1000}>1000 ms (Low overhead - 1 Hz)</option>
          </select>
          <small className="muted">
            Controls the frequency of agent position updates, room detection, and propagation telemetry sampling.
          </small>
        </div>

        {/* Human Body Attenuation Assumption */}
        <div className="control-group">
          <div className="slider-header">
            <label className="input-label">Human Body Shadowing Loss</label>
            <span className="slider-val">{settings.bodyAttenuationDb.toFixed(1)} dB</span>
          </div>
          <input
            type="range"
            min="1.0"
            max="6.0"
            step="0.5"
            value={settings.bodyAttenuationDb}
            onChange={e => updateSettings({ bodyAttenuationDb: parseFloat(e.target.value) })}
            className="range-input"
          />
          <small className="muted">
            Illustrative simulation assumption: Local shadowing loss applied when a human is within 1.2m of receiver.
          </small>
        </div>

        {/* Default Building Selection */}
        <div className="control-group">
          <label className="input-label">Default Focused Building</label>
          <select
            className="select-input"
            value={settings.defaultBuildingId}
            onChange={e => updateSettings({ defaultBuildingId: e.target.value })}
          >
            {campusBuildings.map(b => (
              <option key={b.id} value={b.id}>
                Building {b.id} — {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Default Room Selection */}
        <div className="control-group">
          <label className="input-label">Default Inspected Zone</label>
          <select
            className="select-input"
            value={settings.defaultRoomId}
            onChange={e => updateSettings({ defaultRoomId: e.target.value })}
          >
            {rooms.map(r => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Default Propagation Mode */}
        <div className="control-group">
          <label className="input-label">Default Propagation Mode</label>
          <select
            className="select-input"
            value={settings.defaultPropagationMode}
            onChange={e =>
              updateSettings({
                defaultPropagationMode: e.target.value as 'combined' | 'individual'
              })
            }
          >
            <option value="combined">Combined (Strongest Active AP)</option>
            <option value="individual">Individual AP Coverage</option>
          </select>
        </div>

        {/* Default Movement Speed */}
        <div className="control-group">
          <div className="slider-header">
            <label className="input-label">Default Agent Walking Speed</label>
            <span className="slider-val">{settings.defaultSpeed.toFixed(1)} m/s</span>
          </div>
          <input
            type="range"
            min="0.6"
            max="2.5"
            step="0.1"
            value={settings.defaultSpeed}
            onChange={e => updateSettings({ defaultSpeed: parseFloat(e.target.value) })}
            className="range-input"
          />
        </div>

        {/* Display Toggles */}
        <div className="checkbox-group">
          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={settings.defaultHeatmapVisible}
              onChange={e => updateSettings({ defaultHeatmapVisible: e.target.checked })}
            />
            Default Heatmap Visibility Enabled
          </label>
          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={settings.showTrails}
              onChange={e => updateSettings({ showTrails: e.target.checked })}
            />
            Show Agent Movement Trajectory Trails
          </label>
        </div>

        {/* Persistence Actions */}
        <div className="settings-actions">
          <button className="primary" onClick={handleSave}>
            Save Settings to Local Storage
          </button>
          <button className="secondary" onClick={resetSettings}>
            Reset to Factory Defaults
          </button>
        </div>
      </div>
    </div>
  )
}


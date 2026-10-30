import React from 'react'
import { useCampus } from '../../context/CampusContext'

export const MeshPanel: React.FC = () => {
  const {
    nodes,
    selectedApId,
    setSelectedApId,
    toggleNodeActive,
    meshOptions,
    setMeshOptions,
    setSceneMode,
    setPage,
    setPropSettings
  } = useCampus()

  const selectedNode = nodes.find(n => n.id === selectedApId)

  const handleOpenLocation = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    setSelectedApId(nodeId)
    if (node.scope === 'building') {
      setSceneMode('interior')
      setMeshOptions(o => ({ ...o, scope: 'building' }))
    } else {
      setSceneMode('campus')
      setMeshOptions(o => ({ ...o, scope: 'campus' }))
    }
  }

  const handleInspectPropagation = (nodeId: string) => {
    setSelectedApId(nodeId)
    setPropSettings(p => ({ ...p, mode: 'individual', selectedApId: nodeId }))
    setPage('propagation')
  }

  return (
    <div className="panel-container">
      <div className="section-title">
        <span className="eyebrow">WI-FI MESH TOPOLOGY</span>
        <h2>Virtual AP Nodes</h2>
        <p className="muted">
          Stage 3 campus backbone & interior distribution nodes. State updates reactively re-estimate RF propagation.
        </p>
      </div>

      {/* Topology Scope Filters & Display Toggles */}
      <div className="controls-section" style={{ marginTop: 0 }}>
        <h4>Mesh Visualization Options</h4>
        <div className="controls">
          <button
            className={meshOptions.scope === 'campus' ? 'selected' : ''}
            onClick={() => setMeshOptions(o => ({ ...o, scope: 'campus' }))}
          >
            Campus Scope
          </button>
          <button
            className={meshOptions.scope === 'building' ? 'selected' : ''}
            onClick={() => setMeshOptions(o => ({ ...o, scope: 'building' }))}
          >
            Building 410 Scope
          </button>
          <button
            className={meshOptions.links ? 'selected' : ''}
            onClick={() => setMeshOptions(o => ({ ...o, links: !o.links }))}
          >
            Links {meshOptions.links ? 'ON' : 'OFF'}
          </button>
          <button
            className={meshOptions.labels ? 'selected' : ''}
            onClick={() => setMeshOptions(o => ({ ...o, labels: !o.labels }))}
          >
            Labels {meshOptions.labels ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Access Points List */}
      <h4>Configured Access Points ({nodes.length})</h4>
      <div className="list">
        {nodes.map(n => {
          const isSelected = selectedApId === n.id
          return (
            <div
              key={n.id}
              className={`ap-card ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedApId(n.id)}
            >
              <div className="ap-card-top">
                <div className="ap-title-group">
                  <span className={`status-dot ${n.active ? 'online' : 'offline'}`} />
                  <div>
                    <b>{n.name}</b>
                    <span className="ap-id-tag">{n.id}</span>
                  </div>
                </div>
                <button
                  className={`btn-toggle-switch ${n.active ? 'active' : ''}`}
                  onClick={e => {
                    e.stopPropagation()
                    toggleNodeActive(n.id)
                  }}
                  title={n.active ? 'Click to disable' : 'Click to enable'}
                >
                  {n.active ? 'Active' : 'Offline'}
                </button>
              </div>

              <div className="ap-card-details">
                <span className="ap-badge">{n.band}</span>
                <span className="ap-badge">{n.scope}</span>
                {n.room && <span className="ap-badge-room">Room: {n.room}</span>}
              </div>

              <div className="ap-mesh-links">
                <small className="muted">
                  Mesh peers: {n.connections.length > 0 ? n.connections.join(', ') : 'None'}
                </small>
              </div>

              {isSelected && (
                <div className="ap-card-actions">
                  <button
                    className="btn-tiny primary"
                    onClick={e => {
                      e.stopPropagation()
                      handleOpenLocation(n.id)
                    }}
                  >
                    Locate in 3D
                  </button>
                  <button
                    className="btn-tiny secondary"
                    onClick={e => {
                      e.stopPropagation()
                      handleInspectPropagation(n.id)
                    }}
                  >
                    Inspect Coverage
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedNode && (
        <div className="detail-card">
          <h4>Node Inspector: {selectedNode.name}</h4>
          <dl className="property-list">
            <div>
              <dt>Node ID</dt>
              <dd>{selectedNode.id}</dd>
            </div>
            <div>
              <dt>Operating Band</dt>
              <dd>{selectedNode.band}</dd>
            </div>
            <div>
              <dt>TX Power</dt>
              <dd>18.0 dBm (Simulated)</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>
                [{selectedNode.position[0]}, {selectedNode.position[1]}, {selectedNode.position[2]}]
              </dd>
            </div>
            <div>
              <dt>Mesh Neighbors</dt>
              <dd>{selectedNode.connections.join(', ')}</dd>
            </div>
            <div>
              <dt>Operational State</dt>
              <dd className={selectedNode.active ? 'online bold' : 'offline bold'}>
                {selectedNode.active ? 'Active & Radiating' : 'Disabled (No RF Emission)'}
              </dd>
            </div>
          </dl>

          <button
            className={`primary ${selectedNode.active ? 'btn-danger' : 'btn-success'}`}
            onClick={() => toggleNodeActive(selectedNode.id)}
          >
            {selectedNode.active ? `Deactivate ${selectedNode.id}` : `Activate ${selectedNode.id}`}
          </button>
        </div>
      )}
    </div>
  )
}


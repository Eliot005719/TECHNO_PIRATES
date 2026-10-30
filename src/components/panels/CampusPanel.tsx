import React from 'react'
import { useCampus } from '../../context/CampusContext'
import { campusBuildings } from '../../data/visual-geometry'

export const CampusPanel: React.FC = () => {
  const {
    selectedBuildingId,
    setSelectedBuildingId,
    enterBuilding,
    meshOptions,
    setMeshOptions,
    nodes
  } = useCampus()

  const selectedBuilding = campusBuildings.find(b => b.id === selectedBuildingId)

  return (
    <div className="panel-container">
      <div className="section-title">
        <span className="eyebrow">CAMPUS 3D VIEW</span>
        <h2>Building Directory</h2>
        <p className="muted">
          Audited Stage 1 & 2 spatial representation of campus facility footprints and orientation.
        </p>
      </div>

      <div className="list">
        {campusBuildings.map(b => (
          <button
            key={b.id}
            className={`list-item-btn ${selectedBuildingId === b.id ? 'selected' : ''}`}
            onClick={() => setSelectedBuildingId(b.id)}
          >
            <span className="badge-id">{b.id}</span>
            <div className="list-item-info">
              <span className="item-title">{b.name}</span>
              <span className="item-sub">
                Size: {b.size[0]}×{b.size[2]}m · Elevation: {b.position[1]}m
              </span>
            </div>
          </button>
        ))}
      </div>

      {selectedBuilding && (
        <div className="detail-card">
          <h4>Selected: {selectedBuilding.name}</h4>
          <dl className="property-list">
            <div>
              <dt>Building ID</dt>
              <dd>{selectedBuilding.id}</dd>
            </div>
            <div>
              <dt>Coordinates</dt>
              <dd>
                X: {selectedBuilding.position[0]}, Z: {selectedBuilding.position[2]}
              </dd>
            </div>
            <div>
              <dt>Footprint</dt>
              <dd>
                {selectedBuilding.size[0]}m × {selectedBuilding.size[2]}m (Height: {selectedBuilding.size[1]}m)
              </dd>
            </div>
            <div>
              <dt>Indoor Modeling</dt>
              <dd>{selectedBuilding.id === '410' ? 'Detailed Stage 2 Model' : 'Massing Approximated'}</dd>
            </div>
          </dl>

          {selectedBuilding.id === '410' ? (
            <button className="primary" onClick={() => enterBuilding('410')}>
              Enter Building 410 Interior Layout ➔
            </button>
          ) : (
            <p className="hint-box">
              Detailed interior floor plans are currently audited for priority Building 410.
            </p>
          )}
        </div>
      )}

      <div className="controls-section">
        <h4>Visual Layers</h4>
        <div className="controls">
          <button
            className={meshOptions.visible ? 'selected' : ''}
            onClick={() => setMeshOptions(o => ({ ...o, visible: !o.visible }))}
          >
            AP Nodes {meshOptions.visible ? 'Visible' : 'Hidden'}
          </button>
          <button
            className={meshOptions.links ? 'selected' : ''}
            onClick={() => setMeshOptions(o => ({ ...o, links: !o.links }))}
          >
            Mesh Links {meshOptions.links ? 'Shown' : 'Hidden'}
          </button>
        </div>
      </div>
    </div>
  )
}


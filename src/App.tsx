import React from 'react'
import Scene from './components/Scene'
import { CampusProvider, useCampus } from './context/CampusContext'
import type { PageId } from './types/campus'
import { OverviewPanel } from './components/panels/OverviewPanel'
import { CampusPanel } from './components/panels/CampusPanel'
import { IndoorPanel } from './components/panels/IndoorPanel'
import { MeshPanel } from './components/panels/MeshPanel'
import { PropagationPanel } from './components/panels/PropagationPanel'
import { MovementPanel } from './components/panels/MovementPanel'
import { EventsPanel } from './components/panels/EventsPanel'
import { SettingsPanel } from './components/panels/SettingsPanel'

const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'campus', label: 'Campus 3D', icon: '🏛' },
  { id: 'indoor', label: 'Indoor Explorer', icon: '🏢' },
  { id: 'mesh', label: 'Wi-Fi Mesh', icon: '📶' },
  { id: 'propagation', label: 'Wi-Fi Propagation', icon: '📡' },
  { id: 'movement', label: 'Human Movement', icon: '🚶' },
  { id: 'events', label: 'Events', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙' }
]

function MainLayout() {
  const {
    page,
    setPage,
    sceneMode,
    setSceneMode,
    selectedBuildingId,
    setSelectedBuildingId,
    selectedApId,
    setSelectedApId,
    selectedAgentId,
    setSelectedAgentId,
    cutaway,
    setCutaway,
    nodes,
    meshOptions,
    coverage,
    localCoverage,
    heatmapVisible,
    propSettings,
    agents,
    settings,
    enterBuilding,
    exitToCampus
  } = useCampus()

  // Handle navigation tab click with sensible camera/mode presets
  const handleNavClick = (targetPage: PageId) => {
    setPage(targetPage)
    if (targetPage === 'campus') {
      exitToCampus()
    } else if (['indoor', 'propagation', 'movement'].includes(targetPage)) {
      enterBuilding('410')
    }
  }

  const renderActivePanel = () => {
    switch (page) {
      case 'overview':
        return <OverviewPanel />
      case 'campus':
        return <CampusPanel />
      case 'indoor':
        return <IndoorPanel />
      case 'mesh':
        return <MeshPanel />
      case 'propagation':
        return <PropagationPanel />
      case 'movement':
        return <MovementPanel />
      case 'events':
        return <EventsPanel />
      case 'settings':
        return <SettingsPanel />
      default:
        return <OverviewPanel />
    }
  }

  return (
    <main>
      {/* 1. Left Navigation Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">◈</span>
          <div>
            Campus <b>Sentinel</b>
            <small>Digital Twin Prototype</small>
          </div>
        </div>

        <nav>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`nav-btn ${page === item.id ? 'active' : ''}`}
              onClick={() => handleNavClick(item.id)}
            >
              <span className="nav-btn-content">
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </span>
              {item.id === 'mesh' && (
                <em className="nav-badge">{nodes.filter(n => n.active).length} APs</em>
              )}
              {item.id === 'movement' && (
                <em className="nav-badge">{agents.filter(a => a.active).length} agents</em>
              )}
            </button>
          ))}
        </nav>

        <div className="side-note">
          <b>Simulation Notice</b>
          <p>
            Illustrative RF propagation & human movement digital twin models.
            Not live sensing or certified RF survey measurements.
          </p>
        </div>
      </aside>

      {/* 2. Central 3D Digital Twin Workspace */}
      <section className="workspace">
        <header>
          <div>
            <span className="crumb">Campus Sentinel / {page.replace('_', ' ')}</span>
            <h1>
              {page === 'overview'
                ? 'Unified Monitoring Dashboard'
                : sceneMode === 'campus'
                ? 'Campus 3D Viewport'
                : 'Building 410 Interior Orbit'}
            </h1>
          </div>

          <div className="header-actions">
            {sceneMode === 'campus' ? (
              <button className="primary-action-btn" onClick={() => enterBuilding('410')}>
                Enter Building 410 ➔
              </button>
            ) : (
              <button className="secondary-action-btn" onClick={exitToCampus}>
                ⬅ Campus View
              </button>
            )}
            {sceneMode === 'interior' && (
              <button
                className={`secondary-action-btn ${cutaway ? 'selected' : ''}`}
                onClick={() => setCutaway(c => !c)}
              >
                Cutaway {cutaway ? 'ON' : 'OFF'}
              </button>
            )}
            <button
              className="secondary-action-btn"
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen?.()
                } else {
                  document.exitFullscreen?.()
                }
              }}
            >
              Fullscreen
            </button>
          </div>
        </header>

        {/* Viewport with interactive Three.js Scene */}
        <div className="viewport">
          <Scene
            mode={sceneMode}
            selected={
              page === 'movement'
                ? selectedAgentId
                : page === 'mesh'
                ? selectedApId
                : selectedBuildingId
            }
            cutaway={cutaway}
            options={meshOptions}
            nodes={nodes}
            coverage={coverage}
            localCoverage={localCoverage}
            heatmap={heatmapVisible && sceneMode === 'interior'}
            heatmapOpacity={propSettings.heatmapOpacity}
            agents={agents}
            selectedAgentId={selectedAgentId}
            showTrails={settings.showTrails}
            onSelectBuilding={id => {
              setSelectedBuildingId(id)
              if (page !== 'campus' && page !== 'overview') {
                setPage('campus')
              }
            }}
            onSelectNode={id => {
              setSelectedApId(id)
              if (page !== 'mesh') {
                setPage('mesh')
              }
            }}
            onSelectAgent={id => {
              setSelectedAgentId(id)
              if (page !== 'movement') {
                setPage('movement')
              }
            }}
          />

          <div className="scene-badge">
            SIMULATED PROPAGATION — NOT LIVE NETWORK MEASUREMENTS
          </div>
        </div>
      </section>

      {/* 3. Right Inspector / Dedicated Panel */}
      <aside className="inspector">{renderActivePanel()}</aside>
    </main>
  )
}

export default function App() {
  return (
    <CampusProvider>
      <MainLayout />
    </CampusProvider>
  )
}

import React from 'react'
import Scene, { type SceneViewPreset } from './components/Scene'
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
import WifiSensingExperience from './components/wifi/WifiSensingExperience'

const NAV_ITEMS: { id: PageId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'campus', label: 'Campus 3D', icon: '🏛' },
  { id: 'indoor', label: 'Indoor Explorer', icon: '🏢' },
  { id: 'mesh', label: 'Wi-Fi Mesh', icon: '📶' },
  { id: 'propagation', label: 'Wi-Fi Propagation', icon: '📡' },
  { id: 'movement', label: 'Human Movement', icon: '🚶' },
  { id: 'sensing', label: 'Wi-Fi Sensing Demonstrations', icon: '🧭' },
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
    setMeshOptions,
    coverage,
    localCoverage,
    heatmapVisible,
    setHeatmapVisible,
    propSettings,
    agents,
    settings,
    enterBuilding,
    exitToCampus
  } = useCampus()

  // Handle navigation tab click with sensible camera/mode presets
  const handleNavClick = (targetPage: PageId) => {
    if (targetPage === 'campus') {
      exitToCampus()
    } else if (['indoor', 'propagation', 'movement'].includes(targetPage)) {
      enterBuilding('410')
      setSceneMode('interior')
    }
    setPage(targetPage)
  }

  const handleSceneViewChange = (preset: SceneViewPreset) => {
    if (preset === 'campus') {
      exitToCampus()
      setPage('campus')
    } else if (preset === 'wifi') {
      exitToCampus()
      setSceneMode('campus')
      setPage('mesh')
      setMeshOptions(previous => ({
        ...previous,
        scope: 'campus',
        visible: true,
        labels: true,
        links: true,
        coverageEffects: true
      }))
    } else if (preset === 'propagation') {
      enterBuilding('410')
      setSceneMode('interior')
      setPage('propagation')
      setHeatmapVisible(true)
    } else if (preset === 'sensing') {
      enterBuilding('410')
      setSceneMode('interior')
      setPage('sensing')
      setHeatmapVisible(true)
    } else {
      enterBuilding('410')
      setSceneMode('interior')
      setPage('movement')
    }
  }

  const viewPreset: SceneViewPreset = page === 'mesh'
    ? 'wifi'
    : page === 'propagation'
    ? 'propagation'
    : page === 'movement'
    ? 'movement'
    : page === 'sensing'
    ? 'sensing'
    : 'campus'

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
      case 'sensing':
        return null
      case 'events':
        return <EventsPanel />
      case 'settings':
        return <SettingsPanel />
      default:
        return <OverviewPanel />
    }
  }

  return (
    <main className={page === 'sensing' ? 'sensing-layout' : undefined}>
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
                : page === 'sensing'
                ? 'Wi-Fi Sensing Demonstrations'
                : sceneMode === 'campus'
                ? 'Campus 3D Viewport'
                : 'Building 410 Interior Orbit'}
            </h1>
          </div>

          <div className="header-actions">
            {page === 'sensing' ? (
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
            ) : sceneMode === 'campus' ? (
              <button className="primary-action-btn" onClick={() => enterBuilding('410')}>
                Enter Building 410 ➔
              </button>
            ) : (
              <button className="secondary-action-btn" onClick={exitToCampus}>
                ⬅ Campus View
              </button>
            )}
            {page !== 'sensing' && sceneMode === 'interior' && (
              <button
                className={`secondary-action-btn ${cutaway ? 'selected' : ''}`}
                onClick={() => setCutaway(c => !c)}
              >
                Cutaway {cutaway ? 'ON' : 'OFF'}
              </button>
            )}
            {page !== 'sensing' && <button
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
            </button>}
          </div>
        </header>

        {/* Viewport with interactive Three.js Scene */}
        <div className={`viewport ${page === 'sensing' ? 'sensing-viewport' : ''}`}>
          {page === 'sensing' ? <WifiSensingExperience /> : <Scene
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
            heatmap={heatmapVisible}
            heatmapOpacity={propSettings.heatmapOpacity}
            agents={agents}
            selectedAgentId={selectedAgentId}
            selectedApId={selectedApId}
            viewPreset={viewPreset}
            onViewPresetChange={handleSceneViewChange}
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
          />}

          {page !== 'sensing' && (
            <div className="scene-badge">
              SIMULATED PROPAGATION — NOT LIVE NETWORK MEASUREMENTS
            </div>
          )}
        </div>
      </section>

      {/* 3. Right Inspector / Dedicated Panel */}
      {page !== 'sensing' && <aside className="inspector">{renderActivePanel()}</aside>}
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

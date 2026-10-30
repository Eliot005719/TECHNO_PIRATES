import React, { useState } from 'react'
import { useCampus } from '../../context/CampusContext'
import type { EventItem } from '../../types/campus'

export const EventsPanel: React.FC = () => {
  const { events, clearEvents } = useCampus()
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')

  const filteredEvents = events.filter(e => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.relatedId && e.relatedId.toLowerCase().includes(q))
      )
    }
    return true
  })

  const getCategoryBadgeClass = (category: EventItem['category']) => {
    switch (category) {
      case 'mesh':
        return 'badge-cat-mesh'
      case 'propagation':
        return 'badge-cat-prop'
      case 'movement':
        return 'badge-cat-move'
      default:
        return 'badge-cat-sys'
    }
  }

  return (
    <div className="panel-container">
      <div className="section-title">
        <span className="eyebrow">SYSTEM AUDIT LOG</span>
        <h2>Simulation Events</h2>
        <p className="muted">
          Chronological record of reactive state transitions, RF configuration changes, and multi-agent lifecycle events.
        </p>
      </div>

      {/* Filter and Action Bar */}
      <div className="events-filter-bar">
        <div className="category-pills">
          {['all', 'movement', 'mesh', 'propagation', 'system'].map(cat => (
            <button
              key={cat}
              className={`pill-btn ${filterCategory === cat ? 'active' : ''}`}
              onClick={() => setFilterCategory(cat)}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="events-search-row">
          <input
            type="text"
            placeholder="Search events or IDs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <button className="btn-tiny" onClick={clearEvents} title="Clear event log">
            Clear
          </button>
        </div>
      </div>

      {/* Events Stream */}
      <div className="events-stream">
        {filteredEvents.length === 0 ? (
          <div className="empty-events-state">
            <span className="empty-icon">📭</span>
            <p>No events matching filter.</p>
            <small className="muted">User interactions and simulation transitions appear here in real time.</small>
          </div>
        ) : (
          filteredEvents.map(e => (
            <div key={e.id} className="event-stream-card">
              <div className="event-card-head">
                <span className={`event-category-badge ${getCategoryBadgeClass(e.category)}`}>
                  {e.category}
                </span>
                <span className="event-card-time">{e.timestamp}</span>
              </div>
              <div className="event-card-body">
                <b className="event-card-title">{e.title}</b>
                <p className="event-card-desc">{e.description}</p>
                {e.relatedId && (
                  <span className="event-related-tag">Ref: {e.relatedId}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}


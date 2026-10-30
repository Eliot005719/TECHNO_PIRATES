import React, { useState } from 'react'
import type { AgentSignalRecord } from '../../types/campus'

interface RssiChartProps {
  data: AgentSignalRecord[]
  agentId: string
  agentColor?: string
  onClear?: () => void
}

export const RssiChart: React.FC<RssiChartProps> = ({
  data,
  agentId,
  agentColor = '#7045cc',
  onClear
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (!data || data.length < 2) {
    return (
      <div className="rssi-chart-empty">
        <div className="empty-icon">📈</div>
        <p>No signal telemetry for <b>{agentId}</b> yet.</p>
        <small className="muted">
          Start movement simulation to record real-time propagation telemetry.
        </small>
      </div>
    )
  }

  // Width and height of SVG viewport
  const width = 360
  const height = 140
  const padLeft = 42
  const padRight = 14
  const padTop = 16
  const padBottom = 24

  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBottom

  // RSSI domain range: fixed standard between -30 dBm (strong) and -100 dBm (noise floor)
  const yMin = -95
  const yMax = -35

  const getY = (rssi: number) => {
    const clamped = Math.max(yMin, Math.min(yMax, rssi))
    const ratio = (clamped - yMin) / (yMax - yMin)
    return padTop + chartH - ratio * chartH
  }

  const getX = (index: number) => {
    return padLeft + (index / (data.length - 1)) * chartW
  }

  const points = data.map((d, i) => `${getX(i).toFixed(1)},${getY(d.rssi).toFixed(1)}`).join(' ')
  const areaPoints = `${points} ${getX(data.length - 1)},${padTop + chartH} ${getX(0)},${padTop + chartH}`

  const latest = data[data.length - 1]
  const hovered = hoveredIndex !== null ? data[hoveredIndex] : latest

  // Threshold lines
  const thresholds = [
    { val: -50, label: '-50', color: '#10b981' },
    { val: -65, label: '-65', color: '#f59e0b' },
    { val: -80, label: '-80', color: '#ef4444' }
  ]

  const minRssi = Math.min(...data.map(d => d.rssi))
  const maxRssi = Math.max(...data.map(d => d.rssi))
  const avgRssi = (data.reduce((acc, cur) => acc + cur.rssi, 0) / data.length)

  return (
    <div className="rssi-chart-container">
      <div className="chart-stats-row">
        <div className="chart-stat">
          <span className="stat-label">Current</span>
          <span className="stat-value" style={{ color: agentColor }}>
            {latest.rssi.toFixed(1)} dBm
          </span>
        </div>
        <div className="chart-stat">
          <span className="stat-label">Min / Max</span>
          <span className="stat-value">
            {minRssi.toFixed(0)} / {maxRssi.toFixed(0)}
          </span>
        </div>
        <div className="chart-stat">
          <span className="stat-label">Avg</span>
          <span className="stat-value">{avgRssi.toFixed(1)}</span>
        </div>
        <div className="chart-stat">
          <span className="stat-label">Samples</span>
          <span className="stat-value">{data.length}</span>
        </div>
        {onClear && (
          <button className="btn-tiny" onClick={onClear} title="Clear history">
            Clear
          </button>
        )}
      </div>

      <svg
        className="rssi-svg"
        viewBox={`0 0 ${width} ${height}`}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={`grad-${agentId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={agentColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={agentColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Threshold lines */}
        {thresholds.map(t => {
          const y = getY(t.val)
          return (
            <g key={t.val}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#e2dcf0"
                strokeDasharray="2,2"
                strokeWidth="1"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                fill="#9b8fb3"
                fontSize="9"
                textAnchor="end"
                fontFamily="DM Sans"
              >
                {t.label}
              </text>
            </g>
          )
        })}

        {/* Baseline */}
        <line
          x1={padLeft}
          y1={padTop + chartH}
          x2={width - padRight}
          y2={padTop + chartH}
          stroke="#d2c8e6"
          strokeWidth="1"
        />

        {/* Area fill */}
        <polygon points={areaPoints} fill={`url(#grad-${agentId})`} />

        {/* Line stroke */}
        <polyline
          points={points}
          fill="none"
          stroke={agentColor}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive hover points */}
        {data.map((d, i) => {
          const cx = getX(i)
          const cy = getY(d.rssi)
          const isSelected = hoveredIndex === i || (hoveredIndex === null && i === data.length - 1)
          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 4 : 2}
                fill={isSelected ? agentColor : '#ffffff'}
                stroke={agentColor}
                strokeWidth={isSelected ? 2 : 1}
                style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                onMouseEnter={() => setHoveredIndex(i)}
              />
            </g>
          )
        })}
      </svg>

      {/* Tooltip detail bar */}
      <div className="chart-tooltip-bar">
        <span className="tooltip-item">
          <b>Time:</b> {hovered.timeLabel}
        </span>
        <span className="tooltip-item">
          <b>Room:</b> {hovered.roomName}
        </span>
        <span className="tooltip-item">
          <b>AP:</b> {hovered.strongestApId || 'None'}
        </span>
        <span className="tooltip-item">
          <b>RSSI:</b> {hovered.rssi.toFixed(1)} dBm ({hovered.category})
        </span>
      </div>
    </div>
  )
}


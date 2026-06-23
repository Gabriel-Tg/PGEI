import React, { useMemo } from 'react'
import '../styles/machine-card.css'

export default function MachineCard({ machineId, status = 'offline', oee = 0, realCycle = 0, stopsToday = 0, scrapRate = 0 }) {
  const statusInfo = useMemo(() => {
    const statusMap = {
      producing: {
        label: 'Produzindo',
        class: 'status-producing',
      },
      low_efficiency: {
        label: 'Baixa Eficiência',
        class: 'status-low-efficiency',
      },
      stopped: {
        label: 'Parada',
        class: 'status-stopped',
      },
      offline: {
        label: 'Offline',
        class: 'status-offline',
      },
    }
    return statusMap[status] || statusMap.offline
  }, [status])

  const statusColors = {
    producing: '#10b981',
    low_efficiency: '#f59e0b',
    stopped: '#ef4444',
    offline: '#9ca3af',
  }

  const efficiencyColor = useMemo(() => {
    if (oee >= 85) return 'high'
    if (oee >= 70) return 'medium'
    return 'low'
  }, [oee])

  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '—'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const formatCycle = (seconds) => {
    if (!seconds) return '—'
    return `${Number(seconds).toFixed(1)}s`
  }

  return (
    <div className={`machine-card ${statusInfo.class}`}>
      {/* Status Badge */}
      <div className="machine-badge">
        <span className="machine-status">{statusInfo.label}</span>
      </div>

      {/* Icon Container */}
      <div className="machine-icon-container">
        <div className="machine-status-indicator" style={{ backgroundColor: statusColors[status] || '#9ca3af' }}>
          <span className="machine-icon-text">{machineId}</span>
        </div>
      </div>

      {/* Machine Info Section */}
      <div className="machine-info">
        {/* Machine ID */}
        <div className="info-row machine-id">
          <span className="label">Máquina:</span>
          <span className="value">{machineId}</span>
        </div>

        {/* OEE - Main Indicator */}
        <div className={`info-row oee ${efficiencyColor}`}>
          <span className="label">OEE:</span>
          <span className="value">{oee}%</span>
        </div>

        {/* Cycle Information */}
        <div className="info-row">
          <span className="label">Ciclo Real:</span>
          <span className="value">{formatCycle(realCycle)}</span>
        </div>

        {/* Downtime and Scrap */}
        <div className="info-row">
          <span className="label">Paradas Hoje:</span>
          <span className="value">{formatTime(stopsToday)}</span>
        </div>

        <div className="info-row">
          <span className="label">Refugo:</span>
          <span className="value">{scrapRate}%</span>
        </div>
      </div>

      {/* Efficiency Bar */}
      <div className="efficiency-bar-container">
        <div className={`efficiency-bar ${efficiencyColor}`}>
          <div className="bar-fill" style={{ width: `${Math.min(100, oee)}%` }}></div>
        </div>
        <span className="efficiency-label">{efficiencyColor === 'high' ? 'Alto' : efficiencyColor === 'medium' ? 'Médio' : 'Baixo'}</span>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTripAnalytics } from '../../hooks/useTripAnalytics'
import ChartsTab from './ChartsTab'
import EngineFuelTab from './EngineFuelTab'
import OverviewTab from './OverviewTab'
import PlanTab from './PlanTab'
import RouteTab from './RouteTab'
import TimelineTab from './TimelineTab'
import './TripSummary.css'

const TABS = [
  { id: 'overview', label: 'Overview', Panel: OverviewTab },
  { id: 'plan', label: 'Plan this trip', Panel: PlanTab },
  { id: 'charts', label: 'Charts', Panel: ChartsTab },
  { id: 'route', label: 'Route', Panel: RouteTab },
  { id: 'timeline', label: 'Timeline', Panel: TimelineTab },
  { id: 'engine', label: 'Engine & fuel', Panel: EngineFuelTab },
]

const Waiting = ({ status, error }) => {
  if (status === 'error') return <p className="ts-message error">{error}</p>
  if (status === 'unavailable') return <p className="ts-message">There isn't enough data in this trip to summarise.</p>
  return (
    <div className="ts-message">
      <span className="ts-spinner" aria-hidden="true" />
      {status === 'pending' ? 'Crunching your trip — this takes a few seconds the first time…' : 'Loading…'}
    </div>
  )
}

// The Trip Summary: tabs over the analytics stored on a saved trip
const TripSummaryModal = ({ tripId, title, onClose }) => {
  const { status, analytics, error } = useTripAnalytics(tripId)
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const Panel = TABS.find((t) => t.id === tab).Panel

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Trip summary">
        <header className="ts-header">
          <div>
            <span className="ts-kicker">Trip summary</span>
            <h2 className="ts-title">{title}</h2>
          </div>
          <button className="ts-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <nav className="ts-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`ts-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        <div className="ts-body">
          {status === 'ready' ? <Panel analytics={analytics} /> : <Waiting status={status} error={error} />}
        </div>
      </div>
    </div>
  )
}

export default TripSummaryModal

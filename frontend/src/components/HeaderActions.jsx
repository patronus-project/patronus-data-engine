import { BookOpen, Car, Satellite, Rewind } from 'lucide-react'

// The live-view header's action buttons — unrelated to the refresh cycle, just navigation
// and GPS-source controls that happened to share the same toolbar visually.
export default function HeaderActions({ forceObd, onToggleObdOverride, onReplay }) {
  return (
    <>
      <button className="header-action-btn" disabled title="Units &amp; Names"><BookOpen size={15} /></button>
      <button className="header-action-btn" disabled title="Vehicle Profile"><Car size={15} /></button>
      <button
        className="header-action-btn"
        onClick={onToggleObdOverride}
        title={forceObd ? 'Forced OBD GPS — click to let smart logic decide' : 'Smart GPS active — click to force OBD'}
        style={forceObd ? { background: '#e67e22', borderColor: '#e67e22' } : {}}
      ><Satellite size={15} /></button>
      <button className="header-action-btn" onClick={onReplay} title="Replay" style={{ background: '#e74c3c', borderColor: '#e74c3c' }}><Rewind size={15} fill="#fff" stroke="#fff" /></button>
    </>
  )
}

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { shareTripLink } from './shareLink'

const SHARE_LABEL = { idle: 'Share', copied: 'Link copied', shared: 'Shared', failed: 'Copy failed' }

// The right-hand end of the replay header: what this trip is (name, description, tags when it was saved by hand)
// and the share-link button. Static on purpose: the live numbers (day, distance, progress) are KPIs beside it.
export default function TripInfo({ trip }) {
  const [share, setShare] = useState('idle')

  const handleShare = async () => {
    setShare(await shareTripLink(trip, trip.name || 'Patronus trip replay'))
    setTimeout(() => setShare('idle'), 2500)
  }

  return (
    <div className="trip-info">
      <div className="ti-text">
        {trip.name && <span className="ti-name">{trip.name}</span>}
        {trip.description && <span className="ti-desc">{trip.description}</span>}
        {trip.tags && trip.tags.length > 0 && (
          <span className="ti-tags">{trip.tags.map(tag => <span key={tag} className="ti-tag">{tag}</span>)}</span>
        )}
      </div>
      <button className="ti-share" onClick={handleShare} title="Copy a link to this exact replay">
        {share === 'copied' || share === 'shared' ? <Check size={14} /> : <Share2 size={14} />}
        {SHARE_LABEL[share]}
      </button>
    </div>
  )
}

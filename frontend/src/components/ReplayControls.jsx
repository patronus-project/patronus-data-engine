const SPEEDS = [1, 2, 5, 10, 20]

export default function ReplayControls({ playing, frame, total, speed, buffering, onPlay, onPause, onSeek, onSpeedChange }) {
  const atEnd = total > 0 && frame >= total - 1
  const bufferedPct = total > 0 ? Math.round((frame / (total - 1)) * 100) : 0

  return (
    <div className="replay-controls">
      <button
        className="rc-play-btn"
        onClick={playing ? onPause : onPlay}
        disabled={total === 0 && !buffering}
        aria-label={playing ? 'Pause' : atEnd ? 'Restart' : 'Play'}
      >
        {buffering && frame === 0 ? '…' : playing ? '⏸' : atEnd ? '↺' : '▶'}
      </button>

      <div className="rc-scrubber-wrap">
        <input
          type="range"
          className="rc-scrubber"
          min={0}
          max={Math.max(0, total - 1)}
          value={frame}
          onChange={e => onSeek(Number(e.target.value))}
          disabled={total === 0}
          aria-label="Scrubber"
        />
      </div>

      <span className="rc-frame-count">
        {total > 0 ? `${frame + 1} / ${total}` : '—'}
      </span>

      {buffering && (
        <span className="rc-buffering">buffering…</span>
      )}

      <div className="rc-speed-group" role="group" aria-label="Playback speed">
        <span className="rc-speed-label">Speed</span>
        {SPEEDS.map(s => (
          <button
            key={s}
            className={`rc-speed-btn${speed === s ? ' active' : ''}`}
            onClick={() => onSpeedChange(s)}
            aria-pressed={speed === s}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}

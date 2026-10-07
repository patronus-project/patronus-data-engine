// Small layout pieces shared by the summary tabs.

export const Card = ({ title, hint, children }) => (
  <section className="ts-card">
    {title && <h3 className="ts-card-title">{title}</h3>}
    {hint && <p className="ts-card-hint">{hint}</p>}
    {children}
  </section>
)

// A labelled number: <Stat label="Top speed" value="121" unit="km/h" sub="…" />
export const Stat = ({ label, value, unit, sub }) => (
  <div className="ts-stat">
    <span className="ts-stat-label">{label}</span>
    <span className="ts-stat-value">{value}{unit && <small> {unit}</small>}</span>
    {sub && <span className="ts-stat-sub">{sub}</span>}
  </div>
)

export const StatGrid = ({ children }) => <div className="ts-stat-grid">{children}</div>

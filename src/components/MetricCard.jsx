export default function MetricCard({ icon: Icon, label, value }) {
  return (
    <article className="metric-card">
      <span className="metric-icon">
        <Icon size={18} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

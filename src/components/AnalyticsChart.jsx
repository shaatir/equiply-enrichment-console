import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

const CHART_COLORS = {
  dark: ['#60A5FA', '#34D399', '#FB7185', '#A78BFA', '#38BDF8', '#FBBF24', '#F472B6'],
  light: ['#2563EB', '#059669', '#E11D48', '#7C3AED', '#0891B2', '#D97706', '#BE185D']
};

export default function AnalyticsChart({ rows, theme = 'dark' }) {
  const data = buildChartData(rows);
  const colors = CHART_COLORS[theme] || CHART_COLORS.dark;
  const tooltipStyle = theme === 'dark'
    ? { backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: 8, color: '#F8FAFC' }
    : { backgroundColor: '#FFFFFF', border: '1px solid #D8E0EC', borderRadius: 8, color: '#172033' };

  if (!data.length) {
    return <div className="empty-state">Upload a CSV to see device type distribution.</div>;
  }

  return (
    <div className="chart-stack">
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={96}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [`${value} device${value === 1 ? '' : 's'}`, 'Count']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="legend-list">
        {data.map((entry, index) => (
          <div className="legend-row" key={entry.name}>
            <span
              className="legend-swatch"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span>{entry.name}</span>
            <strong>{entry.percent}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildChartData(rows) {
  const counts = rows.reduce((acc, row) => {
    const key = row.device_type || 'Unknown Device';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, value]) => ({
      name,
      value,
      percent: Math.round((value / rows.length) * 100)
    }))
    .sort((a, b) => b.value - a.value);
}

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Download,
  FileSpreadsheet,
  Moon,
  Stethoscope,
  Sun
} from 'lucide-react';
import AnalyticsChart from './components/AnalyticsChart.jsx';
import EquipmentTable from './components/EquipmentTable.jsx';
import FileUploader from './components/FileUploader.jsx';
import MetricCard from './components/MetricCard.jsx';
import { sampleEquipment } from './data/sampleEquipment.js';
import { parseCsvFile, parseCsvText, exportRowsToCsv } from './utils/csv.js';
import { enrichData } from './utils/enricher.js';

export default function App() {
  const [sourceRows, setSourceRows] = useState(sampleEquipment);
  const [rows, setRows] = useState(() => enrichData(sampleEquipment));
  const [fileName, setFileName] = useState('sample-equipment.csv');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('equiply-theme') || 'light');

  const metrics = useMemo(() => buildMetrics(rows), [rows]);
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('equiply-theme', theme);
  }, [theme]);

  async function handleFile(file) {
    setError('');
    setIsProcessing(true);

    try {
      const parsedRows = await parseCsvFile(file);
      const enrichedRows = enrichData(parsedRows);
      setSourceRows(parsedRows);
      setRows(enrichedRows);
      setFileName(file.name);
    } catch (err) {
      setError(err.message || 'Unable to parse the CSV file.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleLoadChallengeData() {
    setError('');
    setIsProcessing(true);

    try {
      const response = await fetch('/challenge_data-v1.csv');
      if (!response.ok) {
        throw new Error('Unable to load challenge_data-v1.csv from the project root.');
      }

      const parsedRows = parseCsvText(await response.text());
      setSourceRows(parsedRows);
      setRows(enrichData(parsedRows));
      setFileName('challenge_data-v1.csv');
    } catch (err) {
      setError(err.message || 'Unable to load challenge data.');
    } finally {
      setIsProcessing(false);
    }
  }

  function handleExport() {
    const baseName = fileName.replace(/\.csv$/i, '') || 'equipment';
    exportRowsToCsv(rows, `${baseName}-enriched.csv`);
  }

  async function handleRunAiFallback() {
    setError('');
    setIsAiProcessing(true);

    try {
      const response = await fetch('/api/enrich-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rows: sourceRows })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to run AI fallback.');
      }

      setRows(Array.isArray(payload.rows) ? payload.rows : []);
    } catch (err) {
      setError(err.message || 'Unable to run AI fallback.');
    } finally {
      setIsAiProcessing(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-row">
            <span className="brand-mark">
              <Stethoscope size={20} />
            </span>
            <span className="brand-name">Equiply Enrichment Console</span>
          </div>
          <h1>Medical equipment inventory enrichment</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
            {isDark ? 'Light' : 'Dark'}
          </button>
          <button className="primary-button" onClick={handleExport} disabled={!rows.length}>
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </header>

      <section className="metrics-grid" aria-label="Inventory summary">
        <MetricCard icon={FileSpreadsheet} label="Loaded rows" value={rows.length} />
        <MetricCard icon={CalendarClock} label="Oldest device" value={metrics.oldestDate} />
        <MetricCard icon={Activity} label="Device types" value={metrics.deviceTypeCount} />
        <MetricCard icon={AlertTriangle} label="Needs review" value={metrics.reviewCount} />
      </section>

      <section className="workspace-grid">
        <aside className="upload-panel">
          <FileUploader
            fileName={fileName}
            isProcessing={isProcessing}
            isAiProcessing={isAiProcessing}
            reviewCount={metrics.reviewCount}
            onFile={handleFile}
            onLoadChallenge={handleLoadChallengeData}
            onRunAiFallback={handleRunAiFallback}
          />
          {error ? <p className="error-message">{error}</p> : null}

          <div className="strategy-note">
            <h2>Hybrid enrichment</h2>
            <p>
              Cleanly matched rows stay rule-based. Ambiguous rows are flagged for AI fallback,
              so only the uncertain records need manual or model-assisted review.
            </p>
          </div>
        </aside>

        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h2>Enriched inventory</h2>
              <p>Sorted by manufactured date, oldest first.</p>
            </div>
            <span className="file-chip">{fileName}</span>
          </div>
          <EquipmentTable rows={rows} />
        </section>

        <aside className="chart-panel">
          <div className="panel-header">
            <div>
              <h2>Device mix</h2>
              <p>Distribution by enriched device type.</p>
            </div>
          </div>
          <AnalyticsChart rows={rows} theme={theme} />
        </aside>
      </section>
    </main>
  );
}

function buildMetrics(rows) {
  const deviceTypes = new Set(rows.map((row) => row.device_type));
  const reviewCount = rows.filter((row) => row.needs_review).length;

  return {
    oldestDate: rows[0]?.manufactured_date || 'None',
    deviceTypeCount: deviceTypes.size,
    reviewCount
  };
}

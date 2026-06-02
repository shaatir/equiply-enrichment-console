import { useRef, useState } from 'react';
import { FileUp, Loader2, UploadCloud } from 'lucide-react';

export default function FileUploader({
  fileName,
  isProcessing,
  isAiProcessing,
  onFile,
  onLoadChallenge
}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function handleInput(event) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div>
      <div className="panel-header compact">
        <div>
          <h2>Upload CSV</h2>
          <p>Required columns: manufacturer, model, serial_number.</p>
        </div>
      </div>

      <button
        className={`drop-zone ${isDragging ? 'is-dragging' : ''}`}
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="drop-icon">
          {isProcessing || isAiProcessing ? <Loader2 className="spin" size={26} /> : <UploadCloud size={28} />}
        </span>
        <strong>
          {isProcessing || isAiProcessing ? 'Processing inventory...' : 'Drop CSV or click to browse'}
        </strong>
        <span>{fileName}</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        onChange={handleInput}
      />

      <div className="upload-checklist">
        <button className="inline-action" type="button" onClick={onLoadChallenge}>
          Load challenge_data-v1.csv
        </button>
        <div>
          <FileUp size={16} />
          CSV parser handles quoted values and messy row spacing.
        </div>
        <div>
          <FileUp size={16} />
          Rule-based rows stay fixed while ambiguous rows are automatically AI-reviewed.
        </div>
      </div>
    </div>
  );
}

import Papa from 'papaparse';

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (result) => {
        if (result.errors?.length) {
          reject(result.errors[0]);
          return;
        }
        resolve(result.data);
      },
      error: reject
    });
  });
}

export function parseCsvText(csvText) {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader
  });

  if (result.errors?.length) {
    throw result.errors[0];
  }

  return result.data;
}

export function exportRowsToCsv(rows, fileName = 'enriched-equipment.csv') {
  const csv = Papa.unparse(rows, {
    columns: [
      'manufacturer',
      'model',
      'serial_number',
      'manufactured_date',
      'device_type',
      'confidence'
    ]
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/\s+/g, '_');
}

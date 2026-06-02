const DEVICE_RULES = [
  { type: 'Ventilator', pattern: /vent|vnt|puritan|respir|bellavista|servo|hamilton/i },
  { type: 'Ultrasound', pattern: /ultra|voluson|vivid|logiq|affiniti|epiq|sonosite|acuson/i },
  { type: 'Fetal Monitor', pattern: /f9express/i },
  { type: 'Telemetry Transmitter', pattern: /apex pro|it20|intellivue mx40|\bmx40\b/i },
  { type: 'Patient Monitoring Module', pattern: /patient data module|pdm|m3002a/i },
  { type: 'Vital Signs Monitor', pattern: /spot vital signs/i },
  { type: 'Patient Monitor', pattern: /monitor|intellivue|mx\d+|benevision|elitev5|im3|im50|im70|epm12/i },
  { type: 'Infusion Pump', pattern: /infusion|pump|sigma|spectrum|plum|pluma|alaris|inf/i },
  { type: 'CT Scanner', pattern: /ct|somatom|revolution|aquilion/i },
  { type: 'MRI Machine', pattern: /mri|magnetom|ingenia|signa/i },
  { type: 'X-Ray', pattern: /xray|x-ray|\brad\b|definium|digitaldiagnost/i },
  { type: 'Defibrillator / Monitor', pattern: /zoll|defib|lifepak|heartstart|aed|r series|m series|x series|propaq/i },
  { type: 'Anesthesia Machine', pattern: /anesthesia|aestiva|avance|aisys|apollo/i },
  { type: 'ECG Machine', pattern: /ekg|ecg|cardio|mac\s?\d+|se1200/i },
  { type: 'Hospital Electric Bed', pattern: /eleganza|century|p1440|p3200|pcentury/i },
  { type: 'Transport Stretcher', pattern: /\bstryker\b|\b1061\b|\b1115\b/i },
  { type: 'Clinical Thermometer', pattern: /tat5000|filac3000|suretemp/i },
  { type: 'Endoscopic Video Processor', pattern: /cv190/i },
  { type: 'Endoscopic Cystoscope', pattern: /cst-4000|cst-5000/i },
  { type: 'Ultrasonic Cleaner', pattern: /uc95/i },
  { type: 'Laboratory Centrifuge', pattern: /\b642e\b/i },
  { type: 'Laboratory Wireless Monitoring Module', pattern: /smartvue915/i },
  { type: 'Laboratory Microscope', pattern: /g380pl/i },
  { type: 'DVT Compression Pump', pattern: /flowtron/i },
  { type: 'Electrosurgical Smoke Evacuator', pattern: /rapidvac/i },
  { type: 'Patient Warming System', pattern: /iob-507/i },
  { type: 'Pulse Oximeter', pattern: /\brad8\b/i },
  { type: 'Aneroid Sphygmomanometer (Blood Pressure Monitor)', pattern: /ce 1434/i }
];

const MANUFACTURER_PREFIXES = {
  ge: 'GE Healthcare',
  ph: 'Philips',
  philips: 'Philips',
  sie: 'Siemens Healthineers',
  siemens: 'Siemens Healthineers',
  mdt: 'Medtronic',
  bax: 'Baxter'
};

const DATE_SOURCE_STRONG = new Set([
  'manufacturer_rule:edan',
  'manufacturer_rule:zoll',
  'manufacturer_rule:hillrom_serial',
  'manufacturer_rule:hillrom_century',
  'manufacturer_rule:hillrom_model_p1440_p3200',
  'manufacturer_rule:american_diagnostic',
  'manufacturer_rule:biosonic',
  'manufacturer_rule:cogentix',
  'manufacturer_rule:covidien',
  'manufacturer_rule:welch_allyn_alpha',
  'manufacturer_rule:welch_allyn_numeric',
  'manufacturer_rule:hospira',
  'manufacturer_rule:masimo',
  'manufacturer_rule:thermo',
  'generic:explicit_date',
  'generic:year_month',
  'generic:two_digit_year_after_letter',
  'generic:two_digit_year_at_start',
  'generic:numeric_year',
  'generic:year_anywhere'
]);

export function enrichData(rows) {
  return rows.map((row, index) => enrichEquipmentRow(row, index)).sort(sortByManufacturedDate);
}

export async function enrichDataWithAi(rows, options = {}) {
  const analyzed = rows.map((row, index) => analyzeEquipmentRow(row, index));
  const resolved = await Promise.all(
    analyzed.map(async (record, index) => {
      if (!record.needs_review || typeof options.aiResolver !== 'function') {
        return record;
      }

      const aiResult = await options.aiResolver(record, record.row_index ?? index);
      return mergeAiResolution(record, aiResult);
    })
  );

  return resolved.sort(sortByManufacturedDate);
}

export function enrichEquipmentRow(row, index = 0) {
  return analyzeEquipmentRow(row, index);
}

export function analyzeEquipmentRow(row, index = 0) {
  const normalized = normalizeRow(row);
  const manufacturerSource = normalized.manufacturer ? 'input' : '';
  const manufacturer = normalized.manufacturer || deriveManufacturer(normalized.serial_number);
  const derivedManufacturerSource = manufacturerSource || (manufacturer ? 'serial_prefix' : 'missing');
  const searchText = [manufacturer, normalized.model, normalized.serial_number].join(' ');

  const manufacturedDateResult = deriveManufacturedDate({ ...normalized, manufacturer }, index);
  const deviceTypeResult = deriveDeviceType(searchText);
  const reviewReasons = buildReviewReasons({
    manufacturer,
    manufacturerSource: derivedManufacturerSource,
    manufacturedDateResult,
    deviceTypeResult,
    normalized
  });
  const needsReview = reviewReasons.length > 0;

  return {
    ...normalized,
    row_index: index,
    manufacturer,
    manufacturer_source: derivedManufacturerSource,
    manufactured_date: manufacturedDateResult.value,
    manufactured_date_source: manufacturedDateResult.source,
    device_type: deviceTypeResult.value,
    device_type_source: deviceTypeResult.source,
    enrichment_mode: needsReview ? 'ai_review' : 'rule',
    needs_review: needsReview,
    review_reasons: reviewReasons.join('; '),
    confidence: scoreConfidence({
      manufacturer,
      manufacturerSource: derivedManufacturerSource,
      manufacturedDateSource: manufacturedDateResult.source,
      deviceType: deviceTypeResult.value,
      enrichmentMode: needsReview ? 'ai_review' : 'rule'
    })
  };
}

export function sortByManufacturedDate(a, b) {
  return safeTime(a.manufactured_date) - safeTime(b.manufactured_date);
}

function normalizeRow(row) {
  return {
    manufacturer: clean(row.manufacturer ?? row.Manufacturer),
    model: clean(row.model ?? row.Model),
    serial_number: clean(row.serial_number ?? row.serialNumber ?? row['serial number'] ?? row.SerialNumber)
  };
}

function deriveManufacturedDate(row, index) {
  const serial = String(row.serial_number || '').trim().toUpperCase();
  const model = String(row.model || '').trim().toUpperCase();
  const manufacturer = String(row.manufacturer || '').trim().toUpperCase();

  const edanMatch = serial.match(/(?:^|-)M(\d{2})/);
  if (/EDAN/.test(manufacturer) && edanMatch) {
    return dateResult(`20${edanMatch[1]}`, '01', '01', 'manufacturer_rule:edan');
  }

  const zollMatch = serial.match(/^[A-Z]{1,2}(\d{2})([A-L])/);
  if (/ZOLL/.test(manufacturer) && zollMatch) {
    return dateResult(`20${zollMatch[1]}`, monthLetterToNumber(zollMatch[2]), '01', 'manufacturer_rule:zoll');
  }

  if (/HILL ROM|HILLROM/.test(manufacturer) && /(1998|1999)$/.test(serial)) {
    return {
      value: `${serial.slice(-4)}-01-01`,
      source: 'manufacturer_rule:hillrom_serial'
    };
  }

  if (/HILL ROM|HILLROM/.test(manufacturer) && /CENTURY/.test(model)) {
    return {
      value: '1999-01-01',
      source: 'manufacturer_rule:hillrom_century'
    };
  }

  if (/HILL ROM|HILLROM/.test(manufacturer) && /P1440|P3200/.test(model)) {
    return {
      value: '2016-01-01',
      source: 'manufacturer_rule:hillrom_model_p1440_p3200'
    };
  }

  const americanDiagnosticMatch = serial.match(/^C?(\d{2})/);
  if (/AMERICAN DIAGNOSTIC/.test(manufacturer) && americanDiagnosticMatch) {
    return dateResult(twoDigitYearToFour(americanDiagnosticMatch[1]), '01', '01', 'manufacturer_rule:american_diagnostic');
  }

  const biosonicMatch = serial.match(/^(\d{2})([01]\d)/);
  if (/BIOSONIC/.test(manufacturer) && biosonicMatch) {
    return dateResult(twoDigitYearToFour(biosonicMatch[1]), biosonicMatch[2], '01', 'manufacturer_rule:biosonic');
  }

  const cogentixMatch = serial.match(/^CS(\d{2})([01]\d)/);
  if (/COGENTIX/.test(manufacturer) && cogentixMatch) {
    return dateResult(twoDigitYearToFour(cogentixMatch[1]), cogentixMatch[2], '01', 'manufacturer_rule:cogentix');
  }

  const covidienMatch = serial.match(/^VL01(\d{2})/);
  if (/COVIDIEN/.test(manufacturer) && covidienMatch) {
    return dateResult(twoDigitYearToFour(covidienMatch[1]), '01', '01', 'manufacturer_rule:covidien');
  }

  const welchAllynAlphaMatch = serial.match(/^[A-Z](\d{2})/);
  if (/WELCH ALLYN|EXERGEN/.test(manufacturer) && welchAllynAlphaMatch) {
    return dateResult(twoDigitYearToFour(welchAllynAlphaMatch[1]), '01', '01', 'manufacturer_rule:welch_allyn_alpha');
  }

  const welchAllynNumericMatch = serial.match(/^(\d{2})/);
  if (/WELCH ALLYN/.test(manufacturer) && welchAllynNumericMatch) {
    const year = Number(welchAllynNumericMatch[1]);
    if (year >= 20 && year <= 26) {
      return dateResult(`20${welchAllynNumericMatch[1]}`, '01', '01', 'manufacturer_rule:welch_allyn_numeric');
    }
    return {
      value: '2017-01-01',
      source: 'manufacturer_default:welch_allyn'
    };
  }

  const hospiraMatch = serial.match(/^(\d{2})/);
  if (/HOSPIRA/.test(manufacturer) && hospiraMatch) {
    return dateResult(twoDigitYearToFour(hospiraMatch[1]), '01', '01', 'manufacturer_rule:hospira');
  }

  const masimoMatch = serial.match(/^M(\d{2})/);
  if (/MASIMO/.test(manufacturer) && masimoMatch) {
    return dateResult(twoDigitYearToFour(masimoMatch[1]), '01', '01', 'manufacturer_rule:masimo');
  }

  const thermoMatch = serial.match(/^(\d{2})/);
  if (/THERMO/.test(manufacturer) && thermoMatch) {
    return dateResult(twoDigitYearToFour(thermoMatch[1]), '01', '01', 'manufacturer_rule:thermo');
  }

  const explicitDateMatch = serial.match(/(^|\D)(20\d{2}|19\d{2})[-_/]?([01]\d)[-_/]?([0-3]\d)/);
  if (explicitDateMatch) {
    return dateResult(explicitDateMatch[2], explicitDateMatch[3], explicitDateMatch[4], 'generic:explicit_date');
  }

  const yearMonthMatch = serial.match(/(^|\D)(20\d{2}|19\d{2})[-_/]?([01]\d)/);
  if (yearMonthMatch) {
    return dateResult(yearMonthMatch[2], yearMonthMatch[3], '01', 'generic:year_month');
  }

  const twoDigitYearAfterLetter = serial.match(/^[A-Z](\d{2})/);
  if (twoDigitYearAfterLetter) {
    return dateResult(twoDigitYearToFour(twoDigitYearAfterLetter[1]), '01', '01', 'generic:two_digit_year_after_letter');
  }

  const twoDigitYearAtStart = serial.match(/^(\d{2})/);
  if (/EXERGEN|WELCH ALLYN/.test(manufacturer) && twoDigitYearAtStart) {
    return dateResult(twoDigitYearToFour(twoDigitYearAtStart[1]), '01', '01', 'generic:two_digit_year_at_start');
  }

  const numericYearMatch = serial.match(/^(\d{4})/);
  if (numericYearMatch && /^(19|20)\d{2}$/.test(numericYearMatch[1])) {
    return dateResult(numericYearMatch[1], '01', '01', 'generic:numeric_year');
  }

  const yearOnlyMatch = serial.match(/(^|\D)(20\d{2}|19\d{2})(\D|$)/);
  if (yearOnlyMatch) {
    return dateResult(yearOnlyMatch[2], '01', '01', 'generic:year_anywhere');
  }

  if (/BAXTER/.test(manufacturer) && /SPECTRUM IQ/.test(model)) {
    return {
      value: '2022-01-01',
      source: 'manufacturer_default:baxter_spectrum_iq'
    };
  }

  if (/PHILIPS/.test(manufacturer)) {
    return {
      value: '2018-01-01',
      source: 'manufacturer_default:philips'
    };
  }

  if (/GE HEALTHCARE/.test(manufacturer)) {
    return {
      value: '2015-01-01',
      source: 'manufacturer_default:ge_healthcare'
    };
  }

  if (/OLYMPUS/.test(manufacturer)) {
    return {
      value: '2017-01-01',
      source: 'manufacturer_default:olympus'
    };
  }

  const fallbackYear = 2016 + (index % 9);
  return {
    value: `${fallbackYear}-01-01`,
    source: 'fallback:index'
  };
}

function deriveDeviceType(searchText) {
  const match = DEVICE_RULES.find((rule) => rule.pattern.test(searchText));
  return {
    value: match?.type || 'Unknown Device',
    source: match?.type || 'unknown'
  };
}

function deriveManufacturer(serialNumber) {
  const prefix = String(serialNumber || '').split(/[-_\s]/)[0].toLowerCase();
  return MANUFACTURER_PREFIXES[prefix] || '';
}

function buildReviewReasons({ manufacturer, manufacturerSource, manufacturedDateResult, deviceTypeResult, normalized }) {
  const reasons = [];

  if (!normalized.manufacturer && !manufacturer) {
    reasons.push('manufacturer missing');
  } else if (manufacturerSource === 'missing') {
    reasons.push('manufacturer unresolved');
  }

  if (manufacturedDateResult.source.startsWith('manufacturer_default:')) {
    reasons.push('manufactured date used manufacturer default');
  } else if (manufacturedDateResult.source === 'fallback:index') {
    reasons.push('manufactured date used fallback year');
  }

  if (deviceTypeResult.value === 'Unknown Device') {
    reasons.push('device type unresolved');
  }

  if (!normalized.serial_number) {
    reasons.push('serial number missing');
  }

  return reasons;
}

function scoreConfidence({
  manufacturer,
  manufacturerSource,
  manufacturedDateSource,
  deviceType,
  enrichmentMode
}) {
  let score = 100;

  if (!manufacturer) {
    score -= 18;
  } else if (manufacturerSource === 'serial_prefix') {
    score -= 6;
  }

  if (manufacturedDateSource === 'fallback:index') {
    score -= 35;
  } else if (manufacturedDateSource.startsWith('manufacturer_default:')) {
    score -= 20;
  } else if (!DATE_SOURCE_STRONG.has(manufacturedDateSource)) {
    score -= 10;
  }

  if (deviceType === 'Unknown Device') {
    score -= 30;
  }

  if (enrichmentMode === 'ai_review') {
    score -= 5;
  }

  return `${Math.max(40, Math.min(100, Math.round(score / 5) * 5))}%`;
}

export function mergeAiResolution(record, aiResult = {}) {
  const next = { ...record };

  if (typeof aiResult.manufacturer === 'string' && aiResult.manufacturer.trim()) {
    const value = clean(aiResult.manufacturer);
    next.manufacturer = value;
    if (value !== record.manufacturer) {
      next.manufacturer_source = 'ai';
    }
  }

  if (typeof aiResult.manufactured_date === 'string' && aiResult.manufactured_date.trim()) {
    const value = clean(aiResult.manufactured_date);
    next.manufactured_date = value;
    if (value !== record.manufactured_date) {
      next.manufactured_date_source = 'ai';
    }
  }

  if (typeof aiResult.device_type === 'string' && aiResult.device_type.trim()) {
    const value = clean(aiResult.device_type);
    next.device_type = value;
    if (value !== record.device_type) {
      next.device_type_source = 'ai';
    }
  }

  next.enrichment_mode = 'ai';
  next.needs_review = false;
  next.review_reasons = aiResult.notes ? clean(aiResult.notes) : '';
  next.confidence = typeof aiResult.confidence === 'string' && aiResult.confidence.trim()
    ? clean(aiResult.confidence)
    : scoreConfidence({
        manufacturer: next.manufacturer,
        manufacturerSource: next.manufacturer_source,
        manufacturedDateSource: next.manufactured_date_source,
        deviceType: next.device_type,
        enrichmentMode: 'ai'
      });

  return next;
}

function dateResult(year, month, day, source) {
  return {
    value: toDate(year, month, day),
    source
  };
}

function toDate(year, month, day) {
  const mm = clampNumber(month, 1, 12);
  const dd = clampNumber(day, 1, 28);
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function monthLetterToNumber(letter) {
  return String('ABCDEFGHIJKL'.indexOf(letter.toUpperCase()) + 1).padStart(2, '0');
}

function twoDigitYearToFour(value) {
  const year = Number(value);
  if (Number.isNaN(year)) return '2020';
  return year >= 80 ? `19${String(year).padStart(2, '0')}` : `20${String(year).padStart(2, '0')}`;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function safeTime(date) {
  const time = new Date(date).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function clean(value) {
  return String(value || '').trim();
}

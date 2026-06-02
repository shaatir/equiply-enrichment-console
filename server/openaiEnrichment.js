import { enrichDataWithAi } from '../src/utils/enricher.js';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const BATCH_SIZE = 10;

export async function enrichRowsWithOpenAi(rows, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const model = options.model || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set on the dev server.');
  }

  return enrichDataWithAi(rows, {
    aiResolver: createAiResolver({ apiKey, model })
  });
}

export function createAiResolver({ apiKey, model = DEFAULT_MODEL }) {
  const queue = createBatchQueue(async (records) => resolveBatch(records, { apiKey, model }), BATCH_SIZE);

  return async function aiResolver(record) {
    return queue(record);
  };
}

async function resolveBatch(batch, { apiKey, model }) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      records: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            row_index: { type: 'integer' },
            manufacturer: { type: 'string' },
            manufactured_date: { type: 'string' },
            device_type: { type: 'string' },
            confidence: { type: 'string' },
            notes: { type: 'string' }
          },
          required: ['row_index', 'manufacturer', 'manufactured_date', 'device_type', 'confidence', 'notes']
        }
      }
    },
    required: ['records']
  };

  const prompt = [
    'You are assisting with medical equipment enrichment.',
    'Use the deterministic suggestion as a baseline.',
    'Only improve rows that are ambiguous, defaulted, or unresolved.',
    'Preserve manufacturer, model, and serial_number unless the row clearly indicates a correction.',
    'Return one record per input row and keep row_index unchanged.',
    '',
    'Input rows:',
    JSON.stringify(
      batch.map((row) => ({
        row_index: row.row_index,
        manufacturer: row.manufacturer,
        model: row.model,
        serial_number: row.serial_number,
        manufactured_date: row.manufactured_date,
        device_type: row.device_type,
        confidence: row.confidence,
        review_reasons: row.review_reasons
      })),
      null,
      2
    )
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions:
        'You enrich ambiguous equipment rows only. Keep strong deterministic values intact. Return structured JSON only.',
      input: prompt,
      max_output_tokens: 1200,
      text: {
        format: {
          type: 'json_schema',
          name: 'equipment_enrichment_batch',
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI request failed (${response.status}). Try another model with OPENAI_MODEL. Details: ${errorText}`
    );
  }

  const payload = await response.json();
  const text = extractOutputText(payload);
  const parsed = JSON.parse(text);
  const records = Array.isArray(parsed.records) ? parsed.records : [];

  return records.map((record) => ({
    row_index: record.row_index,
    manufacturer: clean(record.manufacturer),
    manufactured_date: normalizeDate(record.manufactured_date),
    device_type: clean(record.device_type),
    confidence: clean(record.confidence),
    notes: clean(record.notes)
  }));
}

function createBatchQueue(worker, batchSize) {
  let pending = [];
  let timer = null;

  return function enqueue(record) {
    return new Promise((resolve, reject) => {
      pending.push({ record, resolve, reject });

      if (pending.length >= batchSize) {
        flush();
        return;
      }

      if (!timer) {
        timer = setTimeout(flush, 0);
      }
    });
  };

  async function flush() {
    if (!pending.length) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    const batch = pending;
    pending = [];

    try {
      const results = await worker(batch.map((item) => item.record));
      const byRowIndex = new Map(results.map((item) => [item.row_index, item]));

      for (const item of batch) {
        item.resolve(byRowIndex.get(item.record.row_index) || {});
      }
    } catch (error) {
      for (const item of batch) {
        item.reject(error);
      }
    }
  }
}

function extractOutputText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if ((content.type === 'output_text' || content.type === 'text') && typeof content.text === 'string') {
        return content.text;
      }
    }
  }

  throw new Error('Unable to locate model output text in the OpenAI response.');
}

function normalizeDate(value) {
  const text = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function clean(value) {
  return String(value || '').trim();
}

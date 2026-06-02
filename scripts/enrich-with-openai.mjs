#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import { sortByManufacturedDate } from '../src/utils/enricher.js';
import { enrichRowsWithOpenAi } from '../server/openaiEnrichment.js';

const DEFAULT_INPUT = path.resolve(process.cwd(), 'challenge_data-v1.csv');
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'challenge_data-v1-enriched-ai.csv');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input || DEFAULT_INPUT);
  const outputPath = path.resolve(args.output || DEFAULT_OUTPUT);
  const model = args.model || process.env.OPENAI_MODEL;

  const csvText = await fs.readFile(inputPath, 'utf8');
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader
  });

  if (parsed.errors?.length) {
    throw parsed.errors[0];
  }

  const finalRows = (await enrichRowsWithOpenAi(parsed.data, { model })).sort(sortByManufacturedDate);
  const aiCount = finalRows.filter((row) => row.enrichment_mode === 'ai').length;

  await writeOutput(outputPath, finalRows);
  console.log(`Wrote ${finalRows.length} rows to ${outputPath}`);
  console.log(`AI fallback rows: ${aiCount}`);
}

async function writeOutput(outputPath, rows) {
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

  await fs.writeFile(outputPath, csv, 'utf8');
}

function parseArgs(args) {
  const result = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--input') {
      result.input = args[++i];
    } else if (arg === '--output') {
      result.output = args[++i];
    } else if (arg === '--model') {
      result.model = args[++i];
    }
  }

  return result;
}

function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/\s+/g, '_');
}

await main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});

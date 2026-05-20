#!/usr/bin/env node
/**
 * Generates document_taxonomy_mapping.json from data/document_taxonomy_analysis.json.
 *
 * Output format matches other taxonomy mapping files in this repo:
 * {
 *   description: string,
 *   mappings: [{ title, proposed, notes }]
 * }
 */
const fs = require('fs');
const path = require('path');

const analysisPath = path.join(__dirname, '..', 'data', 'document_taxonomy_analysis.json');
const outputPath = path.join(__dirname, '..', 'document_taxonomy_mapping.json');

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function flattenRecommended(recommended) {
  if (!recommended || typeof recommended !== 'object') return [];

  const orderedSchemes = [
    'topics',
    'buyingStage',
    'audience',
    'industry',
    'region',
    'companySize',
    'marketModel',
  ];

  const flattened = [];
  for (const key of orderedSchemes) {
    const values = Array.isArray(recommended[key]) ? recommended[key] : [];
    flattened.push(...values);
  }

  // Include any additional scheme keys that may be introduced later.
  for (const [key, values] of Object.entries(recommended)) {
    if (orderedSchemes.includes(key)) continue;
    if (Array.isArray(values)) flattened.push(...values);
  }

  return uniq(flattened);
}

function main() {
  if (!fs.existsSync(analysisPath)) {
    console.error(`Analysis file not found: ${analysisPath}`);
    process.exit(1);
  }

  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  if (!Array.isArray(analysis)) {
    console.error('Expected analysis file to contain an array.');
    process.exit(1);
  }

  const mappings = [];
  let skippedEmpty = 0;

  for (const row of analysis) {
    const title = (row.title || '').trim();
    if (!title) continue;

    const proposed = flattenRecommended(row.recommended);
    if (proposed.length === 0) {
      skippedEmpty++;
      continue;
    }

    mappings.push({
      title,
      proposed,
      notes: 'Auto-generated from document taxonomy analysis. Review before apply.',
    });
  }

  mappings.sort((a, b) => a.title.localeCompare(b.title));

  const output = {
    description:
      'Proposed SKOS taxonomy concept mappings for published documents. Generated from data/document_taxonomy_analysis.json and intended for manual review before apply.',
    mappings,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${mappings.length} document mappings to document_taxonomy_mapping.json`);
  console.log(`Skipped ${skippedEmpty} documents with no recommended concepts.`);
}

main();

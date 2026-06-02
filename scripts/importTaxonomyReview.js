#!/usr/bin/env node
/**
 * Imports taxonomy assignments from a completed review file (xlsx or CSV).
 * Maps human-readable concept names back to IDs and applies taxonomy to entries.
 *
 * Usage:
 *   node scripts/importTaxonomyReview.js                          # dry run (xlsx)
 *   node scripts/importTaxonomyReview.js --apply                  # apply changes
 *   node scripts/importTaxonomyReview.js --file custom.xlsx       # use a different file
 *   node scripts/importTaxonomyReview.js --file custom.csv        # CSV also supported
 *
 * Expects: data/taxonomy_review.xlsx (or --file path)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const organizationId = process.env.CONTENTFUL_ORGANIZATION_ID;

if (!spaceId || !token || !organizationId) {
  console.error('Missing required env vars: CONTENTFUL_SPACE_ID, CONTENTFUL_MANAGEMENT_TOKEN, CONTENTFUL_ORGANIZATION_ID');
  process.exit(1);
}

const BASE = `https://api.contentful.com/spaces/${spaceId}/environments/master`;
const TAXONOMY_BASE = `https://api.contentful.com/organizations/${organizationId}/taxonomy`;
const headers = { Authorization: `Bearer ${token}` };

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');
const fileIdx = args.indexOf('--file');
const defaultFile = path.join(__dirname, '..', 'data', 'taxonomy_review.xlsx');
const inputFile = fileIdx !== -1 ? args[fileIdx + 1] : defaultFile;

async function fetchTaxonomy() {
  const schemes = [];
  let url = `${TAXONOMY_BASE}/concept-schemes?limit=100`;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Schemes ${res.status}: ${await res.text()}`);
    const data = await res.json();
    schemes.push(...data.items);
    url = data.pages?.next ? `https://api.contentful.com${data.pages.next}` : null;
  }

  const concepts = [];
  url = `${TAXONOMY_BASE}/concepts?limit=100`;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Concepts ${res.status}: ${await res.text()}`);
    const data = await res.json();
    concepts.push(...data.items);
    url = data.pages?.next ? `https://api.contentful.com${data.pages.next}` : null;
  }

  return { schemes, concepts };
}

function buildLookups(schemes, concepts) {
  const schemeMap = new Map();
  for (const s of schemes) {
    const name = s.prefLabel?.['en-US'] || s.prefLabel?.en || s.sys.id;
    schemeMap.set(name, s.sys.id);
  }

  const conceptMap = new Map(); // id -> { label, schemeIds, broader }
  for (const c of concepts) {
    const label = c.prefLabel?.['en-US'] || c.prefLabel?.en || c.sys.id;
    const schemeIds = (c.conceptSchemes || []).map(s => s.sys?.id).filter(Boolean);
    const broader = c.broader?.length ? c.broader.map(b => b.sys?.id).filter(Boolean) : [];
    conceptMap.set(c.sys.id, { label, schemeIds, broader, id: c.sys.id });
  }

  // Build path -> id lookup
  function getPath(conceptId) {
    const c = conceptMap.get(conceptId);
    if (!c) return conceptId;
    if (c.broader.length === 0) return c.label;
    return `${getPath(c.broader[0])} > ${c.label}`;
  }

  // Map: "path" -> concept ID, also "label" -> concept ID (for convenience)
  const pathToId = new Map();
  const labelToIds = new Map(); // label can match multiple concepts
  for (const [id, c] of conceptMap) {
    const p = getPath(id);
    pathToId.set(p.toLowerCase(), id);
    // Also index by just the leaf label (case-insensitive)
    const leafLabel = c.label.toLowerCase();
    if (!labelToIds.has(leafLabel)) labelToIds.set(leafLabel, []);
    labelToIds.get(leafLabel).push({ id, schemeIds: c.schemeIds });
  }

  return { schemeMap, conceptMap, pathToId, labelToIds };
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function resolveConceptName(name, schemeName, schemeMap, pathToId, labelToIds) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Try exact path match first
  const byPath = pathToId.get(trimmed.toLowerCase());
  if (byPath) return byPath;

  // Try leaf label match, filtered by scheme
  const schemeId = schemeMap.get(schemeName);
  const byLabel = labelToIds.get(trimmed.toLowerCase());
  if (byLabel) {
    // Filter to concepts in the correct scheme
    const inScheme = byLabel.filter(c => c.schemeIds.includes(schemeId));
    if (inScheme.length === 1) return inScheme[0].id;
    if (inScheme.length > 1) {
      console.warn(`  ⚠️  Ambiguous: "${trimmed}" matches ${inScheme.length} concepts in ${schemeName}. Using first.`);
      return inScheme[0].id;
    }
    // If not in the specific scheme, try any match
    if (byLabel.length === 1) return byLabel[0].id;
  }

  return null; // unresolved
}

async function getEntry(entryId) {
  const url = `${BASE}/entries/${entryId}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET entry ${entryId}: ${res.status}`);
  return res.json();
}

async function updateEntryMetadata(entryId, version, concepts) {
  const url = `${BASE}/entries/${entryId}`;
  // We need to PATCH the entry with updated metadata.concepts
  // First get the full entry, then PUT with updated metadata
  const entry = await getEntry(entryId);

  entry.metadata = entry.metadata || {};
  entry.metadata.concepts = concepts.map(id => ({
    sys: { type: 'Link', linkType: 'TaxonomyConcept', id },
  }));

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/vnd.contentful.management.v1+json',
      'X-Contentful-Version': version || entry.sys.version,
    },
    body: JSON.stringify({
      fields: entry.fields,
      metadata: entry.metadata,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PUT entry ${entryId}: ${res.status} — ${body}`);
  }
  return res.json();
}

async function main() {
  console.log(applyMode ? '🚀 APPLY MODE — changes will be written!' : '🔍 DRY RUN — no changes will be made');
  console.log(`Reading: ${inputFile}\n`);

  if (!fs.existsSync(inputFile)) {
    console.error(`File not found: ${inputFile}`);
    process.exit(1);
  }

  // Load taxonomy
  console.log('Fetching taxonomy...');
  const { schemes, concepts } = await fetchTaxonomy();
  const { schemeMap, pathToId, labelToIds } = buildLookups(schemes, concepts);
  const schemeNames = [...schemeMap.keys()];
  console.log(`  Loaded ${concepts.length} concepts across ${schemes.length} schemes\n`);

  // Parse input file (xlsx or csv)
  let rows = []; // { entryId, title, schemeValues: { [schemeName]: string } }

  if (inputFile.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputFile);

    // Process all sheets except Instructions and Reference
    const skipSheets = ['Instructions', 'Reference'];
    for (const sheet of workbook.worksheets) {
      if (skipSheets.includes(sheet.name)) continue;

      const headerRow = sheet.getRow(1);
      const headerFields = [];
      headerRow.eachCell((cell, colNumber) => {
        headerFields[colNumber - 1] = String(cell.value || '');
      });

      const reviewedIdx = headerFields.indexOf('Reviewed');
      const idIdx = headerFields.indexOf('id');
      const titleIdx = headerFields.indexOf('Title');
      const publishedIdx = headerFields.indexOf('Published');

      if (idIdx === -1 || publishedIdx === -1) continue;

      // Find scheme columns (after Published)
      const schemeColumns = headerFields.slice(publishedIdx + 1);

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header

        const reviewed = String(row.getCell(reviewedIdx + 1).value || '').toLowerCase().trim();
        if (reviewed !== 'yes') return; // Only process reviewed rows

        const entryId = String(row.getCell(idIdx + 1).value || '').trim();
        const title = String(row.getCell(titleIdx + 1).value || '').trim();
        if (!entryId) return;

        const schemeValues = {};
        for (let col = 0; col < schemeColumns.length; col++) {
          const cellValue = String(row.getCell(publishedIdx + 2 + col).value || '');
          schemeValues[schemeColumns[col]] = cellValue;
        }

        rows.push({ entryId, title, schemeValues });
      });
    }

    console.log(`Found ${rows.length} reviewed rows across ${workbook.worksheets.length - skipSheets.length} sheets\n`);
  } else {
    // CSV fallback
    const lines = fs.readFileSync(inputFile, 'utf8').split('\n').filter(l => l.trim());
    const headerFields = parseCsvLine(lines[0]);
    const publishedAtIdx = headerFields.indexOf('publishedAt') !== -1
      ? headerFields.indexOf('publishedAt')
      : headerFields.indexOf('Published');
    const schemeColumns = headerFields.slice(publishedAtIdx + 1);
    const idIdx = headerFields.indexOf('id');
    const titleIdx = headerFields.indexOf('title') !== -1
      ? headerFields.indexOf('title')
      : headerFields.indexOf('Title');

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const entryId = fields[idIdx];
      const title = fields[titleIdx] || '';
      if (!entryId) continue;

      const schemeValues = {};
      for (let col = 0; col < schemeColumns.length; col++) {
        schemeValues[schemeColumns[col]] = fields[publishedAtIdx + 1 + col] || '';
      }

      rows.push({ entryId, title, schemeValues });
    }

    console.log(`Found ${rows.length} rows in CSV\n`);
  }

  let changesCount = 0;
  let errorCount = 0;
  const unresolvedNames = new Set();

  for (let i = 0; i < rows.length; i++) {
    const { entryId, title, schemeValues } = rows[i];

    // Parse concept names from each scheme column
    const newConceptIds = [];
    for (const [schemeName, cellValue] of Object.entries(schemeValues)) {
      // Accept both ; and , as separators
      const names = cellValue.split(/[;,]/).map(n => n.trim()).filter(Boolean);

      for (const name of names) {
        const conceptId = resolveConceptName(name, schemeName, schemeMap, pathToId, labelToIds);
        if (conceptId) {
          newConceptIds.push(conceptId);
        } else {
          unresolvedNames.add(`${schemeName}: "${name}"`);
        }
      }
    }

    // Deduplicate
    const uniqueConceptIds = [...new Set(newConceptIds)];

    // Get current entry to compare
    try {
      const entry = await getEntry(entryId);
      const currentConceptIds = (entry.metadata?.concepts || []).map(c => c.sys.id).sort();
      const newSorted = [...uniqueConceptIds].sort();

      if (JSON.stringify(currentConceptIds) === JSON.stringify(newSorted)) continue; // no change

      changesCount++;
      const added = newSorted.filter(id => !currentConceptIds.includes(id));
      const removed = currentConceptIds.filter(id => !newSorted.includes(id));

      console.log(`[${i + 1}/${rows.length}] ${title || entryId}`);
      if (added.length) console.log(`  + ${added.length} concepts added`);
      if (removed.length) console.log(`  - ${removed.length} concepts removed`);

      if (applyMode) {
        await updateEntryMetadata(entryId, entry.sys.version, uniqueConceptIds);
        console.log('  ✅ Applied');
        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      console.error(`  ❌ Error on ${entryId}: ${err.message}`);
      errorCount++;
    }
  }
  }

  console.log('\n--- Results ---');
  console.log(`Entries with changes: ${changesCount}`);
  console.log(`Errors: ${errorCount}`);

  if (unresolvedNames.size > 0) {
    console.log(`\n⚠️  Unresolved concept names (${unresolvedNames.size}):`);
    for (const name of [...unresolvedNames].sort()) {
      console.log(`  • ${name}`);
    }
  }

  if (!applyMode && changesCount > 0) {
    console.log('\nRun with --apply to write changes to Contentful.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });

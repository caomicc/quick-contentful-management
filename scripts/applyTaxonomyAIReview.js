#!/usr/bin/env node
/**
 * Applies AI-reviewed taxonomy suggestions to Contentful.
 *
 * Reads data/taxonomy_ai_review.json and for each concept with changes,
 * PATCHes the Contentful taxonomy API with the suggested fields.
 *
 * Usage:
 *   node scripts/applyTaxonomyAIReview.js              # dry run (default)
 *   node scripts/applyTaxonomyAIReview.js --apply      # actually apply changes
 *   node scripts/applyTaxonomyAIReview.js --scheme "Topics" --apply  # one scheme only
 *   node scripts/applyTaxonomyAIReview.js --verbose    # print full payloads
 *
 * Output: Logs successful updates and any errors
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');
const SCHEME_FILTER = args.includes('--scheme') ? args[args.indexOf('--scheme') + 1] : null;

const orgId = process.env.CONTENTFUL_ORGANIZATION_ID;
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const TAXONOMY_BASE = `https://api.contentful.com/organizations/${orgId}/taxonomy`;

const INPUT_PATH = path.join(__dirname, '..', 'data', 'taxonomy_ai_review.json');

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`File not found: ${INPUT_PATH}`);
  console.error('Run: node scripts/reviewTaxonomyWithAI.js');
  process.exit(1);
}

const reviews = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

async function applyConceptUpdate(conceptId, suggested) {
  const url = `${TAXONOMY_BASE}/concepts/${conceptId}`;

  // Fetch current version + current data
  let version, currentData;
  try {
    const conceptUrl = `${TAXONOMY_BASE}/concepts/${conceptId}`;
    const res = await fetch(conceptUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    currentData = await res.json();
    version = currentData.sys.version;
  } catch (err) {
    return { ok: false, error: `Failed to get version: ${err.message}` };
  }

  // Build JSON Patch ops, choosing operation based on current state
  const ops = [];

  // altLabels: always exists but may be empty
  if (suggested.altLabels && suggested.altLabels.trim()) {
    const labels = suggested.altLabels
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    ops.push({
      op: 'replace',
      path: '/altLabels/en-US',
      value: labels,
    });
  }

  // String fields: definition exists, others may not
  for (const field of ['definition', 'scopeNote', 'example', 'editorialNote']) {
    if (suggested[field] && suggested[field].trim()) {
      const fieldExists = currentData[field] !== null && currentData[field] !== undefined;
      const op = fieldExists ? 'replace' : 'add';
      const path = fieldExists ? `/${field}/en-US` : `/${field}`;
      
      ops.push({
        op,
        path,
        value: fieldExists ? suggested[field] : { 'en-US': suggested[field] },
      });
    }
  }

  if (ops.length === 0) return { ok: true, skipped: true };

  if (VERBOSE) {
    console.log(`\nJSON Patch ops for ${conceptId} (version ${version}):`);
    console.log(JSON.stringify(ops, null, 2));
  }

  if (!APPLY) return { ok: true, dryRun: true };

  const patchHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json-patch+json',
    'X-Contentful-Version': version.toString(),
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: patchHeaders,
    body: JSON.stringify(ops),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text };
  }

  return { ok: true, applied: true };
}

async function main() {
  const entries = Object.values(reviews);
  let filtered = entries;

  if (SCHEME_FILTER) {
    filtered = entries.filter(e => e.schemeName === SCHEME_FILTER);
    if (filtered.length === 0) {
      console.error(`No concepts found for scheme "${SCHEME_FILTER}"`);
      process.exit(1);
    }
    console.log(`Filtering to ${SCHEME_FILTER}: ${filtered.length} concepts\n`);
  }

  // Group by scheme
  const byScheme = {};
  for (const entry of filtered) {
    if (!byScheme[entry.schemeName]) byScheme[entry.schemeName] = [];
    byScheme[entry.schemeName].push(entry);
  }

  let applied = 0;
  let errors = 0;
  let skipped = 0;

  for (const [schemeName, concepts] of Object.entries(byScheme).sort()) {
    console.log(`\n=== ${schemeName} (${concepts.length} concepts) ===`);

    for (const concept of concepts) {
      if (!concept.changes || concept.changes.length === 0) {
        process.stdout.write(`  ↷ No changes: ${concept.label}\n`);
        skipped++;
        continue;
      }

      process.stdout.write(`  → ${concept.label}... `);

      try {
        const result = await applyConceptUpdate(concept.conceptId, concept.suggested);

        if (result.skipped) {
          console.log('no fields to apply');
          skipped++;
        } else if (result.dryRun) {
          console.log(`DRY: ${concept.changes.join(', ')}`);
          applied++;
        } else if (result.applied) {
          console.log(`✓ Applied: ${concept.changes.join(', ')}`);
          applied++;
        } else if (result.ok === false) {
          console.error(`ERROR: ${result.status}`);
          errors++;
          if (VERBOSE) console.error(result.error);
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`ERROR: ${err.message}`);
        errors++;
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Applied: ${applied}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (!APPLY) {
    console.log('\nThis was a DRY RUN. Use --apply to make changes:');
    console.log('  node scripts/applyTaxonomyAIReview.js --apply');
  }
}

main().catch(err => { console.error(err); process.exit(1); });

#!/usr/bin/env node
/**
 * Exports content for external team review with taxonomy assignment.
 * Produces:
 *   1. data/taxonomy_review.csv — one row per content entry, columns for each scheme
 *   2. data/taxonomy_reference.csv — valid concept names per scheme (for team to pick from)
 *
 * The team fills in concept names (semicolon-separated if multiple) in each scheme column.
 * Then use importTaxonomyReview.js to apply their selections.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

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

const CONTENT_TYPES = [
  { id: 'blogPost', titleField: 'title', slugField: 'slug' },
  { id: 'document', titleField: 'title', slugField: 'slug' },
  { id: 'webinar', titleField: 'title', slugField: 'slug' },
  { id: 'caseStudy', titleField: 'title', slugField: 'slug' },
  { id: 'customerSnapshot', titleField: 'title', slugField: 'slug' },
];

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

function buildTaxonomyMaps(schemes, concepts) {
  const schemeMap = new Map();
  for (const s of schemes) {
    schemeMap.set(s.sys.id, s.prefLabel?.['en-US'] || s.prefLabel?.en || s.sys.id);
  }

  const conceptMap = new Map();
  for (const c of concepts) {
    const label = c.prefLabel?.['en-US'] || c.prefLabel?.en || c.sys.id;
    const schemeIds = (c.conceptSchemes || []).map(s => s.sys?.id).filter(Boolean);
    const broader = c.broader?.length ? c.broader.map(b => b.sys?.id).filter(Boolean) : [];
    conceptMap.set(c.sys.id, { label, schemeIds, broader, id: c.sys.id });
  }

  // Build parent path
  function getPath(conceptId) {
    const c = conceptMap.get(conceptId);
    if (!c) return conceptId;
    if (c.broader.length === 0) return c.label;
    return `${getPath(c.broader[0])} > ${c.label}`;
  }

  // Group concepts by scheme with paths
  const conceptsByScheme = {};
  for (const [id, c] of conceptMap) {
    for (const schemeId of c.schemeIds) {
      const schemeName = schemeMap.get(schemeId) || schemeId;
      if (!conceptsByScheme[schemeName]) conceptsByScheme[schemeName] = [];
      conceptsByScheme[schemeName].push({
        id,
        label: c.label,
        path: getPath(id),
      });
    }
  }

  // Build ID -> resolved info
  const resolvedConcepts = new Map();
  for (const [id, c] of conceptMap) {
    const schemeNames = c.schemeIds.map(sid => schemeMap.get(sid) || sid);
    resolvedConcepts.set(id, { label: c.label, path: getPath(id), schemes: schemeNames });
  }

  return { schemeMap, conceptsByScheme, resolvedConcepts };
}

async function fetchAllEntries(contentType) {
  const all = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const url = `${BASE}/entries?content_type=${contentType.id}&limit=${limit}&skip=${skip}&select=sys.id,sys.publishedAt,sys.archivedAt,sys.updatedAt,fields.${contentType.titleField},fields.${contentType.slugField},metadata`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${contentType.id} ${res.status}: ${await res.text()}`);
    const data = await res.json();

    for (const item of data.items) {
      // Skip drafts (never published) and archived entries
      if (!item.sys.publishedAt) continue;
      if (item.sys.archivedAt) continue;

      // Skip entries tagged 'unlisted'
      const tags = (item.metadata?.tags || []).map(t => t.sys.id);
      if (tags.some(t => t.toLowerCase() === 'unlisted')) continue;

      all.push({
        id: item.sys.id,
        contentType: contentType.id,
        title: item.fields?.[contentType.titleField]?.['en-US'] || '',
        slug: item.fields?.[contentType.slugField]?.['en-US'] || '',
        publishedAt: item.sys.publishedAt || null,
        tags,
        conceptIds: (item.metadata?.concepts || []).map(c => c.sys.id),
      });
    }

    if (all.length >= data.total) break;
    skip += limit;
  }

  return all;
}

function escapeCsv(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  console.log('Fetching taxonomy...');
  const { schemes, concepts } = await fetchTaxonomy();
  const { conceptsByScheme, resolvedConcepts } = buildTaxonomyMaps(schemes, concepts);

  const schemeNames = Object.keys(conceptsByScheme).sort();
  console.log(`Schemes: ${schemeNames.join(', ')}`);

  // --- Generate reference CSV ---
  const maxRows = Math.max(...Object.values(conceptsByScheme).map(arr => arr.length));
  const refHeader = schemeNames.map(escapeCsv).join(',');
  const refRows = [];
  for (let i = 0; i < maxRows; i++) {
    const row = schemeNames.map(scheme => {
      const items = conceptsByScheme[scheme];
      return items[i] ? escapeCsv(items[i].path) : '';
    });
    refRows.push(row.join(','));
  }

  const refPath = path.join(__dirname, '..', 'data', 'taxonomy_reference.csv');
  fs.writeFileSync(refPath, [refHeader, ...refRows].join('\n'));
  console.log(`\nSaved reference sheet: data/taxonomy_reference.csv`);
  console.log('  (Team picks values from this list for each scheme column)');

  // --- Fetch content ---
  const allContent = [];
  for (const ct of CONTENT_TYPES) {
    console.log(`\nFetching ${ct.id}...`);
    try {
      const entries = await fetchAllEntries(ct);
      console.log(`  ${entries.length} entries`);
      allContent.push(...entries);
    } catch (err) {
      console.warn(`  Skipping ${ct.id}: ${err.message}`);
    }
  }

  // --- Generate review CSV ---
  // Columns: id, contentType, title, slug, publishedAt, [one col per scheme with current values]
  const reviewHeader = ['id', 'contentType', 'title', 'slug', 'publishedAt', ...schemeNames].map(escapeCsv).join(',');
  const reviewRows = allContent.map(entry => {
    // Resolve current taxonomy
    const currentByScheme = {};
    for (const conceptId of entry.conceptIds) {
      const resolved = resolvedConcepts.get(conceptId);
      if (!resolved) continue;
      for (const scheme of resolved.schemes) {
        if (!currentByScheme[scheme]) currentByScheme[scheme] = [];
        currentByScheme[scheme].push(resolved.path);
      }
    }

    const schemeCols = schemeNames.map(scheme => {
      const values = currentByScheme[scheme] || [];
      return escapeCsv(values.join('; '));
    });

    return [
      escapeCsv(entry.id),
      escapeCsv(entry.contentType),
      escapeCsv(entry.title),
      escapeCsv(entry.slug),
      escapeCsv(entry.publishedAt),
      ...schemeCols,
    ].join(',');
  });

  const reviewPath = path.join(__dirname, '..', 'data', 'taxonomy_review.csv');
  fs.writeFileSync(reviewPath, [reviewHeader, ...reviewRows].join('\n'));
  console.log(`\nSaved review CSV: data/taxonomy_review.csv`);
  console.log(`  ${allContent.length} rows`);
  console.log('\n--- Instructions for external team ---');
  console.log('1. Open taxonomy_review.csv in a spreadsheet');
  console.log('2. Reference taxonomy_reference.csv for valid values per scheme');
  console.log('3. Fill in or modify values in scheme columns (semicolon-separated for multiple)');
  console.log('4. Return the completed CSV');
  console.log('5. Run: node scripts/importTaxonomyReview.js to apply changes');
}

main().catch(err => { console.error(err); process.exit(1); });

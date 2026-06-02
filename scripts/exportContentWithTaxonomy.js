#!/usr/bin/env node
/**
 * Exports all content entries with their taxonomy concept associations.
 * Resolves concept IDs to human-readable names and groups by scheme.
 *
 * Output: data/content_taxonomy_export.json
 *         data/content_taxonomy_export.csv
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

// Content types to export
const CONTENT_TYPES = [
  { id: 'blogPost', titleField: 'title', slugField: 'slug' },
  { id: 'document', titleField: 'title', slugField: 'slug' },
  { id: 'webinar', titleField: 'title', slugField: 'slug' },
  { id: 'caseStudy', titleField: 'title', slugField: 'slug' },
  { id: 'customerSnapshot', titleField: 'title', slugField: 'slug' },
];

async function fetchTaxonomy() {
  console.log('Fetching taxonomy schemes and concepts...');

  // Fetch schemes
  const schemes = [];
  let url = `${TAXONOMY_BASE}/concept-schemes?limit=100`;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Schemes ${res.status}: ${await res.text()}`);
    const data = await res.json();
    schemes.push(...data.items);
    url = data.pages?.next ? `https://api.contentful.com${data.pages.next}` : null;
  }

  // Fetch concepts
  const concepts = [];
  url = `${TAXONOMY_BASE}/concepts?limit=100`;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Concepts ${res.status}: ${await res.text()}`);
    const data = await res.json();
    concepts.push(...data.items);
    url = data.pages?.next ? `https://api.contentful.com${data.pages.next}` : null;
  }

  // Build lookup maps
  const schemeMap = new Map();
  for (const s of schemes) {
    schemeMap.set(s.sys.id, s.prefLabel?.['en-US'] || s.prefLabel?.en || s.sys.id);
  }

  const conceptMap = new Map();
  for (const c of concepts) {
    const label = c.prefLabel?.['en-US'] || c.prefLabel?.en || c.sys.id;
    const schemeIds = (c.conceptSchemes || []).map(s => s.sys?.id).filter(Boolean);
    const broader = c.broader?.length ? c.broader.map(b => b.sys?.id).filter(Boolean) : [];
    conceptMap.set(c.sys.id, { label, schemeIds, broader });
  }

  // Build full path for each concept (e.g., "Technology > SaaS")
  function getConceptPath(conceptId) {
    const concept = conceptMap.get(conceptId);
    if (!concept) return conceptId;
    if (concept.broader.length === 0) return concept.label;
    const parentPath = getConceptPath(concept.broader[0]);
    return `${parentPath} > ${concept.label}`;
  }

  // Build resolved concept info
  const resolvedConcepts = new Map();
  for (const [id, concept] of conceptMap) {
    const schemeNames = concept.schemeIds.map(sid => schemeMap.get(sid) || sid);
    resolvedConcepts.set(id, {
      label: concept.label,
      path: getConceptPath(id),
      schemes: schemeNames,
    });
  }

  console.log(`  Found ${schemes.length} schemes, ${concepts.length} concepts`);
  return { schemeMap, resolvedConcepts };
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
        updatedAt: item.sys.updatedAt || null,
        tags,
        conceptIds: (item.metadata?.concepts || []).map(c => c.sys.id),
      });
    }

    if (all.length >= data.total) break;
    skip += limit;
  }

  return all;
}

async function main() {
  const { schemeMap, resolvedConcepts } = await fetchTaxonomy();

  // Fetch all content
  const allContent = [];
  for (const ct of CONTENT_TYPES) {
    console.log(`Fetching ${ct.id} entries...`);
    try {
      const entries = await fetchAllEntries(ct);
      console.log(`  Found ${entries.length} entries`);
      allContent.push(...entries);
    } catch (err) {
      console.warn(`  Skipping ${ct.id}: ${err.message}`);
    }
  }

  // Resolve taxonomy for each entry
  const enriched = allContent.map(entry => {
    const taxonomyByScheme = {};
    for (const conceptId of entry.conceptIds) {
      const resolved = resolvedConcepts.get(conceptId);
      if (!resolved) continue;
      for (const scheme of resolved.schemes) {
        if (!taxonomyByScheme[scheme]) taxonomyByScheme[scheme] = [];
        taxonomyByScheme[scheme].push(resolved.path);
      }
    }

    return {
      id: entry.id,
      contentType: entry.contentType,
      title: entry.title,
      slug: entry.slug,
      publishedAt: entry.publishedAt,
      updatedAt: entry.updatedAt,
      tags: entry.tags,
      taxonomy: taxonomyByScheme,
    };
  });

  // Save JSON
  const jsonPath = path.join(__dirname, '..', 'data', 'content_taxonomy_export.json');
  fs.writeFileSync(jsonPath, JSON.stringify(enriched, null, 2));
  console.log(`\nSaved ${enriched.length} entries to data/content_taxonomy_export.json`);

  // Save CSV
  const schemeNames = [...new Set([...resolvedConcepts.values()].flatMap(c => c.schemes))].sort();
  const csvHeader = ['id', 'contentType', 'title', 'slug', 'publishedAt', ...schemeNames].join(',');
  const csvRows = enriched.map(entry => {
    const schemeCols = schemeNames.map(scheme => {
      const concepts = entry.taxonomy[scheme] || [];
      return `"${concepts.join('; ')}"`;
    });
    return [
      entry.id,
      entry.contentType,
      `"${(entry.title || '').replace(/"/g, '""')}"`,
      entry.slug,
      entry.publishedAt || '',
      ...schemeCols,
    ].join(',');
  });

  const csvPath = path.join(__dirname, '..', 'data', 'content_taxonomy_export.csv');
  fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'));
  console.log(`Saved CSV to data/content_taxonomy_export.csv`);

  // Print summary
  console.log('\n--- Summary ---');
  console.log(`Total entries: ${enriched.length}`);
  const withTaxonomy = enriched.filter(e => Object.keys(e.taxonomy).length > 0);
  console.log(`Entries with taxonomy: ${withTaxonomy.length}`);
  console.log(`Entries without taxonomy: ${enriched.length - withTaxonomy.length}`);
  console.log(`\nSchemes found: ${schemeNames.join(', ')}`);

  for (const scheme of schemeNames) {
    const count = enriched.filter(e => e.taxonomy[scheme]?.length > 0).length;
    console.log(`  ${scheme}: ${count} entries tagged`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });

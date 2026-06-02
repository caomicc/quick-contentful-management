#!/usr/bin/env node
/**
 * Exports content for external team review as an Excel file (.xlsx)
 * with data validation dropdowns and a reference sheet.
 *
 * Output: data/taxonomy_review.xlsx
 *   - "Review" sheet: one row per entry, scheme columns with current values
 *   - "Reference" sheet: valid concept names per scheme (dropdown source)
 *
 * Usage: node scripts/exportTaxonomyReviewXlsx.js
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

  // Group leaf concept names by scheme
  const conceptsByScheme = {};
  for (const [id, c] of conceptMap) {
    for (const schemeId of c.schemeIds) {
      const schemeName = schemeMap.get(schemeId) || schemeId;
      if (!conceptsByScheme[schemeName]) conceptsByScheme[schemeName] = [];
      // Only add leaf name (not path) for simplicity
      if (!conceptsByScheme[schemeName].includes(c.label)) {
        conceptsByScheme[schemeName].push(c.label);
      }
    }
  }

  // Sort each scheme's concepts alphabetically
  for (const scheme of Object.keys(conceptsByScheme)) {
    conceptsByScheme[scheme].sort();
  }

  // Build ID -> label resolver
  const resolvedConcepts = new Map();
  for (const [id, c] of conceptMap) {
    const schemeNames = c.schemeIds.map(sid => schemeMap.get(sid) || sid);
    resolvedConcepts.set(id, { label: c.label, schemes: schemeNames });
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
      // Skip drafts and archived
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
        conceptIds: (item.metadata?.concepts || []).map(c => c.sys.id),
      });
    }

    if (all.length >= data.total) break;
    skip += limit;
  }

  return all;
}

async function main() {
  console.log('Fetching taxonomy...');
  const { schemes, concepts } = await fetchTaxonomy();
  const { conceptsByScheme, resolvedConcepts } = buildTaxonomyMaps(schemes, concepts);

  const schemeNames = Object.keys(conceptsByScheme).sort();
  console.log(`Schemes: ${schemeNames.join(', ')}`);

  // Fetch content
  const allContent = [];
  for (const ct of CONTENT_TYPES) {
    console.log(`Fetching ${ct.id}...`);
    try {
      const entries = await fetchAllEntries(ct);
      console.log(`  ${entries.length} entries`);
      allContent.push(...entries);
    } catch (err) {
      console.warn(`  Skipping ${ct.id}: ${err.message}`);
    }
  }

  console.log(`\nTotal entries: ${allContent.length}`);
  console.log('Generating Excel file...');

  // --- Create workbook ---
  const workbook = new ExcelJS.Workbook();

  // === INSTRUCTIONS SHEET (first tab) ===
  const instrSheet = workbook.addWorksheet('Instructions', { state: 'visible' });
  instrSheet.getColumn(1).width = 80;
  const instructions = [
    ['TAXONOMY REVIEW INSTRUCTIONS'],
    [''],
    ['1. Go to the "Review" sheet'],
    ['2. For each row you review, set the "Reviewed" column to "yes"'],
    ['3. Edit the taxonomy columns (Industry, Topics, Buying Stage, etc.)'],
    ['4. Use the dropdown for single values, or type semicolons (;) for multiple'],
    ['   Example: "SaaS; Cloud Computing; Cybersecurity"'],
    ['5. Use ONLY values from the "Reference" sheet — check there if unsure'],
    ['6. To REMOVE all taxonomy for a scheme, clear the cell and mark Reviewed = yes'],
    ['7. Leave cells unchanged if the current values are correct'],
    ['8. Only rows marked "Reviewed = yes" will be processed on import'],
    [''],
    ['TIPS:'],
    ['• Gray columns (id, Content Type, Title, Slug, Published) are for reference only — do not edit'],
    ['• The dropdown shows valid single values; for multiple, type them separated by ;'],
    ['• Spelling must match the Reference sheet exactly (case-insensitive is OK)'],
    ['• If you\'re unsure about a value, leave a comment in the cell'],
  ];
  for (const [text] of instructions) {
    const row = instrSheet.addRow([text]);
    if (text === instructions[0][0]) {
      row.font = { bold: true, size: 14 };
    }
  }

  // === REFERENCE SHEET ===
  const refSheet = workbook.addWorksheet('Reference', { state: 'visible' });

  // Header row
  refSheet.getRow(1).values = schemeNames;
  refSheet.getRow(1).font = { bold: true };
  refSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E2F3' },
  };

  // Fill in concept names per scheme column
  const maxConcepts = Math.max(...Object.values(conceptsByScheme).map(arr => arr.length));
  for (let row = 0; row < maxConcepts; row++) {
    const rowValues = schemeNames.map(scheme => {
      const items = conceptsByScheme[scheme];
      return items[row] || '';
    });
    refSheet.getRow(row + 2).values = rowValues;
  }

  // Auto-width columns
  refSheet.columns.forEach((col, i) => {
    col.width = Math.max(schemeNames[i].length + 2, 20);
  });

  // === REVIEW SHEETS (one per content type) ===
  // Group content by content type
  const contentByType = {};
  for (const entry of allContent) {
    if (!contentByType[entry.contentType]) contentByType[entry.contentType] = [];
    contentByType[entry.contentType].push(entry);
  }

  const contentTypeLabels = {
    blogPost: 'Blog Posts',
    document: 'Documents',
    webinar: 'Webinars',
    caseStudy: 'Case Studies',
    customerSnapshot: 'Customer Snapshots',
  };

  for (const [contentType, entries] of Object.entries(contentByType)) {
    const sheetName = contentTypeLabels[contentType] || contentType;
    const sheet = workbook.addWorksheet(sheetName, { state: 'visible' });

    // Columns: Reviewed, id, title, slug, publishedAt, ...schemes
    const columns = [
      { header: 'Reviewed', key: 'reviewed', width: 10 },
      { header: 'id', key: 'id', width: 25 },
      { header: 'Title', key: 'title', width: 50 },
      { header: 'Slug', key: 'slug', width: 40 },
      { header: 'Published', key: 'publishedAt', width: 12 },
      ...schemeNames.map(scheme => ({
        header: scheme,
        key: scheme,
        width: 25,
      })),
    ];
    sheet.columns = columns;

    // Style header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E2F3' },
    };

    // Freeze header row + info columns
    sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 5 }];

    // Add data rows
    for (const entry of entries) {
      const currentByScheme = {};
      for (const conceptId of entry.conceptIds) {
        const resolved = resolvedConcepts.get(conceptId);
        if (!resolved) continue;
        for (const scheme of resolved.schemes) {
          if (!currentByScheme[scheme]) currentByScheme[scheme] = [];
          currentByScheme[scheme].push(resolved.label);
        }
      }

      const rowData = {
        reviewed: '',
        id: entry.id,
        title: entry.title,
        slug: entry.slug,
        publishedAt: entry.publishedAt ? entry.publishedAt.split('T')[0] : '',
      };

      for (const scheme of schemeNames) {
        rowData[scheme] = (currentByScheme[scheme] || []).join('; ');
      }

      sheet.addRow(rowData);
    }

    // Title column: wrap text
    sheet.getColumn('title').alignment = { wrapText: true, vertical: 'top' };

    // Scheme columns: wrap text
    for (const scheme of schemeNames) {
      sheet.getColumn(scheme).alignment = { wrapText: true, vertical: 'top' };
    }

    // Add "Reviewed" column validation (yes/no dropdown)
    for (let row = 2; row <= entries.length + 1; row++) {
      sheet.getCell(row, 1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"yes,no"'],
      };
    }

    // Gray out info columns (read-only signal)
    for (let row = 2; row <= entries.length + 1; row++) {
      for (let col = 2; col <= 5; col++) {
        sheet.getCell(row, col).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' },
        };
      }
    }

    // Add input message on scheme columns (hint without restricting)
    const schemeStartCol = 6;
    for (let i = 0; i < schemeNames.length; i++) {
      const colIdx = schemeStartCol + i;
      for (let row = 2; row <= entries.length + 1; row++) {
        sheet.getCell(row, colIdx).note = undefined; // no notes needed
      }
    }
  }

  // Save
  const outPath = path.join(__dirname, '..', 'data', 'taxonomy_review.xlsx');
  await workbook.xlsx.writeFile(outPath);
  console.log(`\nSaved: data/taxonomy_review.xlsx`);
  console.log(`  ${allContent.length} content rows`);
  console.log(`  ${schemeNames.length} scheme columns with dropdowns`);
  console.log(`  Reference sheet with ${Object.values(conceptsByScheme).reduce((a, b) => a + b.length, 0)} valid values`);
  console.log('\nUpload to SharePoint and share with the team!');
}

main().catch(err => { console.error(err); process.exit(1); });

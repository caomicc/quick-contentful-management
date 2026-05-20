#!/usr/bin/env node
/**
 * Fetches all published documents with their full RichText content,
 * extracts plain text, and caches locally for taxonomy analysis.
 *
 * Output: data/documents_content.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const BASE = `https://api.contentful.com/spaces/${spaceId}/environments/master`;

function extractText(node) {
  if (!node) return '';
  if (node.nodeType === 'text') return node.value || '';
  if (node.content) return node.content.map(extractText).join(' ');
  return '';
}

async function fetchAllDocumentsWithContent() {
  const all = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const url = `${BASE}/entries?content_type=document&limit=${limit}&skip=${skip}&select=sys.id,sys.publishedAt,fields.title,fields.slug,fields.teaser,fields.content,fields.date,metadata`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();

    for (const item of data.items) {
      // Only include published entries
      if (!item.sys.publishedAt) continue;

      const richText = item.fields?.content?.['en-US'];
      const bodyText = richText ? extractText(richText) : '';

      all.push({
        id: item.sys.id,
        title: item.fields?.title?.['en-US'] || '',
        slug: item.fields?.slug?.['en-US'] || '',
        teaser: item.fields?.teaser?.['en-US'] || '',
        date: item.fields?.date?.['en-US'] || '',
        bodyText,
        tags: (item.metadata?.tags || []).map(t => t.sys.id),
        concepts: (item.metadata?.concepts || []).map(c => c.sys.id),
      });
    }

    console.log(`  Fetched ${skip + data.items.length}/${data.total}...`);
    if (skip + data.items.length >= data.total) break;
    skip += limit;
  }

  return all;
}

async function main() {
  console.log('Fetching all published documents with content...\n');
  const docs = await fetchAllDocumentsWithContent();

  const outPath = path.join(__dirname, '..', 'data', 'documents_content.json');
  fs.writeFileSync(outPath, JSON.stringify(docs, null, 2));

  const totalChars = docs.reduce((sum, d) => sum + d.bodyText.length, 0);
  const avgChars = docs.length ? Math.round(totalChars / docs.length) : 0;
  const withBody = docs.filter(d => d.bodyText.length > 0).length;

  console.log(`\nSaved ${docs.length} documents to data/documents_content.json`);
  console.log(`  Documents with body text: ${withBody}/${docs.length}`);
  console.log(`  Total text: ${(totalChars / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Average: ${avgChars} chars/doc`);
}

main().catch(err => { console.error(err); process.exit(1); });

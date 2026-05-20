#!/usr/bin/env node
/**
 * Fetches webinars, case studies, and customer snapshots with their RichText content,
 * extracts plain text, and caches locally for taxonomy analysis.
 *
 * Output:
 *   data/webinars_content.json
 *   data/case_studies_content.json
 *   data/customer_snapshots_content.json
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

async function fetchEntries(contentType, fields) {
  const all = [];
  let skip = 0;
  const limit = 100;
  const select = `sys.id,sys.publishedAt,metadata,${fields.map(f => `fields.${f}`).join(',')}`;

  while (true) {
    const url = `${BASE}/entries?content_type=${contentType}&limit=${limit}&skip=${skip}&select=${select}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();

    for (const item of data.items) {
      if (!item.sys.publishedAt) continue;

      const richText = item.fields?.content?.['en-US'];
      const bodyText = richText ? extractText(richText) : '';
      // Also try teaserText for customerSnapshot
      const teaserRichText = item.fields?.teaserText?.['en-US'];
      const teaserBody = teaserRichText ? extractText(teaserRichText) : '';

      all.push({
        id: item.sys.id,
        title: item.fields?.title?.['en-US'] || '',
        slug: item.fields?.slug?.['en-US'] || '',
        teaser: item.fields?.teaser?.['en-US'] || '',
        bodyText: `${bodyText} ${teaserBody}`.trim(),
        tags: (item.metadata?.tags || []).map(t => t.sys.id),
        concepts: (item.metadata?.concepts || []).map(c => c.sys.id),
      });
    }

    console.log(`  ${contentType}: ${skip + data.items.length}/${data.total}...`);
    if (skip + data.items.length >= data.total) break;
    skip += limit;
  }

  return all;
}

async function main() {
  console.log('Fetching content for webinars, case studies, and customer snapshots...\n');

  const webinars = await fetchEntries('webinar', ['title', 'slug', 'teaser', 'content']);
  const outW = path.join(__dirname, '..', 'data', 'webinars_content.json');
  fs.writeFileSync(outW, JSON.stringify(webinars, null, 2));
  const wBody = webinars.filter(w => w.bodyText.length > 0).length;
  console.log(`  Saved ${webinars.length} webinars (${wBody} with body text)\n`);

  const cases = await fetchEntries('caseStudy', ['title', 'slug', 'teaser', 'content']);
  const outC = path.join(__dirname, '..', 'data', 'case_studies_content.json');
  fs.writeFileSync(outC, JSON.stringify(cases, null, 2));
  const cBody = cases.filter(c => c.bodyText.length > 0).length;
  console.log(`  Saved ${cases.length} case studies (${cBody} with body text)\n`);

  const snaps = await fetchEntries('customerSnapshot', ['title', 'slug', 'teaser', 'teaserText', 'content']);
  const outS = path.join(__dirname, '..', 'data', 'customer_snapshots_content.json');
  fs.writeFileSync(outS, JSON.stringify(snaps, null, 2));
  const sBody = snaps.filter(s => s.bodyText.length > 0).length;
  console.log(`  Saved ${snaps.length} customer snapshots (${sBody} with body text)\n`);
}

main().catch(err => { console.error(err); process.exit(1); });

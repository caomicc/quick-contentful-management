#!/usr/bin/env node
/**
 * Fetches all published blog posts with their full RichText content,
 * extracts plain text, and caches locally for taxonomy analysis.
 *
 * Output: data/blog_posts_content.json
 * Each entry has: id, title, slug, primaryBreadcrumb, teaser, bodyText, tags, concepts
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

async function fetchAllBlogPostsWithContent() {
  const all = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const url = `${BASE}/entries?content_type=blogPost&limit=${limit}&skip=${skip}&select=sys.id,sys.publishedAt,fields.title,fields.slug,fields.teaser,fields.primaryBreadcrumb,fields.content,fields.date,metadata`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();

    for (const item of data.items) {
      const richText = item.fields?.content?.['en-US'];
      const bodyText = richText ? extractText(richText) : '';

      all.push({
        id: item.sys.id,
        title: item.fields?.title?.['en-US'] || '',
        slug: item.fields?.slug?.['en-US'] || '',
        teaser: item.fields?.teaser?.['en-US'] || '',
        primaryBreadcrumb: item.fields?.primaryBreadcrumb?.['en-US'] || '',
        date: item.fields?.date?.['en-US'] || '',
        bodyText,
        tags: (item.metadata?.tags || []).map(t => t.sys.id),
        concepts: (item.metadata?.concepts || []).map(c => c.sys.id),
      });
    }

    console.log(`  Fetched ${all.length}/${data.total}...`);
    if (all.length >= data.total) break;
    skip += limit;
  }

  return all;
}

async function main() {
  console.log('Fetching all published blog posts with content...\n');
  const posts = await fetchAllBlogPostsWithContent();

  const outPath = path.join(__dirname, '..', 'data', 'blog_posts_content.json');
  fs.writeFileSync(outPath, JSON.stringify(posts, null, 2));

  const totalChars = posts.reduce((sum, p) => sum + p.bodyText.length, 0);
  const avgChars = Math.round(totalChars / posts.length);
  const withBody = posts.filter(p => p.bodyText.length > 0).length;

  console.log(`\nSaved ${posts.length} blog posts to data/blog_posts_content.json`);
  console.log(`  Posts with body text: ${withBody}/${posts.length}`);
  console.log(`  Total text: ${(totalChars / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Average: ${avgChars} chars/post`);
}

main().catch(err => { console.error(err); process.exit(1); });

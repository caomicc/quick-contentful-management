#!/usr/bin/env node
/**
 * Exports published documents that have embedded images in their rich text body.
 * Assumes the first image is the cover image; lists remaining images separately.
 *
 * Output: data/document_cover_images.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const BASE = `https://api.contentful.com/spaces/${spaceId}/environments/master`;

/**
 * Recursively walk a rich text node tree and collect embedded image references.
 * Handles both embedded-asset-block (direct asset) and embedded-entry-block
 * (imageWithAiTags entries that wrap an asset).
 * Returns an array of { type, id } in document order.
 */
function extractEmbeddedImageRefs(node) {
  if (!node) return [];
  const refs = [];
  if (node.nodeType === 'embedded-asset-block') {
    const id = node.data?.target?.sys?.id;
    if (id) refs.push({ type: 'asset', id });
  } else if (node.nodeType === 'embedded-entry-block') {
    const id = node.data?.target?.sys?.id;
    if (id) refs.push({ type: 'entry', id });
  }
  if (node.content) {
    for (const child of node.content) {
      refs.push(...extractEmbeddedImageRefs(child));
    }
  }
  return refs;
}

/**
 * Fetch all published documents with their rich text content field.
 */
async function fetchAllDocuments() {
  const all = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const url = `${BASE}/entries?content_type=document&limit=${limit}&skip=${skip}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();

    for (const item of data.items) {
      if (!item.sys.publishedAt) continue;

      const richText = item.fields?.content?.['en-US'];
      const refs = richText ? extractEmbeddedImageRefs(richText) : [];

      if (refs.length === 0) continue;

      all.push({
        id: item.sys.id,
        title: item.fields?.title?.['en-US'] || '',
        slug: item.fields?.slug?.['en-US'] || '',
        date: item.fields?.date?.['en-US'] || '',
        refs,
      });
    }

    console.log(`  Fetched ${skip + data.items.length}/${data.total} entries...`);
    if (skip + data.items.length >= data.total) break;
    skip += limit;
  }

  return all;
}

/**
 * Batch-fetch asset details by IDs (max 100 per request).
 */
async function fetchAssets(assetIds) {
  const unique = [...new Set(assetIds)];
  const assets = {};
  const batchSize = 100;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const url = `${BASE}/assets?sys.id[in]=${batch.join(',')}&limit=${batchSize}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();

    for (const asset of data.items) {
      const file = asset.fields?.file?.['en-US'];
      assets[asset.sys.id] = {
        assetId: asset.sys.id,
        title: asset.fields?.title?.['en-US'] || '',
        url: file?.url ? `https:${file.url}` : null,
        contentType: file?.contentType || '',
      };
    }
  }

  return assets;
}

/**
 * Batch-fetch imageWithAiTags entries by IDs, returning their linked asset IDs.
 */
async function fetchImageEntries(entryIds) {
  const unique = [...new Set(entryIds)];
  const entries = {};
  const batchSize = 100;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const url = `${BASE}/entries?sys.id[in]=${batch.join(',')}&limit=${batchSize}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();

    for (const entry of data.items) {
      const contentType = entry.sys.contentType?.sys?.id;
      if (contentType === 'imageWithAiTags') {
        const assetId = entry.fields?.image?.['en-US']?.sys?.id;
        if (assetId) {
          entries[entry.sys.id] = assetId;
        }
      }
    }
  }

  return entries;
}

async function main() {
  console.log('Fetching published documents with embedded images...\n');
  const docs = await fetchAllDocuments();

  // Separate entry refs (imageWithAiTags) from direct asset refs
  const allEntryIds = [];
  const allAssetIds = [];
  for (const doc of docs) {
    for (const ref of doc.refs) {
      if (ref.type === 'entry') allEntryIds.push(ref.id);
      else allAssetIds.push(ref.id);
    }
  }

  // Resolve imageWithAiTags entries to their underlying asset IDs
  console.log(`\nResolving ${new Set(allEntryIds).size} imageWithAiTags entries...`);
  const entryToAssetMap = await fetchImageEntries(allEntryIds);

  // Collect all asset IDs (direct + resolved from entries)
  const resolvedAssetIds = [...allAssetIds, ...Object.values(entryToAssetMap)];
  console.log(`Resolving ${new Set(resolvedAssetIds).size} unique assets...`);
  const assetMap = await fetchAssets(resolvedAssetIds);

  // Build output
  const output = docs.map(doc => {
    const images = doc.refs
      .map(ref => {
        if (ref.type === 'asset') return assetMap[ref.id] || null;
        const assetId = entryToAssetMap[ref.id];
        return assetId ? assetMap[assetId] || null : null;
      })
      .filter(Boolean)
      .filter(img => img.contentType.startsWith('image/'));

    if (images.length === 0) return null;

    return {
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      date: doc.date,
      coverImage: images[0] || null,
      otherImages: images.slice(1),
    };
  }).filter(Boolean);

  const outPath = path.join(__dirname, '..', 'data', 'document_cover_images.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  const withMultiple = output.filter(d => d.otherImages.length > 0).length;
  console.log(`\nSaved ${output.length} documents with images to data/document_cover_images.json`);
  console.log(`  Documents with a single image (cover only): ${output.length - withMultiple}`);
  console.log(`  Documents with additional images: ${withMultiple}`);
}

main().catch(err => { console.error(err); process.exit(1); });

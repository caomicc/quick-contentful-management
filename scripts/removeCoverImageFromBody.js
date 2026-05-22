#!/usr/bin/env node
/**
 * Verifies coverImage is set on document entries, then removes the matching
 * image from the rich text body content if it exists there.
 *
 * Logic:
 * 1. Fetch each document that has a coverImage set
 * 2. Walk the rich text `content` field for embedded images
 * 3. Resolve embedded-entry-block nodes (imageWithAiTags) to their asset IDs
 * 4. If the coverImage asset appears in the body, remove that node
 * 5. Update the entry (no publish)
 *
 * Usage:
 *   node scripts/removeCoverImageFromBody.js                          # dry run
 *   node scripts/removeCoverImageFromBody.js --apply                  # write
 *   node scripts/removeCoverImageFromBody.js --apply --safe-scheduled # safe mode
 */
require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');
const path = require('path');

const DRY_RUN = !process.argv.includes('--apply');
const SAFE_SCHEDULED =
  process.argv.includes('--safe-scheduled') || process.argv.includes('--skip-scheduled');

const DATA_PATH = path.join(__dirname, '..', 'data', 'document_cover_images.json');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const BASE = `https://api.contentful.com/spaces/${spaceId}/environments/master`;

async function fetchScheduledEntryIds(space, environmentId) {
  const scheduledEntryIds = new Set();
  let next;

  do {
    const query = {
      'environment.sys.id': environmentId,
      'sys.status[in]': 'scheduled,inProgress',
      limit: 100,
    };
    if (next) query.next = next;

    const scheduledActions = await space.getScheduledActions(query);
    for (const action of scheduledActions.items || []) {
      const link = action.entity && action.entity.sys;
      if (link && link.linkType === 'Entry' && link.id) {
        scheduledEntryIds.add(link.id);
      }
    }
    next = scheduledActions.pages && scheduledActions.pages.next;
  } while (next);

  return scheduledEntryIds;
}

/**
 * Batch-fetch imageWithAiTags entries and return a map of entryId -> assetId.
 */
async function resolveImageEntries(entryIds) {
  const unique = [...new Set(entryIds)];
  const map = {};
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
      const assetId = entry.fields?.image?.['en-US']?.sys?.id;
      if (assetId) {
        map[entry.sys.id] = assetId;
      }
    }
  }

  return map;
}

/**
 * Collect all embedded-entry-block and embedded-asset-block entry/asset IDs from rich text.
 */
function collectEmbeddedRefs(node) {
  const refs = [];
  if (!node) return refs;
  if (node.nodeType === 'embedded-asset-block') {
    const id = node.data?.target?.sys?.id;
    if (id) refs.push({ type: 'asset', id });
  } else if (node.nodeType === 'embedded-entry-block') {
    const id = node.data?.target?.sys?.id;
    if (id) refs.push({ type: 'entry', id });
  }
  if (node.content) {
    for (const child of node.content) {
      refs.push(...collectEmbeddedRefs(child));
    }
  }
  return refs;
}

/**
 * Remove the first node from rich text content that matches the coverImage asset.
 * Modifies the tree in place. Returns true if a node was removed.
 */
function removeImageFromContent(node, coverAssetId, entryToAssetMap) {
  if (!node || !node.content) return false;

  for (let i = 0; i < node.content.length; i++) {
    const child = node.content[i];

    if (child.nodeType === 'embedded-asset-block') {
      const id = child.data?.target?.sys?.id;
      if (id === coverAssetId) {
        node.content.splice(i, 1);
        return true;
      }
    } else if (child.nodeType === 'embedded-entry-block') {
      const entryId = child.data?.target?.sys?.id;
      const assetId = entryToAssetMap[entryId];
      if (assetId === coverAssetId) {
        node.content.splice(i, 1);
        return true;
      }
    }

    // Recurse into nested content
    if (child.content && removeImageFromContent(child, coverAssetId, entryToAssetMap)) {
      return true;
    }
  }

  return false;
}

async function main() {
  const coverImages = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  console.log(`Loaded ${coverImages.length} documents with cover images.\n`);

  const client = contentful.createClient({
    accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
  });

  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
  const environmentId = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';
  const env = await space.getEnvironment(environmentId);

  let scheduledEntryIds = new Set();
  if (SAFE_SCHEDULED) {
    scheduledEntryIds = await fetchScheduledEntryIds(space, environmentId);
    console.log(
      `SAFE MODE enabled - found ${scheduledEntryIds.size} entries with scheduled actions to skip.\n`
    );
  }

  // Pre-resolve all imageWithAiTags entries referenced in documents
  // Fetch all documents first to collect entry IDs from their content
  console.log('Fetching documents and collecting embedded entry references...');
  const docsToProcess = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const batch = await env.getEntries({
      content_type: 'document',
      limit,
      skip,
      'sys.publishedAt[exists]': true,
    });

    for (const entry of batch.items) {
      const coverAssetId = entry.fields?.coverImage?.['en-US']?.sys?.id;
      if (!coverAssetId) continue; // Skip entries without coverImage

      const richText = entry.fields?.content?.['en-US'];
      if (!richText) continue;

      docsToProcess.push({ entry, coverAssetId, richText });
    }

    console.log(`  Fetched ${skip + batch.items.length}/${batch.total}...`);
    if (skip + batch.items.length >= batch.total) break;
    skip += limit;
  }

  console.log(`\nFound ${docsToProcess.length} documents with coverImage set.\n`);

  // Collect all embedded-entry-block IDs for batch resolution
  const allEntryIds = [];
  for (const doc of docsToProcess) {
    const refs = collectEmbeddedRefs(doc.richText);
    for (const ref of refs) {
      if (ref.type === 'entry') allEntryIds.push(ref.id);
    }
  }

  console.log(`Resolving ${new Set(allEntryIds).size} embedded imageWithAiTags entries...`);
  const entryToAssetMap = await resolveImageEntries(allEntryIds);
  console.log(`Resolved ${Object.keys(entryToAssetMap).length} entries to assets.\n`);

  if (DRY_RUN) {
    console.log('DRY RUN - no changes will be made. Use --apply to write.\n');
  } else {
    console.log('APPLY MODE - removing cover images from body content (no publish).\n');
  }

  let removed = 0;
  let notInBody = 0;
  let noCoverImage = 0;
  let skippedScheduled = 0;
  let errors = 0;

  for (let i = 0; i < docsToProcess.length; i++) {
    const { entry, coverAssetId, richText } = docsToProcess[i];
    const title = entry.fields?.title?.['en-US'] || entry.sys.id;

    if (SAFE_SCHEDULED && scheduledEntryIds.has(entry.sys.id)) {
      console.log(`SKIP SCHEDULED: "${title}"`);
      skippedScheduled++;
      continue;
    }

    // Deep clone the rich text to test removal without mutating original (for dry run)
    const contentCopy = JSON.parse(JSON.stringify(richText));
    const wasRemoved = removeImageFromContent(contentCopy, coverAssetId, entryToAssetMap);

    if (!wasRemoved) {
      notInBody++;
      continue;
    }

    console.log(
      `${DRY_RUN ? 'WOULD REMOVE' : 'REMOVE'} [${i + 1}/${docsToProcess.length}]: "${title}" (asset: ${coverAssetId})`
    );

    if (!DRY_RUN) {
      try {
        // Re-fetch to get latest version
        const latest = await env.getEntry(entry.sys.id);
        const latestContent = latest.fields?.content?.['en-US'];

        if (latestContent) {
          const didRemove = removeImageFromContent(latestContent, coverAssetId, entryToAssetMap);
          if (didRemove) {
            latest.fields.content['en-US'] = latestContent;
            try {
              await latest.update();
              removed++;
            } catch (err) {
              if (err.status === 409) {
                const retry = await env.getEntry(entry.sys.id);
                const retryContent = retry.fields?.content?.['en-US'];
                if (retryContent && removeImageFromContent(retryContent, coverAssetId, entryToAssetMap)) {
                  retry.fields.content['en-US'] = retryContent;
                  await retry.update();
                  removed++;
                  console.log(`  (retried after version conflict)`);
                }
              } else {
                throw err;
              }
            }
          } else {
            notInBody++;
          }
        }
        // Rate limit: small delay between writes
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`ERROR: "${title}" (${entry.sys.id}): ${err.message}`);
        errors++;
      }
    } else {
      removed++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`  ${DRY_RUN ? 'Would remove from body' : 'Removed from body'}: ${removed}`);
  console.log(`  Not in body (already clean): ${notInBody}`);
  console.log(`  No coverImage set: ${noCoverImage}`);
  if (SAFE_SCHEDULED) console.log(`  Skipped (scheduled): ${skippedScheduled}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

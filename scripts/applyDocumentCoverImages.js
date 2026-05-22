#!/usr/bin/env node
/**
 * Sets the coverImage field on document entries using the exported
 * cover image data from data/document_cover_images.json.
 *
 * The coverImage field is a Link to an Asset.
 * Entries are updated but NOT published (left as draft changes).
 *
 * Usage:
 *   node scripts/applyDocumentCoverImages.js          # dry run
 *   node scripts/applyDocumentCoverImages.js --apply  # write to Contentful
 *   node scripts/applyDocumentCoverImages.js --apply --safe-scheduled
 */
require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');
const path = require('path');

const DRY_RUN = !process.argv.includes('--apply');
const SAFE_SCHEDULED =
  process.argv.includes('--safe-scheduled') || process.argv.includes('--skip-scheduled');

const DATA_PATH = path.join(__dirname, '..', 'data', 'document_cover_images.json');

async function fetchScheduledEntryIds(space, environmentId) {
  const scheduledEntryIds = new Set();
  let next;

  do {
    const query = {
      'environment.sys.id': environmentId,
      'sys.status[in]': 'scheduled,inProgress',
      limit: 100,
    };

    if (next) {
      query.next = next;
    }

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

  if (DRY_RUN) {
    console.log('DRY RUN - no changes will be made. Use --apply to write.\n');
  } else {
    console.log('APPLY MODE - setting coverImage on document entries (no publish).\n');
  }

  let updated = 0;
  let skipped = 0;
  let skippedScheduled = 0;
  let alreadySet = 0;
  let errors = 0;

  for (let i = 0; i < coverImages.length; i++) {
    const doc = coverImages[i];
    const { id, title, coverImage } = doc;

    if (!coverImage || !coverImage.assetId) {
      skipped++;
      continue;
    }

    if (SAFE_SCHEDULED && scheduledEntryIds.has(id)) {
      console.log(`SKIP SCHEDULED: "${title}"`);
      skippedScheduled++;
      continue;
    }

    try {
      const entry = await env.getEntry(id);

      // Check if coverImage is already set
      const existing = entry.fields?.coverImage?.['en-US']?.sys?.id;
      if (existing) {
        console.log(`ALREADY SET: "${title}" -> ${existing}`);
        alreadySet++;
        continue;
      }

      console.log(
        `${DRY_RUN ? 'WOULD SET' : 'SET'} [${i + 1}/${coverImages.length}]: "${title}" -> ${coverImage.assetId}`
      );

      if (!DRY_RUN) {
        if (!entry.fields.coverImage) {
          entry.fields.coverImage = {};
        }
        entry.fields.coverImage['en-US'] = {
          sys: { type: 'Link', linkType: 'Asset', id: coverImage.assetId },
        };

        try {
          await entry.update();
          updated++;
        } catch (err) {
          if (err.status === 409) {
            // Version conflict - refetch and retry once
            const latest = await env.getEntry(id);
            if (!latest.fields.coverImage) {
              latest.fields.coverImage = {};
            }
            latest.fields.coverImage['en-US'] = {
              sys: { type: 'Link', linkType: 'Asset', id: coverImage.assetId },
            };
            await latest.update();
            updated++;
            console.log(`  (retried after version conflict)`);
          } else {
            throw err;
          }
        }
      } else {
        updated++;
      }
    } catch (err) {
      console.error(`ERROR: "${title}" (${id}): ${err.message}`);
      errors++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`  Already set: ${alreadySet}`);
  console.log(`  Skipped (no image): ${skipped}`);
  if (SAFE_SCHEDULED) console.log(`  Skipped (scheduled): ${skippedScheduled}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

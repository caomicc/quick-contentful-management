#!/usr/bin/env node
require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');

const DRY_RUN = !process.argv.includes('--apply');
const SAFE_SCHEDULED =
  process.argv.includes('--safe-scheduled') || process.argv.includes('--skip-scheduled');
const RETRY_ON_VERSION_CONFLICT = true;

function normalizeTitle(value) {
  return String(value || '')
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ');
}

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

function loadValidConceptIds() {
  const taxonomy = JSON.parse(fs.readFileSync('taxonomy_export.json', 'utf8'));
  const concepts = Array.isArray(taxonomy.concepts) ? taxonomy.concepts : [];
  return new Set(concepts.map(c => c.sys && c.sys.id).filter(Boolean));
}

function toConceptLinks(ids) {
  return ids.map(id => ({
    sys: { type: 'Link', linkType: 'TaxonomyConcept', id },
  }));
}

async function updateEntryConceptsWithRetry(env, entry, desiredConceptIds) {
  const existingConcepts = (entry.metadata?.concepts || []).map(c => c.sys.id);
  const targetConcepts = [...new Set([...existingConcepts, ...desiredConceptIds])];

  entry.metadata.concepts = toConceptLinks(targetConcepts);

  try {
    const saved = await entry.update();
    return { saved, retried: false };
  } catch (error) {
    if (!RETRY_ON_VERSION_CONFLICT || error.status !== 409) {
      throw error;
    }

    const latest = await env.getEntry(entry.sys.id);
    const latestConcepts = (latest.metadata?.concepts || []).map(c => c.sys.id);
    const mergedConcepts = [...new Set([...latestConcepts, ...desiredConceptIds])];
    latest.metadata.concepts = toConceptLinks(mergedConcepts);

    const saved = await latest.update();
    return { saved, retried: true };
  }
}

async function main() {
  const mapping = JSON.parse(fs.readFileSync('document_taxonomy_mapping.json', 'utf8'));
  const mappings = Array.isArray(mapping.mappings) ? mapping.mappings : [];
  const validConceptIds = loadValidConceptIds();

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

  // Fetch all published documents.
  const entries = [];
  let skip = 0;
  while (true) {
    const batch = await env.getEntries({
      content_type: 'document',
      limit: 100,
      skip,
      'sys.publishedAt[exists]': true,
    });
    entries.push(...batch.items);
    if (entries.length >= batch.total) break;
    skip += 100;
  }

  console.log(`Found ${entries.length} published documents in ${environmentId}.\n`);

  if (DRY_RUN) {
    console.log('DRY RUN - no changes will be made. Use --apply to write.\n');
  } else {
    console.log('APPLY MODE - writing taxonomy concepts to Contentful entries.\n');
  }

  let updated = 0;
  let skipped = 0;
  let skippedScheduled = 0;
  let skippedInvalidConcepts = 0;
  let notFound = 0;
  let errors = 0;

  for (const row of mappings) {
    const proposed = Array.isArray(row.proposed) ? [...new Set(row.proposed)] : [];
    const invalidConcepts = proposed.filter(id => !validConceptIds.has(id));
    const desired = proposed.filter(id => validConceptIds.has(id));
    const title = normalizeTitle(row.title);

    if (invalidConcepts.length) {
      console.log(`INVALID CONCEPTS SKIPPED: "${row.title}" -> ${invalidConcepts.join(', ')}`);
      skippedInvalidConcepts += invalidConcepts.length;
    }

    if (desired.length === 0) {
      skipped++;
      continue;
    }

    const entry = entries.find(e => normalizeTitle(e.fields?.title?.['en-US']) === title);

    if (!entry) {
      console.log(`NOT FOUND: "${row.title}"`);
      notFound++;
      continue;
    }

    if (SAFE_SCHEDULED && scheduledEntryIds.has(entry.sys.id)) {
      console.log(`SKIP SCHEDULED: "${row.title}"`);
      skippedScheduled++;
      continue;
    }

    const existingConcepts = (entry.metadata?.concepts || []).map(c => c.sys.id);
    const targetConcepts = [...new Set([...existingConcepts, ...desired])];
    const newIds = targetConcepts.filter(id => !existingConcepts.includes(id));

    if (newIds.length === 0) {
      console.log(`ALREADY UP TO DATE: "${row.title}"`);
      skipped++;
      continue;
    }

    console.log(`UPDATE: ${row.title}`);
    console.log(`  existing: ${existingConcepts.length}`);
    console.log(`  adding:   ${newIds.join(', ')}`);
    console.log(`  total:    ${targetConcepts.length}`);

    if (!DRY_RUN) {
      try {
        const result = await updateEntryConceptsWithRetry(env, entry, desired);
        if (result.retried) {
          console.log(`  OK (v${result.saved.sys.version}) [retried after 409]`);
        } else {
          console.log(`  OK (v${result.saved.sys.version})`);
        }
        updated++;

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`  ERROR: ${error.message}`);
        errors++;
      }
    } else {
      updated++;
    }

    console.log('');
  }

  console.log('---');
  console.log(
    `Summary: ${updated} to update, ${skipped} skipped, ${skippedScheduled} skipped scheduled, ${skippedInvalidConcepts} invalid concepts skipped, ${notFound} not found, ${errors} errors.`
  );
  console.log(`Mapping has ${mappings.length} entries, ${entries.length} published documents.`);

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run with --apply to write changes.');
  }
}

main().catch(error => {
  console.error(`Fatal: ${error.message}`);
  process.exit(1);
});

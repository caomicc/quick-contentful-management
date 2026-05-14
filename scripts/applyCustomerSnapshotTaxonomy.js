#!/usr/bin/env node
require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  const { mappings } = JSON.parse(fs.readFileSync('customer_snapshot_taxonomy_mapping.json', 'utf8'));
  const client = contentful.createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
  const env = await space.getEnvironment('master');

  // Fetch all customer snapshots
  const entries = [];
  let skip = 0;
  while (true) {
    const batch = await env.getEntries({ content_type: 'customerSnapshot', limit: 100, skip });
    entries.push(...batch.items);
    if (entries.length >= batch.total) break;
    skip += 100;
  }
  const published = entries.filter(e => e.isPublished());
  console.log(`Found ${published.length} published customer snapshots (${entries.length} total)\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — no changes will be made. Use --apply to write.\n');
  } else {
    console.log('🚀 APPLYING taxonomy concepts to Contentful entries.\n');
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let notFound = 0;

  const normalize = s => s.trim().replace(/[\u2018\u2019]/g, "'");

  for (const m of mappings) {
    const entry = published.find(e => {
      const t = normalize(e.fields.title?.['en-US'] || '');
      return t === normalize(m.title);
    });

    if (!entry) {
      console.log(`⚠️  NOT FOUND: "${m.title}"`);
      notFound++;
      continue;
    }

    if (!m.proposed || m.proposed.length === 0) {
      console.log(`⏭️  SKIP (no concepts): "${m.title}"`);
      skipped++;
      continue;
    }

    const existingConcepts = (entry.metadata?.concepts || []).map(c => c.sys.id);
    const targetConcepts = [...new Set([...existingConcepts, ...m.proposed])];
    const newIds = targetConcepts.filter(id => !existingConcepts.includes(id));

    if (newIds.length === 0) {
      console.log(`✅ ALREADY UP TO DATE: "${m.title}"`);
      skipped++;
      continue;
    }

    console.log(`📝 ${m.title}`);
    console.log(`   existing: ${existingConcepts.length} concepts`);
    console.log(`   adding:   ${newIds.join(', ')}`);
    console.log(`   total:    ${targetConcepts.length} concepts`);

    if (!DRY_RUN) {
      try {
        entry.metadata.concepts = targetConcepts.map(id => ({
          sys: { type: 'Link', linkType: 'TaxonomyConcept', id },
        }));

        const updatedEntry = await entry.update();
        console.log(`   ✅ Updated (v${updatedEntry.sys.version})`);
        updated++;
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.log(`   ❌ ERROR: ${err.message}`);
        errors++;
      }
    } else {
      updated++;
    }

    console.log('');
  }

  console.log('---');
  console.log(`Summary: ${updated} to update, ${skipped} skipped, ${notFound} not found, ${errors} errors.`);
  console.log(`Mapping has ${mappings.length} entries, ${published.length} published snapshots.`);
  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run with --apply to write changes.');
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});

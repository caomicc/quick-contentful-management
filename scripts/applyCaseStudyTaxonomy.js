#!/usr/bin/env node
require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  const mapping = JSON.parse(fs.readFileSync('case_study_taxonomy_mapping.json', 'utf8'));
  const client = contentful.createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
  const env = await space.getEnvironment(process.env.CONTENTFUL_ENVIRONMENT_ID);

  // Fetch all published case studies
  const entries = [];
  let skip = 0;
  while (true) {
    const batch = await env.getEntries({ content_type: 'caseStudy', limit: 100, skip });
    entries.push(...batch.items);
    if (entries.length >= batch.total) break;
    skip += 100;
  }
  const published = entries.filter(e => e.isPublished());

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — no changes will be made. Use --apply to write.\n');
  } else {
    console.log('🚀 APPLYING taxonomy concepts to Contentful entries.\n');
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const m of mapping.mappings) {
    const entry = published.find(e => {
      const t = (e.fields.title?.['en-US'] || '').trim();
      return t === m.title.trim();
    });

    if (!entry) {
      console.log(`⚠️  NOT FOUND: "${m.title}"`);
      skipped++;
      continue;
    }

    // Build the desired concept list
    const existingConcepts = (entry.metadata?.concepts || []).map(c => c.sys.id);
    let targetConcepts;

    if (m.proposed_add) {
      // Merge: keep existing + add new
      const combined = new Set([...existingConcepts, ...m.proposed_add]);
      targetConcepts = [...combined];
    } else if (m.proposed) {
      // Set from scratch (entry had no concepts)
      targetConcepts = [...m.proposed];
    } else {
      console.log(`⏭️  SKIP (no changes): "${m.title}"`);
      skipped++;
      continue;
    }

    // Check if anything actually changes
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
        // Build the concepts metadata array
        entry.metadata.concepts = targetConcepts.map(id => ({
          sys: { type: 'Link', linkType: 'TaxonomyConcept', id },
        }));

        const updatedEntry = await entry.update();
        console.log(`   ✅ Updated (v${updatedEntry.sys.version})`);

        updated++;

        // Small delay to avoid rate limits
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
  console.log(`Done! ${updated} updated, ${skipped} skipped, ${errors} errors.`);
  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run with --apply to write changes.');
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});

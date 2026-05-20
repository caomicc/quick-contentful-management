#!/usr/bin/env node
require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  const analysisData = JSON.parse(fs.readFileSync('data/blog_taxonomy_analysis.json', 'utf8'));
  const client = contentful.createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
  const env = await space.getEnvironment('master');

  // Fetch all published blog posts
  const entries = [];
  let skip = 0;
  while (true) {
    const batch = await env.getEntries({
      content_type: 'blogPost',
      limit: 100,
      skip,
      'sys.publishedAt[exists]': true,
    });
    entries.push(...batch.items);
    if (entries.length >= batch.total) break;
    skip += 100;
  }
  console.log(`Found ${entries.length} published blog posts\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — no changes will be made. Use --apply to write.\n');
  } else {
    console.log('🚀 APPLYING taxonomy concepts to Contentful entries.\n');
  }

  // Build a map of entry ID -> entry for fast lookup
  const entryById = new Map(entries.map(e => [e.sys.id, e]));

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let notFound = 0;
  let published = 0;

  for (const analysis of analysisData) {
    // Skip entries with no recommendations
    const rec = analysis.recommended;
    if (!rec) { skipped++; continue; }

    const allRecommended = [
      ...(rec.topics || []),
      ...(rec.region || []),
      ...(rec.buyingStage || []),
      ...(rec.audience || []),
      ...(rec.industry || []),
    ];
    if (allRecommended.length === 0) { skipped++; continue; }

    const entry = entryById.get(analysis.id);
    if (!entry) {
      // Entry might not be published or was deleted
      notFound++;
      continue;
    }

    // Build the desired concept list (merge existing + recommended)
    const existingConcepts = (entry.metadata?.concepts || []).map(c => c.sys.id);
    const targetConcepts = [...new Set([...existingConcepts, ...allRecommended])];

    // Check if anything actually changes
    const newIds = targetConcepts.filter(id => !existingConcepts.includes(id));
    if (newIds.length === 0) {
      skipped++;
      continue;
    }

    console.log(`📝 ${analysis.title}`);
    console.log(`   existing: ${existingConcepts.length} concepts`);
    console.log(`   adding:   ${newIds.join(', ')}`);
    console.log(`   total:    ${targetConcepts.length} concepts`);

    if (!DRY_RUN) {
      try {
        entry.metadata.concepts = targetConcepts.map(id => ({
          sys: { type: 'Link', linkType: 'TaxonomyConcept', id },
        }));

        const updatedEntry = await entry.update();

        // Publish the updated entry
        try {
          const publishedEntry = await updatedEntry.publish();
          console.log(`   ✅ Updated & Published (v${publishedEntry.sys.version})`);
          published++;
        } catch (pubErr) {
          console.log(`   ⚠️  Updated (v${updatedEntry.sys.version}) but publish failed: ${pubErr.message}`);
        }

        updated++;

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.log(`   ❌ ERROR: ${err.message}`);
        errors++;
      }
    } else {
      updated++;
    }
  }

  console.log('\n---');
  console.log(`Done! ${updated} to update, ${skipped} already up-to-date/skipped, ${notFound} not found, ${errors} errors.`);
  if (published > 0) console.log(`   ${published} published.`);
  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run with --apply to write changes.');
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});

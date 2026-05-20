#!/usr/bin/env node
/**
 * Applies LLM taxonomy analysis to Contentful entries — REPLACES existing
 * concepts with the LLM recommendations (not merge).
 *
 * Usage:
 *   node scripts/applyLLMTaxonomy.js --type blogPost [--apply] [--limit N]
 *   node scripts/applyLLMTaxonomy.js --type caseStudy --apply
 *   node scripts/applyLLMTaxonomy.js --type customerSnapshot --apply
 *   node scripts/applyLLMTaxonomy.js --type document --apply
 *   node scripts/applyLLMTaxonomy.js --type webinar --apply
 *   node scripts/applyLLMTaxonomy.js --type all --apply
 *
 * Without --apply, runs in dry-run mode (shows what would change).
 */
require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const TYPE = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
const DRY_RUN = !args.includes('--apply');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;

const CONTENT_TYPES = {
  blogPost: {
    analysisPath: path.join(__dirname, '..', 'data', 'blog_taxonomy_llm_analysis.json'),
    contentfulType: 'blogPost',
    label: 'Blog Posts',
  },
  caseStudy: {
    analysisPath: path.join(__dirname, '..', 'data', 'case_study_taxonomy_llm_analysis.json'),
    contentfulType: 'caseStudy',
    label: 'Case Studies',
  },
  customerSnapshot: {
    analysisPath: path.join(__dirname, '..', 'data', 'customer_snapshot_taxonomy_llm_analysis.json'),
    contentfulType: 'customerSnapshot',
    label: 'Customer Snapshots',
  },
  document: {
    analysisPath: path.join(__dirname, '..', 'data', 'document_taxonomy_llm_analysis.json'),
    contentfulType: 'document',
    label: 'Documents',
  },
  webinar: {
    analysisPath: path.join(__dirname, '..', 'data', 'webinar_taxonomy_llm_analysis.json'),
    contentfulType: 'webinar',
    label: 'Webinars',
  },
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyContentType(typeKey, env) {
  const config = CONTENT_TYPES[typeKey];
  if (!config) {
    console.error(`Unknown type: ${typeKey}. Valid: ${Object.keys(CONTENT_TYPES).join(', ')}`);
    return;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${config.label} (${config.contentfulType})`);
  console.log(`${'═'.repeat(60)}`);

  // Load LLM analysis
  if (!fs.existsSync(config.analysisPath)) {
    console.error(`  Analysis file not found: ${config.analysisPath}`);
    return;
  }
  let analysisData = JSON.parse(fs.readFileSync(config.analysisPath, 'utf8'));
  // Filter out any errored entries
  analysisData = analysisData.filter(a => !a.error && a.recommended);
  console.log(`  Loaded ${analysisData.length} analyzed entries.`);

  if (LIMIT) {
    analysisData = analysisData.slice(0, LIMIT);
    console.log(`  Limited to ${LIMIT} entries.`);
  }

  // Fetch all published entries of this content type
  const entries = [];
  let skip = 0;
  while (true) {
    const batch = await env.getEntries({
      content_type: config.contentfulType,
      limit: 100,
      skip,
      'sys.publishedAt[exists]': true,
    });
    entries.push(...batch.items);
    if (entries.length >= batch.total) break;
    skip += 100;
  }
  console.log(`  Found ${entries.length} published entries in Contentful.`);

  const entryById = new Map(entries.map(e => [e.sys.id, e]));

  let updated = 0;
  let unchanged = 0;
  let notFound = 0;
  let errors = 0;

  for (const analysis of analysisData) {
    const rec = analysis.recommended;
    const entry = entryById.get(analysis.id);
    if (!entry) {
      notFound++;
      continue;
    }

    // Build the new concept list from LLM recommendations (all schemes flattened)
    const newConcepts = [
      ...(rec.topics || []),
      ...(rec.marketModel || []),
      ...(rec.audience || []),
      ...(rec.buyingStage || []),
      ...(rec.industry || []),
      ...(rec.region || []),
      ...(rec.companySize || []),
    ];

    // Deduplicate
    const targetConcepts = [...new Set(newConcepts)];

    // Compare with existing
    const existingConcepts = (entry.metadata?.concepts || []).map(c => c.sys.id);
    const existingSet = new Set(existingConcepts);
    const targetSet = new Set(targetConcepts);

    // Check if they're identical
    const added = targetConcepts.filter(id => !existingSet.has(id));
    const removed = existingConcepts.filter(id => !targetSet.has(id));

    if (added.length === 0 && removed.length === 0) {
      unchanged++;
      continue;
    }

    if (DRY_RUN && updated < 10) {
      // Show details for first 10 in dry run
      console.log(`\n  📝 ${analysis.title}`);
      console.log(`     existing: ${existingConcepts.length} → new: ${targetConcepts.length}`);
      if (added.length > 0) console.log(`     + adding: ${added.slice(0, 8).join(', ')}${added.length > 8 ? ` (+${added.length - 8} more)` : ''}`);
      if (removed.length > 0) console.log(`     - removing: ${removed.join(', ')}`);
    }

    if (!DRY_RUN) {
      try {
        // Replace concepts entirely
        entry.metadata.concepts = targetConcepts.map(id => ({
          sys: { type: 'Link', linkType: 'TaxonomyConcept', id },
        }));

        const updatedEntry = await entry.update();

        try {
          await updatedEntry.publish();
        } catch (pubErr) {
          console.log(`  ⚠️  "${analysis.title}" updated but publish failed: ${pubErr.message}`);
        }

        updated++;

        if (updated % 50 === 0) {
          console.log(`  Progress: ${updated} updated...`);
        }

        // Rate limit delay
        await sleep(200);
      } catch (err) {
        if (err.message?.includes('Version mismatch')) {
          // Re-fetch and retry once
          try {
            const fresh = await env.getEntry(analysis.id);
            fresh.metadata.concepts = targetConcepts.map(id => ({
              sys: { type: 'Link', linkType: 'TaxonomyConcept', id },
            }));
            const updatedFresh = await fresh.update();
            await updatedFresh.publish();
            updated++;
          } catch (retryErr) {
            console.log(`  ❌ "${analysis.title}": ${retryErr.message}`);
            errors++;
          }
        } else {
          console.log(`  ❌ "${analysis.title}": ${err.message}`);
          errors++;
        }
      }
    } else {
      updated++;
    }
  }

  console.log(`\n  --- ${config.label} Summary ---`);
  console.log(`  Would change: ${updated} | Unchanged: ${unchanged} | Not found: ${notFound} | Errors: ${errors}`);
  if (DRY_RUN && updated > 10) {
    console.log(`  (Showing first 10 of ${updated} changes)`);
  }

  return { updated, unchanged, notFound, errors };
}

async function main() {
  if (!TYPE) {
    console.error('Usage: node scripts/applyLLMTaxonomy.js --type <blogPost|caseStudy|customerSnapshot|document|webinar|all> [--apply] [--limit N]');
    process.exit(1);
  }

  console.log('=== Apply LLM Taxonomy to Contentful ===');
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made. Use --apply to write.' : '🚀 APPLYING — replacing existing taxonomy with LLM recommendations.');

  const client = contentful.createClient({ accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN });
  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
  const env = await space.getEnvironment('master');

  const typesToProcess = TYPE === 'all' ? Object.keys(CONTENT_TYPES) : [TYPE];
  const totals = { updated: 0, unchanged: 0, notFound: 0, errors: 0 };

  for (const typeKey of typesToProcess) {
    const result = await applyContentType(typeKey, env);
    if (result) {
      totals.updated += result.updated;
      totals.unchanged += result.unchanged;
      totals.notFound += result.notFound;
      totals.errors += result.errors;
    }
  }

  if (typesToProcess.length > 1) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  TOTAL: ${totals.updated} changed | ${totals.unchanged} unchanged | ${totals.notFound} not found | ${totals.errors} errors`);
    console.log(`${'═'.repeat(60)}`);
  }

  if (DRY_RUN) {
    console.log('\nThis was a dry run. Run with --apply to write changes.');
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});

require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');
const csv = require('csv-parser');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const sourceEnvironmentId = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

// Parse CSV and extract draft entry IDs
async function getDraftEntriesToPublish(csvFilePath) {
  return new Promise((resolve, reject) => {
    const draftEntries = new Map(); // Use Map to avoid duplicates

    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        const status = row['Referenced Status'];
        const entryId = row['Referenced Entry ID'];
        const contentType = row['Referenced Content Type'];
        const title = row['Referenced Title'];

        // Only process draft entries (not archived or missing)
        if (status === 'Draft' && entryId && contentType !== 'MISSING') {
          draftEntries.set(entryId, {
            id: entryId,
            contentType,
            title: title || 'Untitled',
            referencedBy: []
          });
        }
      })
      .on('end', () => {
        // Convert Map to Array
        resolve(Array.from(draftEntries.values()));
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Publish a single entry
async function publishEntry(environment, entryId) {
  try {
    const entry = await environment.getEntry(entryId);

    // Check if already published
    if (entry.isPublished()) {
      return { success: false, reason: 'Already published', alreadyPublished: true };
    }

    // Check if archived
    if (entry.isArchived()) {
      return { success: false, reason: 'Entry is archived' };
    }

    // Publish the entry
    await entry.publish();
    return { success: true, entry };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

// Main function
async function publishDraftReferences(csvFilePath, dryRun = false) {
  try {
    // Check if file exists
    if (!fs.existsSync(csvFilePath)) {
      console.log(`❌ Error: ${csvFilePath} not found`);
      console.log('💡 Please run auditDraftReferences.js first');
      console.log('   Example: node auditDraftReferences.js -t blogPost');
      return;
    }

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    console.log('📖 Reading CSV file...');
    const draftEntries = await getDraftEntriesToPublish(csvFilePath);

    console.log(`\n📊 Found ${draftEntries.length} unique draft entries to publish`);

    if (draftEntries.length === 0) {
      console.log('✅ No draft entries to publish!');
      return;
    }

    // Group by content type
    const byContentType = {};
    draftEntries.forEach(entry => {
      byContentType[entry.contentType] = (byContentType[entry.contentType] || 0) + 1;
    });

    console.log('\n   By Content Type:');
    Object.entries(byContentType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    // Display entries that will be published
    console.log(`\n📋 Entries to ${dryRun ? 'be published (DRY RUN)' : 'publish'}:`);
    console.log('─'.repeat(80));
    draftEntries.forEach((entry, index) => {
      console.log(`${index + 1}. [${entry.contentType}] ${entry.id} - ${entry.title}`);
    });
    console.log('─'.repeat(80));

    // If dry run, exit here
    if (dryRun) {
      console.log('\n✅ DRY RUN COMPLETE - No changes were made');
      console.log('💡 Run without --dry-run flag to actually publish these entries');
      return;
    }

    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\n⚠️  Do you want to proceed with publishing these entries? (yes/no): ', async (answer) => {
      readline.close();

      if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('❌ Cancelled. No entries were published.');
        return;
      }

      console.log('\n🚀 Starting publish process...\n');

      const space = await client.getSpace(spaceId);
      const environment = await space.getEnvironment(sourceEnvironmentId);

      const results = {
        success: [],
        alreadyPublished: [],
        failed: []
      };

      // Publish entries one by one
      for (let i = 0; i < draftEntries.length; i++) {
        const entry = draftEntries[i];
        console.log(`[${i + 1}/${draftEntries.length}] Publishing ${entry.id}...`);

        const result = await publishEntry(environment, entry.id);

        if (result.success) {
          results.success.push(entry);
          console.log(`  ✅ Successfully published: ${entry.title}`);
        } else if (result.alreadyPublished) {
          results.alreadyPublished.push(entry);
          console.log(`  ℹ️  Already published: ${entry.title}`);
        } else {
          results.failed.push({ ...entry, reason: result.reason });
          console.log(`  ❌ Failed to publish: ${entry.title} (${result.reason})`);
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Summary
      console.log('\n' + '='.repeat(80));
      console.log('📊 SUMMARY');
      console.log('='.repeat(80));
      console.log(`✅ Successfully published: ${results.success.length}`);
      console.log(`ℹ️  Already published: ${results.alreadyPublished.length}`);
      console.log(`❌ Failed: ${results.failed.length}`);

      if (results.failed.length > 0) {
        console.log('\n❌ Failed entries:');
        results.failed.forEach(entry => {
          console.log(`  - ${entry.id}: ${entry.title} (${entry.reason})`);
        });
      }

      // Save results to a log file
      const logData = {
        timestamp: new Date().toISOString(),
        total: draftEntries.length,
        successful: results.success.length,
        alreadyPublished: results.alreadyPublished.length,
        failed: results.failed.length,
        successfulEntries: results.success,
        alreadyPublishedEntries: results.alreadyPublished,
        failedEntries: results.failed
      };

      const logFileName = `logs/publish_draft_refs_log_${Date.now()}.json`;

      // Ensure logs directory exists
      if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs');
      }

      fs.writeFileSync(
        logFileName,
        JSON.stringify(logData, null, 2),
        'utf8'
      );

      console.log(`\n📝 Log saved to ${logFileName}`);
      console.log('\n💡 Recommendation: Run the audit script again to verify');
      console.log(`   Example: node auditDraftReferences.js -t <contentType>`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let csvFilePath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--csv' || arg === '-f') {
      csvFilePath = args[i + 1];
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node publishDraftReferences.js [options]

This script publishes all draft entries that are referenced by published entries.
It reads from a CSV file generated by auditDraftReferences.js.

Options:
  --csv, -f <file>  Path to CSV file (default: ./blog_posts_with_draft_references.csv)
                     Can also use files generated by auditDraftReferences.js
  --dry-run         Preview which entries would be published without making changes
  --help, -h        Show this help message

Examples:
  # Dry run with default blog post CSV
  node publishDraftReferences.js --dry-run

  # Publish draft references from blog posts
  node publishDraftReferences.js

  # Publish draft references from pages
  node publishDraftReferences.js -f page_with_draft_references.csv

  # Publish draft references from news articles (dry run)
  node publishDraftReferences.js --dry-run -f newsArticle_with_draft_references.csv

Workflow:
  1. Run: node auditDraftReferences.js -t <contentType>
  2. Review: <contentType>_with_draft_references.csv
  3. Run: node publishDraftReferences.js --dry-run -f <contentType>_with_draft_references.csv
  4. Run: node publishDraftReferences.js -f <contentType>_with_draft_references.csv
  5. Verify: node auditDraftReferences.js -t <contentType>

Note: This script only publishes DRAFT entries. It will skip:
  - Already published entries
  - Archived entries
  - Missing/deleted entries
      `);
      process.exit(0);
    }
  }

  // Default to blog_posts CSV if not specified
  if (!csvFilePath) {
    csvFilePath = './blog_posts_with_draft_references.csv';
  }

  return { csvFilePath, dryRun };
}

// Run the script
const { csvFilePath, dryRun } = parseArgs();
publishDraftReferences(csvFilePath, dryRun);

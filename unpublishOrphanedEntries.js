require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');
const csv = require('csv-parser');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const sourceEnvironmentId = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

// Parse CSV and extract entries based on filters
async function getEntriesToUnpublish(csvFilePath, contentType, referenceTypes) {
  return new Promise((resolve, reject) => {
    const entries = [];

    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        const rowContentType = row['Content Type'];
        const rowReferenceType = row['Reference Type'];

        // Check if content type matches
        const contentTypeMatches = contentType === 'all' || rowContentType === contentType;

        // Check if reference type matches
        const referenceTypeMatches = referenceTypes.includes(rowReferenceType);

        if (contentTypeMatches && referenceTypeMatches) {
          entries.push({
            id: row['Entry ID'],
            contentType: rowContentType,
            title: row['Title/Name'],
            referenceType: rowReferenceType,
            updatedAt: row['Updated At']
          });
        }
      })
      .on('end', () => {
        resolve(entries);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Unpublish a single entry
async function unpublishEntry(environment, entryId) {
  try {
    const entry = await environment.getEntry(entryId);

    // Check if entry is published
    if (entry.isPublished()) {
      await entry.unpublish();
      return { success: true, entry };
    } else {
      return { success: false, reason: 'Not published' };
    }
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

// Main function
async function unpublishEntries(contentType, referenceTypes, dryRun = false) {
  try {
    const csvFilePath = './orphaned_entries_published.csv';

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    console.log('📖 Reading CSV file...');
    console.log(`🔍 Filtering for:`);
    console.log(`   - Content Type: ${contentType}`);
    console.log(`   - Reference Types: ${referenceTypes.join(', ')}\n`);

    const entries = await getEntriesToUnpublish(csvFilePath, contentType, referenceTypes);

    console.log(`\n📊 Found ${entries.length} entries to unpublish`);

    // Count by reference type
    const noRefs = entries.filter(e => e.referenceType === 'No References').length;
    const archivedRefs = entries.filter(e => e.referenceType === 'Archived References').length;
    if (noRefs > 0) console.log(`   - No References: ${noRefs}`);
    if (archivedRefs > 0) console.log(`   - Archived References: ${archivedRefs}`);

    // Count by content type if showing all types
    if (contentType === 'all') {
      const byContentType = {};
      entries.forEach(e => {
        byContentType[e.contentType] = (byContentType[e.contentType] || 0) + 1;
      });
      console.log('\n   By Content Type:');
      Object.entries(byContentType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        console.log(`   - ${type}: ${count}`);
      });
    }

    if (entries.length === 0) {
      console.log('✅ No entries to unpublish!');
      return;
    }

    // Display entries that will be unpublished
    console.log(`\n📋 Entries to ${dryRun ? 'be unpublished (DRY RUN)' : 'unpublish'}:`);
    console.log('─'.repeat(80));
    entries.forEach((entry, index) => {
      const contentTypeLabel = contentType === 'all' ? `${entry.contentType} | ` : '';
      console.log(`${index + 1}. [${contentTypeLabel}${entry.referenceType}] ${entry.id} - ${entry.title}`);
    });
    console.log('─'.repeat(80));

    // If dry run, exit here
    if (dryRun) {
      console.log('\n✅ DRY RUN COMPLETE - No changes were made');
      console.log('💡 Run without --dry-run flag to actually unpublish these entries');
      return;
    }

    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\n⚠️  Do you want to proceed with unpublishing these entries? (yes/no): ', async (answer) => {
      readline.close();

      if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        console.log('❌ Cancelled. No entries were unpublished.');
        return;
      }

      console.log('\n🚀 Starting unpublish process...\n');

      const space = await client.getSpace(spaceId);
      const environment = await space.getEnvironment(sourceEnvironmentId);

      const results = {
        success: [],
        failed: []
      };

      // Unpublish entries one by one
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        console.log(`[${i + 1}/${entries.length}] Unpublishing ${entry.id}...`);

        const result = await unpublishEntry(environment, entry.id);

        if (result.success) {
          results.success.push(entry);
          console.log(`  ✅ Successfully unpublished: ${entry.title}`);
        } else {
          results.failed.push({ ...entry, reason: result.reason });
          console.log(`  ❌ Failed to unpublish: ${entry.title} (${result.reason})`);
        }

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Summary
      console.log('\n' + '='.repeat(80));
      console.log('📊 SUMMARY');
      console.log('='.repeat(80));
      console.log(`✅ Successfully unpublished: ${results.success.length}`);
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
        contentType,
        referenceTypes,
        total: entries.length,
        successful: results.success.length,
        failed: results.failed.length,
        successfulEntries: results.success,
        failedEntries: results.failed
      };

      const logFileName = `unpublish_${contentType}_log_${Date.now()}.json`;
      fs.writeFileSync(
        logFileName,
        JSON.stringify(logData, null, 2),
        'utf8'
      );

      console.log(`\n📝 Log saved to ${logFileName}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  let contentType = 'seo'; // default
  let referenceTypes = ['No References', 'Archived References']; // default to both
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--content-type' || arg === '-t') {
      contentType = args[i + 1];
      i++;
    } else if (arg === '--reference-type' || arg === '-r') {
      const refType = args[i + 1];
      if (refType === 'no-references') {
        referenceTypes = ['No References'];
      } else if (refType === 'archived-references') {
        referenceTypes = ['Archived References'];
      } else if (refType === 'both') {
        referenceTypes = ['No References', 'Archived References'];
      }
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node unpublishSeoEntries.js [options]

Options:
  --content-type, -t <type>       Content type to unpublish (default: seo, use 'all' for all types)
  --reference-type, -r <type>     Reference type filter:
                                    - no-references: Only "No References"
                                    - archived-references: Only "Archived References"
                                    - both: Both types (default)
  --dry-run                       Preview changes without unpublishing
  --help, -h                      Show this help message

Examples:
  # Dry run for SEO entries with no references
  node unpublishSeoEntries.js --dry-run -t seo -r no-references

  # Unpublish all SEO entries (both reference types)
  node unpublishSeoEntries.js -t seo -r both

  # Unpublish block entries with archived references only
  node unpublishSeoEntries.js -t block -r archived-references

  # Dry run for all content types with no references
  node unpublishSeoEntries.js --dry-run -t all -r no-references
      `);
      process.exit(0);
    }
  }

  return { contentType, referenceTypes, dryRun };
}

// Run the script
const { contentType, referenceTypes, dryRun } = parseArgs();
unpublishEntries(contentType, referenceTypes, dryRun);

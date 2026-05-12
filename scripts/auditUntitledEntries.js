const contentful = require('contentful-management');
const fs = require('fs');
require('dotenv').config();

async function auditUntitledEntries() {
  const client = contentful.createClient({
    accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
  });

  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
  const environment = await space.getEnvironment(process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID);

  console.log('🔍 Fetching all entries...');

  const allEntries = [];
  let skip = 0;
  const limit = 100;
  let total = 0;

  // Fetch all entries with pagination
  do {
    console.log(`Fetching entries... (${allEntries.length} so far)`);
    const response = await environment.getEntries({ skip, limit });

    if (response.items && response.items.length > 0) {
      allEntries.push(...response.items);
    }

    total = response.total;
    skip += limit;

    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (allEntries.length < total);

  console.log(`📊 Total entries fetched: ${allEntries.length}`);

  const untitledEntries = [];

  // Common title field names to check
  const titleFields = [
    'title', 'name', 'internalName', 'heading', 'slug',
    'internalTitle', 'ctaTitle', 'pageHeading', 'displayName',
    'label', 'text', 'content', 'description'
  ];

  // Common patterns that indicate untitled/placeholder content
  const untitledPatterns = [
    /^untitled$/i,
    /^untitled\s*\d*$/i,
    /^test$/i,
    /^test\s*\d*$/i,
    /^placeholder$/i,
    /^temp$/i,
    /^temp\s*\d*$/i,
    /^new\s*(entry|item|content)$/i,
    /^copy\s*of\s*/i,
    /^\s*$/,  // Empty or whitespace only
    /^-+$/,   // Only dashes
    /^\.+$/,  // Only dots
    /^_+$/,   // Only underscores
    /^#\d+$/  // Just a number with hash
  ];

  console.log('\n🔍 Analyzing entries for missing or placeholder titles...\n');

  for (const entry of allEntries) {
    const contentType = entry.sys.contentType.sys.id;
    const isPublished = !!entry.sys.publishedVersion;
    const isArchived = !!entry.sys.archivedVersion;
    const entryId = entry.sys.id;

    // Determine entry status
    let status;
    if (isPublished) {
      status = 'Published';
    } else if (isArchived) {
      status = 'Archived';
    } else {
      status = 'Draft';
    }

    let hasValidTitle = false;
    let foundTitle = '';
    let titleFieldName = '';

    if (entry.fields) {
      // Check each potential title field
      for (const fieldName of titleFields) {
        if (entry.fields[fieldName]) {
          const locales = Object.keys(entry.fields[fieldName]);

          for (const locale of locales) {
            const fieldValue = entry.fields[fieldName][locale];

            if (fieldValue && typeof fieldValue === 'string') {
              const trimmedValue = fieldValue.trim();

              if (trimmedValue.length > 0) {
                // Check if it matches untitled patterns
                const isUntitledPattern = untitledPatterns.some(pattern =>
                  pattern.test(trimmedValue)
                );

                if (!isUntitledPattern) {
                  hasValidTitle = true;
                  foundTitle = trimmedValue;
                  titleFieldName = fieldName;
                  break;
                }
              }
            }
          }

          if (hasValidTitle) break;
        }
      }
    }

    // If no valid title found, this is an untitled entry
    if (!hasValidTitle) {
      // Try to find any title for display purposes (even if it's a placeholder)
      let displayTitle = 'No title found';

      if (entry.fields) {
        for (const fieldName of titleFields) {
          if (entry.fields[fieldName]) {
            const locales = Object.keys(entry.fields[fieldName]);
            if (locales.length > 0) {
              const fieldValue = entry.fields[fieldName][locales[0]];
              if (fieldValue && typeof fieldValue === 'string') {
                displayTitle = fieldValue.trim() || 'Empty title';
                titleFieldName = fieldName;
                break;
              }
            }
          }
        }
      }

      untitledEntries.push({
        id: entryId,
        contentType,
        status: status,
        title: displayTitle,
        titleField: titleFieldName,
        createdAt: entry.sys.createdAt,
        updatedAt: entry.sys.updatedAt,
        link: `https://app.contentful.com/spaces/${process.env.CONTENTFUL_SPACE_ID}/environments/${process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID}/entries/${entryId}`
      });
    }
  }

  // Sort by content type, then by status (Published, Draft, Archived)
  untitledEntries.sort((a, b) => {
    const contentTypeCompare = a.contentType.localeCompare(b.contentType);
    if (contentTypeCompare !== 0) return contentTypeCompare;

    // Custom status order: Published first, then Draft, then Archived
    const statusOrder = { 'Published': 1, 'Draft': 2, 'Archived': 3 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  console.log(`📊 Found ${untitledEntries.length} untitled entries`);

  if (untitledEntries.length === 0) {
    console.log('✅ No untitled entries found!');
    return;
  }

  // Generate CSV report
  const csvHeader = 'Entry ID,Content Type,Status,Title/Found Text,Title Field,Created At,Updated At,Contentful Link\n';
  const csvRows = untitledEntries.map(entry => {
    const title = entry.title.replace(/"/g, '""'); // Escape quotes for CSV
    return `"${entry.id}","${entry.contentType}","${entry.status}","${title}","${entry.titleField}","${entry.createdAt}","${entry.updatedAt}","${entry.link}"`;
  }).join('\n');

  const csvContent = csvHeader + csvRows;
  const csvFilename = 'untitled_entries.csv';
  fs.writeFileSync(csvFilename, csvContent);

  // Display results in console
  console.log('\n' + '='.repeat(100));
  console.log('📋 UNTITLED ENTRIES REPORT');
  console.log('='.repeat(100));
  console.log(`📅 Generated: ${new Date().toLocaleString()}`);
  console.log(`📊 Total Untitled Entries: ${untitledEntries.length}`);
  console.log('='.repeat(100));

  // Group by content type and status
  const byContentType = {};
  const byStatus = { Published: 0, Draft: 0, Archived: 0 };

  untitledEntries.forEach(entry => {
    byContentType[entry.contentType] = (byContentType[entry.contentType] || 0) + 1;
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
  });

  console.log('\n📊 BREAKDOWN BY CONTENT TYPE:');
  console.log('─'.repeat(60));
  console.log(`${'Content Type'.padEnd(30)} ${'Count'.padStart(8)} ${'%'.padStart(8)}`);
  console.log('─'.repeat(60));

  const sortedContentTypes = Object.entries(byContentType).sort((a, b) => b[1] - a[1]);

  for (const [contentType, count] of sortedContentTypes) {
    const percentage = Math.round((count / untitledEntries.length) * 100);
    console.log(`${contentType.padEnd(30)} ${count.toString().padStart(7)} ${percentage.toString().padStart(6)}%`);
  }

  console.log('\n📊 BREAKDOWN BY STATUS:');
  console.log('─'.repeat(30));
  console.log(`Published: ${byStatus.Published || 0}`);
  console.log(`Draft: ${byStatus.Draft || 0}`);
  console.log(`Archived: ${byStatus.Archived || 0}`);

  // Show top 20 entries
  console.log('\n🔍 SAMPLE UNTITLED ENTRIES:');
  console.log('─'.repeat(100));
  console.log(`${'Content Type'.padEnd(20)} ${'Status'.padEnd(10)} ${'Title/Found Text'.padEnd(40)} ${'Field'.padEnd(15)}`);
  console.log('─'.repeat(100));

  untitledEntries.slice(0, 20).forEach(entry => {
    const contentType = entry.contentType.length > 18 ? entry.contentType.substring(0, 18) + '..' : entry.contentType.padEnd(20);
    const status = entry.status.padEnd(10);
    const title = entry.title.length > 38 ? entry.title.substring(0, 38) + '..' : entry.title.padEnd(40);
    const field = entry.titleField.padEnd(15);

    console.log(`${contentType} ${status} ${title} ${field}`);
  });

  // Identify patterns
  const patterns = {
    completelyEmpty: untitledEntries.filter(e => e.title === 'No title found' || e.title === 'Empty title').length,
    untitledPattern: untitledEntries.filter(e => /untitled/i.test(e.title)).length,
    testPattern: untitledEntries.filter(e => /test/i.test(e.title)).length,
    placeholderPattern: untitledEntries.filter(e => /placeholder|temp|copy of/i.test(e.title)).length,
    numbersOnly: untitledEntries.filter(e => /^[\d\s\-_.#]+$/.test(e.title)).length
  };

  if (Object.values(patterns).some(count => count > 0)) {
    console.log('\n🚨 COMMON PATTERNS FOUND:');
    console.log('─'.repeat(40));
    if (patterns.completelyEmpty > 0) console.log(`• Completely empty titles: ${patterns.completelyEmpty}`);
    if (patterns.untitledPattern > 0) console.log(`• "Untitled" pattern: ${patterns.untitledPattern}`);
    if (patterns.testPattern > 0) console.log(`• "Test" pattern: ${patterns.testPattern}`);
    if (patterns.placeholderPattern > 0) console.log(`• Placeholder patterns: ${patterns.placeholderPattern}`);
    if (patterns.numbersOnly > 0) console.log(`• Numbers/symbols only: ${patterns.numbersOnly}`);
  }

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  console.log('─'.repeat(60));
  console.log('• Review entries with "test", "untitled", or "placeholder" in titles');
  console.log('• Consider deleting old test entries');
  console.log('• Add proper titles to valuable content');
  console.log('• Check if published entries without titles are causing issues');
  console.log('• Use CSV to bulk edit titles in Contentful');

  console.log('\n' + '='.repeat(100));
  console.log(`✅ Report saved to: ${csvFilename}`);
  console.log('💡 Use this data to improve content discoverability and organization');
  console.log('='.repeat(100));
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
📋 Untitled Entries Audit

This script finds all entries in your Contentful space that are missing proper titles
or have placeholder/untitled content.

What it looks for:
• Entries with no title fields
• Entries with empty title fields
• Entries with placeholder titles like "Untitled", "Test", "Placeholder"
• Entries with only numbers, symbols, or whitespace as titles

Usage:
  node auditUntitledEntries.js

Output:
  - Console report with breakdown by content type and status
  - CSV file: untitled_entries.csv

Examples:
  node auditUntitledEntries.js
      `);
      process.exit(0);
    }
  }
}

async function main() {
  try {
    parseArgs();
    await auditUntitledEntries();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

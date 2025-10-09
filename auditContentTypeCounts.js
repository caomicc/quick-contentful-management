const contentful = require('contentful-management');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function auditContentTypeCounts() {
  const client = contentful.createClient({
    accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
  });

  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
  const environment = await space.getEnvironment(process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID);

  console.log('🔍 Fetching all content types...');
  
  // Get all content types
  const contentTypes = await environment.getContentTypes({ limit: 1000 });
  console.log(`📋 Found ${contentTypes.items.length} content types`);

  const results = [];
  let totalPublishedEntries = 0;
  let totalDraftEntries = 0;

  console.log('\n📊 Analyzing content type usage...\n');

  for (const contentType of contentTypes.items) {
    console.log(`Analyzing: ${contentType.sys.id} (${contentType.name})`);
    
    try {
      // Get published entries for this content type
      const publishedEntries = await environment.getEntries({
        content_type: contentType.sys.id,
        limit: 1000,
        'sys.publishedAt[exists]': true
      });

      // Get all entries (including drafts) for this content type
      const allEntries = await environment.getEntries({
        content_type: contentType.sys.id,
        limit: 1000
      });

      const publishedCount = publishedEntries.total;
      const draftCount = allEntries.total - publishedCount;
      
      totalPublishedEntries += publishedCount;
      totalDraftEntries += draftCount;

      results.push({
        contentTypeId: contentType.sys.id,
        contentTypeName: contentType.name,
        publishedCount,
        draftCount,
        totalCount: allEntries.total,
        lastUpdated: contentType.sys.updatedAt,
        description: contentType.description || 'No description'
      });

      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error) {
      console.error(`❌ Error analyzing ${contentType.sys.id}:`, error.message);
      results.push({
        contentTypeId: contentType.sys.id,
        contentTypeName: contentType.name,
        publishedCount: 'Error',
        draftCount: 'Error',
        totalCount: 'Error',
        lastUpdated: contentType.sys.updatedAt,
        description: contentType.description || 'No description',
        error: error.message
      });
    }
  }

  // Sort by published count (descending)
  results.sort((a, b) => {
    if (typeof a.publishedCount === 'number' && typeof b.publishedCount === 'number') {
      return b.publishedCount - a.publishedCount;
    }
    return 0;
  });

  // Generate CSV report
  const csvHeader = 'Content Type ID,Content Type Name,Published Count,Draft Count,Total Count,Last Updated,Description,Contentful Link\n';
  const csvRows = results.map(result => {
    const link = `https://app.contentful.com/spaces/${process.env.CONTENTFUL_SPACE_ID}/environments/${process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID}/content_types/${result.contentTypeId}`;
    return `"${result.contentTypeId}","${result.contentTypeName}","${result.publishedCount}","${result.draftCount}","${result.totalCount}","${result.lastUpdated}","${result.description.replace(/"/g, '""')}","${link}"`;
  }).join('\n');

  const csvContent = csvHeader + csvRows;
  const csvFilename = 'content_type_counts.csv';
  fs.writeFileSync(csvFilename, csvContent);

  // Display results in console
  console.log('\n' + '='.repeat(120));
  console.log('📊 CONTENT TYPE USAGE REPORT');
  console.log('='.repeat(120));
  console.log(`📅 Generated: ${new Date().toLocaleString()}`);
  console.log(`📈 Total Published Entries: ${totalPublishedEntries.toLocaleString()}`);
  console.log(`📝 Total Draft Entries: ${totalDraftEntries.toLocaleString()}`);
  console.log(`📊 Total Entries: ${(totalPublishedEntries + totalDraftEntries).toLocaleString()}`);
  console.log(`📋 Total Content Types: ${contentTypes.items.length}`);
  console.log('='.repeat(120));

  // Show top 20 by published count
  console.log('\n🏆 TOP CONTENT TYPES BY PUBLISHED COUNT:');
  console.log('─'.repeat(120));
  console.log(`${'Content Type'.padEnd(30)} ${'Published'.padStart(10)} ${'Drafts'.padStart(8)} ${'Total'.padStart(8)} ${'Description'.padEnd(50)}`);
  console.log('─'.repeat(120));

  results.slice(0, 20).forEach((result, index) => {
    const rank = `${index + 1}.`.padEnd(3);
    const name = result.contentTypeName.length > 25 
      ? result.contentTypeName.substring(0, 25) + '...' 
      : result.contentTypeName.padEnd(28);
    const published = String(result.publishedCount).padStart(9);
    const drafts = String(result.draftCount).padStart(7);
    const total = String(result.totalCount).padStart(7);
    const desc = result.description.length > 48 
      ? result.description.substring(0, 48) + '...' 
      : result.description.padEnd(50);
    
    console.log(`${rank}${name} ${published} ${drafts} ${total} ${desc}`);
  });

  // Show content types with zero published entries (potential bloat)
  const zeroPublished = results.filter(r => r.publishedCount === 0);
  if (zeroPublished.length > 0) {
    console.log('\n🚨 CONTENT TYPES WITH ZERO PUBLISHED ENTRIES (POTENTIAL BLOAT):');
    console.log('─'.repeat(80));
    zeroPublished.forEach(result => {
      console.log(`• ${result.contentTypeName} (${result.contentTypeId}) - ${result.draftCount} drafts`);
    });
  }

  // Show content types with very few published entries
  const lowPublished = results.filter(r => typeof r.publishedCount === 'number' && r.publishedCount > 0 && r.publishedCount <= 5);
  if (lowPublished.length > 0) {
    console.log('\n⚠️  CONTENT TYPES WITH VERY FEW PUBLISHED ENTRIES (≤5):');
    console.log('─'.repeat(80));
    lowPublished.forEach(result => {
      console.log(`• ${result.contentTypeName} (${result.contentTypeId}) - ${result.publishedCount} published, ${result.draftCount} drafts`);
    });
  }

  // Show content types with only drafts (no published content)
  const onlyDrafts = results.filter(r => r.publishedCount === 0 && r.draftCount > 0);
  if (onlyDrafts.length > 0) {
    console.log('\n📝 CONTENT TYPES WITH ONLY DRAFT ENTRIES:');
    console.log('─'.repeat(80));
    onlyDrafts.forEach(result => {
      console.log(`• ${result.contentTypeName} (${result.contentTypeId}) - ${result.draftCount} drafts`);
    });
  }

  // Show completely empty content types
  const empty = results.filter(r => r.totalCount === 0);
  if (empty.length > 0) {
    console.log('\n🗑️  COMPLETELY EMPTY CONTENT TYPES:');
    console.log('─'.repeat(80));
    empty.forEach(result => {
      console.log(`• ${result.contentTypeName} (${result.contentTypeId})`);
    });
  }

  console.log('\n' + '='.repeat(120));
  console.log(`✅ Report saved to: ${csvFilename}`);
  console.log('💡 Use this data to identify content types that may be unused or underutilized');
  console.log('='.repeat(120));

  // Summary statistics
  const activeContentTypes = results.filter(r => typeof r.publishedCount === 'number' && r.publishedCount > 0).length;
  const unusedContentTypes = results.filter(r => r.publishedCount === 0).length;
  const averagePublishedPerType = totalPublishedEntries / activeContentTypes;

  console.log('\n📈 SUMMARY STATISTICS:');
  console.log(`• Active content types (with published content): ${activeContentTypes}`);
  console.log(`• Unused content types (zero published): ${unusedContentTypes}`);
  console.log(`• Average published entries per active type: ${Math.round(averagePublishedPerType)}`);
  console.log(`• Content type utilization: ${Math.round((activeContentTypes / contentTypes.items.length) * 100)}%`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
📊 Content Type Usage Audit

This script analyzes all content types in your Contentful space and shows:
- Published entry counts per content type
- Draft entry counts per content type  
- Total entries per content type
- Identifies potential bloat (unused content types)
- Generates a CSV report

Usage:
  node auditContentTypeCounts.js

Output:
  - Console report with top content types and potential bloat
  - CSV file: content_type_counts.csv

Examples:
  node auditContentTypeCounts.js
      `);
      process.exit(0);
    }
  }
}

async function main() {
  try {
    parseArgs();
    await auditContentTypeCounts();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

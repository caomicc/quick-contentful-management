require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const sourceEnvironmentId = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

// Function to fetch all entries with pagination
async function fetchAllEntriesPaginated(environment, contentType = null) {
  const allEntries = [];
  let skip = 0;
  const limit = 100;
  let total = 0;

  do {
    console.log(`Fetching ${contentType || 'all'} entries... (${allEntries.length} so far)`);
    const queryOptions = { skip, limit };
    if (contentType) {
      queryOptions['content_type'] = contentType;
    }
    
    const response = await environment.getEntries(queryOptions);

    if (response.items && response.items.length > 0) {
      allEntries.push(...response.items);
    }

    total = response.total;
    skip += limit;
  } while (allEntries.length < total);

  return allEntries;
}

// Function to recursively find entry links in Rich Text and other nested structures
function findEntryLinksRecursive(obj, referencedIds) {
  if (!obj || typeof obj !== 'object') return;

  // Check if this is an entry link
  if (obj.sys && obj.sys.type === 'Link' && obj.sys.linkType === 'Entry' && obj.sys.id) {
    const referencedId = obj.sys.id;
    referencedIds.add(referencedId);
    return;
  }

  // Recursively search in arrays
  if (Array.isArray(obj)) {
    for (const item of obj) {
      findEntryLinksRecursive(item, referencedIds);
    }
    return;
  }

  // Recursively search in objects
  for (const key in obj) {
    findEntryLinksRecursive(obj[key], referencedIds);
  }
}

// Function to extract all referenced entry IDs from an entry
function extractReferencedEntryIds(entry) {
  const referencedIds = new Set();

  if (!entry.fields) return referencedIds;

  for (const fieldName in entry.fields) {
    const fieldValue = entry.fields[fieldName];

    // Check each locale in the field
    for (const locale in fieldValue) {
      const value = fieldValue[locale];
      findEntryLinksRecursive(value, referencedIds);
    }
  }

  return referencedIds;
}

// Main function to audit entries for draft references
async function auditEntriesForDraftReferences(contentType, publishedOnly = true) {
  try {
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(sourceEnvironmentId);

    console.log(`Fetching all ${contentType} entries...`);
    const entries = await fetchAllEntriesPaginated(environment, contentType);
    console.log(`Total ${contentType} entries fetched: ${entries.length}`);

    // Filter based on published status
    const filteredEntries = publishedOnly 
      ? entries.filter(entry => entry.sys.publishedVersion)
      : entries;
    
    if (publishedOnly) {
      console.log(`Published ${contentType} entries: ${filteredEntries.length}`);
    }

    console.log('\nFetching all entries to check their status...');
    const allEntries = await fetchAllEntriesPaginated(environment);
    console.log(`Total entries fetched: ${allEntries.length}`);

    // Create a map of entry ID to entry status
    const entryStatusMap = new Map();
    allEntries.forEach(entry => {
      entryStatusMap.set(entry.sys.id, {
        id: entry.sys.id,
        contentType: entry.sys.contentType.sys.id,
        isPublished: !!entry.sys.publishedVersion,
        isArchived: !!entry.sys.archivedVersion,
        title: getEntryTitle(entry)
      });
    });

    console.log(`\nAnalyzing ${contentType} entries for draft references...`);
    const entriesWithDraftRefs = [];

    for (const entry of filteredEntries) {
      const referencedIds = extractReferencedEntryIds(entry);
      const draftReferences = [];
      const archivedReferences = [];

      for (const refId of referencedIds) {
        const refEntry = entryStatusMap.get(refId);
        
        if (!refEntry) {
          // Referenced entry doesn't exist (deleted or missing)
          draftReferences.push({
            id: refId,
            contentType: 'MISSING',
            status: 'Missing/Deleted',
            title: 'N/A'
          });
        } else if (refEntry.isArchived) {
          archivedReferences.push({
            id: refEntry.id,
            contentType: refEntry.contentType,
            status: 'Archived',
            title: refEntry.title
          });
        } else if (!refEntry.isPublished) {
          draftReferences.push({
            id: refEntry.id,
            contentType: refEntry.contentType,
            status: 'Draft',
            title: refEntry.title
          });
        }
      }

      if (draftReferences.length > 0 || archivedReferences.length > 0) {
        entriesWithDraftRefs.push({
          entry: {
            id: entry.sys.id,
            contentType: entry.sys.contentType.sys.id,
            title: getEntryTitle(entry),
            slug: getSlug(entry),
            updatedAt: entry.sys.updatedAt,
            isPublished: !!entry.sys.publishedVersion
          },
          draftReferences,
          archivedReferences
        });
      }
    }

    console.log(`\n📊 Found ${entriesWithDraftRefs.length} ${contentType} entries with draft or archived references`);

    // Generate CSV
    if (entriesWithDraftRefs.length > 0) {
      const csvRows = [
        'Entry ID,Entry Content Type,Entry Title,Entry Slug,Entry Status,Entry Updated At,Referenced Entry ID,Referenced Content Type,Referenced Status,Referenced Title,Contentful Entry Link,Contentful Referenced Entry Link'
      ];

      for (const item of entriesWithDraftRefs) {
        const entryLink = `https://app.contentful.com/spaces/${spaceId}/environments/${sourceEnvironmentId}/entries/${item.entry.id}`;
        const entryStatus = item.entry.isPublished ? 'Published' : 'Draft';
        
        // Add draft references
        for (const ref of item.draftReferences) {
          const refLink = ref.id !== 'MISSING' 
            ? `https://app.contentful.com/spaces/${spaceId}/environments/${sourceEnvironmentId}/entries/${ref.id}`
            : 'N/A';
          
          csvRows.push([
            item.entry.id,
            item.entry.contentType,
            `"${escapeCsv(item.entry.title)}"`,
            `"${escapeCsv(item.entry.slug)}"`,
            entryStatus,
            item.entry.updatedAt,
            ref.id,
            ref.contentType,
            ref.status,
            `"${escapeCsv(ref.title)}"`,
            entryLink,
            refLink
          ].join(','));
        }

        // Add archived references
        for (const ref of item.archivedReferences) {
          const refLink = `https://app.contentful.com/spaces/${spaceId}/environments/${sourceEnvironmentId}/entries/${ref.id}`;
          
          csvRows.push([
            item.entry.id,
            item.entry.contentType,
            `"${escapeCsv(item.entry.title)}"`,
            `"${escapeCsv(item.entry.slug)}"`,
            entryStatus,
            item.entry.updatedAt,
            ref.id,
            ref.contentType,
            ref.status,
            `"${escapeCsv(ref.title)}"`,
            entryLink,
            refLink
          ].join(','));
        }
      }

      const fileName = `${contentType}_with_draft_references.csv`;
      fs.writeFileSync(fileName, csvRows.join('\n'), 'utf8');
      console.log(`✅ Report saved to ${fileName}`);
    } else {
      console.log(`✅ No ${contentType} entries with draft or archived references found!`);
    }

    // Display summary
    console.log(`\n📋 Summary by ${contentType} Entry:`);
    console.log('─'.repeat(80));
    entriesWithDraftRefs.forEach((item, index) => {
      const draftCount = item.draftReferences.length;
      const archivedCount = item.archivedReferences.length;
      console.log(`${index + 1}. ${item.entry.title}`);
      console.log(`   ID: ${item.entry.id}`);
      if (item.entry.slug) console.log(`   Slug: ${item.entry.slug}`);
      console.log(`   Status: ${item.entry.isPublished ? 'Published' : 'Draft'}`);
      if (draftCount > 0) console.log(`   Draft References: ${draftCount}`);
      if (archivedCount > 0) console.log(`   Archived References: ${archivedCount}`);
      console.log('');
    });

  } catch (err) {
    console.error('❌ Error during audit:', err);
  }
}

// Helper function to get entry title
function getEntryTitle(entry) {
  if (!entry.fields) return '';
  
  const titleFields = ['title', 'name', 'internalName', 'heading', 'slug', 'internalTitle', 'ctaTitle', 'pageHeading'];
  
  for (const fieldName of titleFields) {
    if (entry.fields[fieldName]) {
      const locales = Object.keys(entry.fields[fieldName]);
      if (locales.length > 0) {
        const value = entry.fields[fieldName][locales[0]];
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
  }
  
  return '';
}

// Helper function to get slug
function getSlug(entry) {
  if (!entry.fields || !entry.fields.slug) return '';
  
  const locales = Object.keys(entry.fields.slug);
  if (locales.length > 0) {
    return entry.fields.slug[locales[0]] || '';
  }
  
  return '';
}

// Helper function to escape CSV values
function escapeCsv(value) {
  if (!value) return '';
  return value.replace(/"/g, '""');
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  let contentType = 'blogPost'; // default
  let publishedOnly = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--content-type' || arg === '-t') {
      contentType = args[i + 1];
      i++;
    } else if (arg === '--include-drafts') {
      publishedOnly = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: node auditDraftReferences.js [options]

This script audits entries of a specific content type for references to draft, 
archived, or missing content.

Options:
  --content-type, -t <type>    Content type to audit (default: blogPost)
                                Examples: blogPost, page, newsArticle, etc.
  --include-drafts              Include draft entries in the audit
                                (by default, only published entries are audited)
  --help, -h                   Show this help message

Examples:
  # Audit published blog posts for draft references
  node auditDraftReferences.js -t blogPost

  # Audit published pages for draft references
  node auditDraftReferences.js -t page

  # Audit ALL news articles (including drafts) for draft references
  node auditDraftReferences.js -t newsArticle --include-drafts

  # Audit webinars
  node auditDraftReferences.js -t webinar

Output:
  - CSV file: <contentType>_with_draft_references.csv
  - Contains all entries with references to draft, archived, or missing content
  - Includes direct Contentful links for easy access

Note: By default, only PUBLISHED entries are audited. Use --include-drafts
to also check draft entries for problematic references.
      `);
      process.exit(0);
    }
  }

  return { contentType, publishedOnly };
}

// Run the audit
const { contentType, publishedOnly } = parseArgs();
auditEntriesForDraftReferences(contentType, publishedOnly);

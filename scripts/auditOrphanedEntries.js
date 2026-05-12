require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const sourceEnvironmentId = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

// Function to fetch all entries with pagination
async function fetchAllEntriesPaginated(environment) {
  const allEntries = [];
  let skip = 0;
  const limit = 100;
  let total = 0;

  do {
    console.log(`Fetching entries... (${allEntries.length} so far)`);
    const response = await environment.getEntries({ skip, limit });

    if (response.items && response.items.length > 0) {
      allEntries.push(...response.items);
    }

    total = response.total;
    skip += limit;
  } while (allEntries.length < total);

  return allEntries;
}

// Function to recursively find entry links in Rich Text and other nested structures
function findEntryLinksRecursive(obj, incomingRefs) {
  if (!obj || typeof obj !== 'object') return;

  // Check if this is an entry link
  if (obj.sys && obj.sys.type === 'Link' && obj.sys.linkType === 'Entry' && obj.sys.id) {
    const referencedId = obj.sys.id;
    incomingRefs.set(referencedId, (incomingRefs.get(referencedId) || 0) + 1);
    return;
  }

  // Recursively search in arrays
  if (Array.isArray(obj)) {
    for (const item of obj) {
      findEntryLinksRecursive(item, incomingRefs);
    }
    return;
  }

  // Recursively search in objects
  for (const key in obj) {
    findEntryLinksRecursive(obj[key], incomingRefs);
  }
}

// Function to build a map of which entries are referenced by others
// Returns two maps: one for all references, one for only archived references
function buildIncomingReferencesMap(allEntries) {
  const incomingRefs = new Map(); // entryId -> count of references to it (non-archived only)
  const archivedRefs = new Map(); // entryId -> count of references from archived entries

  for (const entry of allEntries) {
    if (!entry.fields) continue;

    const isArchived = !!entry.sys.archivedVersion;
    const refs = new Map();

    for (const fieldName in entry.fields) {
      const fieldValue = entry.fields[fieldName];

      // Check each locale in the field
      for (const locale in fieldValue) {
        const value = fieldValue[locale];

        // Use recursive function to find all entry links
        // This handles Rich Text fields, nested structures, and regular references
        findEntryLinksRecursive(value, refs);
      }
    }

    // Add references to appropriate map based on whether parent is archived
    for (const [refId, count] of refs.entries()) {
      if (isArchived) {
        archivedRefs.set(refId, (archivedRefs.get(refId) || 0) + count);
      } else {
        incomingRefs.set(refId, (incomingRefs.get(refId) || 0) + count);
      }
    }
  }

  return { incomingRefs, archivedRefs };
}

// Main function to audit orphaned entries
async function auditOrphanedEntries() {
  try {
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(sourceEnvironmentId);

    console.log('Fetching all entries...');
    const allEntries = await fetchAllEntriesPaginated(environment);
    console.log(`Total entries fetched: ${allEntries.length}`);

    // Filter out archived entries
    const nonArchivedEntries = allEntries.filter(entry => !entry.sys.archivedVersion);
    console.log(`Non-archived entries: ${nonArchivedEntries.length}`);
    console.log(`Archived entries (excluded): ${allEntries.length - nonArchivedEntries.length}`);

    // Build map of incoming references (including from archived entries)
    console.log('\nBuilding reference map...');
    const { incomingRefs, archivedRefs } = buildIncomingReferencesMap(allEntries);

    // Find entries with no incoming references from non-archived entries
    const orphanedEntries = nonArchivedEntries.filter(entry => {
      const refCount = incomingRefs.get(entry.sys.id) || 0;
      return refCount === 0;
    });

    console.log(`\nOrphaned entries (no incoming references): ${orphanedEntries.length}`);
    console.log(`Referenced entries: ${nonArchivedEntries.length - orphanedEntries.length}`);

    // Separate entries by publish status only (no content type splitting)
    // Exclude published page content types that should remain even if orphaned
    const pageContentTypes = ['page', 'blogPost', 'newsArticle', 'podcasts', 'webinar', 'caseStudy', 'customerSnapshot', 'spotlight', 'document', 'abmTemplate', 'listingPages', 'landingPage', 'pressReleaseHome', 'announcementBar', 'careersConfiguration', 'promotionWrapper', 'event', 'cerosLandingPage'];
    const allEntriesPublished = [];
    const allEntriesDraft = [];

    for (const entry of orphanedEntries) {
      const contentType = entry.sys.contentType.sys.id;
      const isPublished = !!entry.sys.publishedVersion;

      // Skip published page content types
      if (isPublished && pageContentTypes.includes(contentType)) {
        continue;
      }

      if (isPublished) {
        allEntriesPublished.push(entry);
      } else {
        allEntriesDraft.push(entry);
      }
    }

    // Function to generate CSV rows for entries
    function generateCsvRows(entries) {
      const rows = [
        'Entry ID,Content Type,Status,Reference Type,Created At,Updated At,Title/Name,Contentful Link'
      ];

      // Sort entries by content type
      const sortedEntries = entries.sort((a, b) => {
        const contentTypeA = a.sys.contentType.sys.id.toLowerCase();
        const contentTypeB = b.sys.contentType.sys.id.toLowerCase();
        return contentTypeA.localeCompare(contentTypeB);
      });

      for (const entry of sortedEntries) {
        const id = entry.sys.id;
        const contentType = entry.sys.contentType.sys.id;
        const status = entry.sys.publishedVersion ? 'Published' : 'Draft';
        const createdAt = entry.sys.createdAt;
        const updatedAt = entry.sys.updatedAt;

        // Determine reference type
        const hasArchivedRefs = (archivedRefs.get(id) || 0) > 0;
        const referenceType = hasArchivedRefs ? 'Archived References' : 'No References';

        // Create direct link to Contentful
        const contentfulLink = `https://app.contentful.com/spaces/${spaceId}/environments/${sourceEnvironmentId}/entries/${id}`;

        // Try to find a title or name field
        let title = '';
        if (entry.fields) {
          // Common title field names
          const titleFields = ['title', 'name', 'internalName', 'heading', 'slug', 'internalTitle', 'ctaTitle', 'pageHeading'];
          for (const fieldName of titleFields) {
            if (entry.fields[fieldName]) {
              const locales = Object.keys(entry.fields[fieldName]);
              if (locales.length > 0) {
                const value = entry.fields[fieldName][locales[0]];
                title = typeof value === 'string' ? value : JSON.stringify(value);
                break;
              }
            }
          }
        }

        // Escape CSV values
        title = `"${(title || '').replace(/"/g, '""')}"`;

        rows.push(`${id},${contentType},${status},${referenceType},${createdAt},${updatedAt},${title},${contentfulLink}`);
      }

      return rows;
    }

    // Save main CSV files (excluding large content types)
    console.log('\n📁 Saving orphaned entries reports...');

    // Write CSV files - only two files now (published and draft)
    // Published entries
    if (allEntriesPublished.length > 0) {
      const publishedCsvRows = generateCsvRows(allEntriesPublished);
      fs.writeFileSync('orphaned_entries_published.csv', publishedCsvRows.join('\n'), 'utf8');
      console.log(`✅ All orphaned published entries saved to orphaned_entries_published.csv (${allEntriesPublished.length} entries)`);
    }

    // Draft entries
    if (allEntriesDraft.length > 0) {
      const draftCsvRows = generateCsvRows(allEntriesDraft);
      fs.writeFileSync('orphaned_entries_draft.csv', draftCsvRows.join('\n'), 'utf8');
      console.log(`✅ All orphaned draft entries saved to orphaned_entries_draft.csv (${allEntriesDraft.length} entries)`);
    }

    // Display summary by content type
    const byContentType = {};
    for (const entry of orphanedEntries) {
      const contentType = entry.sys.contentType.sys.id;
      byContentType[contentType] = (byContentType[contentType] || 0) + 1;
    }

    console.log('\n📊 Orphaned Entries Breakdown by Content Type:');
    console.log('─'.repeat(50));
    for (const [contentType, count] of Object.entries(byContentType).sort((a, b) => b[1] - a[1])) {
      console.log(`${contentType}: ${count}`);
    }

  } catch (err) {
    console.error('❌ Error during audit:', err);
  }
}

// Run the audit
auditOrphanedEntries();

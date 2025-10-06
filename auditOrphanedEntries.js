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
function buildIncomingReferencesMap(allEntries) {
  const incomingRefs = new Map(); // entryId -> count of references to it

  for (const entry of allEntries) {
    if (!entry.fields) continue;

    for (const fieldName in entry.fields) {
      const fieldValue = entry.fields[fieldName];

      // Check each locale in the field
      for (const locale in fieldValue) {
        const value = fieldValue[locale];

        // Use recursive function to find all entry links
        // This handles Rich Text fields, nested structures, and regular references
        findEntryLinksRecursive(value, incomingRefs);
      }
    }
  }

  return incomingRefs;
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

    // Build map of incoming references
    console.log('\nBuilding reference map...');
    const incomingRefs = buildIncomingReferencesMap(nonArchivedEntries);

    // Find entries with no incoming references
    const orphanedEntries = nonArchivedEntries.filter(entry => {
      const refCount = incomingRefs.get(entry.sys.id) || 0;
      return refCount === 0;
    });

    console.log(`\nOrphaned entries (no incoming references): ${orphanedEntries.length}`);
    console.log(`Referenced entries: ${nonArchivedEntries.length - orphanedEntries.length}`);

    // Separate entries by content type and publish status
    // Exclude published page content types that should remain even if orphaned
    const pageContentTypes = ['page', 'blogPost', 'newsArticle', 'podcasts', 'webinar', 'caseStudy', 'customerSuccessStory', 'spotlight', 'document', 'abmTemplate', 'listingPages'];
    const excludedTypes = ['imageWithAiTags', 'colorBlocks'];
    const mainEntriesPublished = [];
    const mainEntriesDraft = [];
    const imageWithAiTagsEntriesPublished = [];
    const imageWithAiTagsEntriesDraft = [];
    const colorBlocksEntriesPublished = [];
    const colorBlocksEntriesDraft = [];

    for (const entry of orphanedEntries) {
      const contentType = entry.sys.contentType.sys.id;
      const isPublished = !!entry.sys.publishedVersion;

      // Skip published page content types
      if (isPublished && pageContentTypes.includes(contentType)) {
        continue;
      }

      if (contentType === 'imageWithAiTags') {
        if (isPublished) {
          imageWithAiTagsEntriesPublished.push(entry);
        } else {
          imageWithAiTagsEntriesDraft.push(entry);
        }
      } else if (contentType === 'colorBlocks') {
        if (isPublished) {
          colorBlocksEntriesPublished.push(entry);
        } else {
          colorBlocksEntriesDraft.push(entry);
        }
      } else {
        if (isPublished) {
          mainEntriesPublished.push(entry);
        } else {
          mainEntriesDraft.push(entry);
        }
      }
    }

    // Function to generate CSV rows for entries
    function generateCsvRows(entries) {
      const rows = [
        'Entry ID,Content Type,Status,Created At,Updated At,Title/Name,Contentful Link'
      ];

      for (const entry of entries) {
        const id = entry.sys.id;
        const contentType = entry.sys.contentType.sys.id;
        const status = entry.sys.publishedVersion ? 'Published' : 'Draft';
        const createdAt = entry.sys.createdAt;
        const updatedAt = entry.sys.updatedAt;

        // Create direct link to Contentful
        const contentfulLink = `https://app.contentful.com/spaces/${spaceId}/environments/${sourceEnvironmentId}/entries/${id}`;

        // Try to find a title or name field
        let title = '';
        if (entry.fields) {
          // Common title field names
          const titleFields = ['title', 'name', 'internalName', 'heading', 'slug'];
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

        rows.push(`${id},${contentType},${status},${createdAt},${updatedAt},${title},${contentfulLink}`);
      }

      return rows;
    }

    // Save main CSV files (excluding large content types)
    console.log('\n📁 Saving orphaned entries reports...');

    // Main - Published
    if (mainEntriesPublished.length > 0) {
      const mainPublishedCsvRows = generateCsvRows(mainEntriesPublished);
      fs.writeFileSync('orphaned_entries_published.csv', mainPublishedCsvRows.join('\n'), 'utf8');
      console.log(`✅ Orphaned published entries saved to orphaned_entries_published.csv (${mainEntriesPublished.length} entries)`);
    }

    // Main - Draft
    if (mainEntriesDraft.length > 0) {
      const mainDraftCsvRows = generateCsvRows(mainEntriesDraft);
      fs.writeFileSync('orphaned_entries_draft.csv', mainDraftCsvRows.join('\n'), 'utf8');
      console.log(`✅ Orphaned draft entries saved to orphaned_entries_draft.csv (${mainEntriesDraft.length} entries)`);
    }

    // imageWithAiTags - Published
    if (imageWithAiTagsEntriesPublished.length > 0) {
      const imagesPublishedCsvRows = generateCsvRows(imageWithAiTagsEntriesPublished);
      fs.writeFileSync('orphaned_entries_imageWithAiTags_published.csv', imagesPublishedCsvRows.join('\n'), 'utf8');
      console.log(`✅ Orphaned imageWithAiTags (published) saved to orphaned_entries_imageWithAiTags_published.csv (${imageWithAiTagsEntriesPublished.length} entries)`);
    }

    // imageWithAiTags - Draft
    if (imageWithAiTagsEntriesDraft.length > 0) {
      const imagesDraftCsvRows = generateCsvRows(imageWithAiTagsEntriesDraft);
      fs.writeFileSync('orphaned_entries_imageWithAiTags_draft.csv', imagesDraftCsvRows.join('\n'), 'utf8');
      console.log(`✅ Orphaned imageWithAiTags (draft) saved to orphaned_entries_imageWithAiTags_draft.csv (${imageWithAiTagsEntriesDraft.length} entries)`);
    }

    // colorBlocks - Published
    if (colorBlocksEntriesPublished.length > 0) {
      const colorsPublishedCsvRows = generateCsvRows(colorBlocksEntriesPublished);
      fs.writeFileSync('orphaned_entries_colorBlocks_published.csv', colorsPublishedCsvRows.join('\n'), 'utf8');
      console.log(`✅ Orphaned colorBlocks (published) saved to orphaned_entries_colorBlocks_published.csv (${colorBlocksEntriesPublished.length} entries)`);
    }

    // colorBlocks - Draft
    if (colorBlocksEntriesDraft.length > 0) {
      const colorsDraftCsvRows = generateCsvRows(colorBlocksEntriesDraft);
      fs.writeFileSync('orphaned_entries_colorBlocks_draft.csv', colorsDraftCsvRows.join('\n'), 'utf8');
      console.log(`✅ Orphaned colorBlocks (draft) saved to orphaned_entries_colorBlocks_draft.csv (${colorBlocksEntriesDraft.length} entries)`);
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

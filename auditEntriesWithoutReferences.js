require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const sourceEnvironmentId = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

// Function to check if an entry has any reference fields
function hasReferences(entry) {
  if (!entry.fields) return false;

  for (const fieldName in entry.fields) {
    const fieldValue = entry.fields[fieldName];

    // Check each locale in the field
    for (const locale in fieldValue) {
      const value = fieldValue[locale];

      // Check if it's a single reference (Link to Entry)
      if (value && typeof value === 'object' && value.sys && value.sys.type === 'Link' && value.sys.linkType === 'Entry') {
        return true;
      }

      // Check if it's an array of references
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && item.sys && item.sys.type === 'Link' && item.sys.linkType === 'Entry') {
            return true;
          }
        }
      }
    }
  }

  return false;
}

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

// Main function to audit entries
async function auditEntriesWithoutReferences() {
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

    // Filter entries without references
    const entriesWithoutRefs = nonArchivedEntries.filter(entry => !hasReferences(entry));

    console.log(`\nEntries without reference links: ${entriesWithoutRefs.length}`);
    console.log(`Entries with reference links: ${nonArchivedEntries.length - entriesWithoutRefs.length}`);

    // Separate entries by content type and publish status
    const excludedTypes = ['imageWithAiTags', 'colorBlocks'];
    const mainEntriesPublished = [];
    const mainEntriesDraft = [];
    const imageWithAiTagsEntriesPublished = [];
    const imageWithAiTagsEntriesDraft = [];
    const colorBlocksEntriesPublished = [];
    const colorBlocksEntriesDraft = [];

    for (const entry of entriesWithoutRefs) {
      const contentType = entry.sys.contentType.sys.id;
      const isPublished = !!entry.sys.publishedVersion;

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
    console.log('\n📁 Saving reports...');

    // Main - Published
    if (mainEntriesPublished.length > 0) {
      const mainPublishedCsvRows = generateCsvRows(mainEntriesPublished);
      fs.writeFileSync('entries_without_references_published.csv', mainPublishedCsvRows.join('\n'), 'utf8');
      console.log(`✅ Published entries saved to entries_without_references_published.csv (${mainEntriesPublished.length} entries)`);
    }

    // Main - Draft
    if (mainEntriesDraft.length > 0) {
      const mainDraftCsvRows = generateCsvRows(mainEntriesDraft);
      fs.writeFileSync('entries_without_references_draft.csv', mainDraftCsvRows.join('\n'), 'utf8');
      console.log(`✅ Draft entries saved to entries_without_references_draft.csv (${mainEntriesDraft.length} entries)`);
    }

    // imageWithAiTags - Published
    if (imageWithAiTagsEntriesPublished.length > 0) {
      const imagesPublishedCsvRows = generateCsvRows(imageWithAiTagsEntriesPublished);
      fs.writeFileSync('entries_without_references_imageWithAiTags_published.csv', imagesPublishedCsvRows.join('\n'), 'utf8');
      console.log(`✅ imageWithAiTags (published) saved to entries_without_references_imageWithAiTags_published.csv (${imageWithAiTagsEntriesPublished.length} entries)`);
    }

    // imageWithAiTags - Draft
    if (imageWithAiTagsEntriesDraft.length > 0) {
      const imagesDraftCsvRows = generateCsvRows(imageWithAiTagsEntriesDraft);
      fs.writeFileSync('entries_without_references_imageWithAiTags_draft.csv', imagesDraftCsvRows.join('\n'), 'utf8');
      console.log(`✅ imageWithAiTags (draft) saved to entries_without_references_imageWithAiTags_draft.csv (${imageWithAiTagsEntriesDraft.length} entries)`);
    }

    // colorBlocks - Published
    if (colorBlocksEntriesPublished.length > 0) {
      const colorsPublishedCsvRows = generateCsvRows(colorBlocksEntriesPublished);
      fs.writeFileSync('entries_without_references_colorBlocks_published.csv', colorsPublishedCsvRows.join('\n'), 'utf8');
      console.log(`✅ colorBlocks (published) saved to entries_without_references_colorBlocks_published.csv (${colorBlocksEntriesPublished.length} entries)`);
    }

    // colorBlocks - Draft
    if (colorBlocksEntriesDraft.length > 0) {
      const colorsDraftCsvRows = generateCsvRows(colorBlocksEntriesDraft);
      fs.writeFileSync('entries_without_references_colorBlocks_draft.csv', colorsDraftCsvRows.join('\n'), 'utf8');
      console.log(`✅ colorBlocks (draft) saved to entries_without_references_colorBlocks_draft.csv (${colorBlocksEntriesDraft.length} entries)`);
    }

    // Display summary by content type
    const byContentType = {};
    for (const entry of entriesWithoutRefs) {
      const contentType = entry.sys.contentType.sys.id;
      byContentType[contentType] = (byContentType[contentType] || 0) + 1;
    }

    console.log('\n📊 Breakdown by Content Type:');
    console.log('─'.repeat(50));
    for (const [contentType, count] of Object.entries(byContentType).sort((a, b) => b[1] - a[1])) {
      console.log(`${contentType}: ${count}`);
    }

  } catch (err) {
    console.error('❌ Error during audit:', err);
  }
}

// Run the audit
auditEntriesWithoutReferences();

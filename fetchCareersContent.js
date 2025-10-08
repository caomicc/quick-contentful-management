require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const sourceEnvironmentId = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

/**
 * Fetch all entries with the "careers content" tag
 * @param {Object} environment - Contentful environment object
 * @param {string} tagId - The tag ID to filter by (default: 'careers content')
 * @returns {Array} Array of entries with the specified tag
 */
async function fetchEntriesWithTag(environment, tagId = 'careersContent') {
  const allEntries = [];
  let skip = 0;
  const limit = 100;
  let total = 0;

  console.log(`Fetching entries with tag: "${tagId}"...`);

  do {
    try {
      const entriesResponse = await environment.getEntries({
        'metadata.tags.sys.id[in]': tagId,
        skip,
        limit,
      });

      if (entriesResponse.items && entriesResponse.items.length > 0) {
        allEntries.push(...entriesResponse.items);
      }

      total = entriesResponse.total;
      skip += limit;

      console.log(`Fetched ${allEntries.length} of ${total} entries...`);
    } catch (error) {
      console.error(`Error fetching entries at skip ${skip}:`, error);
      break;
    }
  } while (allEntries.length < total);

  return allEntries;
}

/**
 * Save entries to a JSON file
 * @param {Array} entries - Array of Contentful entries
 * @param {string} filename - Output filename
 */
function saveEntriesToJSON(entries, filename = 'careers_content_entries.json') {
  const data = entries.map(entry => ({
    id: entry.sys.id,
    contentType: entry.sys.contentType?.sys?.id || 'unknown',
    createdAt: entry.sys.createdAt,
    updatedAt: entry.sys.updatedAt,
    publishedAt: entry.sys.publishedAt,
    version: entry.sys.version,
    fields: entry.fields,
  }));

  fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\nSaved ${entries.length} entries to ${filename}`);
}

/**
 * Save entries summary to a CSV file
 * @param {Array} entries - Array of Contentful entries
 * @param {string} filename - Output filename
 */
function saveEntriesToCSV(entries, filename = 'careers_content_entries.csv') {
  const csvRows = [
    'id,contentType,status,createdAt,updatedAt,publishedAt,version',
    ...entries.map(entry => {
      const id = entry.sys.id;
      const contentType = entry.sys.contentType?.sys?.id || 'unknown';
      const status = entry.sys.publishedAt ? 'published' : 'draft';
      const createdAt = entry.sys.createdAt || '';
      const updatedAt = entry.sys.updatedAt || '';
      const publishedAt = entry.sys.publishedAt || '';
      const version = entry.sys.version || '';
      return `${id},${contentType},${status},${createdAt},${updatedAt},${publishedAt},${version}`;
    })
  ];

  fs.writeFileSync(filename, csvRows.join('\n'), 'utf8');
  console.log(`Saved ${entries.length} entries summary to ${filename}`);
}

/**
 * Main function to fetch and save careers content
 */
async function fetchCareersContent() {
  try {
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(sourceEnvironmentId);

    // Fetch all entries with the "careers content" tag
    const entries = await fetchEntriesWithTag(environment, 'careersContent');

    if (entries.length === 0) {
      console.log('No entries found with the "careersContent" tag.');
      return;
    }

    console.log(`\nFound ${entries.length} entries with "careersContent" tag`);

    // Group by content type for summary
    const contentTypeSummary = entries.reduce((acc, entry) => {
      const contentType = entry.sys.contentType?.sys?.id || 'unknown';
      acc[contentType] = (acc[contentType] || 0) + 1;
      return acc;
    }, {});

    console.log('\nContent Type Summary:');
    Object.entries(contentTypeSummary).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    // Save to files
    saveEntriesToJSON(entries);
    saveEntriesToCSV(entries);

    console.log('\nFetch complete!');
  } catch (error) {
    console.error('Error fetching careers content:', error);
  }
}

// Export the function for use in other scripts
module.exports = { fetchEntriesWithTag, saveEntriesToJSON, saveEntriesToCSV };

// Run the function if executed directly
if (require.main === module) {
  fetchCareersContent();
}

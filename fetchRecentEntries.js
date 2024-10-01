require('dotenv').config();
const contentfulManagement = require('contentful-management');
const spaceId = process.env.CONTENTFUL_SPACE_ID;

const sourceEnvironmentId = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;
const targetEnvironmentId = process.env.CONTENTFUL_TARGET_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

// Function to fetch entries created or updated in the last hour
async function fetchRecentEntries(environment) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const entries = await environment.getEntries({
    'sys.updatedAt[gte]': oneHourAgo, // Fetch entries updated in the last hour
  });
  return entries.items;
}

// Function to import entries into the target environment
async function importEntries(entries, targetEnvironment) {
  for (const entry of entries) {
    const { sys, fields } = entry;
    // Exclude `sys` properties to avoid conflicts
    const newEntryData = {
      fields,
      sys: {
        id: sys.id, // You can also omit this if you want Contentful to generate a new ID
        contentType: sys.contentType.sys.id,
      },
    };

    try {
      const newEntry = await targetEnvironment.createEntry(newEntryData.sys.contentType, {
        fields: newEntryData.fields,
      });
      console.log(`Imported entry: ${newEntry.sys.id}`);
    } catch (error) {
      console.error(`Error importing entry ${sys.id}:`, error);
    }
  }
}

// Main function to perform the import
async function importRecentEntries() {
  try {
    // Get source and target environments
    const space = await client.getSpace(spaceId);
    const sourceEnvironment = await space.getEnvironment(sourceEnvironmentId);
    const targetEnvironment = await space.getEnvironment(targetEnvironmentId);

    // Fetch recent entries from the source environment
    const recentEntries = await fetchRecentEntries(sourceEnvironment);
    console.log(`Fetched ${recentEntries.length} entries from the last hour.`);

    // Import the entries into the target environment
    await importEntries(recentEntries, targetEnvironment);
    console.log('Import process completed.');
  } catch (error) {
    console.error(`Error during import process: ${error}`);
  }
}

// Run the import function
importRecentEntries();

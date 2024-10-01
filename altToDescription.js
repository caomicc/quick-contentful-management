require('dotenv').config();
const contentfulManagement = require('contentful-management');

// Initialize the Contentful client
const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const environmentId = process.env.CONTENTFUL_ENVIRONMENT_ID;
const contentType = 'imageWithAiTags';

// Function to fetch entries with pagination
async function fetchEntries(environment, skip = 0, limit = 100) {
  return await environment.getEntries({
    content_type: contentType,
    skip: skip,
    limit: limit,
  });
}

// Function to update an entry
async function updateEntry(environment, entry) {
  try {
    // Try updating the entry
    await entry.update();
    console.log(`Updated entry: ${entry.sys.id}`);

    // Publish the entry
    await entry.publish();
    console.log(`Published entry: ${entry.sys.id}`);
  } catch (error) {
    if (error.name === 'VersionMismatch') {
      // Skip this entry and move to the next one
      console.log(`Version conflict for entry: ${entry.sys.id}, skipping.`);
    } else {
      console.error(`Error updating entry: ${entry.sys.id}`, error);
    }
  }
}

// Main function to process entries
async function altToDescription() {
  try {
    // Get the space and environment
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(environmentId);

    let skip = 0;
    const limit = 100;
    let totalEntries = 0;

    while (true) {
      // Fetch a batch of entries
      const entries = await fetchEntries(environment, skip, limit);
      totalEntries = entries.total;

      // Process each entry
      for (const entry of entries.items) {
        const alt = entry.fields.alt;
        const description = entry.fields.description;

        if (alt && (!description || !description['en-US'])) {
          entry.fields.description = entry.fields.description || {};
          entry.fields.description['en-US'] = alt['en-US'];

          // Try to update the entry and skip on conflict
          await updateEntry(environment, entry);
        } else {
          console.log(`Skipped entry: ${entry.sys.id} (description not empty)`);
        }
      }

      // Increment the skip value to fetch the next batch
      skip += limit;

      // If we've processed all the entries, exit the loop
      if (skip >= totalEntries) {
        break;
      }
    }

    console.log('All entries processed.');
  } catch (error) {
    console.error(`Error updating entries: ${error}`);
  }
}

altToDescription();

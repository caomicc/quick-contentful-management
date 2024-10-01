require('dotenv').config();
const contentfulManagement = require('contentful-management');

// Initialize the Contentful client
const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const environmentId = process.env.CONTENTFUL_ENVIRONMENT_ID;
const contentType = 'imageWithAiTags'; // Replace with your specific content type

// Function to fetch entries with pagination
async function fetchEntries(environment, skip = 0, limit = 100) {
  return await environment.getEntries({
    content_type: contentType,
    skip: skip,
    limit: limit,
  });
}

// Function to publish an entry if it's in changed mode
async function publishChangedEntry(entry, count, totalEntries) {
  try {
    const currentVersion = entry.sys.version;
    const publishedVersion = entry.sys.publishedVersion || 0;

    // Check if the entry is in changed mode (version > publishedVersion)
    if (currentVersion > publishedVersion) {
      // Publish the entry
      await entry.publish();
      console.log(`${count}/${totalEntries} - Published entry: ${entry.sys.id} (version: ${currentVersion}, published: ${publishedVersion})`);
    } else {
      console.log(`${count}/${totalEntries} - Entry already published: ${entry.sys.id} (version: ${currentVersion})`);
    }
  } catch (error) {
    console.error(`${count}/${totalEntries} - Error publishing entry: ${entry.sys.id}`, error);
  }
}

// Main function to process and publish changed entries
async function publishChangedEntries() {
  try {
    // Get the space and environment
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(environmentId);

    let skip = 0;
    const limit = 100;
    let totalEntries = 0;
    let count = 0; // Initialize a counter for processed entries

    while (true) {
      // Fetch a batch of entries
      const entries = await fetchEntries(environment, skip, limit);
      totalEntries = entries.total;

      // Process each entry
      for (const entry of entries.items) {
        count += 1; // Increment the count

        // Publish the entry if it is in changed mode
        await publishChangedEntry(entry, count, totalEntries);
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
    console.error(`Error processing entries: ${error}`);
  }
}

// Run the function to publish changed entries
publishChangedEntries();

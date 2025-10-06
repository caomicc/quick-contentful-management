require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');
const spaceId = process.env.CONTENTFUL_SPACE_ID;

const sourceEnvironmentId = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;
// const targetEnvironmentId = process.env.CONTENTFUL_TARGET_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

async function fetchAllTagsPaginated(environment) {
  const allTags = [];
  let skip = 0;
  const limit = 100;
  let total = 0;
  do {
    const tagsResponse = await environment.getTags({ skip, limit });
    if (tagsResponse.items && tagsResponse.items.length > 0) {
      allTags.push(...tagsResponse.items);
    }
    total = tagsResponse.total;
    skip += limit;
  } while (allTags.length < total);
  return allTags;
}

async function fetchAndSaveContentTags() {
  try {
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(sourceEnvironmentId);
    const tags = await fetchAllTagsPaginated(environment);

    const csvRows = [
      'id,name,description,visibility',
      ...tags.map(tag => {
        const id = tag.sys.id;
        const name = tag.name ? `"${tag.name.replace(/"/g, '""')}"` : '';
        const description = tag.description ? `"${tag.description.replace(/"/g, '""')}"` : '';
        // Contentful tags have a visibility property: 'public' or 'private'
        const visibility = tag.sys.visibility || '';
        return `${id},${name},${description},${visibility}`;
      })
    ];

    fs.writeFileSync('contentful_tags.csv', csvRows.join('\n'), 'utf8');
    console.log('Tags saved to contentful_tags.csv');
  } catch (err) {
    console.error('Error fetching or saving tags:', err);
  }
}

fetchAndSaveContentTags();

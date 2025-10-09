require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');
const csv = require('csv-parser');

// 🔧 Configuration
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const ENVIRONMENT_ID = process.env.CONTENTFUL_ENVIRONMENT_ID;
const FIELD_ID = 'pardotForm'; // the field you want to update
const SLUG_FIELD = 'slug'; // change if your slug field has a different ID
const CONTENT_TYPE_ID = process.env.CONTENTFUL_CONTENT_TYPE_ID; // add this to your .env

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

async function run() {
  const space = await client.getSpace(SPACE_ID);
  const environment = await space.getEnvironment(ENVIRONMENT_ID);

  const updates = [];

  fs.createReadStream('webinarsBySlug.csv')
    .pipe(csv())
    .on('data', (row) => {
      updates.push(row);
    })
    .on('end', async () => {
      console.log(`Updating ${updates.length} entries...`);

      for (const { slug, newText } of updates) {
        try {
          // Query for entry by slug
          const entries = await environment.getEntries({
            content_type: CONTENT_TYPE_ID,
            [`fields.${SLUG_FIELD}`]: slug,
            limit: 1,
          });

          if (!entries.items.length) {
            console.error(`❌ No entry found with slug "${slug}"`);
            continue;
          }

          const entry = entries.items[0];

          // Update the field (assuming 'en-US' locale)
          entry.fields[FIELD_ID] = {
            ...entry.fields[FIELD_ID],
            'en-US': newText,
          };

          const updatedEntry = await entry.update();
          await updatedEntry.publish();

          console.log(`✅ Updated entry with slug "${slug}"`);
        } catch (err) {
          console.error(`❌ Failed to update slug "${slug}": ${err.message}`);
        }
      }

      console.log('✔️ All done');
    });
}

run().catch(console.error);

require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');
const csv = require('csv-parser');

// 🔧 Configuration
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const ENVIRONMENT_ID = process.env.CONTENTFUL_ENVIRONMENT_ID; // or your specific environment
const FIELD_ID = 'pardotForm'; // the field you want to update

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

async function run() {
  const space = await client.getSpace(SPACE_ID);
  const environment = await space.getEnvironment(ENVIRONMENT_ID);

  const updates = [];

  fs.createReadStream('updates.csv')
    .pipe(csv())
    .on('data', (row) => {
      updates.push(row);
    })
    .on('end', async () => {
      console.log(`Updating ${updates.length} entries...`);

      for (const { contentId, newText } of updates) {
        try {
          const entry = await environment.getEntry(contentId);

          // Update the field (assuming 'en-US' locale)
          entry.fields[FIELD_ID] = {
            ...entry.fields[FIELD_ID],
            'en-US': newText,
          };

          const updatedEntry = await entry.update();
          await updatedEntry.publish();

          console.log(`✅ Updated entry ${contentId}`);
        } catch (err) {
          console.error(`❌ Failed to update ${contentId}: ${err.message}`);
        }
      }

      console.log('✔️ All done');
    });
}

run().catch(console.error);

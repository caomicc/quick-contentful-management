require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');

const SPACE_ID = process.env.CONTENTFUL_SPACE_ID;
const ENVIRONMENT_ID = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

function escapeCsv(value) {
  if (!value) return '';
  return String(value).replace(/"/g, '""');
}

async function fetchAllDocumentsWithPardotForm(environment) {
  const allEntries = [];
  let skip = 0;
  const limit = 100;
  let total = 0;

  do {
    console.log(`Fetching document entries... (${allEntries.length} so far)`);
    const response = await environment.getEntries({
      content_type: 'document',
      'fields.pardotForm[exists]': true,
      skip,
      limit,
    });

    if (response.items && response.items.length > 0) {
      allEntries.push(...response.items);
    }

    total = response.total;
    skip += limit;
  } while (allEntries.length < total);

  return allEntries;
}

async function run() {
  const space = await client.getSpace(SPACE_ID);
  const environment = await space.getEnvironment(ENVIRONMENT_ID);

  console.log('Fetching all document entries with pardotForm...');
  const gatedDocuments = await fetchAllDocumentsWithPardotForm(environment);
  console.log(`Found ${gatedDocuments.length} gated documents.`);

  const csvRows = [
    'Entry ID,Title,Slug,Status,Pardot Form ID,Updated At,Contentful Link'
  ];

  for (const entry of gatedDocuments) {
    const entryId = entry.sys.id;
    const fields = entry.fields;
    const title = fields.title ? (fields.title['en-US'] || Object.values(fields.title)[0] || '') : '';
    const slug = fields.slug ? (fields.slug['en-US'] || Object.values(fields.slug)[0] || '') : '';
    const pardotForm = fields.pardotForm ? (fields.pardotForm['en-US'] || Object.values(fields.pardotForm)[0] || '') : '';
    const updatedAt = entry.sys.updatedAt || '';
    const isPublished = entry.sys.publishedAt ? 'Published' : 'Draft';
    const link = `https://app.contentful.com/spaces/${SPACE_ID}/environments/${ENVIRONMENT_ID}/entries/${entryId}`;

    // pardotForm could be a link to another entry or a string value
    let pardotFormValue = '';
    if (typeof pardotForm === 'object' && pardotForm.sys) {
      pardotFormValue = pardotForm.sys.id;
    } else {
      pardotFormValue = String(pardotForm);
    }

    csvRows.push([
      entryId,
      `"${escapeCsv(title)}"`,
      `"${escapeCsv(slug)}"`,
      isPublished,
      `"${escapeCsv(pardotFormValue)}"`,
      updatedAt,
      link,
    ].join(','));
  }

  const outputFile = 'gated_documents.csv';
  fs.writeFileSync(outputFile, csvRows.join('\n'), 'utf8');
  console.log(`Exported ${gatedDocuments.length} gated documents to ${outputFile}`);
}

run().catch(console.error);

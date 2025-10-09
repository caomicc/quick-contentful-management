require('dotenv').config();
// importTaxonomyToContentful.js
const { execSync } = require('child_process');
const path = require('path');

const taxonomyJsonPath = path.join(__dirname, 'taxonomy-import.json');
const organizationId = process.env.CONTENTFUL_ORGANIZATION_ID;

console.log('Importing taxonomy from:', taxonomyJsonPath);
console.log('Using Organization ID:', organizationId);
if (!organizationId) {
  console.error('Missing required environment variable: CONTENTFUL_ORGANIZATION_ID');
  process.exit(1);
}

const command = [
  'contentful',
  'organization',
  'import',
  '--organization-id', organizationId,
  '--content-file', taxonomyJsonPath
].join(' ');

try {
  console.log('Running:', command);
  execSync(command, { stdio: 'inherit' });
  console.log('Taxonomy import complete!');
} catch (err) {
  console.error('Error importing taxonomy:', err.message);
  process.exit(1);
}

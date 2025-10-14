// Converts contentful_tags.csv to contentful_tags_taxonomy_ready.csv for Contentful Taxonomy Manager import
// Usage: node convertTagsToTaxonomyCsv.js

const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/sync');
const csvStringify = require('csv-stringify/sync');

const INPUT = path.join('contentful_tags.csv');
const OUTPUT = path.join('contentful_tags_taxonomy_ready.csv');

function inferScheme(id, name) {
  // 1. Prefix before double underscore in id
  if (id.includes('__')) return id.split('__')[0].replace(/_/g, '').toLowerCase();
  // 2. Prefix before colon in name
  if (name && name.includes(':')) return name.split(':')[0].replace(/\s|_/g, '').toLowerCase();
  // 3. Prefix before single underscore in id
  if (id.includes('_')) return id.split('_')[0].replace(/_/g, '').toLowerCase();
  // 4. Fallback: use first word in name
  if (name && name.match(/^[a-zA-Z]+/)) return name.match(/^[a-zA-Z]+/)[0].toLowerCase();
  // 5. Fallback: use first letters in id
  if (id.match(/^[a-zA-Z]+/)) return id.match(/^[a-zA-Z]+/)[0].toLowerCase();
  return 'general';
}

function main() {
  const inputCsv = fs.readFileSync(INPUT, 'utf8');
  const records = csvParse.parse(inputCsv, { columns: true, skip_empty_lines: true });

  // Collect scheme groupings for summary
  const schemeGroups = {};

  const outputRows = [
    ['preferredLabel', 'identifier', 'inScheme', 'broader'],
    ...records
      .filter(row => !row.visibility || row.visibility.trim().toLowerCase() !== 'private')
      .map(row => {
        const preferredLabel = row.name ? row.name.replace(/^"|"$/g, '') : row.id;
        const identifier = row.id;
        const inScheme = inferScheme(row.id, row.name);
        if (!schemeGroups[inScheme]) schemeGroups[inScheme] = [];
        schemeGroups[inScheme].push(identifier);
        // Broader is left blank unless you want to add hierarchy
        return [preferredLabel, identifier, inScheme, ''];
      })
  ];

  const outputCsv = csvStringify.stringify(outputRows);
  fs.writeFileSync(OUTPUT, outputCsv, 'utf8');
  console.log('Converted to contentful_tags_taxonomy_ready.csv');

  // Print summary of inferred groupings
  console.log('\nInferred schemes and their tags:');
  Object.entries(schemeGroups).forEach(([scheme, ids]) => {
    console.log(`- ${scheme}: ${ids.length} tags`);
  });
}

main();

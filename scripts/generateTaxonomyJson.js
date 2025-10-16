require('dotenv').config();
// generateTaxonomyJson.js - Creates taxonomy-import.json from contentful_tags_taxonomy_ready.csv
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse/sync');

const INPUT_CSV = path.join(__dirname, '..', 'contentful_tags_taxonomy_ready.csv');
const OUTPUT_JSON = path.join(__dirname, 'taxonomy-import.json');

// Function to sanitize IDs for Contentful taxonomy
function sanitizeId(id) {
  const timestamp = Date.now().toString().slice(-4); // Last 4 digits of timestamp
  return (id
    .replace(/[^a-zA-Z0-9\-_]/g, '') // Remove invalid characters
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^[^a-zA-Z]/, 'id') // Ensure starts with letter
    .substring(0, 60) + '_' + timestamp) // Add timestamp to make unique
    .substring(0, 64); // Limit total length
}

function main() {
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`Input file not found: ${INPUT_CSV}`);
    console.log('Please run convertTagsToTaxonomyCsv.js first to generate contentful_tags_taxonomy_ready.csv');
    process.exit(1);
  }

  const inputCsv = fs.readFileSync(INPUT_CSV, 'utf8');
  const records = csvParse.parse(inputCsv, { columns: true, skip_empty_lines: true });

  // Group concepts by scheme
  const schemes = {};
  const concepts = [];

  records.forEach(row => {
    const scheme = sanitizeId(row.inScheme);
    const conceptId = sanitizeId(row.identifier);

    // Create scheme if it doesn't exist
    if (!schemes[scheme]) {
      schemes[scheme] = {
        sys: {
          id: scheme,
          type: "TaxonomyConceptScheme",
          version: 1
        },
        conceptIds: [],
        totalConcepts: 0,
        preferredLabel: {
          "en-US": row.inScheme.charAt(0).toUpperCase() + row.inScheme.slice(1)
        },
        definedTerms: []
      };
    }

    // Add concept to scheme
    schemes[scheme].conceptIds.push(conceptId);
    schemes[scheme].totalConcepts++;

    // Create concept
    const concept = {
      sys: {
        id: conceptId,
        type: "TaxonomyConcept",
        version: 1
      },
      prefLabel: {
        "en-US": row.preferredLabel
      },
      conceptSchemeId: scheme,
      hiddenLabels: {
        "en-US": []
      },
      altLabels: {
        "en-US": []
      }
    };

    // Add broader relationship if specified
    if (row.broader && row.broader.trim()) {
      concept.broader = [sanitizeId(row.broader.trim())];
    }

    concepts.push(concept);
  });

  // Convert schemes object to array
  const schemesArray = Object.values(schemes);

  // Create the taxonomy import structure
  const taxonomyData = {
   taxonomy: {
      version: 1,
      conceptSchemes: schemesArray.map(scheme => ({
        sys: {
          id: scheme.sys.id,
          type: "TaxonomyConceptScheme",
          version: 1
        },
        prefLabel: scheme.preferredLabel
      })),
      concepts: concepts
    }
  };

  // Write JSON file
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(taxonomyData, null, 2), 'utf8');

  console.log(`✅ Generated taxonomy import file: ${OUTPUT_JSON}`);
  console.log(`📊 Summary:`);
  console.log(`   - ${schemesArray.length} concept schemes`);
  console.log(`   - ${concepts.length} concepts`);

  schemesArray.forEach(scheme => {
    console.log(`   - ${scheme.preferredLabel["en-US"]}: ${scheme.totalConcepts} concepts`);
  });
}

main();

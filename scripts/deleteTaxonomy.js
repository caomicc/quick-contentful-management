require('dotenv').config();
const contentfulManagement = require('contentful-management');

const organizationId = process.env.CONTENTFUL_ORGANIZATION_ID;
const accessToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

if (!organizationId || !accessToken) {
  console.error('Missing required environment variables: CONTENTFUL_ORGANIZATION_ID, CONTENTFUL_MANAGEMENT_TOKEN');
  process.exit(1);
}

const client = contentfulManagement.createClient({
  accessToken: accessToken,
});

async function deleteAllTaxonomy() {
  try {
    console.log('🔍 Fetching existing taxonomy...');
    
    const organization = await client.getOrganization(organizationId);
    
    // Get all concept schemes
    console.log('📋 Fetching concept schemes...');
    let conceptSchemes;
    try {
      conceptSchemes = await organization.getTaxonomyConceptSchemes();
    } catch (error) {
      console.log('Trying alternative method for concept schemes...');
      conceptSchemes = await organization.getMany('conceptScheme');
    }
    console.log(`Found ${conceptSchemes.items.length} concept schemes`);
    
    // Get all concepts
    console.log('📋 Fetching concepts...');
    let concepts;
    try {
      concepts = await organization.getTaxonomyConcepts();
    } catch (error) {
      console.log('Trying alternative method for concepts...');
      concepts = await organization.getMany('concept');
    }
    console.log(`Found ${concepts.items.length} concepts`);
    
    // Delete all concepts first (they depend on schemes)
    if (concepts.items.length > 0) {
      console.log('\n🗑️ Deleting concepts...');
      for (const concept of concepts.items) {
        try {
          await concept.delete();
          console.log(`✅ Deleted concept: ${concept.sys.id}`);
        } catch (error) {
          console.error(`❌ Failed to delete concept ${concept.sys.id}:`, error.message);
        }
      }
    }
    
    // Delete all concept schemes
    if (conceptSchemes.items.length > 0) {
      console.log('\n🗑️ Deleting concept schemes...');
      for (const scheme of conceptSchemes.items) {
        try {
          await scheme.delete();
          console.log(`✅ Deleted concept scheme: ${scheme.sys.id}`);
        } catch (error) {
          console.error(`❌ Failed to delete concept scheme ${scheme.sys.id}:`, error.message);
        }
      }
    }
    
    console.log('\n✅ Taxonomy cleanup complete!');
    
  } catch (error) {
    console.error('❌ Error during taxonomy cleanup:', error);
    if (error.details) {
      console.error('Details:', JSON.stringify(error.details, null, 2));
    }
  }
}

// Run the cleanup
deleteAllTaxonomy();

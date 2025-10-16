#!/usr/bin/env node
require('dotenv').config();
const { execSync } = require('child_process');

const organizationId = process.env.CONTENTFUL_ORGANIZATION_ID;

if (!organizationId) {
  console.error('Missing required environment variable: CONTENTFUL_ORGANIZATION_ID');
  process.exit(1);
}

console.log('🗑️ Deleting all taxonomy from organization:', organizationId);
console.log('⚠️  This will delete ALL concept schemes and concepts!');

// Give user a chance to cancel
console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
setTimeout(() => {
  try {
    console.log('\n🔍 Listing existing taxonomy...');
    
    // List concept schemes
    try {
      const listSchemesCmd = `contentful organization taxonomy list-concept-schemes --organization-id ${organizationId}`;
      console.log('Running:', listSchemesCmd);
      const schemes = execSync(listSchemesCmd, { encoding: 'utf8' });
      console.log('Concept Schemes:');
      console.log(schemes);
    } catch (error) {
      console.log('No concept schemes found or error listing schemes');
    }
    
    // List concepts
    try {
      const listConceptsCmd = `contentful organization taxonomy list-concepts --organization-id ${organizationId}`;
      console.log('\nRunning:', listConceptsCmd);
      const concepts = execSync(listConceptsCmd, { encoding: 'utf8' });
      console.log('Concepts:');
      console.log(concepts);
    } catch (error) {
      console.log('No concepts found or error listing concepts');
    }
    
    // Try to delete all (this may need to be done manually)
    console.log('\n⚠️  CLI deletion commands may not be available.');
    console.log('You may need to delete taxonomy manually from the Contentful web interface.');
    console.log('Or we can try the Management API approach...');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}, 5000);

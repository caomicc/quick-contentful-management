require('dotenv').config();
const https = require('https');

const organizationId = process.env.CONTENTFUL_ORGANIZATION_ID;
const accessToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

if (!organizationId || !accessToken) {
  console.error('Missing required environment variables: CONTENTFUL_ORGANIZATION_ID, CONTENTFUL_MANAGEMENT_TOKEN');
  process.exit(1);
}

// Function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.contentful.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/vnd.contentful.management.v1+json',
        'X-Contentful-User-Agent': 'app taxonomy-cleanup-script'
      }
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(responseData));
          } catch (e) {
            resolve(responseData);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function deleteAllTaxonomy() {
  try {
    console.log('🔍 Fetching existing taxonomy concepts...');
    
    // Get all concepts
    const conceptsResponse = await makeRequest('GET', `/organizations/${organizationId}/taxonomy/concepts`);
    const concepts = conceptsResponse.items || [];
    console.log(`Found ${concepts.length} concepts`);
    
    // Get all concept schemes
    console.log('🔍 Fetching existing concept schemes...');
    let schemesResponse;
    try {
      schemesResponse = await makeRequest('GET', `/organizations/${organizationId}/taxonomy/concept_schemes`);
    } catch (error) {
      console.log('Trying alternative path for concept schemes...');
      try {
        schemesResponse = await makeRequest('GET', `/organizations/${organizationId}/taxonomy/conceptSchemes`);
      } catch (error2) {
        console.log('Trying another alternative path...');
        schemesResponse = await makeRequest('GET', `/organizations/${organizationId}/taxonomy/concept-schemes`);
      }
    }
    const schemes = schemesResponse.items || [];
    console.log(`Found ${schemes.length} concept schemes`);
    
    // Delete all concepts first
    if (concepts.length > 0) {
      console.log('\n🗑️ Deleting concepts...');
      for (const concept of concepts) {
        try {
          await makeRequest('DELETE', `/organizations/${organizationId}/taxonomy/concepts/${concept.sys.id}`);
          console.log(`✅ Deleted concept: ${concept.sys.id}`);
        } catch (error) {
          console.error(`❌ Failed to delete concept ${concept.sys.id}:`, error.message);
        }
      }
    }
    
    // Delete all concept schemes
    if (schemes.length > 0) {
      console.log('\n🗑️ Deleting concept schemes...');
      for (const scheme of schemes) {
        try {
          let deletePath = `/organizations/${organizationId}/taxonomy/concept_schemes/${scheme.sys.id}`;
          try {
            await makeRequest('DELETE', deletePath);
          } catch (error) {
            // Try alternative paths
            deletePath = `/organizations/${organizationId}/taxonomy/conceptSchemes/${scheme.sys.id}`;
            try {
              await makeRequest('DELETE', deletePath);
            } catch (error2) {
              deletePath = `/organizations/${organizationId}/taxonomy/concept-schemes/${scheme.sys.id}`;
              await makeRequest('DELETE', deletePath);
            }
          }
          console.log(`✅ Deleted concept scheme: ${scheme.sys.id}`);
        } catch (error) {
          console.error(`❌ Failed to delete concept scheme ${scheme.sys.id}:`, error.message);
        }
      }
    }
    
    console.log('\n✅ Taxonomy cleanup complete!');
    
  } catch (error) {
    console.error('❌ Error during taxonomy cleanup:', error.message);
  }
}

// Run the cleanup
deleteAllTaxonomy();

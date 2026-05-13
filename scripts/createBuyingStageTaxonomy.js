#!/usr/bin/env node
require('dotenv').config();

const organizationId = process.env.CONTENTFUL_ORGANIZATION_ID;
const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const BASE = `https://api.contentful.com/organizations/${organizationId}/taxonomy`;
const headers = {
  Authorization: `Bearer ${managementToken}`,
  'Content-Type': 'application/json',
};

const SCHEME_ID = 'buyingStage';

// Step 1: Create the concept scheme
async function createScheme() {
  const body = {
    sys: { id: SCHEME_ID },
    prefLabel: { 'en-US': 'Buying Stage' },
    definition: { 'en-US': 'Where in the buyer journey the content is most relevant.' },
    topConcepts: [
      { sys: { id: 'awareness', type: 'Link', linkType: 'TaxonomyConcept' } },
      { sys: { id: 'consideration', type: 'Link', linkType: 'TaxonomyConcept' } },
      { sys: { id: 'decision', type: 'Link', linkType: 'TaxonomyConcept' } },
      { sys: { id: 'retention', type: 'Link', linkType: 'TaxonomyConcept' } },
    ],
  };

  const res = await fetch(`${BASE}/concept-schemes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create scheme → ${res.status}: ${err}`);
  }
  return res.json();
}

// Step 2: Create concepts
const concepts = [
  // Top-level
  { id: 'awareness', label: 'Awareness', broader: null },
  { id: 'consideration', label: 'Consideration', broader: null },
  { id: 'decision', label: 'Decision', broader: null },
  { id: 'retention', label: 'Retention', broader: null },
  // Awareness children
  { id: 'thoughtLeadership', label: 'Thought Leadership', broader: 'awareness' },
  { id: 'trendsResearch', label: 'Trends & Research', broader: 'awareness' },
  // Consideration children
  { id: 'businessCaseRoi', label: 'Business Case / ROI', broader: 'consideration' },
  { id: 'analystResearch', label: 'Analyst Research', broader: 'consideration' },
  { id: 'solutionOverview', label: 'Solution Overview', broader: 'consideration' },
  // Decision children
  { id: 'customerStory', label: 'Customer Story', broader: 'decision' },
  { id: 'productDemo', label: 'Product Demo', broader: 'decision' },
  { id: 'competitiveDifferentiation', label: 'Competitive Differentiation', broader: 'decision' },
  // Retention children
  { id: 'bestPractices', label: 'Best Practices', broader: 'retention' },
  { id: 'customerEnablement', label: 'Customer Enablement', broader: 'retention' },
];

async function createConcept({ id, label, broader }) {
  const body = {
    sys: { id },
    uri: null,
    prefLabel: { 'en-US': label },
    definition: { 'en-US': '' },
    broader: broader
      ? [{ sys: { id: broader, type: 'Link', linkType: 'TaxonomyConcept' } }]
      : [],
    related: [],
    conceptSchemes: [
      { sys: { id: SCHEME_ID, type: 'Link', linkType: 'TaxonomyConceptScheme' } },
    ],
  };

  const res = await fetch(`${BASE}/concepts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST concept "${id}" → ${res.status}: ${err}`);
  }
  return res.json();
}

async function main() {
  // Step 1: Create top-level concepts WITHOUT scheme reference first
  const topLevel = concepts.filter(c => !c.broader);
  const children = concepts.filter(c => c.broader);

  console.log('1️⃣  Creating top-level concepts (without scheme ref)...\n');
  for (const concept of topLevel) {
    try {
      // Create without conceptSchemes - just bare concepts
      const body = {
        sys: { id: concept.id },
        uri: null,
        prefLabel: { 'en-US': concept.label },
        definition: { 'en-US': '' },
        broader: [],
        related: [],
        conceptSchemes: [],
      };
      const res = await fetch(`${BASE}/concepts`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.text();
        // May already exist from previous run
        if (res.status === 409) {
          console.log(`   ⏭️  ${concept.label} (already exists)`);
        } else {
          throw new Error(`${res.status}: ${err}`);
        }
      } else {
        console.log(`   ✅ ${concept.label} (${concept.id})`);
      }
    } catch (err) {
      console.log(`   ❌ ${concept.label}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Step 2: Create the scheme now that top concepts exist
  console.log('\n2️⃣  Creating "Buying Stage" concept scheme...');
  try {
    await createScheme();
    console.log('   ✅ Scheme created\n');
  } catch (err) {
    if (err.message.includes('409')) {
      console.log('   ⏭️  Scheme already exists\n');
    } else {
      console.log('   ❌ ' + err.message + '\n');
    }
  }

  // Step 3: Update top-level concepts to add scheme reference
  console.log('3️⃣  Linking top-level concepts to scheme...\n');
  for (const concept of topLevel) {
    try {
      // PATCH concept to add conceptSchemes
      const patchBody = [
        { op: 'replace', path: '/conceptSchemes', value: [{ sys: { id: SCHEME_ID, type: 'Link', linkType: 'TaxonomyConceptScheme' } }] },
      ];
      const res = await fetch(`${BASE}/concepts/${concept.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json-patch+json', 'X-Contentful-Version': '1' },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${res.status}: ${err}`);
      }
      console.log(`   ✅ ${concept.label} linked to scheme`);
    } catch (err) {
      console.log(`   ❌ ${concept.label}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Step 4: Create child concepts (they can now reference both scheme and broader)
  console.log('\n4️⃣  Creating child concepts...\n');
  for (const concept of children) {
    try {
      await createConcept(concept);
      console.log(`   ✅ ${concept.label} (${concept.id}) → parent: ${concept.broader}`);
    } catch (err) {
      if (err.message.includes('409')) {
        console.log(`   ⏭️  ${concept.label} (already exists)`);
      } else {
        console.log(`   ❌ ${concept.label}: ${err.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nDone!');
}

main();

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

// Top-level concepts (no broader)
const topConcepts = [
  { id: 'awareness', label: 'Awareness' },
  { id: 'consideration', label: 'Consideration' },
  { id: 'decision', label: 'Decision' },
  { id: 'retention', label: 'Retention' },
];

// Sub-concepts (with broader parent)
const subConcepts = [
  { id: 'thoughtLeadership', label: 'Thought Leadership', broader: 'awareness' },
  { id: 'trendsResearch', label: 'Trends & Research', broader: 'awareness' },
  { id: 'businessCaseRoi', label: 'Business Case / ROI', broader: 'consideration' },
  { id: 'analystResearch', label: 'Analyst Research', broader: 'consideration' },
  { id: 'solutionOverview', label: 'Solution Overview', broader: 'consideration' },
  { id: 'customerStory', label: 'Customer Story', broader: 'decision' },
  { id: 'productDemo', label: 'Product Demo', broader: 'decision' },
  { id: 'competitiveDifferentiation', label: 'Competitive Differentiation', broader: 'decision' },
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
    throw new Error(`${res.status}: ${err}`);
  }
  return await res.json();
}

async function main() {
  console.log('Creating Buying Stage taxonomy concepts...\n');

  // Create top-level concepts first
  console.log('Top-level:');
  for (const c of topConcepts) {
    try {
      await createConcept(c);
      console.log(`  ✅ ${c.label} (${c.id})`);
    } catch (err) {
      console.log(`  ❌ ${c.label}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Then sub-concepts
  console.log('\nSub-concepts:');
  for (const c of subConcepts) {
    try {
      await createConcept(c);
      console.log(`  ✅ ${c.label} (${c.id}) → parent: ${c.broader}`);
    } catch (err) {
      console.log(`  ❌ ${c.label}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nDone!');
}

main();

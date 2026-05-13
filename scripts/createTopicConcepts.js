#!/usr/bin/env node
require('dotenv').config();

const organizationId = process.env.CONTENTFUL_ORGANIZATION_ID;
const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const BASE = `https://api.contentful.com/organizations/${organizationId}/taxonomy`;
const headers = {
  Authorization: `Bearer ${managementToken}`,
  'Content-Type': 'application/json',
};

const newConcepts = [
  { id: 'peopleAnalytics', label: 'People Analytics', broader: 'technologyAi' },
  { id: 'hybridFlexibleWork', label: 'Hybrid & Flexible Work', broader: 'cultureLeadership' },
  { id: 'changeManagement', label: 'Change Management', broader: 'cultureLeadership' },
  { id: 'roiBusinessImpact', label: 'ROI & Business Impact', broader: 'hrStrategy' },
  { id: 'skillsUpskilling', label: 'Skills & Upskilling', broader: 'hrStrategy' },
  { id: 'burnout', label: 'Burnout', broader: 'deiWellbeing' },
];

async function createConcept({ id, label, broader }) {
  const body = {
    sys: { id },
    uri: null,
    prefLabel: { 'en-US': label },
    definition: { 'en-US': '' },
    broader: [
      { sys: { id: broader, type: 'Link', linkType: 'TaxonomyConcept' } },
    ],
    related: [],
    conceptSchemes: [
      { sys: { id: 'topics', type: 'Link', linkType: 'TaxonomyConceptScheme' } },
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

  const data = await res.json();
  return data;
}

async function main() {
  console.log('Creating 6 new Topic sub-concepts...\n');

  for (const concept of newConcepts) {
    try {
      const result = await createConcept(concept);
      console.log(`  ✅ ${concept.label} (${concept.id}) → parent: ${concept.broader}`);
    } catch (err) {
      console.log(`  ❌ ${concept.label}: ${err.message}`);
    }
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nDone!');
}

main();

#!/usr/bin/env node
const data = require('../taxonomy_export.json');
const cs = require('../case_study_taxonomy_mapping.json');
const wb = require('../webinar_taxonomy_mapping.json');

// Build lookups
const allConceptIds = new Set(data.concepts.map(c => c.sys.id));
const conceptLabel = {};
for (const c of data.concepts) {
  conceptLabel[c.sys.id] = c.prefLabel?.['en-US'] || c.sys.id;
}

const schemeMap = {};
for (const s of data.schemes) {
  schemeMap[s.sys.id] = {
    name: s.prefLabel?.['en-US'],
    concepts: new Set(s.concepts.map(c => c.sys.id)),
    topConcepts: new Set(s.topConcepts.map(c => c.sys.id)),
  };
}

// Collect all proposed IDs
const usedIds = new Set();
for (const m of [...cs.mappings, ...wb.mappings]) {
  for (const id of (m.proposed || m.proposed_add || [])) {
    usedIds.add(id);
  }
}

// 1. Check for missing concept IDs
const missing = [...usedIds].filter(id => !allConceptIds.has(id)).sort();
if (missing.length) {
  console.log('WARNING: Concept IDs used in mappings but NOT in taxonomy:');
  missing.forEach(id => console.log('  - ' + id));
} else {
  console.log('All proposed concept IDs exist in taxonomy.\n');
}

// 2. Orphaned concepts (in taxonomy but no scheme)
console.log('=== Orphaned Concepts (no scheme) ===');
for (const c of data.concepts) {
  const inScheme = Object.values(schemeMap).some(s => s.concepts.has(c.sys.id));
  if (!inScheme) {
    console.log('  ' + c.sys.id + ' -> ' + (c.prefLabel?.['en-US'] || '?'));
  }
}

// 3. Analyze content themes NOT covered by existing taxonomy
console.log('\n=== GAP ANALYSIS: Missing Concepts by Scheme ===\n');

console.log('--- TOPICS (current: ' + schemeMap.topics.concepts.size + ' concepts) ---');
console.log('Content themes found in webinars/case studies with NO matching concept:');
const topicGaps = [
  { gap: 'ROI / Business Impact', reason: '~10 webinars focus on ROI, business case, economic impact of recognition' },
  { gap: 'Burnout', reason: '3+ webinars specifically about burnout (distinct from general Wellbeing)' },
  { gap: 'Skills / Upskilling', reason: 'Mercer skills-powered org webinar, Gallup upskilling content' },
  { gap: 'People Analytics / Workforce Intelligence', reason: 'Human Intelligence, HR dashboards, data-driven insights webinars' },
  { gap: 'Change Management', reason: 'Organon spinoff, rebrand (Corpay), cultural transformation stories' },
  { gap: 'Hybrid/Flexible Work', reason: 'Remote Work exists but no hybrid/flexible work concept - many webinars reference hybrid' },
];
topicGaps.forEach(g => console.log('  + ' + g.gap + ': ' + g.reason));

console.log('\n--- AUDIENCE (current: ' + schemeMap.audience.concepts.size + ' concepts) ---');
console.log('Audience segments found with NO matching concept:');
const audienceGaps = [
  { gap: 'HR Professionals / HR Leaders', reason: 'Nearly every webinar targets HR leaders, but no Audience concept for them (only a Topic "Human Resources")' },
  { gap: 'Total Rewards / Compensation Professionals', reason: 'Multiple webinars target comp/benefits pros specifically' },
  { gap: 'DEI Professionals / ERG Leaders', reason: '6+ DEI-focused webinars, ERG strategy content' },
  { gap: 'Learning & Development', reason: 'Skills, upskilling, performance development content' },
  { gap: 'Employee Communications', reason: 'Internal comms, employer branding referenced in several webinars' },
];
audienceGaps.forEach(g => console.log('  + ' + g.gap + ': ' + g.reason));

console.log('\n--- INDUSTRY (current: ' + schemeMap.industry.concepts.size + ' concepts) ---');
console.log('Industries referenced in content with NO matching concept:');
const industryGaps = [
  { gap: 'Education / Higher Education', reason: 'No education vertical despite being a common HR buyer segment' },
  { gap: 'Government / Public Sector', reason: 'No public sector concept' },
  { gap: 'Nonprofit', reason: 'Baystate Health, CAA, EmblemHealth are all nonprofits - no way to tag this' },
  { gap: 'Insurance (general)', reason: 'Only healthInsurance exists - no general insurance concept' },
  { gap: 'Hospitality', reason: 'hospitalityStaff exists in Audience but no Hospitality industry' },
  { gap: 'Telecommunications', reason: 'Common industry vertical, not represented' },
  { gap: 'Media & Entertainment', reason: 'No concept despite being a recognizable vertical' },
];
industryGaps.forEach(g => console.log('  + ' + g.gap + ': ' + g.reason));

console.log('\n--- REGION (current: ' + schemeMap.region.concepts.size + ' concepts) ---');
console.log('Regional gaps:');
const regionGaps = [
  { gap: 'Asia Pacific (APAC)', reason: 'No APAC region despite global customers' },
  { gap: 'Europe (specific countries)', reason: 'Only Ireland and UK - no Germany, France, etc. despite translated content' },
  { gap: 'Latin America (LATAM)', reason: 'No LATAM representation' },
  { gap: 'Australia / New Zealand', reason: 'No ANZ' },
];
regionGaps.forEach(g => console.log('  + ' + g.gap + ': ' + g.reason));

console.log('\n--- COMPANY SIZE (current: ' + schemeMap.companySize.concepts.size + ' concepts) ---');
console.log('Size gaps:');
const sizeGaps = [
  { gap: 'Upper Mid-Market / Large Enterprise split', reason: 'Some case studies used "upperMidMarket" and "largeEnterprise" in past tagging but those IDs do not exist in this scheme' },
];
sizeGaps.forEach(g => console.log('  + ' + g.gap + ': ' + g.reason));

console.log('\n--- MARKET MODEL (current: ' + schemeMap.marketModel.concepts.size + ' concepts) ---');
console.log('Market model gaps:');
const modelGaps = [
  { gap: 'Nonprofit / NGO', reason: 'Multiple case studies feature nonprofits (Baystate, CAA, EmblemHealth, First Tech credit union)' },
  { gap: 'Government / Public Sector', reason: 'Could be relevant as a market model' },
];
modelGaps.forEach(g => console.log('  + ' + g.gap + ': ' + g.reason));

console.log('\n--- POTENTIAL NEW SCHEMES ---');
console.log('Scheme concepts that might warrant their own top-level scheme:');
const newSchemes = [
  { scheme: 'Use Case / Solution', reason: 'Recognition, Performance, Feedback, Wellbeing, Skills, Service Awards — how the product is used. Currently mixed into Topics.' },
  { scheme: 'Buying Stage / Intent', reason: 'Awareness (trends), Consideration (ROI/business case), Decision (customer stories) — useful for content marketing' },
];
newSchemes.forEach(s => console.log('  + ' + s.scheme + ': ' + s.reason));

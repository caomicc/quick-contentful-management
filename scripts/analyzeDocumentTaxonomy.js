#!/usr/bin/env node
/**
 * Analyzes published documents and determines which taxonomy concepts
 * can be automatically mapped based on existing tags, titles, and teasers.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const documents = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'documents_published.json'), 'utf-8')
);
const taxonomy = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'taxonomy_export.json'), 'utf-8')
);

// Build concept lookup by scheme
const conceptsByScheme = {};
for (const c of taxonomy.concepts) {
  for (const s of c.conceptSchemes || []) {
    const sid = s.sys.id;
    if (!conceptsByScheme[sid]) conceptsByScheme[sid] = [];
    conceptsByScheme[sid].push({
      id: c.sys.id,
      label: c.prefLabel['en-US'],
      broader: (c.broader || []).map(b => b.sys.id),
    });
  }
}

// ─── TAG → TOPIC MAPPING ───
// Maps existing document tags to taxonomy topic concept IDs
const tagToTopics = {
  'topics__ai': 'ai',
  'topics__appreciation': 'appreciation',
  'topics__Awards_and_Accolades': 'awardsAccolades',
  'topics__company_culture': 'companyCulture',
  'topics__compensation_benefits': 'compensationBenefits',
  'topics__development': null, // no direct match
  'topics__engagement': 'engagement',
  'topics__experience': 'experience',
  'topics__feedback': 'feedback',
  'topics__future_of_dei': 'futureOfDei',
  'topics__future_of_work': 'futureOfWork',
  'topics__human_resources': 'humanResources',
  'topics__management_leadership': 'companyCulture', // closest match → Culture & Leadership parent
  'topics__performance': 'performance',
  'topics__recognition': 'recognition',
  'topics__remote_work': 'remoteWork',
  'topics__retention_and_turnover': 'retentionTurnover',
  'topics__surveys': null, // no direct match
  'topics__team_building': 'teamBuilding',
  'topics__wellbeing': 'wellbeing',
  'topics__back_to_basics': null, // no match
  'topics__emea': null, // this is a region, not a topic
};

// ─── TAG → REGION MAPPING ───
const tagToRegion = {
  'topics__emea': 'emea',
  'regionUs': 'unitedStates',
  'translation__french': 'emea', // French content → EMEA
  'translation__german': 'emea', // German content → EMEA
};

// ─── RESOURCE TYPE TAG → BUYING STAGE MAPPING ───
const resourceToBuyingStage = {
  'resources__research': 'awareness',        // Research = Awareness stage
  'resources__thought_leadership': 'awareness',
  'resources__workhuman_iq_report': 'awareness',
  'resources__product_briefs': 'consideration', // Product briefs = Consideration
  'resourcesGartner': 'consideration',        // Analyst = Consideration
  'resourcesGallup': 'awareness',             // Research partner
  'resourcesG2': 'decision',                  // Peer reviews = Decision
  'resourcesWhyWorkhuman': 'decision',        // Why us = Decision
};

// ─── KEYWORD-BASED SIGNALS ───
const topicKeywords = {
  ai: ['artificial intelligence', ' ai ', 'machine learning', 'generative ai', 'chatgpt', 'automation'],
  recognition: ['recognition', 'recognize', 'recognizing'],
  appreciation: ['appreciation', 'gratitude', 'thank'],
  engagement: ['engagement', 'engaged', 'disengaged'],
  wellbeing: ['wellbeing', 'well-being', 'wellness', 'mental health', 'burnout', 'stress'],
  performance: ['performance', 'performance management', 'continuous performance'],
  companyCulture: ['culture', 'workplace culture', 'company culture'],
  retentionTurnover: ['retention', 'turnover', 'attrition', 'quit', 'great resignation'],
  compensationBenefits: ['compensation', 'benefits', 'pay equity', 'salary', 'total rewards'],
  futureOfWork: ['future of work', 'hybrid work', 'remote work', 'return to office'],
  feedback: ['feedback', '360', 'check-in', 'check in', 'one-on-one', '1-on-1'],
  teamBuilding: ['team building', 'teamwork', 'collaboration'],
  humanResources: ['chro', 'hr leader', 'human resources', 'people ops'],
  futureOfDei: ['dei', 'diversity', 'equity', 'inclusion', 'belonging'],
};

// Audience keywords
const audienceKeywords = {
  executivesLeadership: ['ceo', 'cfo', 'chro', 'c-suite', 'executive', 'leader', 'leadership'],
  humanResources: ['hr ', 'human resources', 'people ops', 'talent', 'chro'],
  frontlineWorkers: ['frontline', 'deskless', 'hourly'],
};

// Industry keywords
const industryKeywords = {
  healthcare: ['healthcare', 'hospital', 'clinical', 'patient', 'nursing'],
  financialServices: ['banking', 'financial', 'insurance', 'fintech'],
  technology: ['technology', 'software', 'saas', 'tech company'],
  manufacturing: ['manufacturing', 'factory', 'production'],
  consumerGoodsRetail: ['retail', 'consumer goods', 'cpg', 'store'],
};

function textContains(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

// ─── ANALYZE EACH DOCUMENT ───
const results = [];
const stats = {
  total: documents.length,
  withTopics: 0,
  withRegion: 0,
  withBuyingStage: 0,
  withAudience: 0,
  withIndustry: 0,
  noMapping: 0,
};

for (const doc of documents) {
  const mapping = {
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    existingTags: doc.tags,
    existingConcepts: doc.concepts,
    recommended: {
      topics: [],
      region: [],
      buyingStage: [],
      audience: [],
      industry: [],
      companySize: [],
    },
    confidence: {},
  };

  const searchText = `${doc.title || ''} ${doc.teaser || ''}`;

  // Map tags → topics
  const topicSet = new Set();
  for (const tag of doc.tags) {
    if (tagToTopics[tag]) topicSet.add(tagToTopics[tag]);
  }
  // Keyword-based topic detection
  for (const [conceptId, keywords] of Object.entries(topicKeywords)) {
    if (textContains(searchText, keywords)) topicSet.add(conceptId);
  }
  mapping.recommended.topics = [...topicSet];
  mapping.confidence.topics = topicSet.size > 0 ? 'high' : 'none';

  // Map tags → region
  const regionSet = new Set();
  for (const tag of doc.tags) {
    if (tagToRegion[tag]) regionSet.add(tagToRegion[tag]);
  }
  mapping.recommended.region = [...regionSet];
  mapping.confidence.region = regionSet.size > 0 ? 'high' : 'none';

  // Map resource type → buying stage
  const stageSet = new Set();
  for (const tag of doc.tags) {
    if (resourceToBuyingStage[tag]) stageSet.add(resourceToBuyingStage[tag]);
  }
  mapping.recommended.buyingStage = [...stageSet];
  mapping.confidence.buyingStage = stageSet.size > 0 ? 'medium' : 'none';

  // Keyword → audience
  const audSet = new Set();
  for (const [conceptId, keywords] of Object.entries(audienceKeywords)) {
    if (textContains(searchText, keywords)) audSet.add(conceptId);
  }
  // Leader tags → audience
  const leaderTags = doc.tags.filter(t => t.includes('_leader'));
  for (const lt of leaderTags) {
    if (lt.includes('hr_leader')) audSet.add('executivesLeadership');
    if (lt.includes('finance_leader')) audSet.add('financeProcurement');
    if (lt.includes('healthcare_leader')) audSet.add('healthcareProfessionals');
    if (lt.includes('technology_leader')) audSet.add('informationTechnology');
    if (lt.includes('talent_acquisition')) audSet.add('executivesLeadership');
    if (lt.includes('compensation_benefits_leader')) audSet.add('financeProcurement');
  }
  mapping.recommended.audience = [...audSet];
  mapping.confidence.audience = audSet.size > 0 ? 'low' : 'none';

  // Keyword → industry
  const indSet = new Set();
  for (const [conceptId, keywords] of Object.entries(industryKeywords)) {
    if (textContains(searchText, keywords)) indSet.add(conceptId);
  }
  mapping.recommended.industry = [...indSet];
  mapping.confidence.industry = indSet.size > 0 ? 'low' : 'none';

  // Check if any mapping found
  const hasAny = Object.values(mapping.recommended).some(arr => arr.length > 0);
  if (!hasAny) stats.noMapping++;
  if (mapping.recommended.topics.length) stats.withTopics++;
  if (mapping.recommended.region.length) stats.withRegion++;
  if (mapping.recommended.buyingStage.length) stats.withBuyingStage++;
  if (mapping.recommended.audience.length) stats.withAudience++;
  if (mapping.recommended.industry.length) stats.withIndustry++;

  results.push(mapping);
}

// ─── PRINT SUMMARY ───
console.log('\n╔══════════════════════════════════════════════════════╗');
console.log('║   DOCUMENT TAXONOMY ANALYSIS – 361 Published Docs   ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

console.log('COVERAGE BY SCHEME:');
console.log('─'.repeat(50));
console.log(`  Topics:       ${stats.withTopics}/${stats.total} (${(stats.withTopics/stats.total*100).toFixed(0)}%) — from tags + keywords`);
console.log(`  Region:       ${stats.withRegion}/${stats.total} (${(stats.withRegion/stats.total*100).toFixed(0)}%) — from tags`);
console.log(`  Buying Stage: ${stats.withBuyingStage}/${stats.total} (${(stats.withBuyingStage/stats.total*100).toFixed(0)}%) — from resource type tags`);
console.log(`  Audience:     ${stats.withAudience}/${stats.total} (${(stats.withAudience/stats.total*100).toFixed(0)}%) — from leader tags + keywords`);
console.log(`  Industry:     ${stats.withIndustry}/${stats.total} (${(stats.withIndustry/stats.total*100).toFixed(0)}%) — from title/teaser keywords`);
console.log(`  No mapping:   ${stats.noMapping}/${stats.total}`);

// Topic distribution
console.log('\n\nTOPIC DISTRIBUTION (how many docs map to each topic):');
console.log('─'.repeat(50));
const topicCounts = {};
for (const r of results) {
  for (const t of r.recommended.topics) {
    topicCounts[t] = (topicCounts[t] || 0) + 1;
  }
}
const topicLabel = {};
for (const c of conceptsByScheme.topics || []) topicLabel[c.id] = c.label;
for (const [id, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(topicLabel[id] || id).padEnd(30)} ${count}`);
}

// Buying stage distribution
console.log('\n\nBUYING STAGE DISTRIBUTION:');
console.log('─'.repeat(50));
const stageCounts = {};
for (const r of results) {
  for (const s of r.recommended.buyingStage) {
    stageCounts[s] = (stageCounts[s] || 0) + 1;
  }
}
for (const [stage, count] of Object.entries(stageCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${stage.padEnd(20)} ${count}`);
}

// Audience distribution
console.log('\n\nAUDIENCE DISTRIBUTION:');
console.log('─'.repeat(50));
const audCounts = {};
for (const r of results) {
  for (const a of r.recommended.audience) {
    audCounts[a] = (audCounts[a] || 0) + 1;
  }
}
const audLabel = {};
for (const c of conceptsByScheme.audience || []) audLabel[c.id] = c.label;
for (const [id, count] of Object.entries(audCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(audLabel[id] || id).padEnd(35)} ${count}`);
}

// Tags with NO topic mapping
console.log('\n\nUNMAPPED TAGS (no taxonomy equivalent):');
console.log('─'.repeat(50));
const unmappedTags = new Set();
for (const doc of documents) {
  for (const tag of doc.tags) {
    if (tag.startsWith('topics__') && !tagToTopics[tag]) {
      unmappedTags.add(tag);
    }
  }
}
for (const t of [...unmappedTags].sort()) {
  console.log(`  ${t}`);
}

// Sample documents with rich mapping
console.log('\n\nSAMPLE MAPPINGS (first 5 docs with most taxonomy coverage):');
console.log('─'.repeat(70));
const richDocs = results
  .map(r => ({
    ...r,
    totalConcepts: Object.values(r.recommended).reduce((sum, arr) => sum + arr.length, 0),
  }))
  .sort((a, b) => b.totalConcepts - a.totalConcepts)
  .slice(0, 5);

for (const doc of richDocs) {
  console.log(`\n  "${doc.title}"`);
  console.log(`  slug: ${doc.slug}`);
  for (const [scheme, concepts] of Object.entries(doc.recommended)) {
    if (concepts.length) {
      const labels = concepts.map(cid => {
        const lookup = conceptsByScheme[scheme === 'buyingStage' ? 'buyingStage' : scheme];
        const found = (lookup || []).find(c => c.id === cid);
        return found ? found.label : cid;
      });
      console.log(`    ${scheme}: ${labels.join(', ')} [${doc.confidence[scheme]}]`);
    }
  }
}

// Save full results
const outPath = path.join(__dirname, '..', 'data', 'document_taxonomy_analysis.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\n\nFull analysis saved to: data/document_taxonomy_analysis.json`);

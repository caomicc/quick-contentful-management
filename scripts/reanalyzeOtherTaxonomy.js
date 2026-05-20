#!/usr/bin/env node
/**
 * Re-analyzes webinars, case studies, and customer snapshots using body text
 * keyword matching (with threshold). Compares against existing mappings and
 * suggests additions.
 *
 * Outputs updated mapping files if new concepts are found.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'taxonomy_export.json'), 'utf-8'));
const validIds = new Set(taxonomy.concepts.map(c => c.sys.id));

// ─── KEYWORD TABLES (same as blog/document analyzers) ───

const topicKeywords = {
  ai: ['artificial intelligence', ' ai ', 'machine learning', 'generative ai', 'chatgpt', 'automation'],
  recognition: ['recognition', 'recognize', 'recognizing', 'social recognition'],
  appreciation: ['appreciation', 'gratitude', 'thank you', 'thankful'],
  engagement: ['engagement', 'engaged', 'disengaged', 'employee engagement'],
  wellbeing: ['wellbeing', 'well-being', 'wellness', 'mental health', 'burnout', 'stress'],
  performance: ['performance management', 'continuous performance', 'performance review'],
  companyCulture: ['workplace culture', 'company culture', 'organizational culture'],
  retentionTurnover: ['retention', 'turnover', 'attrition', 'great resignation', 'quiet quitting'],
  compensationBenefits: ['compensation', 'benefits', 'pay equity', 'salary', 'total rewards'],
  futureOfWork: ['future of work', 'hybrid work', 'return to office'],
  feedback: ['feedback', '360', 'check-in', 'one-on-one', '1-on-1'],
  teamBuilding: ['team building', 'teamwork', 'collaboration', 'team bonding'],
  humanResources: ['chro', 'hr leader', 'human resources', 'people ops'],
  futureOfDei: ['dei', 'diversity', 'equity', 'inclusion', 'belonging'],
  remoteWork: ['remote work', 'work from home', 'wfh', 'virtual team'],
};

const audienceKeywords = {
  executivesLeadership: ['ceo', 'cfo', 'chro', 'c-suite', 'executive', 'senior leader'],
  humanResources: ['hr ', 'human resources', 'people ops', 'talent', 'chro', 'hr professional'],
  frontlineWorkers: ['frontline', 'deskless', 'hourly', 'essential worker'],
  peopleLeaders: ['manager', 'people leader', 'people manager', 'team lead'],
};

const industryKeywords = {
  healthcare: ['healthcare', 'hospital', 'clinical', 'patient', 'nursing'],
  financialServices: ['banking', 'financial', 'insurance', 'fintech'],
  technology: ['technology', 'software', 'saas', 'tech company'],
  manufacturingIndustrial: ['manufacturing', 'factory', 'production'],
  consumerGoodsRetail: ['retail', 'consumer goods', 'cpg', 'store'],
};

const buyingStageKeywords = {
  awareness: ['what is', 'why', 'how to', 'guide', 'tips', 'ideas', 'ways to', 'benefits of'],
  consideration: ['vs', 'versus', 'comparison', 'alternative', 'platform', 'software', 'solution'],
  decision: ['roi', 'case study', 'customer story', 'success story'],
};

// Thresholds
const BODY_TOPIC_THRESHOLD = 3;
const BODY_OTHER_THRESHOLD = 2;

function textContains(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

function countKeywordHits(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
}

function analyzeEntry(entry) {
  const titleTeaser = `${entry.title} ${entry.teaser || ''}`;
  const bodyText = entry.bodyText || '';
  const concepts = new Set();

  // Topics
  for (const [id, keywords] of Object.entries(topicKeywords)) {
    if (textContains(titleTeaser, keywords)) {
      concepts.add(id);
    } else if (bodyText && countKeywordHits(bodyText, keywords) >= BODY_TOPIC_THRESHOLD) {
      concepts.add(id);
    }
  }

  // Audience
  for (const [id, keywords] of Object.entries(audienceKeywords)) {
    if (textContains(titleTeaser, keywords)) {
      concepts.add(id);
    } else if (bodyText && countKeywordHits(bodyText, keywords) >= BODY_OTHER_THRESHOLD) {
      concepts.add(id);
    }
  }

  // Industry
  for (const [id, keywords] of Object.entries(industryKeywords)) {
    if (textContains(titleTeaser, keywords)) {
      concepts.add(id);
    } else if (bodyText && countKeywordHits(bodyText, keywords) >= BODY_OTHER_THRESHOLD) {
      concepts.add(id);
    }
  }

  // Buying stage
  for (const [id, keywords] of Object.entries(buyingStageKeywords)) {
    if (textContains(titleTeaser, keywords)) {
      concepts.add(id);
    } else if (bodyText && countKeywordHits(bodyText, keywords) >= BODY_OTHER_THRESHOLD) {
      concepts.add(id);
    }
  }

  return [...concepts].filter(id => validIds.has(id));
}

function processContentType(name, contentPath, mappingPath) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name.toUpperCase()} RE-ANALYSIS`);
  console.log('═'.repeat(60));

  if (!fs.existsSync(contentPath)) {
    console.log(`  ⚠ No content cache found at ${contentPath}. Run fetchOtherContent.js first.`);
    return null;
  }

  const entries = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
  const existingMappings = mapping.mappings;

  console.log(`  Entries: ${entries.length}, Existing mappings: ${existingMappings.length}`);
  console.log(`  Keyword source: title + teaser + body text (threshold=${BODY_TOPIC_THRESHOLD})`);

  let totalNew = 0;
  let entriesUpdated = 0;
  const updatedMappings = [];

  for (const m of existingMappings) {
    const entry = entries.find(e =>
      e.title.trim().replace(/[\u2018\u2019]/g, "'") === m.title.trim().replace(/[\u2018\u2019]/g, "'")
    );

    // Handle both formats: {proposed: [...]} and {existing: [...], proposed_add: [...]}
    const proposedConcepts = m.proposed || m.proposed_add || [];
    const existingConcepts = m.existing || [];
    const existingSet = new Set([...proposedConcepts, ...existingConcepts]);
    let newConcepts = [];

    if (entry) {
      const suggested = analyzeEntry(entry);
      newConcepts = suggested.filter(id => !existingSet.has(id) && !entry.concepts.includes(id));
    }

    if (newConcepts.length > 0) {
      totalNew += newConcepts.length;
      entriesUpdated++;
      console.log(`\n  + "${m.title}"`);
      console.log(`    existing: ${proposedConcepts.length} | adding: ${newConcepts.join(', ')}`);
      if (m.proposed) {
        updatedMappings.push({ ...m, proposed: [...m.proposed, ...newConcepts] });
      } else if (m.proposed_add) {
        updatedMappings.push({ ...m, proposed_add: [...m.proposed_add, ...newConcepts] });
      } else {
        updatedMappings.push({ ...m, proposed_add: newConcepts });
      }
    } else {
      updatedMappings.push(m);
    }
  }

  // Check for entries not in mapping
  const mappedTitles = new Set(existingMappings.map(m => m.title.trim().replace(/[\u2018\u2019]/g, "'")));
  const unmapped = entries.filter(e => !mappedTitles.has(e.title.trim().replace(/[\u2018\u2019]/g, "'")));

  if (unmapped.length > 0) {
    console.log(`\n  UNMAPPED ENTRIES (${unmapped.length} not in mapping file):`);
    for (const e of unmapped) {
      const suggested = analyzeEntry(e);
      const allConcepts = [...new Set([...e.concepts, ...suggested])];
      if (suggested.length > 0) {
        const newOnes = suggested.filter(id => !e.concepts.includes(id));
        if (newOnes.length > 0) {
          console.log(`    "${e.title}" → could add: ${newOnes.join(', ')}`);
        }
      }
    }
  }

  console.log(`\n  Summary: ${entriesUpdated} entries updated, ${totalNew} new concepts added`);

  // Write updated mapping
  const updatedMapping = { ...mapping, mappings: updatedMappings };
  fs.writeFileSync(mappingPath, JSON.stringify(updatedMapping, null, 2));
  console.log(`  Updated mapping saved to: ${path.basename(mappingPath)}`);

  return { entriesUpdated, totalNew };
}

// ─── MAIN ───

processContentType(
  'Webinars',
  path.join(__dirname, '..', 'data', 'webinars_content.json'),
  path.join(__dirname, '..', 'webinar_taxonomy_mapping.json')
);

processContentType(
  'Case Studies',
  path.join(__dirname, '..', 'data', 'case_studies_content.json'),
  path.join(__dirname, '..', 'case_study_taxonomy_mapping.json')
);

processContentType(
  'Customer Snapshots',
  path.join(__dirname, '..', 'data', 'customer_snapshots_content.json'),
  path.join(__dirname, '..', 'customer_snapshot_taxonomy_mapping.json')
);

console.log('\n\nDone. Run apply scripts to push changes to Contentful.');

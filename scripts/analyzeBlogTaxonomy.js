#!/usr/bin/env node
/**
 * Fetches all published blog posts and analyzes which taxonomy concepts
 * can be mapped based on primaryBreadcrumb, tags, title, and teaser.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const BASE = `https://api.contentful.com/spaces/${spaceId}/environments/master`;

async function fetchAllBlogPosts() {
  const all = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const url = `${BASE}/entries?content_type=blogPost&limit=${limit}&skip=${skip}&select=sys.id,sys.publishedAt,fields.title,fields.slug,fields.teaser,fields.primaryBreadcrumb,fields.date,metadata`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();

    for (const item of data.items) {
      all.push({
        id: item.sys.id,
        title: item.fields?.title?.['en-US'] || '',
        slug: item.fields?.slug?.['en-US'] || '',
        teaser: item.fields?.teaser?.['en-US'] || '',
        primaryBreadcrumb: item.fields?.primaryBreadcrumb?.['en-US'] || '',
        date: item.fields?.date?.['en-US'] || '',
        tags: (item.metadata?.tags || []).map(t => t.sys.id),
        concepts: (item.metadata?.concepts || []).map(c => c.sys.id),
      });
    }

    console.log(`  Fetched ${all.length}/${data.total}...`);
    if (all.length >= data.total) break;
    skip += limit;
  }

  return all;
}

// ─── TAXONOMY MAPPING TABLES ───

// primaryBreadcrumb → Topics concept IDs
const breadcrumbToTopics = {
  'Recognition': ['recognition'],
  'Employee Experience': ['experience'],
  'Employee Engagement': ['engagement'],
  'Engagement': ['engagement'],
  'Experience': ['experience'],
  'Company Culture': ['companyCulture'],
  'Performance': ['performance'],
  'Management/Leadership': ['companyCulture'], // maps to Culture & Leadership
  'Compensation/Benefits': ['compensationBenefits'],
  'Compensation & Benefits': ['compensationBenefits'],
  'Team Building': ['teamBuilding'],
  'Wellbeing': ['wellbeing'],
  'HR': ['humanResources'],
  'Human Resources': ['humanResources'],
  'HR Leader': ['humanResources'],
  'AI': ['ai'],
  'Artificial Intelligence': ['ai'],
  'DEI': ['futureOfDei'],
  'Diversity & Inclusion': ['futureOfDei'],
  'Future of Work': ['futureOfWork'],
  'Remote Work': ['remoteWork'],
  'Feedback': ['feedback'],
  'Retention': ['retentionTurnover'],
  'Retention & Turnover': ['retentionTurnover'],
  'Talent Acquisition': ['retentionTurnover'],
  'Awards': ['awardsAccolades'],
  'Awards and Accolades': ['awardsAccolades'],
  'Appreciation': ['appreciation'],
  'Development': ['performance'], // closest match
  'Press': ['pressReleases'],
  'Workhuman Live': ['awardsAccolades'],
  'Workhuman': ['awardsAccolades'],
  'Life at Workhuman': ['companyCulture'], // employer brand content
  'Human Workplace Index': ['engagement'], // research/survey series
  'Surveys': ['engagement'],
  'Back to Basics': ['recognition'],
  'EMEA': ['recognition'], // content is usually recognition-focused
};

// Keyword → Topics
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

// Audience keywords
const audienceKeywords = {
  executivesLeadership: ['ceo', 'cfo', 'chro', 'c-suite', 'executive', 'senior leader'],
  humanResources: ['hr ', 'human resources', 'people ops', 'talent', 'chro', 'hr professional'],
  frontlineWorkers: ['frontline', 'deskless', 'hourly', 'essential worker'],
  peopleLeaders: ['manager', 'people leader', 'people manager', 'team lead'],
};

// Buying stage — blog posts are mostly awareness/thought leadership
const buyingStageKeywords = {
  awareness: ['what is', 'why', 'how to', 'guide', 'tips', 'ideas', 'ways to', 'benefits of', 'importance of', 'meaning of'],
  consideration: ['vs', 'versus', 'comparison', 'alternative', 'platform', 'software', 'solution', 'tool'],
  decision: ['roi', 'case study', 'customer story', 'success story', 'workhuman vs'],
};

function textContains(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

async function main() {
  console.log('Fetching all published blog posts...\n');
  const blogPosts = await fetchAllBlogPosts();

  // Save raw data
  const rawPath = path.join(__dirname, '..', 'data', 'blog_posts_published.json');
  fs.writeFileSync(rawPath, JSON.stringify(blogPosts, null, 2));
  console.log(`\nSaved ${blogPosts.length} blog posts to data/blog_posts_published.json\n`);

  // ─── ANALYZE ───
  const results = [];
  const stats = {
    total: blogPosts.length,
    withTopics: 0,
    withRegion: 0,
    withBuyingStage: 0,
    withAudience: 0,
    withIndustry: 0,
    noMapping: 0,
  };

  // Collect breadcrumb distribution
  const breadcrumbCounts = {};

  for (const post of blogPosts) {
    const mapping = {
      id: post.id,
      title: post.title,
      slug: post.slug,
      primaryBreadcrumb: post.primaryBreadcrumb,
      existingTags: post.tags,
      existingConcepts: post.concepts,
      recommended: {
        topics: [],
        region: [],
        buyingStage: [],
        audience: [],
        industry: [],
      },
      confidence: {},
    };

    const searchText = `${post.title} ${post.teaser}`;
    const bc = post.primaryBreadcrumb;
    breadcrumbCounts[bc || '(none)'] = (breadcrumbCounts[bc || '(none)'] || 0) + 1;

    // Topics from breadcrumb
    const topicSet = new Set();
    if (bc && breadcrumbToTopics[bc]) {
      for (const t of breadcrumbToTopics[bc]) topicSet.add(t);
    }
    // Topics from keywords
    for (const [conceptId, keywords] of Object.entries(topicKeywords)) {
      if (textContains(searchText, keywords)) topicSet.add(conceptId);
    }
    mapping.recommended.topics = [...topicSet];
    mapping.confidence.topics = topicSet.size > 0 ? (bc && breadcrumbToTopics[bc] ? 'high' : 'medium') : 'none';

    // Buying stage — most blog content is awareness
    const stageSet = new Set();
    for (const [stage, keywords] of Object.entries(buyingStageKeywords)) {
      if (textContains(searchText, keywords)) stageSet.add(stage);
    }
    // Default: blog posts without specific signals are awareness/thought leadership
    if (stageSet.size === 0 && topicSet.size > 0) {
      stageSet.add('awareness');
    }
    mapping.recommended.buyingStage = [...stageSet];
    mapping.confidence.buyingStage = stageSet.size > 0 ? 'medium' : 'none';

    // Audience from keywords
    const audSet = new Set();
    for (const [conceptId, keywords] of Object.entries(audienceKeywords)) {
      if (textContains(searchText, keywords)) audSet.add(conceptId);
    }
    mapping.recommended.audience = [...audSet];
    mapping.confidence.audience = audSet.size > 0 ? 'low' : 'none';

    // Industry — very few blog posts are industry-specific
    mapping.recommended.industry = [];
    mapping.confidence.industry = 'none';

    // Region — blogs are generally global
    mapping.recommended.region = [];
    mapping.confidence.region = 'none';

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
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║   BLOG POST TAXONOMY ANALYSIS – ${stats.total} Published Posts   ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('COVERAGE BY SCHEME:');
  console.log('─'.repeat(55));
  console.log(`  Topics:       ${stats.withTopics}/${stats.total} (${(stats.withTopics/stats.total*100).toFixed(0)}%) — from breadcrumb + keywords`);
  console.log(`  Buying Stage: ${stats.withBuyingStage}/${stats.total} (${(stats.withBuyingStage/stats.total*100).toFixed(0)}%) — from title/teaser keywords`);
  console.log(`  Audience:     ${stats.withAudience}/${stats.total} (${(stats.withAudience/stats.total*100).toFixed(0)}%) — from title/teaser keywords`);
  console.log(`  Region:       ${stats.withRegion}/${stats.total} (${(stats.withRegion/stats.total*100).toFixed(0)}%)`);
  console.log(`  Industry:     ${stats.withIndustry}/${stats.total} (${(stats.withIndustry/stats.total*100).toFixed(0)}%)`);
  console.log(`  No mapping:   ${stats.noMapping}/${stats.total}`);

  // Breadcrumb distribution
  console.log('\n\nBREADCRUMB DISTRIBUTION:');
  console.log('─'.repeat(55));
  for (const [bc, count] of Object.entries(breadcrumbCounts).sort((a, b) => b[1] - a[1])) {
    const mapped = breadcrumbToTopics[bc] ? `→ ${breadcrumbToTopics[bc].join(', ')}` : '⚠ NO MAPPING';
    console.log(`  ${bc.padEnd(30)} ${String(count).padStart(4)}  ${mapped}`);
  }

  // Topic distribution
  console.log('\n\nTOPIC DISTRIBUTION:');
  console.log('─'.repeat(55));
  const topicCounts = {};
  for (const r of results) {
    for (const t of r.recommended.topics) {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    }
  }
  // Load taxonomy for labels
  const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'taxonomy_export.json'), 'utf-8'));
  const topicLabel = {};
  for (const c of taxonomy.concepts) {
    for (const s of c.conceptSchemes || []) {
      if (s.sys.id === 'topics') topicLabel[c.sys.id] = c.prefLabel['en-US'];
    }
  }
  for (const [id, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(topicLabel[id] || id).padEnd(30)} ${count}`);
  }

  // Buying stage distribution
  console.log('\n\nBUYING STAGE DISTRIBUTION:');
  console.log('─'.repeat(55));
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
  console.log('─'.repeat(55));
  const audCounts = {};
  for (const r of results) {
    for (const a of r.recommended.audience) {
      audCounts[a] = (audCounts[a] || 0) + 1;
    }
  }
  for (const [id, count] of Object.entries(audCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(30)} ${count}`);
  }

  // Unmapped breadcrumbs
  const unmapped = Object.keys(breadcrumbCounts).filter(bc => bc !== '(none)' && !breadcrumbToTopics[bc]);
  if (unmapped.length) {
    console.log('\n\nUNMAPPED BREADCRUMBS (no taxonomy equivalent):');
    console.log('─'.repeat(55));
    for (const bc of unmapped.sort()) {
      console.log(`  "${bc}" (${breadcrumbCounts[bc]} posts)`);
    }
  }

  // Sample rich mappings
  console.log('\n\nSAMPLE MAPPINGS (5 posts with most coverage):');
  console.log('─'.repeat(70));
  const richPosts = results
    .map(r => ({ ...r, total: Object.values(r.recommended).reduce((s, a) => s + a.length, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  for (const post of richPosts) {
    console.log(`\n  "${post.title}"`);
    console.log(`  breadcrumb: ${post.primaryBreadcrumb || '(none)'} | slug: ${post.slug}`);
    for (const [scheme, concepts] of Object.entries(post.recommended)) {
      if (concepts.length) {
        const labels = concepts.map(cid => topicLabel[cid] || cid);
        console.log(`    ${scheme}: ${labels.join(', ')} [${post.confidence[scheme]}]`);
      }
    }
  }

  // Save full analysis
  const outPath = path.join(__dirname, '..', 'data', 'blog_taxonomy_analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n\nFull analysis saved to: data/blog_taxonomy_analysis.json`);
}

main().catch(err => { console.error(err); process.exit(1); });

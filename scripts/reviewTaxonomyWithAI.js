#!/usr/bin/env node
/**
 * Uses OpenAI to review all taxonomy concepts and suggest improvements for:
 *   - altLabels: synonyms and alternate search terms
 *   - definition: what the concept is
 *   - scopeNote: when to use it (and when not to)
 *   - example: 2-3 concrete examples (companies, content types, etc.)
 *   - editorialNote: any internal flags or open questions
 *
 * Processes one scheme at a time, saves progress, supports resume.
 *
 * Usage:
 *   node scripts/reviewTaxonomyWithAI.js              # review all schemes
 *   node scripts/reviewTaxonomyWithAI.js --resume     # skip already-reviewed concepts
 *   node scripts/reviewTaxonomyWithAI.js --scheme "Industry"  # one scheme only
 *   node scripts/reviewTaxonomyWithAI.js --dry        # print prompts without calling API
 *
 * Output: data/taxonomy_ai_review.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai').default;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const args = process.argv.slice(2);
const RESUME = args.includes('--resume');
const DRY = args.includes('--dry');
const SCHEME_FILTER = args.includes('--scheme') ? args[args.indexOf('--scheme') + 1] : null;

const orgId = process.env.CONTENTFUL_ORGANIZATION_ID;
const token = process.env.CONTENTFUL_MANAGEMENT_TOKEN;
const TAXONOMY_BASE = `https://api.contentful.com/organizations/${orgId}/taxonomy`;
const headers = { Authorization: `Bearer ${token}` };

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'taxonomy_ai_review.json');

const SYSTEM_PROMPT = `You are a taxonomy and content strategy expert helping improve a B2B SaaS company's content taxonomy.

The company is Workhuman — a leading employee recognition and human connection platform used by large enterprises globally. Their content (blog posts, whitepapers, webinars, case studies) covers HR strategy, employee experience, workplace culture, DEI, and technology.

For each taxonomy concept provided, suggest improvements to:

1. **altLabels**: 3–6 alternate names, synonyms, or search terms a content tagger might use. Comma-separated.
2. **definition**: 1–2 sentences. What this concept IS. Objective, factual.
3. **scopeNote**: 1–2 sentences. When to USE this concept (and when NOT to if there's a common confusion). Practical guidance for taggers.
4. **example**: 2–3 concrete examples appropriate to the scheme type:
   - Industry: example companies (e.g., "Salesforce, ServiceNow, HubSpot")
   - Topics: example content titles or topics (e.g., "The ROI of Recognition, Building a Culture of Feedback")
   - Buying Stage: example content types (e.g., "Gartner Magic Quadrant placement, analyst reports")
   - Audience: example job titles or personas
   - Other: whatever is most useful
5. **editorialNote**: Any open questions, edge cases, or flags for the taxonomy team. Leave blank if none.

IMPORTANT:
- Keep existing values if they are already good — only suggest improvements
- Be concise and practical — these are used by content taggers, not academics
- Do NOT suggest changes to the concept name itself
- Return ONLY valid JSON, no markdown, no explanation`;

async function fetchAll(path) {
  const items = [];
  let url = `${TAXONOMY_BASE}${path}?limit=100`;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();
    items.push(...data.items);
    url = data.pages?.next ? `https://api.contentful.com${data.pages.next}` : null;
  }
  return items;
}

function getLabel(obj) {
  return obj?.prefLabel?.['en-US'] || obj?.prefLabel?.en || '';
}

function buildConceptTree(concepts) {
  const byId = new Map(concepts.map(c => [c.sys.id, c]));

  function getPath(id) {
    const c = byId.get(id);
    if (!c) return getLabel(c) || id;
    const broader = c.broader?.[0]?.sys?.id;
    if (!broader) return getLabel(c);
    return `${getPath(broader)} > ${getLabel(c)}`;
  }

  return { byId, getPath };
}

async function reviewConcept(concept, schemeName, conceptPath, existingReview) {
  const label = getLabel(concept);
  const existing = {
    altLabels: (concept.altLabels?.['en-US'] || concept.altLabels?.en || []).join(', '),
    definition: concept.definition?.['en-US'] || concept.definition?.en || '',
    scopeNote: concept.scopeNote?.['en-US'] || concept.scopeNote?.en || '',
    example: concept.example?.['en-US'] || concept.example?.en || '',
    editorialNote: concept.editorialNote?.['en-US'] || concept.editorialNote?.en || '',
  };

  const prompt = `Review this taxonomy concept and suggest improvements.

Taxonomy Scheme: ${schemeName}
Concept: ${label}
Full Path: ${conceptPath}

Current values (empty = not set):
- altLabels: ${existing.altLabels || '(none)'}
- definition: ${existing.definition || '(none)'}
- scopeNote: ${existing.scopeNote || '(none)'}
- example: ${existing.example || '(none)'}
- editorialNote: ${existing.editorialNote || '(none)'}

Return a JSON object with these exact keys:
{
  "altLabels": "comma-separated alt labels",
  "definition": "definition text",
  "scopeNote": "scope note text",
  "example": "example text",
  "editorialNote": "editorial note or empty string"
}`;

  if (DRY) {
    console.log(`\n--- DRY: ${label} (${schemeName}) ---`);
    console.log(prompt);
    return null;
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0].message.content;
  const suggested = JSON.parse(raw);

  return {
    conceptId: concept.sys.id,
    label,
    schemeName,
    path: conceptPath,
    current: existing,
    suggested,
    // Flag fields that actually changed
    changes: Object.keys(suggested).filter(key => {
      const cur = existing[key] || '';
      const sug = suggested[key] || '';
      return cur.trim() !== sug.trim() && sug.trim() !== '';
    }),
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in .env');
    process.exit(1);
  }

  console.log('Fetching taxonomy...');
  const [schemes, concepts] = await Promise.all([
    fetchAll('/concept-schemes'),
    fetchAll('/concepts'),
  ]);
  console.log(`  ${schemes.length} schemes, ${concepts.length} concepts\n`);

  // Load existing results if resuming
  let results = {};
  if (RESUME && fs.existsSync(OUTPUT_PATH)) {
    results = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    const done = Object.keys(results).length;
    console.log(`Resuming — ${done} concepts already reviewed\n`);
  }

  const schemeMap = new Map(schemes.map(s => [s.sys.id, getLabel(s)]));
  const { getPath } = buildConceptTree(concepts);

  // Filter schemes if requested
  const targetSchemes = SCHEME_FILTER
    ? schemes.filter(s => getLabel(s).toLowerCase() === SCHEME_FILTER.toLowerCase())
    : schemes;

  if (SCHEME_FILTER && targetSchemes.length === 0) {
    console.error(`Scheme "${SCHEME_FILTER}" not found. Available: ${schemes.map(getLabel).join(', ')}`);
    process.exit(1);
  }

  let reviewed = 0;
  let skipped = 0;
  let errors = 0;

  for (const scheme of targetSchemes) {
    const schemeName = getLabel(scheme);
    const schemeConcepts = concepts.filter(c =>
      (c.conceptSchemes || []).some(s => s.sys?.id === scheme.sys.id)
    );

    console.log(`\n=== ${schemeName} (${schemeConcepts.length} concepts) ===`);

    for (const concept of schemeConcepts) {
      const label = getLabel(concept);
      const conceptPath = getPath(concept.sys.id);

      if (RESUME && results[concept.sys.id]) {
        console.log(`  ↷ Skip: ${label}`);
        skipped++;
        continue;
      }

      try {
        process.stdout.write(`  → ${label}... `);
        const review = await reviewConcept(concept, schemeName, conceptPath, results[concept.sys.id]);

        if (review) {
          results[concept.sys.id] = review;
          const changeCount = review.changes.length;
          console.log(changeCount > 0 ? `${changeCount} changes` : 'no changes');
          reviewed++;

          // Save after each concept
          fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`ERROR: ${err.message}`);
        errors++;
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Reviewed: ${reviewed}`);
  console.log(`Skipped (already done): ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (!DRY) {
    // Print concepts with the most suggested changes
    const withChanges = Object.values(results)
      .filter(r => r.changes?.length > 0)
      .sort((a, b) => b.changes.length - a.changes.length);

    console.log(`\nConcepts with suggested changes: ${withChanges.length}/${Object.keys(results).length}`);
    console.log('\nTop concepts needing updates:');
    for (const r of withChanges.slice(0, 20)) {
      console.log(`  [${r.changes.join(', ')}] ${r.schemeName} > ${r.label}`);
    }

    console.log(`\nFull results saved to data/taxonomy_ai_review.json`);
    console.log('Review the suggestions, then run: node scripts/applyTaxonomyAIReview.js');
  }
}

main().catch(err => { console.error(err); process.exit(1); });

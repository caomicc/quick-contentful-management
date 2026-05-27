#!/usr/bin/env node
/**
 * Applies Buying Stage taxonomy updates based on the stakeholder's rule:
 * - Early funnel (awareness/consideration in proposal) → Awareness + Consideration
 * - Mid funnel (decision in proposal) → Decision
 *
 * Only ADDS missing top-level Buying Stage concepts. Does not remove existing sub-concepts.
 *
 * Usage:
 *   node scripts/applyBuyingStageUpdate.js          # dry run
 *   node scripts/applyBuyingStageUpdate.js --apply  # write changes
 */
require('dotenv').config();
const contentful = require('contentful-management');
const fs = require('fs');

const DRY_RUN = !process.argv.includes('--apply');
const SAFE_SCHEDULED = process.argv.includes('--safe-scheduled');

// Buying Stage concept IDs (top-level)
const BUYING_STAGE_IDS = {
  awareness: 'awareness',
  consideration: 'consideration',
  decision: 'decision',
};

// The 45 entries that need updates, derived from cross-map analysis
const UPDATES = [
  { id: '7qqa3eakTq4kIT0XhKQpYK', title: '2026 Humans at Work Barometer', add: ['consideration'] },
  { id: '41lGZjAfKAukTgM6OLeWG7', title: '2025 Workhuman Global Research Study: The Tangible Value of Appreciation', add: ['consideration'] },
  { id: '36o8AHm5Bx0PaEdCMBkrDx', title: '2025 Workhuman Global Research Study: Recognition as an Engine for Strategy', add: ['consideration'] },
  { id: '1IBEzTXbundQteLtqUb4Sx', title: '2025 Workhuman Global Research Study: The Tangible Value of Appreciation (unlisted)', add: ['awareness', 'consideration'] },
  { id: '5cO4jusZhhdqVxEu87k3ei', title: 'Feature Brief: SAP SuccessFactors Integration', add: ['awareness'] },
  { id: '6lZy0cVIlfgi3M7eqq9FlE', title: 'Feature Brief: Topics', add: ['consideration'] },
  { id: 'Hx8sJ1KQozwxrepLFiNO6', title: 'Feature Brief: Social Sharing', add: ['awareness'] },
  { id: 'lhc7eWQ1RswYRD7oqP9lM', title: 'How Work Gets Done (Now)', add: ['awareness', 'consideration'] },
  { id: '2TYornwmOoaPlylMqoej3n', title: 'Recognition as a Strategic Lever', add: ['consideration'] },
  { id: '4KSx7XSpgBxfMtD2k48M9z', title: 'Unlock the Skills-Powered Organization', add: ['consideration'] },
  { id: '7eMJE7lusYbF83joOCe5nh', title: 'The People Data Playbook', add: ['consideration'] },
  { id: '5Q2JORwOJfVH0seITlRgKI', title: 'Senior Leaders vs. Employees: Two Worlds, One Workplace', add: ['consideration'] },
  { id: '5Urwuo5zQBSnGmRYjPPjmW', title: 'The Lost Art of the 1:1 Check-in', add: ['consideration'] },
  { id: '2axahYwk7DkdBIV4saxxFQ', title: 'Upskill or Stand Still: AI Isn\'t Going to Wait for You', add: ['consideration'] },
  { id: '2hgCqeGmndTNS7LfESD4Yi', title: '4 AI-Powered Workhuman Innovations to Elevate Your Organization', add: ['consideration'] },
  { id: '6yRGSEjrN2uTCmFe6hoxaQ', title: 'The Power of Recognition Done Right', add: ['consideration', 'decision'] },
  { id: '1RjMgz0usV05dHEu8ZANQt', title: 'Guaranteed Impact: Why Workhuman Is the Strategic Recognition Partner You Need', add: ['decision'] },
  { id: '5P36zetvTZLA4LU0ICvfEy', title: 'Why Your Organization Needs Human Intelligence', add: ['decision'] },
  { id: '54Fat58ncp8gJ5zmPhKxTV', title: 'The Total Economic Impact Of Workhuman', add: ['awareness', 'decision'] },
  { id: '39zsPrYwZXipq30rLu4WRH', title: 'Executive Summary: Unlock Skills Insights with Recognition Data', add: ['consideration'] },
  { id: '5SkmcCzwcttFeS6GiySpXM', title: '5 Benefits of the #1 Recognition Rewards Store', add: ['awareness', 'decision'] },
  { id: '3JbwuaKYykWt4psAeqVngO', title: 'Product Brief: Conversations', add: ['awareness'] },
  { id: '78zwAMyVEuPWNlY6t2Z5Qv', title: 'The Evolution of Work Report', add: ['consideration'] },
  { id: '5hlgN9tphE2p2rCTKjPIhu', title: 'Think Smart, Act Smarter: 3 Tips for Success with HI', add: ['decision'] },
  { id: '2lvXyT069IvLCXfxAvoy9H', title: '12-Step Guide to Transition to Continuous Performance Management', add: ['consideration'] },
  { id: '4I8WT0WJhNkniQjujXociO', title: '12 Tips for Having Amazing Check-Ins', add: ['consideration'] },
  { id: '4DuslAwwIqCbt2xxpLNJ9q', title: 'The Case for Belonging', add: ['consideration'] },
  { id: '26Sa5wZOq9wSJn2kWAZLoy', title: '5 Ways to Thank Employees on World Gratitude Day', add: ['consideration'] },
  { id: '4pNIrgpevPw5yuKpBlTk4e', title: '11 Ways Employee Recognition Builds Better Managers', add: ['consideration'] },
  { id: '1vYUwx4OjZz4nDZ4UYKgpB', title: 'Unleashing the Human Element at Work', add: ['consideration'] },
  { id: '2wHzhnHKH2Z1doCeyoIjnn', title: '4 Powerful Ways To Fuel Employee Engagement', add: ['consideration'] },
  { id: '6samTWxf1FYVEEaSKHz5m', title: '6 Ways Recognition Drives Impact', add: ['consideration'] },
  { id: '5G4cVXRo4VlZsYDsfQi0zv', title: 'Amplifying Wellbeing at Work and Beyond', add: ['consideration'] },
  { id: '3EXoUGh8Y81O9ovEmzMW1F', title: '5 Ways Leaders Can Amplify Employee Wellbeing', add: ['consideration'] },
  { id: '7dEGoYNYxhXs7j8QDwdB68', title: '6 Tips to Increase Employee Engagement in Times of Change', add: ['consideration'] },
  { id: '6t4cN6VpDMuG0ABXnqk5XE', title: '3 Key Data Points: The Immediate and Long-Term ROI of Social Recognition', add: ['consideration'] },
  { id: '3kQT0vTVriKsRjz4VvIRtL', title: '4 Ways to Build a Connected Culture', add: ['consideration'] },
  { id: '2McYBVitbAic09UvNIryVK', title: 'Solve 7 Common Business Challenges With Recognition EMEA', add: ['consideration'] },
  { id: '7afDRVUQHyg3RqZEMRoK9a', title: '5 New Ideas to Extend DEI Beyond a One-Time Training', add: ['consideration'] },
  { id: '6nArIXb2TiTa2FBEkHobig', title: 'From Praise to Profits', add: ['awareness'] },
  { id: '7FQukE8UV3zO2wo7uawkh0', title: 'How to Build Psychological Safety', add: ['consideration'] },
  { id: '7AU8fFUg7ZR70L0RaK7L2M', title: '6 Steps to Cultivate a People-First Culture', add: ['consideration'] },
  { id: '6VzbCYKXt4YglC7A1zvXo3', title: 'Reducing Voluntary Turnover With Social Recognition', add: ['consideration', 'decision'] },
  { id: '4LN5isoWvw2Y9A5Upk3r5t', title: '7 Ways Social Recognition Improves Your Business', add: ['consideration'] },
  { id: '4wZiMcqMipLYnLoWm3skDu', title: '3 Ways Recognition Combats Economic Uncertainty', add: ['consideration'] },
];

function toConceptLinks(ids) {
  return ids.map(id => ({
    sys: { type: 'Link', linkType: 'TaxonomyConcept', id },
  }));
}

async function fetchScheduledEntryIds(space, environmentId) {
  const scheduledEntryIds = new Set();
  let next;
  do {
    const query = {
      'environment.sys.id': environmentId,
      'sys.status[in]': 'scheduled,inProgress',
      limit: 100,
    };
    if (next) query.next = next;
    const scheduledActions = await space.getScheduledActions(query);
    for (const action of scheduledActions.items || []) {
      const link = action.entity && action.entity.sys;
      if (link && link.linkType === 'Entry' && link.id) {
        scheduledEntryIds.add(link.id);
      }
    }
    next = scheduledActions.pages && scheduledActions.pages.next;
  } while (next);
  return scheduledEntryIds;
}

async function main() {
  console.log('Buying Stage Update Script');
  console.log('==========================');
  console.log(`Entries to update: ${UPDATES.length}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'APPLY (writing to Contentful)'}\n`);

  const client = contentful.createClient({
    accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
  });

  const space = await client.getSpace(process.env.CONTENTFUL_SPACE_ID);
  const environmentId = process.env.CONTENTFUL_ENVIRONMENT_ID || 'master';
  const env = await space.getEnvironment(environmentId);

  let scheduledEntryIds = new Set();
  if (SAFE_SCHEDULED) {
    scheduledEntryIds = await fetchScheduledEntryIds(space, environmentId);
    console.log(`SAFE MODE - skipping ${scheduledEntryIds.size} scheduled entries.\n`);
  }

  let updated = 0;
  let alreadyDone = 0;
  let skippedScheduled = 0;
  let errors = 0;

  for (const update of UPDATES) {
    const { id, title, add } = update;

    if (SAFE_SCHEDULED && scheduledEntryIds.has(id)) {
      console.log(`SKIP SCHEDULED: "${title}"`);
      skippedScheduled++;
      continue;
    }

    try {
      const entry = await env.getEntry(id);
      const existingConcepts = (entry.metadata?.concepts || []).map(c => c.sys.id);
      const newConcepts = add.filter(cid => !existingConcepts.includes(cid));

      if (newConcepts.length === 0) {
        console.log(`ALREADY DONE: "${title}"`);
        alreadyDone++;
        continue;
      }

      const merged = [...new Set([...existingConcepts, ...newConcepts])];

      console.log(`UPDATE: "${title}"`);
      console.log(`  Adding: ${newConcepts.join(', ')}`);
      console.log(`  Total concepts: ${existingConcepts.length} → ${merged.length}`);

      if (!DRY_RUN) {
        entry.metadata.concepts = toConceptLinks(merged);
        const saved = await entry.update();
        console.log(`  OK (v${saved.sys.version})`);
        updated++;
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        updated++;
      }
    } catch (error) {
      if (error.status === 404) {
        console.log(`NOT FOUND: "${title}" (${id})`);
      } else {
        console.log(`ERROR: "${title}" - ${error.message}`);
      }
      errors++;
    }
  }

  console.log('\n==========================');
  console.log('Results:');
  console.log(`  Updated: ${updated}`);
  console.log(`  Already done: ${alreadyDone}`);
  if (skippedScheduled) console.log(`  Skipped (scheduled): ${skippedScheduled}`);
  if (errors) console.log(`  Errors: ${errors}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLIED'}`);
}

main().catch(err => { console.error(err); process.exit(1); });

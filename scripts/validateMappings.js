#!/usr/bin/env node
/**
 * Validates all taxonomy mapping files against the current taxonomy_export.json
 */
const fs = require('fs');
const path = require('path');

const taxonomy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'taxonomy_export.json'), 'utf8'));
const validIds = new Set(taxonomy.concepts.map(c => c.sys.id));

const mappings = [
  { name: 'Webinars', file: 'webinar_taxonomy_mapping.json' },
  { name: 'Case Studies', file: 'case_study_taxonomy_mapping.json' },
  { name: 'Customer Snapshots', file: 'customer_snapshot_taxonomy_mapping.json' },
  { name: 'Documents', file: 'document_taxonomy_mapping.json' },
];

for (const m of mappings) {
  const filePath = path.join(__dirname, '..', m.file);
  if (!fs.existsSync(filePath)) {
    console.log(`${m.name}: FILE NOT FOUND`);
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const data = Array.isArray(raw) ? raw : (raw.mappings || []);
  const invalidIds = new Set();
  let totalConcepts = 0;
  for (const entry of data) {
    for (const id of (entry.proposed || [])) {
      totalConcepts++;
      if (!validIds.has(id)) invalidIds.add(id);
    }
  }
  console.log(`\n${m.name}: ${data.length} entries, ${totalConcepts} concept assignments`);
  if (invalidIds.size) {
    console.log(`  ❌ ${invalidIds.size} INVALID IDs: ${[...invalidIds].join(', ')}`);
  } else {
    console.log(`  ✅ All concept IDs valid`);
  }
}

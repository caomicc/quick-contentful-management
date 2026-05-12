#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');

const organizationId = process.env.CONTENTFUL_ORGANIZATION_ID;
const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

if (!organizationId || !managementToken) {
  console.error('Missing required env vars: CONTENTFUL_ORGANIZATION_ID, CONTENTFUL_MANAGEMENT_TOKEN');
  process.exit(1);
}

const BASE = `https://api.contentful.com/organizations/${organizationId}/taxonomy`;
const headers = {
  Authorization: `Bearer ${managementToken}`,
  'Content-Type': 'application/json',
};

async function fetchAllPages(path) {
  const items = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${BASE}${path}${sep}limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET ${url} → ${res.status}: ${body}`);
    }
    const data = await res.json();
    items.push(...data.items);
    if (items.length >= data.total) break;
    offset += limit;
  }
  return items;
}

async function main() {
  console.log('📋 Fetching taxonomy from organization:', organizationId);

  // Fetch concept schemes
  console.log('\n🔖 Concept Schemes:');
  const schemes = await fetchAllPages('/concept-schemes');

  if (schemes.length === 0) {
    console.log('  (none found)');
  } else {
    for (const scheme of schemes) {
      const name = scheme.prefLabel?.['en-US'] || scheme.prefLabel?.en || JSON.stringify(scheme.prefLabel);
      console.log(`  • ${name} (${scheme.sys.id})`);
    }
  }
  console.log(`  Total: ${schemes.length}`);

  // Fetch concepts
  console.log('\n🏷️  Concepts:');
  const concepts = await fetchAllPages('/concepts');

  if (concepts.length === 0) {
    console.log('  (none found)');
  } else {
    // Group concepts by scheme
    const byScheme = {};
    const unassigned = [];
    for (const concept of concepts) {
      const label = concept.prefLabel?.['en-US'] || concept.prefLabel?.en || JSON.stringify(concept.prefLabel);
      const schemeIds = (concept.conceptSchemes || []).map(s => s.sys?.id).filter(Boolean);
      if (schemeIds.length === 0) {
        unassigned.push({ label, id: concept.sys.id, broader: concept.broader });
      } else {
        for (const sid of schemeIds) {
          if (!byScheme[sid]) byScheme[sid] = [];
          byScheme[sid].push({ label, id: concept.sys.id, broader: concept.broader });
        }
      }
    }

    for (const scheme of schemes) {
      const name = scheme.prefLabel?.['en-US'] || scheme.prefLabel?.en || JSON.stringify(scheme.prefLabel);
      const schemeConcepts = byScheme[scheme.sys.id] || [];
      console.log(`\n  📂 ${name} (${schemeConcepts.length} concepts)`);
      printTree(schemeConcepts, '    ');
    }

    if (unassigned.length > 0) {
      console.log(`\n  📂 (unassigned) (${unassigned.length} concepts)`);
      printTree(unassigned, '    ');
    }
  }
  console.log(`\n  Total concepts: ${concepts.length}`);

  // Save raw data
  const output = { schemes, concepts };
  fs.writeFileSync('taxonomy_export.json', JSON.stringify(output, null, 2), 'utf8');
  console.log('\n✅ Raw taxonomy saved to taxonomy_export.json');
}

function printTree(concepts, indent) {
  // Build a tree from broader relationships
  const byId = new Map(concepts.map(c => [c.id, c]));
  const children = new Map();
  const roots = [];

  for (const c of concepts) {
    const parentIds = (c.broader || []).map(b => b.sys?.id).filter(Boolean);
    let isRoot = true;
    for (const pid of parentIds) {
      if (byId.has(pid)) {
        if (!children.has(pid)) children.set(pid, []);
        children.get(pid).push(c);
        isRoot = false;
      }
    }
    if (isRoot) roots.push(c);
  }

  roots.sort((a, b) => a.label.localeCompare(b.label));

  function print(node, prefix) {
    console.log(`${prefix}• ${node.label}`);
    const kids = children.get(node.id) || [];
    kids.sort((a, b) => a.label.localeCompare(b.label));
    for (const kid of kids) {
      print(kid, prefix + '  ');
    }
  }

  for (const root of roots) {
    print(root, indent);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

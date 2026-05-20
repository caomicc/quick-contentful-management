#!/usr/bin/env node
/**
 * LLM-powered taxonomy analyzer for all content types using GPT-4o-mini.
 *
 * Supports: caseStudy, customerSnapshot, document, webinar
 *
 * Usage:
 *   node scripts/analyzeContentTaxonomyLLM.js --type caseStudy [--resume] [--limit N] [--concurrency N]
 *   node scripts/analyzeContentTaxonomyLLM.js --type customerSnapshot
 *   node scripts/analyzeContentTaxonomyLLM.js --type document
 *   node scripts/analyzeContentTaxonomyLLM.js --type webinar
 *   node scripts/analyzeContentTaxonomyLLM.js --type all
 *
 * Output: data/{type}_taxonomy_llm_analysis.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai').default;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── CLI FLAGS ───
const args = process.argv.slice(2);
const TYPE = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
const RESUME = args.includes('--resume');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const CONCURRENCY = args.includes('--concurrency') ? parseInt(args[args.indexOf('--concurrency') + 1]) : 5;
const BODY_CHAR_LIMIT = 4000;

const CONTENT_TYPES = {
  caseStudy: {
    cachePath: path.join(__dirname, '..', 'data', 'case_studies_content.json'),
    outputPath: path.join(__dirname, '..', 'data', 'case_study_taxonomy_llm_analysis.json'),
    progressPath: path.join(__dirname, '..', 'data', 'case_study_taxonomy_llm_progress.json'),
    label: 'Case Studies',
    contextPrompt: `This is a CUSTOMER CASE STUDY from Workhuman. Case studies describe how a specific customer uses Workhuman's platform and the results they achieved.

Key classification guidance for case studies:
- Market Model: Assign based on the CUSTOMER'S business model (e.g., a hospital = B2B, a retailer = B2C). Also assign child concepts for their specific type.
- Industry: Assign the customer's industry (this is highly relevant for case studies — always assign if identifiable).
- Audience: Who would read this case study? Usually decision-makers evaluating Workhuman — executives, HR leaders, people leaders.
- Buying Stage: Case studies are almost always "decision" + "customerStory". May also be "consideration" + "peerValidation".
- Topics: What Workhuman capabilities/outcomes does the case study highlight?
- Company Size: Based on the customer's size if mentioned (enterprise for large orgs, midMarket for mid-size).
- Region: Based on where the customer operates if mentioned.`,
  },
  customerSnapshot: {
    cachePath: path.join(__dirname, '..', 'data', 'customer_snapshots_content.json'),
    outputPath: path.join(__dirname, '..', 'data', 'customer_snapshot_taxonomy_llm_analysis.json'),
    progressPath: path.join(__dirname, '..', 'data', 'customer_snapshot_taxonomy_llm_progress.json'),
    label: 'Customer Snapshots',
    contextPrompt: `This is a CUSTOMER SNAPSHOT from Workhuman — a brief summary of a customer's experience with Workhuman's platform (shorter than a full case study).

Key classification guidance for customer snapshots:
- Market Model: Assign based on the CUSTOMER'S business model. Also assign child concepts for their specific type.
- Industry: Assign the customer's industry (highly relevant — always assign if identifiable).
- Audience: Who would read this? Decision-makers evaluating Workhuman — executives, HR leaders.
- Buying Stage: Snapshots are "decision" + "customerStory". Also "consideration" + "peerValidation".
- Topics: What capabilities/outcomes does the snapshot highlight?
- Company Size: Based on the customer's size.
- Region: Based on where the customer operates if mentioned.`,
  },
  document: {
    cachePath: path.join(__dirname, '..', 'data', 'documents_content.json'),
    outputPath: path.join(__dirname, '..', 'data', 'document_taxonomy_llm_analysis.json'),
    progressPath: path.join(__dirname, '..', 'data', 'document_taxonomy_llm_progress.json'),
    label: 'Documents (Gated Content)',
    contextPrompt: `This is a GATED DOCUMENT (whitepaper, ebook, report, guide, infographic, etc.) from Workhuman. These are premium content assets offered behind a form to generate leads.

Key classification guidance for documents:
- Market Model: Almost always B2B (targeting enterprise buyers). Assign "b2b".
- Industry: Assign if the document targets a specific industry.
- Audience: Who is the intended reader? Usually HR leaders, executives, or specific roles depending on topic.
- Buying Stage: Documents span multiple stages:
  - Research reports / trend papers = "awareness" + "trendsResearch"
  - ROI calculators / business case docs = "consideration" + "businessCaseRoi"
  - Product overviews = "consideration" + "solutionOverview"
  - Analyst reports (Gartner, Forrester) = "consideration" + "analystResearch"
  - Implementation guides = "decision" + "implementationOnboarding"
- Topics: What is the document about? Assign all relevant topics.
- Company Size: Usually "enterprise", sometimes also "midMarket".
- Region: Assign if region-specific.`,
  },
  webinar: {
    cachePath: path.join(__dirname, '..', 'data', 'webinars_content.json'),
    outputPath: path.join(__dirname, '..', 'data', 'webinar_taxonomy_llm_analysis.json'),
    progressPath: path.join(__dirname, '..', 'data', 'webinar_taxonomy_llm_progress.json'),
    label: 'Webinars',
    contextPrompt: `This is a WEBINAR from Workhuman — an online presentation or panel discussion on HR/workplace topics, often featuring guest speakers or Workhuman executives.

Key classification guidance for webinars:
- Market Model: Almost always B2B. Assign "b2b".
- Industry: Assign if the webinar targets a specific industry.
- Audience: Who would attend this webinar? Usually HR professionals, executives, people leaders. Be specific about the child audience concept.
- Buying Stage: Webinars can be:
  - Thought leadership / trends = "awareness" + "thoughtLeadership"
  - Research presentations = "awareness" + "trendsResearch"
  - Product demos = "decision" + "productDemo"
  - Industry events / conferences = "awareness" + "industryEvents"
- Topics: What HR/workplace topics does the webinar cover?
- Company Size: Usually "enterprise".
- Region: Assign if the webinar is region-specific.`,
  },
};

// ─── VALID CONCEPT IDS (for validation) ───
const VALID_TOPICS = new Set([
  'technologyAi', 'ai', 'futureOfWork', '1akiyritkmMPT2HuLoGNGU',
  'employeeExperience', 'experience', 'engagement', 'recognition', 'appreciation', 'feedback',
  'cultureLeadership', 'companyCulture', 'teamBuilding', 'remoteWork', '1KLdYmyf8PkadV985QKbIY', '7taQE7P53ht0P37YH8KwAV',
  'hrStrategy', 'humanResources', 'performance', 'retentionTurnover', 'compensationBenefits', '3CeA7jpM1kIRBc0YW5urke', 'ghofma863u6Ud512esGm1',
  'deiWellbeing', 'futureOfDei', 'wellbeing', '2ltc2PmTjKdjKMAi1ewdqM',
  'communicationMedia', 'pressReleases', 'mediaCoverage', 'awardsAccolades', 'partnerContent',
]);
const VALID_MARKET_MODEL = new Set([
  'b2b', 'saaSProvider', 'manufacturer', 'professionalServicesFirm', 'platformProvider',
  'b2c', 'consumerBrand', 'retailer', 'consumerServices',
  'b2b2c', 'insurer', 'financialInstitution', 'marketplace',
]);
const VALID_AUDIENCE = new Set([
  'executivesLeadership', 'cSuiteExecutives', 'businessLeaders', 'departmentHeads', 'peopleLeaders', 'boardMembers', 'digitalTransformationLeaders',
  'informationTechnology', 'itLeadership', 'infrastructureTeams', 'cybersecurityTeams', 'developers', 'systemAdministrators',
  'financeProcurement', 'financeTeams', 'procurementTeams', 'accounting', 'accountsPayable', 'financialPlanningAnalysis', 'purchasingManagers',
  'operations', 'businessOperations', 'supplyChainTeams', 'facilitiesManagement', 'logisticsTeams', 'workplaceOperations', 'processManagement',
  'salesMarketing', 'salesTeams', 'demandGeneration', 'digitalMarketing', 'brandMarketing', 'revenueOperations', 'accountManagement',
  'customerService', 'customerSupport', 'callCenterTeams', 'memberServices', 'clientSuccess', 'technicalSupport', 'fieldService',
  'healthcareProfessionals', 'doctors', 'nurses', 'hospitalAdministrators', 'clinicalStaff', 'healthcareItTeams', 'careCoordinators',
  'engineersTechnicalTeams', 'softwareEngineers', 'infrastructureEngineers', 'networkEngineers', 'devOpsTeams', 'dataEngineers', 'technicalArchitects',
  'frontlineWorkers', 'retailAssociates', 'healthcareStaff', 'fieldTechnicians', 'manufacturingWorkers', 'hospitalityStaff', 'transportationWorkers',
  'consumers', 'retailCustomers', 'digitalConsumers', 'membersSubscribers', 'travelers',
]);
const VALID_BUYING_STAGE = new Set([
  'awareness', 'thoughtLeadership', 'trendsResearch', 'brandAwareness', 'industryEvents',
  'consideration', 'businessCaseRoi', 'analystResearch', 'solutionOverview', 'peerValidation', 'integrationEcosystem',
  'decision', 'customerStory', 'productDemo', 'competitiveDifferentiation', 'pricingPackaging', 'implementationOnboarding',
]);
const VALID_INDUSTRY = new Set([
  'technology', 'software', 'artificialIntelligence', 'cybersecurity', 'cloudComputing', 'hardware', 'saaS', 'dataAnalytics', 'networking', 'fintech', 'healthcareTechnology',
  'healthcare', 'hospitals', 'pharmaceuticals', 'biotechnology', 'medicalDevices', 'healthInsurance',
  'financialServices', 'banking', 'payments', 'investmentServices',
  'manufacturingIndustrial', 'industrialEquipment', 'transportationEquipment', 'powerManagement', 'engineering',
  'transportationTravel', 'aviation', 'travelServices', 'roadsideAssistance', 'automotiveServices',
  'professionalServices', 'architecture', 'consulting', 'businessServices',
  'energyUtilities', 'oilGas', 'renewableEnergy', 'utilities', 'energyTechnology',
  'consumerGoodsRetail', 'foodBeverage', 'consumerPackagedGoods', 'retail', 'ecommerce',
]);
const VALID_REGION = new Set([
  'global', 'emea', 'ireland', 'unitedKingdom', 'northAmerica', 'unitedStates', 'canada',
]);
const VALID_COMPANY_SIZE = new Set([
  'smallBusiness', 'midMarket', 'enterprise',
]);

// ─── FULL TAXONOMY REFERENCE ───
const TAXONOMY_REFERENCE = `
## Available Taxonomy Concepts

You MUST only use concept IDs from this list. Do NOT invent new IDs.

### Topics (scheme: topics)
Parent groups and their children:
- technologyAi: Technology & AI
  - ai: AI
  - futureOfWork: Future of Work
  - 1akiyritkmMPT2HuLoGNGU: People Analytics
- employeeExperience: Employee Experience
  - experience: Experience
  - engagement: Engagement
  - recognition: Recognition
  - appreciation: Appreciation
  - feedback: Feedback
- cultureLeadership: Culture & Leadership
  - companyCulture: Company Culture
  - teamBuilding: Team Building
  - remoteWork: Remote Work
  - 1KLdYmyf8PkadV985QKbIY: Hybrid & Flexible Work
  - 7taQE7P53ht0P37YH8KwAV: Change Management
- hrStrategy: HR Strategy
  - humanResources: Human Resources
  - performance: Performance
  - retentionTurnover: Retention & Turnover
  - compensationBenefits: Compensation & Benefits
  - 3CeA7jpM1kIRBc0YW5urke: ROI & Business Impact
  - ghofma863u6Ud512esGm1: Skills & Upskilling
- deiWellbeing: DEI & Wellbeing
  - futureOfDei: Future of DEI
  - wellbeing: Wellbeing
  - 2ltc2PmTjKdjKMAi1ewdqM: Burnout
- communicationMedia: Communication & Media
  - pressReleases: Press Releases
  - mediaCoverage: Media Coverage
  - awardsAccolades: Awards & Accolades
  - partnerContent: Partner Content

### Market Model (scheme: marketModel)
- b2b: B2B
  - saaSProvider: SaaS Provider
  - manufacturer: Manufacturer
  - professionalServicesFirm: Professional Services Firm
  - platformProvider: Platform Provider
- b2c: B2C
  - consumerBrand: Consumer Brand
  - retailer: Retailer
  - consumerServices: Consumer Services
- b2b2c: B2B2C
  - insurer: Insurer
  - financialInstitution: Financial Institution
  - marketplace: Marketplace

### Industry (scheme: industry)
- technology: Technology (children: software, artificialIntelligence, cybersecurity, cloudComputing, hardware, saaS, dataAnalytics, networking, fintech, healthcareTechnology)
- healthcare: Healthcare (children: hospitals, pharmaceuticals, biotechnology, medicalDevices, healthInsurance, healthcareTechnology)
- financialServices: Financial Services (children: fintech, banking, payments, investmentServices)
- manufacturingIndustrial: Manufacturing & Industrial (children: industrialEquipment, transportationEquipment, powerManagement, engineering)
- transportationTravel: Transportation & Travel (children: aviation, travelServices, roadsideAssistance, automotiveServices)
- professionalServices: Professional Services (children: engineering, architecture, consulting, businessServices)
- energyUtilities: Energy & Utilities (children: oilGas, renewableEnergy, utilities, energyTechnology)
- consumerGoodsRetail: Consumer Goods & Retail (children: foodBeverage, consumerPackagedGoods, retail, ecommerce)

### Audience (scheme: audience)
- executivesLeadership: Executives & Leadership (children: cSuiteExecutives, businessLeaders, departmentHeads, peopleLeaders, boardMembers, digitalTransformationLeaders)
- informationTechnology: Information Technology (children: itLeadership, infrastructureTeams, cybersecurityTeams, developers, systemAdministrators)
- financeProcurement: Finance & Procurement (children: financeTeams, procurementTeams, accounting, accountsPayable, financialPlanningAnalysis, purchasingManagers)
- operations: Operations (children: businessOperations, supplyChainTeams, facilitiesManagement, logisticsTeams, workplaceOperations, processManagement)
- salesMarketing: Sales & Marketing (children: salesTeams, demandGeneration, digitalMarketing, brandMarketing, revenueOperations, accountManagement)
- customerService: Customer Service (children: customerSupport, callCenterTeams, memberServices, clientSuccess, technicalSupport, fieldService)
- healthcareProfessionals: Healthcare Professionals (children: doctors, nurses, hospitalAdministrators, clinicalStaff, healthcareItTeams, careCoordinators)
- engineersTechnicalTeams: Engineers & Technical Teams (children: softwareEngineers, infrastructureEngineers, networkEngineers, devOpsTeams, dataEngineers, technicalArchitects)
- frontlineWorkers: Frontline Workers (children: retailAssociates, healthcareStaff, fieldTechnicians, manufacturingWorkers, hospitalityStaff, transportationWorkers)
- consumers: Consumers (children: retailCustomers, digitalConsumers, membersSubscribers, travelers)

### Buying Stage (scheme: buyingStage)
- awareness: Awareness (children: thoughtLeadership, trendsResearch, brandAwareness, industryEvents)
- consideration: Consideration (children: businessCaseRoi, analystResearch, solutionOverview, peerValidation, integrationEcosystem)
- decision: Decision (children: customerStory, productDemo, competitiveDifferentiation, pricingPackaging, implementationOnboarding)

### Region (scheme: region)
- global: Global
- emea: EMEA (children: ireland, unitedKingdom)
- northAmerica: North America (children: unitedStates, canada)

### Company Size (scheme: companySize)
- smallBusiness: Small Business
- midMarket: Mid-Market
- enterprise: Enterprise
`;

// ─── BUILD SYSTEM PROMPT ───
function buildSystemPrompt(contentTypeConfig) {
  return `You are a taxonomy classification expert for Workhuman's content. Workhuman is a B2B enterprise SaaS company that sells employee recognition, rewards, and performance management software to large organizations.

Your job is to analyze content and assign the most relevant taxonomy concepts from the provided taxonomy structure. Be thorough — assign ALL concepts that genuinely apply.

${contentTypeConfig.contextPrompt}

${TAXONOMY_REFERENCE}

## General Rules:
1. Assign BOTH parent AND child concepts when applicable (e.g., if about "Recognition", assign both "employeeExperience" and "recognition").
2. For Topics: Assign 2-8 topic concepts. Most content covers multiple topics.
3. For Market Model: Assign based on context. Include child concepts for specific types.
4. For Audience: Think about WHO would consume this content. Assign 1-4 audience concepts (parents + children).
5. For Buying Stage: Assign parent stage + the most relevant child concept.
6. For Industry: Only assign if the content specifically discusses or targets a particular industry. Always include the parent industry AND the specific child.
7. For Region: Assign "global" unless the content is specifically about a geographic region.
8. For Company Size: Assign based on the target organization size.

## Output Format:
Return a JSON object with these fields:
{
  "topics": ["conceptId1", "conceptId2", ...],
  "marketModel": ["conceptId1", ...],
  "audience": ["conceptId1", ...],
  "buyingStage": ["conceptId1", ...],
  "industry": ["conceptId1", ...],
  "region": ["conceptId1", ...],
  "companySize": ["conceptId1", ...],
  "reasoning": "Brief 1-2 sentence explanation of your classification choices"
}`;
}

// ─── ANALYSIS FUNCTION ───
async function analyzeEntry(entry, systemPrompt) {
  const bodyTruncated = (entry.bodyText || '').slice(0, BODY_CHAR_LIMIT);

  const userMessage = `Classify this content:

Title: ${entry.title}
${entry.teaser ? `Teaser/Description: ${entry.teaser}` : ''}
${entry.primaryBreadcrumb ? `Category: ${entry.primaryBreadcrumb}` : ''}

${bodyTruncated ? `Body text:\n${bodyTruncated}` : '(No body text available — classify based on title and teaser only)'}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const content = response.choices[0].message.content;
  const result = JSON.parse(content);

  // Validate concept IDs against known valid sets
  const validated = {
    topics: (result.topics || []).filter(id => VALID_TOPICS.has(id)),
    marketModel: (result.marketModel || []).filter(id => VALID_MARKET_MODEL.has(id)),
    audience: (result.audience || []).filter(id => VALID_AUDIENCE.has(id)),
    buyingStage: (result.buyingStage || []).filter(id => VALID_BUYING_STAGE.has(id)),
    industry: (result.industry || []).filter(id => VALID_INDUSTRY.has(id)),
    region: (result.region || []).filter(id => VALID_REGION.has(id)),
    companySize: (result.companySize || []).filter(id => VALID_COMPANY_SIZE.has(id)),
  };

  return {
    id: entry.id,
    title: entry.title,
    slug: entry.slug,
    recommended: validated,
    reasoning: result.reasoning || '',
    usage: {
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
    },
  };
}

// ─── BATCH PROCESSING ───
async function processWithConcurrency(items, fn, concurrency) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        console.error(`  ERROR on "${items[i].title}": ${err.message}`);
        results[i] = {
          id: items[i].id,
          title: items[i].title,
          slug: items[i].slug,
          error: err.message,
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── PROCESS A SINGLE CONTENT TYPE ───
async function processContentType(typeKey) {
  const config = CONTENT_TYPES[typeKey];
  if (!config) {
    console.error(`Unknown content type: ${typeKey}. Valid: ${Object.keys(CONTENT_TYPES).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Processing: ${config.label} (${typeKey})`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Model: gpt-4o-mini | Concurrency: ${CONCURRENCY} | Body limit: ${BODY_CHAR_LIMIT} chars`);

  // Load content cache
  if (!fs.existsSync(config.cachePath)) {
    console.error(`ERROR: ${path.basename(config.cachePath)} not found.`);
    return;
  }
  const entries = JSON.parse(fs.readFileSync(config.cachePath, 'utf-8'));
  console.log(`Loaded ${entries.length} entries from cache.`);

  // Load progress if resuming
  let completed = {};
  if (RESUME && fs.existsSync(config.progressPath)) {
    const progress = JSON.parse(fs.readFileSync(config.progressPath, 'utf-8'));
    progress.forEach(p => { completed[p.id] = p; });
    console.log(`Resuming: ${Object.keys(completed).length} already processed.`);
  }

  // Filter to unprocessed
  let toProcess = entries.filter(e => !completed[e.id]);
  if (LIMIT) {
    toProcess = toProcess.slice(0, LIMIT);
  }
  console.log(`To process: ${toProcess.length} entries${LIMIT ? ` (limited to ${LIMIT})` : ''}\n`);

  if (toProcess.length === 0) {
    console.log('Nothing to process.');
    return;
  }

  const systemPrompt = buildSystemPrompt(config);

  // Process in batches
  const BATCH_SIZE = 20;
  let totalTokens = 0;
  let processed = 0;
  const startTime = Date.now();

  for (let batchStart = 0; batchStart < toProcess.length; batchStart += BATCH_SIZE) {
    const batch = toProcess.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} entries)...`);

    const results = await processWithConcurrency(batch, async (entry) => {
      const result = await analyzeEntry(entry, systemPrompt);
      const tokens = (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0);
      totalTokens += tokens;
      processed++;

      if (processed % 10 === 0 || processed === toProcess.length) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        const remaining = (toProcess.length - processed) / rate;
        console.log(`  Progress: ${processed}/${toProcess.length} | ${rate.toFixed(1)}/sec | ~${Math.ceil(remaining / 60)}min remaining | ${(totalTokens / 1000).toFixed(0)}K tokens`);
      }

      return result;
    }, CONCURRENCY);

    // Save progress
    results.forEach(r => { if (r && r.id) completed[r.id] = r; });
    const allResults = Object.values(completed);
    fs.writeFileSync(config.progressPath, JSON.stringify(allResults, null, 2));
  }

  // Write final output
  const allResults = Object.values(completed);
  fs.writeFileSync(config.outputPath, JSON.stringify(allResults, null, 2));

  // Stats
  const elapsed = (Date.now() - startTime) / 1000;
  const errors = allResults.filter(r => r.error).length;
  const successful = allResults.filter(r => !r.error);
  const avgTopics = successful.reduce((s, r) => s + (r.recommended?.topics?.length || 0), 0) / (successful.length || 1);
  const avgConcepts = successful.reduce((s, r) => s + Object.values(r.recommended || {}).flat().length, 0) / (successful.length || 1);
  const withIndustry = successful.filter(r => (r.recommended?.industry?.length || 0) > 0).length;

  console.log(`\n--- ${config.label} Results ---`);
  console.log(`Processed: ${processed} in ${(elapsed / 60).toFixed(1)} minutes`);
  console.log(`Errors: ${errors}`);
  console.log(`Avg concepts/entry: ${avgConcepts.toFixed(1)} | Avg topics: ${avgTopics.toFixed(1)}`);
  console.log(`With industry: ${withIndustry}/${successful.length}`);
  console.log(`Tokens: ${(totalTokens / 1000).toFixed(0)}K`);
  console.log(`Output: ${config.outputPath}\n`);
}

// ─── MAIN ───
async function main() {
  if (!TYPE) {
    console.error('Usage: node scripts/analyzeContentTaxonomyLLM.js --type <caseStudy|customerSnapshot|document|webinar|all>');
    process.exit(1);
  }

  console.log('=== LLM-Powered Content Taxonomy Analyzer ===\n');

  if (TYPE === 'all') {
    for (const typeKey of Object.keys(CONTENT_TYPES)) {
      await processContentType(typeKey);
    }
  } else {
    await processContentType(TYPE);
  }

  console.log('\n=== ALL DONE ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

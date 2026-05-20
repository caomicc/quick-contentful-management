#!/usr/bin/env node
/**
 * LLM-powered blog taxonomy analyzer using GPT-4o-mini.
 *
 * Reads each blog post (title, teaser, body) and asks the LLM to assign
 * taxonomy concepts from all 7 schemes with reasoning.
 *
 * Features:
 * - Processes in batches with concurrency control
 * - Saves progress every batch (resumable)
 * - Structured JSON output via response_format
 * - Truncates body to ~4000 chars to stay within token limits
 *
 * Usage:
 *   node scripts/analyzeBlogTaxonomyLLM.js [--resume] [--limit N] [--concurrency N]
 *
 * Output: data/blog_taxonomy_llm_analysis.json
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai').default;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONTENT_CACHE_PATH = path.join(__dirname, '..', 'data', 'blog_posts_content.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'blog_taxonomy_llm_analysis.json');
const PROGRESS_PATH = path.join(__dirname, '..', 'data', 'blog_taxonomy_llm_progress.json');

// ─── CLI FLAGS ───
const args = process.argv.slice(2);
const RESUME = args.includes('--resume');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const CONCURRENCY = args.includes('--concurrency') ? parseInt(args[args.indexOf('--concurrency') + 1]) : 5;
const BODY_CHAR_LIMIT = 4000;

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

const SYSTEM_PROMPT = `You are a taxonomy classification expert for Workhuman's blog. Workhuman is a B2B enterprise SaaS company that sells employee recognition, rewards, and performance management software to large organizations.

Your job is to analyze each blog post and assign the most relevant taxonomy concepts from the provided taxonomy structure. Be thorough — assign ALL concepts that genuinely apply.

${TAXONOMY_REFERENCE}

## Rules:
1. Assign BOTH parent AND child concepts when applicable (e.g., if a post is about "Recognition", assign both "employeeExperience" and "recognition").
2. For Topics: Assign 2-8 topic concepts. Most posts cover multiple topics.
3. For Market Model: Almost all Workhuman blog posts target B2B buyers. Assign "b2b" unless the post specifically targets consumers. If discussing a specific customer type (SaaS, manufacturing, etc.), add that child concept too.
4. For Audience: Think about WHO would read this. HR leaders, executives, people managers are the primary audience for most posts. Assign 1-4 audience concepts (parents + children).
5. For Buying Stage:
   - "awareness" + "thoughtLeadership" for educational/thought leadership content
   - "awareness" + "trendsResearch" for research/data/survey content
   - "consideration" + relevant children for comparison/evaluation content
   - "decision" + "customerStory" for customer case studies referenced in posts
   - Most blog posts are awareness-stage thought leadership
6. For Industry: Only assign if the post specifically discusses or targets a particular industry. Leave empty if generic.
7. For Region: Assign "global" unless the content is specifically about a geographic region.
8. For Company Size: Assign "enterprise" for most posts (Workhuman's target market). Add "midMarket" if the post applies to mid-size companies too.
9. "Life at Workhuman" posts (careers/culture content about Workhuman itself): these target job seekers, not buyers. Give them minimal taxonomy — skip marketModel and buyingStage, just assign relevant topics (companyCulture, etc.) and region.

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

// ─── RETRY WITH BACKOFF ───

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callWithRetry(fn, maxRetries = 5) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 429 && attempt < maxRetries) {
        // Parse retry-after from error or use exponential backoff
        const waitMs = Math.min(1000 * Math.pow(2, attempt), 30000) + Math.random() * 1000;
        console.log(`    Rate limited, waiting ${(waitMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(waitMs);
      } else {
        throw err;
      }
    }
  }
}

// ─── ANALYSIS FUNCTION ───

async function analyzePost(post) {
  const bodyTruncated = (post.bodyText || '').slice(0, BODY_CHAR_LIMIT);

  const userMessage = `Classify this blog post:

Title: ${post.title}
Primary Breadcrumb Category: ${post.primaryBreadcrumb || '(none)'}
Teaser: ${post.teaser || '(none)'}

Body (first ${BODY_CHAR_LIMIT} chars):
${bodyTruncated}`;

  const response = await callWithRetry(() => openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  }));

  const content = response.choices[0].message.content;
  const result = JSON.parse(content);

  // Normalize fields to arrays (LLM sometimes returns strings for single values)
  const toArray = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.length > 0) return [val];
    return [];
  };

  // Validate concept IDs against known valid sets
  const validated = {
    topics: toArray(result.topics).filter(id => VALID_TOPICS.has(id)),
    marketModel: toArray(result.marketModel).filter(id => VALID_MARKET_MODEL.has(id)),
    audience: toArray(result.audience).filter(id => VALID_AUDIENCE.has(id)),
    buyingStage: toArray(result.buyingStage).filter(id => VALID_BUYING_STAGE.has(id)),
    industry: toArray(result.industry).filter(id => VALID_INDUSTRY.has(id)),
    region: toArray(result.region).filter(id => VALID_REGION.has(id)),
    companySize: toArray(result.companySize).filter(id => VALID_COMPANY_SIZE.has(id)),
  };

  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    primaryBreadcrumb: post.primaryBreadcrumb,
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

// ─── MAIN ───

async function main() {
  console.log('=== LLM-Powered Blog Taxonomy Analyzer ===');
  console.log(`Model: gpt-4o-mini | Concurrency: ${CONCURRENCY} | Body limit: ${BODY_CHAR_LIMIT} chars`);

  // Load content cache
  if (!fs.existsSync(CONTENT_CACHE_PATH)) {
    console.error('ERROR: blog_posts_content.json not found. Run fetchBlogContent.js first.');
    process.exit(1);
  }
  const posts = JSON.parse(fs.readFileSync(CONTENT_CACHE_PATH, 'utf-8'));
  console.log(`Loaded ${posts.length} blog posts from cache.`);

  // Load progress if resuming
  let completed = {};
  if (RESUME && fs.existsSync(PROGRESS_PATH)) {
    const progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
    progress.forEach(p => { completed[p.id] = p; });
    console.log(`Resuming: ${Object.keys(completed).length} already processed.`);
  }

  // Filter to unprocessed posts
  let toProcess = posts.filter(p => !completed[p.id]);

  // Exclude Life at Workhuman from priority processing (do them last or separately)
  const lifeAtWH = toProcess.filter(p => p.primaryBreadcrumb === 'Life at Workhuman');
  const mainPosts = toProcess.filter(p => p.primaryBreadcrumb !== 'Life at Workhuman');
  toProcess = [...mainPosts, ...lifeAtWH];

  if (LIMIT) {
    toProcess = toProcess.slice(0, LIMIT);
  }

  console.log(`To process: ${toProcess.length} posts${LIMIT ? ` (limited to ${LIMIT})` : ''}`);
  console.log(`Skipping: ${lifeAtWH.length} "Life at Workhuman" posts (processed last)\n`);

  // Process in batches of 20 for progress saves
  const BATCH_SIZE = 20;
  let totalTokens = 0;
  let processed = 0;
  const startTime = Date.now();

  for (let batchStart = 0; batchStart < toProcess.length; batchStart += BATCH_SIZE) {
    const batch = toProcess.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} posts)...`);

    const results = await processWithConcurrency(batch, async (post, i) => {
      const result = await analyzePost(post);
      const tokens = (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0);
      totalTokens += tokens;
      processed++;

      if (processed % 10 === 0) {
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
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(allResults, null, 2));
  }

  // Write final output
  const allResults = Object.values(completed);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allResults, null, 2));

  // Stats
  const elapsed = (Date.now() - startTime) / 1000;
  const errors = allResults.filter(r => r.error).length;
  const estimatedCost = (totalTokens / 1_000_000) * 0.15; // $0.15/M input tokens (rough)

  console.log(`\n=== COMPLETE ===`);
  console.log(`Processed: ${processed} posts in ${(elapsed / 60).toFixed(1)} minutes`);
  console.log(`Errors: ${errors}`);
  console.log(`Total tokens: ${(totalTokens / 1000).toFixed(0)}K (~$${estimatedCost.toFixed(2)} estimated)`);
  console.log(`Output: ${OUTPUT_PATH}`);

  // Quick coverage summary
  const successful = allResults.filter(r => !r.error);
  const avgTopics = successful.reduce((s, r) => s + (r.recommended?.topics?.length || 0), 0) / successful.length;
  const avgAudience = successful.reduce((s, r) => s + (r.recommended?.audience?.length || 0), 0) / successful.length;
  const avgBuyingStage = successful.reduce((s, r) => s + (r.recommended?.buyingStage?.length || 0), 0) / successful.length;
  const withMarketModel = successful.filter(r => (r.recommended?.marketModel?.length || 0) > 0).length;
  const withIndustry = successful.filter(r => (r.recommended?.industry?.length || 0) > 0).length;

  console.log(`\n--- Coverage Summary ---`);
  console.log(`Avg topics/post: ${avgTopics.toFixed(1)}`);
  console.log(`Avg audience/post: ${avgAudience.toFixed(1)}`);
  console.log(`Avg buyingStage/post: ${avgBuyingStage.toFixed(1)}`);
  console.log(`Posts with marketModel: ${withMarketModel}/${successful.length}`);
  console.log(`Posts with industry: ${withIndustry}/${successful.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

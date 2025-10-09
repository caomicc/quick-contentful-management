# Content Type Usage Audit

This script analyzes all content types in your Contentful space to help you identify bloat and understand content distribution. It shows published vs draft counts for each content type and highlights potential issues.

## What It Does

The script:
1. **Fetches all content types** from your Contentful space
2. **Counts published and draft entries** for each content type
3. **Identifies potential bloat** - content types with zero or very few published entries
4. **Generates a comprehensive report** with statistics and recommendations
5. **Creates a CSV export** for further analysis

## Why This Is Useful

Content type bloat can cause:
- 🚨 **Slower Contentful interface** - too many unused content types
- 🚨 **Developer confusion** - unclear which content types are actually used
- 🚨 **Maintenance overhead** - managing unused schemas
- 🚨 **License costs** - paying for unused content types in some plans
- 🚨 **Content strategy confusion** - unclear content model

## Prerequisites

- Node.js installed
- `.env` file configured with:
  - `CONTENTFUL_SPACE_ID`
  - `CONTENTFUL_SOURCE_ENVIRONMENT_ID`
  - `CONTENTFUL_MANAGEMENT_TOKEN`

## Usage

```bash
# Run the audit
node auditContentTypeCounts.js

# Show help
node auditContentTypeCounts.js --help
```

## Output

### Console Report

The script provides a comprehensive console report:

```
📊 CONTENT TYPE USAGE REPORT
════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
📅 Generated: 10/9/2025, 2:30:45 PM
📈 Total Published Entries: 1,234
📝 Total Draft Entries: 567
📊 Total Entries: 1,801
📋 Total Content Types: 45
════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

🏆 TOP CONTENT TYPES BY PUBLISHED COUNT:
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Content Type                   Published   Drafts    Total Description
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
1. Blog Post                        234       45      279 Main blog content for the website
2. Page                             156       23      179 Standard website pages
3. News Article                      89       12      101 Company news and announcements
4. Case Study                        67        8       75 Customer success stories
5. Landing Page                      45        5       50 Marketing campaign landing pages
```

### Issues Identified

The script highlights several types of potential bloat:

#### 🚨 Zero Published Entries (Potential Bloat)
```
• Test Content Type (testContentType) - 3 drafts
• Old Campaign (oldCampaign) - 0 drafts
• Deprecated Feature (deprecatedFeature) - 1 drafts
```

#### ⚠️ Very Few Published Entries (≤5)
```
• FAQ Section (faqSection) - 2 published, 1 drafts
• Team Member (teamMember) - 4 published, 0 drafts
```

#### 📝 Only Draft Entries
```
• New Product Launch (newProductLaunch) - 5 drafts
• Beta Feature (betaFeature) - 2 drafts
```

#### 🗑️ Completely Empty
```
• Unused Template (unusedTemplate)
• Old Integration (oldIntegration)
```

### CSV Export

The script generates `content_type_counts.csv` with columns:
- **Content Type ID** - Contentful ID of the content type
- **Content Type Name** - Display name
- **Published Count** - Number of published entries
- **Draft Count** - Number of draft entries
- **Total Count** - Total entries (published + draft)
- **Last Updated** - When the content type was last modified
- **Description** - Content type description
- **Contentful Link** - Direct link to the content type in Contentful

### Summary Statistics

```
📈 SUMMARY STATISTICS:
• Active content types (with published content): 28
• Unused content types (zero published): 17
• Average published entries per active type: 44
• Content type utilization: 62%
```

## Interpreting the Results

### 🟢 Healthy Content Types
- **High published count** (>20 entries)
- **Low draft-to-published ratio** (<50%)
- **Regular usage** (recently updated)

### 🟡 Review Needed
- **Very few published entries** (1-5)
- **High draft-to-published ratio** (>50%)
- **Old but still used** (not updated recently)

### 🔴 Potential Bloat
- **Zero published entries**
- **Only draft entries that are old**
- **Completely empty content types**
- **Deprecated or test content types**

## Common Bloat Scenarios

### Test Content Types
```
• Test Blog Post (testBlogPost) - 0 published, 3 drafts
• Demo Content (demoContent) - 0 published, 1 drafts
```
**Action**: Usually safe to delete after backing up any useful drafts

### Deprecated Features
```
• Old Product Feature (oldProductFeature) - 0 published, 0 drafts
• Legacy Integration (legacyIntegration) - 0 published, 0 drafts
```
**Action**: Safe to delete if no longer needed

### Underutilized Content Types
```
• Event (event) - 2 published, 1 drafts
• Testimonial (testimonial) - 3 published, 0 drafts
```
**Action**: Consider consolidating with similar content types

### Work in Progress
```
• New Campaign (newCampaign) - 0 published, 8 drafts
• Upcoming Feature (upcomingFeature) - 0 published, 12 drafts
```
**Action**: Keep if actively being developed, review timeline

## Recommended Actions

### 1. Review Zero Published Entries
- Check if these are test/development content types
- Verify if they're still needed
- Consider deleting unused ones

### 2. Consolidate Similar Content Types
- Look for content types that serve similar purposes
- Consider merging underutilized types
- Simplify your content model

### 3. Clean Up Drafts
- Review old draft entries in unused content types
- Publish valuable content or delete outdated drafts
- Archive content that might be needed later

### 4. Update Documentation
- Document which content types are actively used
- Add descriptions to content types without them
- Create content strategy guidelines

## Performance Notes

- **Large spaces** (1000+ content types) may take several minutes
- **Rate limiting** built in (200ms delay between requests)
- **Memory usage** scales with number of content types
- **API limits** - respects Contentful's rate limits

## Example Workflow

```bash
# 1. Run the audit
node auditContentTypeCounts.js

# 2. Review the console output and CSV
# Focus on content types with zero published entries

# 3. Check unused content types in Contentful
# Verify they're not needed before deleting

# 4. Clean up drafts in unused content types
# Use other scripts to archive/delete orphaned content

# 5. Consider consolidating similar content types
# Plan content model improvements

# 6. Re-run the audit to see improvements
node auditContentTypeCounts.js
```

## Integration with Other Scripts

This audit pairs well with other content management scripts:

- **After finding unused content types**: Use `auditOrphanedEntries.js` to find orphaned content
- **Before deleting content types**: Use `archiveOrphanedEntries.js` to clean up drafts
- **For active content types**: Use `auditDraftReferences.js` to ensure quality

## Common Content Types to Review

Based on typical Contentful usage, these are often candidates for cleanup:

### Usually Safe to Delete
- `test*` - Test content types
- `demo*` - Demo content types  
- `old*` - Old/deprecated content types
- `temp*` - Temporary content types

### Review Carefully
- `*Template` - Template content types (might be used programmatically)
- `*Config` - Configuration content types (might be used by code)
- `*Settings` - Settings content types (might be used by applications)

### Usually Keep
- `page` - Main page content
- `blogPost` - Blog content
- `newsArticle` - News content
- `*Landing` - Landing pages (high value)

## CSV Analysis Tips

Open the CSV in Excel/Google Sheets for advanced analysis:

1. **Sort by Published Count** - Find highest/lowest usage
2. **Filter by Zero Published** - Focus on potential bloat
3. **Calculate Ratios** - Draft-to-published ratios
4. **Group by Patterns** - Look for naming patterns that indicate test/temp content
5. **Timeline Analysis** - Sort by Last Updated to find abandoned content types

## Output Files

- `content_type_counts.csv` - Main report with all data
- Console output - Human-readable summary and recommendations

The CSV can be imported into other tools for further analysis or shared with stakeholders to make content strategy decisions.

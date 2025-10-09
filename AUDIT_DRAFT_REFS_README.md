# Audit Draft References (Generic)

This script audits any content type in Contentful for references to draft, archived, or missing content. It's a generic version that works with any content type, not just blog posts.

## What It Does

The script:
1. Fetches all entries of a specified content type
2. Extracts all referenced entry IDs from each entry (including references in rich text fields)
3. Checks the status of each referenced entry
4. Identifies references to:
   - **Draft entries** (not published)
   - **Archived entries** (archived)
   - **Missing entries** (deleted or non-existent)
5. Generates a CSV report with all findings

## Prerequisites

- Node.js installed
- `.env` file configured with:
  - `CONTENTFUL_SPACE_ID`
  - `CONTENTFUL_SOURCE_ENVIRONMENT_ID`
  - `CONTENTFUL_MANAGEMENT_TOKEN`

## Usage

### Basic Usage

```bash
# Audit blog posts (default)
node auditDraftReferences.js

# Audit pages
node auditDraftReferences.js -t page

# Audit news articles
node auditDraftReferences.js -t newsArticle

# Audit webinars
node auditDraftReferences.js -t webinar

# Audit case studies
node auditDraftReferences.js -t caseStudy
```

### Advanced Usage

```bash
# Include draft entries in the audit (not just published)
node auditDraftReferences.js -t page --include-drafts

# Show help
node auditDraftReferences.js --help
```

## Command Line Options

- `--content-type`, `-t` - Content type to audit (default: `blogPost`)
- `--include-drafts` - Include draft entries in the audit (by default, only published entries are checked)
- `--help`, `-h` - Show help message

## Output

### CSV Report

The script generates: `<contentType>_with_draft_references.csv`

For example:
- `blogPost_with_draft_references.csv`
- `page_with_draft_references.csv`
- `newsArticle_with_draft_references.csv`

The CSV includes:
- **Entry ID** - Contentful ID of the entry
- **Entry Content Type** - Content type of the entry
- **Entry Title** - Title of the entry
- **Entry Slug** - URL slug (if available)
- **Entry Status** - Published or Draft
- **Entry Updated At** - Last update timestamp
- **Referenced Entry ID** - ID of the problematic referenced entry
- **Referenced Content Type** - Content type of the referenced entry
- **Referenced Status** - Status (Draft, Archived, or Missing/Deleted)
- **Referenced Title** - Title of the referenced entry (if available)
- **Contentful Entry Link** - Direct link to the entry in Contentful
- **Contentful Referenced Entry Link** - Direct link to the referenced entry

### Console Output

```
Fetching all page entries...
Total page entries fetched: 87
Published page entries: 78

Fetching all entries to check their status...
Total entries fetched: 8234

Analyzing page entries for draft references...

📊 Found 5 page entries with draft or archived references
✅ Report saved to page_with_draft_references.csv

📋 Summary by page Entry:
────────────────────────────────────────────────────────────────────────────────
1. About Us
   ID: 2XKM78bOAvSHLX76f97DiE
   Slug: about-us
   Status: Published
   Draft References: 2
   Archived References: 1
```

## Common Use Cases

### Audit Different Content Types

```bash
# Blog posts
node auditDraftReferences.js -t blogPost

# Pages
node auditDraftReferences.js -t page

# News articles
node auditDraftReferences.js -t newsArticle

# Webinars
node auditDraftReferences.js -t webinar

# Case studies
node auditDraftReferences.js -t caseStudy

# Customer success stories
node auditDraftReferences.js -t customerSuccessStory

# Landing pages
node auditDraftReferences.js -t landingPage

# Spotlights
node auditDraftReferences.js -t spotlight
```

### Complete Workflow

```bash
# 1. Audit pages for draft references
node auditDraftReferences.js -t page

# 2. Review the CSV
# Open page_with_draft_references.csv

# 3. Publish the draft references (with dry run first)
node publishDraftReferences.js --dry-run -f page_with_draft_references.csv

# 4. Publish the draft references
node publishDraftReferences.js -f page_with_draft_references.csv

# 5. Verify everything is fixed
node auditDraftReferences.js -t page
```

## Why This Is Important

Published content referencing draft/archived entries can cause:
- 🚨 Broken links or missing content on live site
- 🚨 Incomplete user experiences
- 🚨 Unprofessional appearance
- 🚨 SEO issues
- 🚨 Confused site visitors

## Default Behavior

- **Only published entries are audited** by default
- This makes sense because published content is what users see
- Use `--include-drafts` if you want to audit draft entries too

### Why Audit Published Only?

Published entries are live and visible to users, so they should only reference other published content. Draft entries are works in progress, so it's more acceptable for them to reference draft content.

### When to Include Drafts

Use `--include-drafts` when:
- You want to audit all entries before a big launch
- You're preparing draft content and want to ensure it's ready
- You're doing a comprehensive content audit

## Published vs Draft Entries

### Published Entries (Default)
```bash
node auditDraftReferences.js -t page
```
- Checks only published pages
- Most common use case
- Ensures live content is clean

### All Entries (Including Drafts)
```bash
node auditDraftReferences.js -t page --include-drafts
```
- Checks both published AND draft pages
- Comprehensive audit
- Useful for pre-launch checks

## Common Content Types

Here are common Workhuman content types you might audit:

- `blogPost` - Blog posts
- `page` - Standard pages
- `newsArticle` - News articles
- `podcasts` - Podcasts
- `webinar` - Webinars
- `caseStudy` - Case studies
- `customerSuccessStory` - Customer success stories
- `spotlight` - Spotlight articles
- `document` - Documents
- `landingPage` - Landing pages
- `abmTemplate` - ABM templates
- `listingPages` - Listing pages

## Performance

- Fetching all entries can take several minutes for large spaces
- Progress indicators show the script is working
- For spaces with 10,000+ entries, consider running during off-peak hours

## After Running the Audit

1. **Review the CSV** - Open in Excel/Numbers to see all issues
2. **Prioritize** - Focus on high-traffic pages first
3. **Fix issues** - Either:
   - Publish the referenced draft content (use `publishDraftReferences.js`)
   - Replace with published alternatives
   - Remove the reference
4. **Re-audit** - Run the script again to verify all issues are resolved

## Related Scripts

- `publishDraftReferences.js` - Automatically publish draft references found in audit
- `auditOrphanedEntries.js` - Find orphaned content
- `unpublishOrphanedEntries.js` - Unpublish orphaned content
- `archiveOrphanedEntries.js` - Archive orphaned draft content

## Examples

### Example 1: Audit Landing Pages
```bash
node auditDraftReferences.js -t landingPage
# Output: landingPage_with_draft_references.csv
```

### Example 2: Comprehensive Page Audit
```bash
# Check all pages (including drafts)
node auditDraftReferences.js -t page --include-drafts

# Publish any draft references
node publishDraftReferences.js -f page_with_draft_references.csv

# Verify
node auditDraftReferences.js -t page
```

### Example 3: Audit Multiple Content Types
```bash
# Audit blog posts
node auditDraftReferences.js -t blogPost

# Audit pages
node auditDraftReferences.js -t page

# Audit news articles
node auditDraftReferences.js -t newsArticle

# Now you have 3 CSV reports to review
```

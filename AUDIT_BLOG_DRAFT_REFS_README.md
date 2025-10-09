# Blog Post Draft References Audit

This script audits all published blog posts in Contentful to find references to draft, archived, or missing content.

## What It Does

The script:
1. Fetches all published blog posts from Contentful
2. Extracts all referenced entry IDs from each blog post (including references in rich text fields)
3. Checks the status of each referenced entry
4. Identifies references to:
   - **Draft entries** (not published)
   - **Archived entries** (archived)
   - **Missing entries** (deleted or non-existent)
5. Generates a CSV report with all findings

## Why This Is Important

Published blog posts should ideally only reference other published content. References to draft or archived content can cause:
- Broken links or missing content on the live site
- Incomplete user experiences
- Content that appears unprofessional
- SEO issues

## Prerequisites

- Node.js installed
- `.env` file configured with:
  - `CONTENTFUL_SPACE_ID`
  - `CONTENTFUL_SOURCE_ENVIRONMENT_ID`
  - `CONTENTFUL_MANAGEMENT_TOKEN`

## Usage

```bash
node auditBlogPostDraftReferences.js
```

The script will:
- Fetch all blog posts and entries
- Analyze each published blog post for problematic references
- Generate a CSV report: `blog_posts_with_draft_references.csv`
- Display a summary in the console

## Output

### CSV Report

The generated CSV includes:
- **Blog Post ID** - Contentful ID of the blog post
- **Blog Post Title** - Title of the blog post
- **Blog Post Slug** - URL slug of the blog post
- **Blog Post Updated At** - Last update timestamp
- **Referenced Entry ID** - ID of the problematic referenced entry
- **Referenced Content Type** - Content type of the referenced entry
- **Referenced Status** - Status (Draft, Archived, or Missing/Deleted)
- **Referenced Title** - Title of the referenced entry (if available)
- **Contentful Blog Post Link** - Direct link to the blog post in Contentful
- **Contentful Referenced Entry Link** - Direct link to the referenced entry in Contentful

### Console Output

Example:
```
Fetching all blog posts...
Total blog posts fetched: 156
Published blog posts: 142

Fetching all entries to check their status...
Total entries fetched: 8234

Analyzing blog posts for draft references...

📊 Found 12 blog posts with draft or archived references
✅ Report saved to blog_posts_with_draft_references.csv

📋 Summary by Blog Post:
────────────────────────────────────────────────────────────────────────────────
1. 10 Best Remote Collaboration Tools
   ID: 2XKM78bOAvSHLX76f97DiE
   Slug: best-remote-collaboration-tools
   Draft References: 2
   Archived References: 1

2. Work Culture: What It Means to Have a Healthy Workplace
   ID: 6CnGZxkjViMTyMZ11UEgWI
   Slug: work-culture-healthy-workplace
   Draft References: 1
```

## Common Issues Found

### Draft References
- Content that hasn't been published yet
- Images or media files that are still in draft
- Related blog posts that haven't been published
- CTAs or forms that are works in progress

### Archived References
- Old content that has been archived but is still referenced
- Deprecated images or assets
- Outdated related content

### Missing References
- Deleted entries that were never unlinked
- References to entries that don't exist
- Broken links in rich text fields

## Recommended Workflow

1. **Run the audit:**
   ```bash
   node auditBlogPostDraftReferences.js
   ```

2. **Review the CSV report** to identify which blog posts need attention

3. **For each blog post with issues:**
   - Open the blog post in Contentful (use the provided link)
   - Find and remove/replace the draft or archived references
   - Update with published alternatives or remove the reference entirely
   - Save and republish the blog post

4. **Re-run the audit** to verify all issues are resolved

## Tips

- Run this audit regularly (weekly or monthly) to catch issues early
- Focus on high-traffic blog posts first
- Consider creating a published "placeholder" content for common references
- Document any intentional draft references (rare cases where it's acceptable)

## Performance

- Fetching all entries can take several minutes depending on the size of your content space
- The script includes progress indicators to show it's working
- For large spaces (10,000+ entries), consider running during off-peak hours

## Related Scripts

- `auditOrphanedEntries.js` - Find orphaned content in Contentful
- `unpublishOrphanedEntries.js` - Unpublish orphaned published content
- `archiveOrphanedEntries.js` - Archive orphaned draft content

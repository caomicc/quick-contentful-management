# Archive Orphaned Draft Entries Script

This script archives orphaned draft entries from Contentful based on content type and reference type filters according to the orphaned entries audit.

## Prerequisites

- Node.js installed
- `.env` file configured with:
  - `CONTENTFUL_SPACE_ID`
  - `CONTENTFUL_SOURCE_ENVIRONMENT_ID`
  - `CONTENTFUL_MANAGEMENT_TOKEN`
- `orphaned_entries_draft.csv` file generated from `auditOrphanedEntries.js`

## Usage

1. First, run the audit to generate the CSV file:
   ```bash
   node auditOrphanedEntries.js
   ```

2. **Dry run** (recommended first step) - see what would be archived without making changes:
   ```bash
   # All draft entries with no references only
   node archiveOrphanedEntries.js --dry-run -r no-references
   
   # All draft block entries (both reference types)
   node archiveOrphanedEntries.js --dry-run -t block -r both
   
   # Draft seo entries with archived references only
   node archiveOrphanedEntries.js --dry-run -t seo -r archived-references
   ```

3. Run the archive script for real:
   ```bash
   # Archive all draft entries with no references (recommended)
   node archiveOrphanedEntries.js -r no-references
   
   # Archive draft block entries with both reference types
   node archiveOrphanedEntries.js -t block -r both
   
   # Archive all orphaned draft entries (default)
   node archiveOrphanedEntries.js
   ```

4. The script will:
   - Read the `orphaned_entries_draft.csv` file
   - Filter based on content type and reference type
   - Display a list of entries to be archived
   - Ask for confirmation before proceeding
   - Archive each entry one by one (unpublishing first if needed)
   - Generate a log file with results

## What It Does

- ✅ Filters draft entries by content type (specific type or all types)
- ✅ Filters entries by reference type (no references, archived references, or both)
- ✅ Supports dry-run mode to preview changes
- ✅ Unpublishes entries if they are published (shouldn't happen for drafts)
- ✅ Archives entries
- ✅ Asks for confirmation before archiving (in real mode)
- ✅ Provides detailed progress and results
- ✅ Creates timestamped log files for tracking

## Safety Features

- **Dry-run mode** to preview changes without making them
- Confirmation prompt before archiving (in real mode)
- Rate limiting (200ms delay between requests)
- Detailed error logging
- Results saved to JSON log file
- Only targets draft entries (from `orphaned_entries_draft.csv`)

## Command Line Options

### Basic Options
- `--content-type`, `-t` - Content type to filter (default: `all`)
  - Use specific type like `block`, `seo`, `backgroundImage`, etc.
  - Use `all` to target all content types (default)
  
- `--reference-type`, `-r` - Reference type filter (default: `both`)
  - `no-references` - Only entries with "No References"
  - `archived-references` - Only entries with "Archived References"
  - `both` - Both reference types (default)
  
- `--dry-run` - Preview what would be archived without making any changes

- `--help`, `-h` - Show help message with examples

### Examples

```bash
# Show help
node archiveOrphanedEntries.js --help

# Dry run for all draft entries with no references only (recommended)
node archiveOrphanedEntries.js --dry-run -r no-references

# Archive all draft entries with no references
node archiveOrphanedEntries.js -r no-references

# Archive draft block entries with archived references only
node archiveOrphanedEntries.js -t block -r archived-references

# Dry run for all draft backgroundImage entries
node archiveOrphanedEntries.js --dry-run -t backgroundImage

# Archive ALL draft content types with both reference types (use with caution!)
node archiveOrphanedEntries.js -t all -r both
```

## Output

The script generates:
- Console output with progress and summary
- `archive_<contentType>_log_<timestamp>.json` - detailed log of all operations

## Example Output

### Dry Run Mode
```bash
$ node archiveOrphanedEntries.js --dry-run -t block -r no-references
```

```
🔍 DRY RUN MODE - No changes will be made

📖 Reading CSV file...
🔍 Filtering for:
   - Content Type: block
   - Reference Types: No References

📊 Found 15 draft entries to archive
   - No References: 15

📋 Entries to be archived (DRY RUN):
────────────────────────────────────────────────────────────────────────────────
1. [No References] 4zaRpx8pfH2HRD9s6FuHvl - Test Page Block
2. [No References] 7kjjJQZl82two61UpDMa3u - Ensuring compliance and security...
...
────────────────────────────────────────────────────────────────────────────────

✅ DRY RUN COMPLETE - No changes were made
💡 Run without --dry-run flag to actually archive these entries
```

### Real Mode
```bash
$ node archiveOrphanedEntries.js -t block -r no-references
```

```
📖 Reading CSV file...
🔍 Filtering for:
   - Content Type: block
   - Reference Types: No References

📊 Found 15 draft entries to archive
   - No References: 15

📋 Entries to archive:
────────────────────────────────────────────────────────────────────────────────
1. [No References] 4zaRpx8pfH2HRD9s6FuHvl - Test Page Block
2. [No References] 7kjjJQZl82two61UpDMa3u - Ensuring compliance and security...
...
────────────────────────────────────────────────────────────────────────────────

⚠️  Do you want to proceed with archiving these entries? (yes/no): yes

🚀 Starting archive process...

[1/15] Archiving 4zaRpx8pfH2HRD9s6FuHvl...
  ✅ Successfully archived: Test Page Block

================================================================================
📊 SUMMARY
================================================================================
✅ Successfully archived: 15
❌ Failed: 0

📝 Log saved to archive_block_log_1728518400000.json
```

## Recommended Workflow

1. **Run audit** to generate fresh CSV:
   ```bash
   node auditOrphanedEntries.js
   ```

2. **Start with no-references only** (safest):
   ```bash
   node archiveOrphanedEntries.js --dry-run -r no-references
   ```

3. **Review the list**, then archive:
   ```bash
   node archiveOrphanedEntries.js -r no-references
   ```

4. **Optional**: Archive entries with archived references:
   ```bash
   node archiveOrphanedEntries.js --dry-run -r archived-references
   node archiveOrphanedEntries.js -r archived-references
   ```

## Difference from Unpublish Script

- **unpublishOrphanedEntries.js** - Works on `orphaned_entries_published.csv` and unpublishes entries
- **archiveOrphanedEntries.js** - Works on `orphaned_entries_draft.csv` and archives entries

Use the unpublish script for published content you want to take offline but keep.
Use the archive script for draft content you want to remove from the active workspace.

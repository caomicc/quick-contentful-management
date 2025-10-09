# Unpublish Entries Script

This script unpublishes entries from Contentful based on content type and reference type filters according to the orphaned entries audit.

## Prerequisites

- Node.js installed
- `.env` file configured with:
  - `CONTENTFUL_SPACE_ID`
  - `CONTENTFUL_SOURCE_ENVIRONMENT_ID`
  - `CONTENTFUL_MANAGEMENT_TOKEN`
- `orphaned_entries_published.csv` file generated from `auditOrphanedEntries.js`

## Usage

1. First, run the audit to generate the CSV file:
   ```bash
   node auditOrphanedEntries.js
   ```

2. **Dry run** (recommended first step) - see what would be unpublished without making changes:
   ```bash
   # SEO entries with no references only
   node unpublishSeoEntries.js --dry-run -t seo -r no-references
   
   # All SEO entries (both reference types)
   node unpublishSeoEntries.js --dry-run -t seo -r both
   
   # Block entries with archived references only
   node unpublishSeoEntries.js --dry-run -t block -r archived-references
   ```

3. Run the unpublish script for real:
   ```bash
   # Unpublish SEO entries with both reference types
   node unpublishSeoEntries.js -t seo -r both
   
   # Unpublish backgroundImage entries with no references
   node unpublishSeoEntries.js -t backgroundImage -r no-references
   ```

4. The script will:
   - Read the `orphaned_entries_published.csv` file
   - Filter for SEO entries with "No References"
   - Display a list of entries to be unpublished
   - Ask for confirmation before proceeding
   - Unpublish each entry one by one
   - Generate a log file `unpublish_seo_log.json` with the results

## What It Does

- ✅ Filters entries by content type (specific type or all types)
- ✅ Filters entries by reference type (no references, archived references, or both)
- ✅ Supports dry-run mode to preview changes
- ✅ Asks for confirmation before unpublishing (in real mode)
- ✅ Provides detailed progress and results
- ✅ Creates timestamped log files for tracking

## Safety Features

- **Dry-run mode** to preview changes without making them
- Confirmation prompt before unpublishing (in real mode)
- Rate limiting (200ms delay between requests)
- Detailed error logging
- Results saved to JSON log file

## Command Line Options

### Basic Options
- `--content-type`, `-t` - Content type to filter (default: `seo`)
  - Use specific type like `seo`, `block`, `backgroundImage`, etc.
  - Use `all` to target all content types
  
- `--reference-type`, `-r` - Reference type filter (default: `both`)
  - `no-references` - Only entries with "No References"
  - `archived-references` - Only entries with "Archived References"
  - `both` - Both reference types (default)
  
- `--dry-run` - Preview what would be unpublished without making any changes

- `--help`, `-h` - Show help message with examples

### Examples

```bash
# Show help
node unpublishSeoEntries.js --help

# Dry run for SEO entries with no references only
node unpublishSeoEntries.js --dry-run -t seo -r no-references

# Unpublish all SEO entries (both reference types) - default behavior
node unpublishSeoEntries.js -t seo -r both

# Unpublish block entries with archived references only
node unpublishSeoEntries.js -t block -r archived-references

# Dry run for all backgroundImage entries with no references
node unpublishSeoEntries.js --dry-run -t backgroundImage -r no-references

# Unpublish ALL content types with no references (be careful!)
node unpublishSeoEntries.js --dry-run -t all -r no-references
```

## Output

The script generates:
- Console output with progress and summary
- `unpublish_seo_log.json` - detailed log of all operations

## Example Output

### Dry Run Mode (SEO entries with no references)
```bash
$ node unpublishSeoEntries.js --dry-run -t seo -r no-references
```

```
🔍 DRY RUN MODE - No changes will be made

📖 Reading CSV file...
🔍 Filtering for:
   - Content Type: seo
   - Reference Types: No References

📊 Found 8 SEO entries to unpublish
   - No References: 8

📋 Entries to be unpublished (DRY RUN):
────────────────────────────────────────────────────────────────────────────────
1. [No References] 2XKM78bOAvSHLX76f97DiE - 10 Best Remote Collaboration Tools...
2. [No References] 658RvX1WEH1CeLAdm6j5CX - New careers
...
────────────────────────────────────────────────────────────────────────────────

✅ DRY RUN COMPLETE - No changes were made
💡 Run without --dry-run flag to actually unpublish these entries
```

### Real Mode (Block entries with archived references)
```bash
$ node unpublishSeoEntries.js -t block -r archived-references
```

```
📖 Reading CSV file...
🔍 Filtering for:
   - Content Type: block
   - Reference Types: Archived References

📊 Found 5 entries to unpublish
   - Archived References: 5

📋 Entries to unpublish:
────────────────────────────────────────────────────────────────────────────────
1. [Archived References] 648FbbAvu6jGgVfjh1hi9e - Headline - Join a purpose-driven business...
2. [Archived References] 2NqG4Hb6QuSX1OqQFCw1Qn - Test Duplex Media Card
...
────────────────────────────────────────────────────────────────────────────────

⚠️  Do you want to proceed with unpublishing these entries? (yes/no): yes

🚀 Starting unpublish process...

[1/5] Unpublishing 648FbbAvu6jGgVfjh1hi9e...
  ✅ Successfully unpublished: Headline - Join a purpose-driven business...

================================================================================
📊 SUMMARY
================================================================================
✅ Successfully unpublished: 5
❌ Failed: 0

📝 Log saved to unpublish_block_log_1728518400000.json
```
```
� DRY RUN MODE - No changes will be made

�📖 Reading CSV file...

📊 Found 21 SEO entries to unpublish
   - No References: 8
   - Archived References: 13

📋 Entries to be unpublished (DRY RUN):
────────────────────────────────────────────────────────────────────────────────
1. [No References] 2XKM78bOAvSHLX76f97DiE - 10 Best Remote Collaboration Tools...
2. [Archived References] 23d7SPuANotKf4x0LZndBE - Workhuman | Careers
...
────────────────────────────────────────────────────────────────────────────────

✅ DRY RUN COMPLETE - No changes were made
💡 Run without --dry-run flag to actually unpublish these entries
```

### Real Mode
```
📖 Reading CSV file...

📊 Found 21 SEO entries to unpublish
   - No References: 8
   - Archived References: 13

📋 Entries to unpublish:
────────────────────────────────────────────────────────────────────────────────
1. [No References] 2XKM78bOAvSHLX76f97DiE - 10 Best Remote Collaboration Tools...
2. [Archived References] 23d7SPuANotKf4x0LZndBE - Workhuman | Careers
...
────────────────────────────────────────────────────────────────────────────────

⚠️  Do you want to proceed with unpublishing these entries? (yes/no): yes

🚀 Starting unpublish process...

[1/21] Unpublishing 2XKM78bOAvSHLX76f97DiE...
  ✅ Successfully unpublished: 10 Best Remote Collaboration Tools...

================================================================================
📊 SUMMARY
================================================================================
✅ Successfully unpublished: 21
❌ Failed: 0

📝 Log saved to unpublish_seo_log.json
```

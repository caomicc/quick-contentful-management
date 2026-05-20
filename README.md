Silly little Contentful scripts that I've written to make my life easier while managing content as a developer.

## Document taxonomy workflow

These commands support adding taxonomy concepts to the `document` content type.

1. Analyze published documents and produce recommendation data:

```bash
npm run analyze:taxonomy:document
```

2. Generate a reviewable mapping file:

```bash
npm run generate:taxonomy:document
```

This writes `document_taxonomy_mapping.json`.

3. Dry run the taxonomy updates against Contentful:

```bash
npm run apply:taxonomy:document:dry
```

4. Apply updates to Contentful after reviewing mapping:

```bash
npm run apply:taxonomy:document
```

Safety mode (recommended for active launch schedules):

```bash
npm run apply:taxonomy:document:dry:safe
npm run apply:taxonomy:document:safe
```

This mode skips entries that have scheduled actions pending (for example future publish jobs).

Environment variables required:

- `CONTENTFUL_MANAGEMENT_TOKEN`
- `CONTENTFUL_SPACE_ID`
- `CONTENTFUL_ENVIRONMENT_ID` (falls back to `master` if omitted)

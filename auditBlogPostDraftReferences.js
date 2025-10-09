require('dotenv').config();
const contentfulManagement = require('contentful-management');
const fs = require('fs');

const spaceId = process.env.CONTENTFUL_SPACE_ID;
const sourceEnvironmentId = process.env.CONTENTFUL_SOURCE_ENVIRONMENT_ID;

const client = contentfulManagement.createClient({
  accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
});

// Function to fetch all entries with pagination
async function fetchAllEntriesPaginated(environment, contentType = null) {
  const allEntries = [];
  let skip = 0;
  const limit = 100;
  let total = 0;

  do {
    console.log(`Fetching ${contentType || 'all'} entries... (${allEntries.length} so far)`);
    const queryOptions = { skip, limit };
    if (contentType) {
      queryOptions['content_type'] = contentType;
    }

    const response = await environment.getEntries(queryOptions);

    if (response.items && response.items.length > 0) {
      allEntries.push(...response.items);
    }

    total = response.total;
    skip += limit;
  } while (allEntries.length < total);

  return allEntries;
}

// Function to recursively find entry links in Rich Text and other nested structures
function findEntryLinksRecursive(obj, referencedIds) {
  if (!obj || typeof obj !== 'object') return;

  // Check if this is an entry link
  if (obj.sys && obj.sys.type === 'Link' && obj.sys.linkType === 'Entry' && obj.sys.id) {
    const referencedId = obj.sys.id;
    referencedIds.add(referencedId);
    return;
  }

  // Recursively search in arrays
  if (Array.isArray(obj)) {
    for (const item of obj) {
      findEntryLinksRecursive(item, referencedIds);
    }
    return;
  }

  // Recursively search in objects
  for (const key in obj) {
    findEntryLinksRecursive(obj[key], referencedIds);
  }
}

// Function to extract all referenced entry IDs from a blog post
function extractReferencedEntryIds(blogPost) {
  const referencedIds = new Set();

  if (!blogPost.fields) return referencedIds;

  for (const fieldName in blogPost.fields) {
    const fieldValue = blogPost.fields[fieldName];

    // Check each locale in the field
    for (const locale in fieldValue) {
      const value = fieldValue[locale];
      findEntryLinksRecursive(value, referencedIds);
    }
  }

  return referencedIds;
}

// Main function to audit blog posts for draft references
async function auditBlogPostDraftReferences() {
  try {
    const space = await client.getSpace(spaceId);
    const environment = await space.getEnvironment(sourceEnvironmentId);

    console.log('Fetching all blog posts...');
    const blogPosts = await fetchAllEntriesPaginated(environment, 'blogPost');
    console.log(`Total blog posts fetched: ${blogPosts.length}`);

    // Filter for published blog posts only
    const publishedBlogPosts = blogPosts.filter(post => post.sys.publishedVersion);
    console.log(`Published blog posts: ${publishedBlogPosts.length}`);

    console.log('\nFetching all entries to check their status...');
    const allEntries = await fetchAllEntriesPaginated(environment);
    console.log(`Total entries fetched: ${allEntries.length}`);

    // Create a map of entry ID to entry status
    const entryStatusMap = new Map();
    allEntries.forEach(entry => {
      entryStatusMap.set(entry.sys.id, {
        id: entry.sys.id,
        contentType: entry.sys.contentType.sys.id,
        isPublished: !!entry.sys.publishedVersion,
        isArchived: !!entry.sys.archivedVersion,
        title: getEntryTitle(entry)
      });
    });

    console.log('\nAnalyzing blog posts for draft references...');
    const blogPostsWithDraftRefs = [];

    for (const blogPost of publishedBlogPosts) {
      const referencedIds = extractReferencedEntryIds(blogPost);
      const draftReferences = [];
      const archivedReferences = [];

      for (const refId of referencedIds) {
        const refEntry = entryStatusMap.get(refId);

        if (!refEntry) {
          // Referenced entry doesn't exist (deleted or missing)
          draftReferences.push({
            id: refId,
            contentType: 'MISSING',
            status: 'Missing/Deleted',
            title: 'N/A'
          });
        } else if (refEntry.isArchived) {
          archivedReferences.push({
            id: refEntry.id,
            contentType: refEntry.contentType,
            status: 'Archived',
            title: refEntry.title
          });
        } else if (!refEntry.isPublished) {
          draftReferences.push({
            id: refEntry.id,
            contentType: refEntry.contentType,
            status: 'Draft',
            title: refEntry.title
          });
        }
      }

      if (draftReferences.length > 0 || archivedReferences.length > 0) {
        blogPostsWithDraftRefs.push({
          blogPost: {
            id: blogPost.sys.id,
            title: getEntryTitle(blogPost),
            slug: getSlug(blogPost),
            updatedAt: blogPost.sys.updatedAt
          },
          draftReferences,
          archivedReferences
        });
      }
    }

    console.log(`\n📊 Found ${blogPostsWithDraftRefs.length} blog posts with draft or archived references`);

    // Generate CSV
    if (blogPostsWithDraftRefs.length > 0) {
      const csvRows = [
        'Blog Post ID,Blog Post Title,Blog Post Slug,Blog Post Updated At,Referenced Entry ID,Referenced Content Type,Referenced Status,Referenced Title,Contentful Blog Post Link,Contentful Referenced Entry Link'
      ];

      for (const item of blogPostsWithDraftRefs) {
        const blogPostLink = `https://app.contentful.com/spaces/${spaceId}/environments/${sourceEnvironmentId}/entries/${item.blogPost.id}`;

        // Add draft references
        for (const ref of item.draftReferences) {
          const refLink = ref.id !== 'MISSING'
            ? `https://app.contentful.com/spaces/${spaceId}/environments/${sourceEnvironmentId}/entries/${ref.id}`
            : 'N/A';

          csvRows.push([
            item.blogPost.id,
            `"${escapeCsv(item.blogPost.title)}"`,
            `"${escapeCsv(item.blogPost.slug)}"`,
            item.blogPost.updatedAt,
            ref.id,
            ref.contentType,
            ref.status,
            `"${escapeCsv(ref.title)}"`,
            blogPostLink,
            refLink
          ].join(','));
        }

        // Add archived references
        for (const ref of item.archivedReferences) {
          const refLink = `https://app.contentful.com/spaces/${spaceId}/environments/${sourceEnvironmentId}/entries/${ref.id}`;

          csvRows.push([
            item.blogPost.id,
            `"${escapeCsv(item.blogPost.title)}"`,
            `"${escapeCsv(item.blogPost.slug)}"`,
            item.blogPost.updatedAt,
            ref.id,
            ref.contentType,
            ref.status,
            `"${escapeCsv(ref.title)}"`,
            blogPostLink,
            refLink
          ].join(','));
        }
      }

      fs.writeFileSync('blog_posts_with_draft_references.csv', csvRows.join('\n'), 'utf8');
      console.log('✅ Report saved to blog_posts_with_draft_references.csv');
    } else {
      console.log('✅ No blog posts with draft or archived references found!');
    }

    // Display summary
    console.log('\n📋 Summary by Blog Post:');
    console.log('─'.repeat(80));
    blogPostsWithDraftRefs.forEach((item, index) => {
      const draftCount = item.draftReferences.length;
      const archivedCount = item.archivedReferences.length;
      console.log(`${index + 1}. ${item.blogPost.title}`);
      console.log(`   ID: ${item.blogPost.id}`);
      console.log(`   Slug: ${item.blogPost.slug}`);
      if (draftCount > 0) console.log(`   Draft References: ${draftCount}`);
      if (archivedCount > 0) console.log(`   Archived References: ${archivedCount}`);
      console.log('');
    });

  } catch (err) {
    console.error('❌ Error during audit:', err);
  }
}

// Helper function to get entry title
function getEntryTitle(entry) {
  if (!entry.fields) return '';

  const titleFields = ['title', 'name', 'internalName', 'heading', 'slug', 'internalTitle', 'ctaTitle', 'pageHeading'];

  for (const fieldName of titleFields) {
    if (entry.fields[fieldName]) {
      const locales = Object.keys(entry.fields[fieldName]);
      if (locales.length > 0) {
        const value = entry.fields[fieldName][locales[0]];
        return typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
  }

  return '';
}

// Helper function to get slug
function getSlug(entry) {
  if (!entry.fields || !entry.fields.slug) return '';

  const locales = Object.keys(entry.fields.slug);
  if (locales.length > 0) {
    return entry.fields.slug[locales[0]] || '';
  }

  return '';
}

// Helper function to escape CSV values
function escapeCsv(value) {
  if (!value) return '';
  return value.replace(/"/g, '""');
}

// Run the audit
auditBlogPostDraftReferences();

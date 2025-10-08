# Contentful Careers Content Management Guide

## Overview
This guide explains how to manage the careers content in Contentful for someone with no prior Contentful experience. The content structure consists of 186 entries across 11 different content types that power the careers website.

## What is Contentful?
Contentful is a headless Content Management System (CMS) that stores your content separately from how it's displayed. Think of it as a database for your website content that developers can pull from to build web pages.

## Content Structure Overview

### Entry Count by Type
- **expandingIconCard**: 51 entries - Interactive cards with icons and descriptions
- **slide**: 34 entries - Carousel/slider content 
- **imageWithAiTags**: 33 entries - Images with AI-generated descriptions
- **block**: 20 entries - General content blocks
- **careersTab**: 17 entries - Team-specific career pages
- **grid**: 14 entries - Layout grids for organizing content
- **accordionSlider**: 10 entries - Expandable content sections
- **richTextContent**: 3 entries - Rich text content blocks
- **page**: 1 entry - Main page configuration
- **panel**: 1 entry - Panel/section content
- **wrapperComponent**: 1 entry - Layout wrapper
- **careersConfiguration**: 1 entry - Global careers settings

## Key Content Types Explained

### 1. careersTab (17 entries)
**Purpose**: Creates team-specific "Meet the Team" pages for different departments.

**Fields**:
- `internalName`: Internal reference (e.g., "Meet the Team Page - Finance & Legal")
- `name`: Display name (typically "Meet the team")
- `slug`: URL path (e.g., "careers-meet-the-team-finance-and-legal")
- `team`: Department name (e.g., "Finance & Legal", "Sales", "Operations")
- `content`: Array of linked content entries that make up the page

**Teams Included**: Finance & Legal, Operations, Sales, E-Commerce, Engineering, Marketing, Customer Success, People & Culture, Product

### 2. expandingIconCard (51 entries)
**Purpose**: Interactive cards that expand to show more information when clicked.

**Fields**:
- `internalTitle`: Internal reference for content managers
- `title`: Card headline displayed to users
- `icon`: FontAwesome icon class (e.g., "far fa-heart")
- `description`: Rich text content that appears when expanded

**Common Uses**: 
- "What we value" sections
- Job benefits and perks
- Company culture highlights
- Process explanations

### 3. imageWithAiTags (33 entries)
**Purpose**: Images with AI-generated descriptions for accessibility and SEO.

**Fields**:
- `title`: Internal title for the image
- `image`: Link to the actual image asset
- `description`: AI-generated description of the image content
- Supports multiple languages (en-US, de)

### 4. slide (34 entries) 
**Purpose**: Individual slides used in carousels and sliders.

**Fields**:
- Typically contains images, text, and layout information
- Used to build interactive photo galleries and content carousels

### 5. block (20 entries)
**Purpose**: Reusable content blocks that can be inserted into pages.

**Use Cases**:
- Text sections
- Call-to-action blocks  
- Informational panels

## Content Management Best Practices

### 1. Naming Conventions
- **Internal Names**: Always start with descriptive context (e.g., "Careers 'Everything You Need' Grid Item - What we value")
- **Slugs**: Use kebab-case with descriptive paths (e.g., "careers-meet-the-team-finance-and-legal")
- **Teams**: Use consistent team names across all content

### 2. Content Organization
- Each team has its own `careersTab` entry
- Content is modular - pages are built by linking multiple content blocks
- Images are managed separately and linked to content entries

### 3. Localization
- Content supports multiple languages (primarily en-US)
- Some images have German (de) descriptions
- Always provide en-US as the primary language

## Common Management Tasks

### Adding a New Team Section
1. Create a new `careersTab` entry
2. Set the `internalName` following the pattern: "Meet the Team Page - [Team Name]"
3. Set `name` to "Meet the team"
4. Create a unique `slug` following pattern: "careers-meet-the-team-[team-name-lowercase]"
5. Set the `team` field to the exact team name
6. Link relevant content entries in the `content` array

### Adding New Content Cards
1. Create an `expandingIconCard` entry
2. Choose an appropriate FontAwesome icon
3. Write a compelling `title` and detailed `description`
4. Use descriptive `internalTitle` for easy content management

### Managing Images
1. Upload images as Assets in Contentful
2. Create `imageWithAiTags` entries to link to the assets
3. Ensure AI descriptions are accurate and helpful for accessibility

## Technical Notes

### Entry Structure
Each content entry contains:
- `id`: Unique identifier
- `contentType`: Defines the entry type
- `createdAt`/`updatedAt`: Timestamps
- `publishedAt`: When content went live
- `version`: Content version number
- `fields`: The actual content data

### Content Linking
- Content entries reference each other using `sys.id` links
- This creates a network of interconnected content
- Changes to one piece of content can affect multiple pages

### Publishing Workflow
- Content has states: Draft → Published
- All changes must be published to appear on the website
- Version history allows you to track and revert changes

## Troubleshooting

### Content Not Appearing
1. Check if the entry is published (has `publishedAt` timestamp)
2. Verify all linked content is also published
3. Ensure the content is properly linked in parent entries

### Broken Links
1. Check that referenced `sys.id` values exist
2. Verify linked content is published
3. Update links if content has been deleted or moved

### Image Issues
1. Ensure images are uploaded as Assets in Contentful
2. Check that `imageWithAiTags` entries properly link to assets
3. Verify image descriptions are complete

## Getting Help
- Contentful Documentation: https://www.contentful.com/developers/docs/
- Contact your development team for technical issues
- Use Contentful's built-in help system for platform questions

This content structure represents a sophisticated careers website with team-specific pages, interactive elements, and rich media content. Take time to explore the existing content to understand the patterns before making changes.
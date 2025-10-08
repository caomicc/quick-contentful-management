# 🚀 Complete Contentful Careers Management Guide

## 🔍 Overview

Your Careers section uses a tab-based structure with different types of content organized into tabs. This includes team pages, location pages, benefits pages, and culture content. Each tab contains modular content blocks that can be rearranged or customized.

💡 **Key Concept**: Each tab = one Contentful entry of type `careersTab`.

**Add Screenshot Here** → Example: Careers tabs list in Contentful ("Meet the Team Page – Technology," etc.)

---

## 📋 Complete Content Structure

### 1️⃣ Careers Tab (Main Container) - 17 entries

Each tab represents different types of careers content organized into categories.

#### Fields Breakdown:
- **internalName** (Text): Internal reference for content managers
  - Example: `"Meet the Team Page - Finance & Legal"`
- **name** (Text): Display name shown to users  
  - Examples: `"Meet the team"`, `"Benefits"`, `"Culture"`, `"Location"`
- **slug** (Text): URL path for the page
  - Example: `"careers-meet-the-team-finance-and-legal"`
- **team** (Text): Category/team name
  - Examples: `"Finance & Legal"`, `"Other"` (for non-team content)
- **content** (References - Multiple): Array of linked content blocks that build the page
  - Links to: blocks, grids, accordionSliders, etc.

#### Tab Categories:

**🧑‍💼 Team Pages (10 entries):**
- Meet the Team Page – Finance & Legal
- Meet the Team Page – Technology  
- Meet the Team Page – Human Experience (HX)
- Meet the Team Page – Customer Excellence
- Meet the Team Page – Operations
- Meet the Team Page – Sales
- Meet the Team Page – E-Commerce
- Meet the Team Page – Marketing
- Meet the Team Page – Product
- Meet the Team Page – Other

**💰 Benefits Pages (3 entries):**
- Benefits Page – International
- Benefits Page – USA  
- Benefits Page – Europe

**📍 Location Pages (3 entries):**
- Location Page – International
- Location Page – Europe
- Location Page – USA

**🌍 Culture Page (1 entry):**
- Culture Page – Global

**Add Screenshot Here** → Example of an open "Meet the Team" page entry showing linked content blocks

---

### 2️⃣ Block (Two-Column Layout) - 20 entries

Used for side-by-side layouts — text + image, text + text, etc.

#### Fields Breakdown:
- **title** (Text): Internal name for the block
  - Example: `"Careers Page - Office Locations"`
- **left** (References - Multiple): Content for left column
- **right** (References - Multiple): Content for right column  
- **theme** (Text): Visual theme
  - Options: `"default"`, `"humanity"`
- **layout** (Text): Column proportions
  - Options: `"50:50"`, `"Full"`
- **reverseOnMobile** (Boolean): Swap columns on mobile
- **centerContentVertically** (Boolean): Vertical alignment
- **centerContent** (Boolean): Center content horizontally
- **mobileCenterContentHorizontally** (Boolean): Mobile-specific centering
- **removeTopAndBottomPadding** (Boolean): Remove spacing
- **containerSize** (Text): Width constraint
  - Options: `"6xl"`, `"7xl"`

#### Real Examples from Your Content:
- "Careers Page - Office Locations"
- "Introduction - Meet the Team Customer Excellence"  
- "Introduction - Meet the Team Finance & Legal"
- "Introduction - Meet the Team E-Commerce"
- "Introduction - Meet the Team Operations"

**Add Screenshot Here** → Two-column block showing text on one side and image on the other

---

### 3️⃣ Accordion Slider (Interactive Slideshow) - 10 entries

Used for showcasing roles or team members in a carousel format.

#### Fields Breakdown:
- **internalName** (Text): Descriptive internal name
  - Example: `"Roles - Customer Excellence"`
- **slides** (References - Multiple): Array of individual slide entries
  - Links to slide content type entries

#### Real Examples from Your Content:
- "Roles - Customer Excellence" (5 slides)
- "Roles - E-Commerce" (4 slides)
- "Roles - Finance Legal" (2 slides)
- "Roles - Operations" (4 slides)
- "Roles - Technology" (5+ slides)

**Add Screenshot Here** → Accordion Slider in Contentful showing individual slides list

---

### 4️⃣ Slide (Individual Carousel Item) - 34 entries

Individual slides used within accordion sliders.

#### Fields Breakdown:
- **internalTitle** (Text): Internal reference
  - Example: `"Role - Technology - Architecture"`
- **title** (Text): Role/slide title displayed to users
  - Example: `"Architecture"`  
- **content** (Rich Text): Detailed description of the role
  - Example: Full paragraph about architecture team responsibilities
- **image** (Media Reference): Optional slide image
- **additionalFields**: May include role-specific information

#### Real Examples from Your Content:
- "Role - Technology - Architecture"
- "Role - Technology - IT Infrastructure" 
- "Role - E-Commerce - Store Experience"
- "Role - Customer Excellence - Customer Success"
- "Role - Finance Legal - Finance"

**Add Screenshot Here** → Individual slide entry showing title, content, and image fields

---

### 5️⃣ Grid (Multi-Column Cards) - 14 entries

Displays content cards in a grid format for benefits, values, or features.

#### Fields Breakdown:
- **internalName** (Text): Descriptive internal name
  - Example: `"Content Block - Everything You Need Grid"`
- **gridItems** (References - Multiple): Array of cards to display
  - Links to expandingIconCard entries
- **columnCount** (Text): Number of columns
  - Example: `"3"`
- **theme** (Text): Visual theme
  - Options: `"default"`, `"humanity"`
- **centerContentVertically** (Boolean): Vertical alignment
- **centerContent** (Boolean): Horizontal alignment  
- **removeTopAndBottomPadding** (Boolean): Spacing control
- **containerSize** (Text): Width constraint
  - Options: `"6xl"`, `"7xl"`

#### Real Examples from Your Content:
- "Content Block - Everything You Need Grid"
- "More than a Paycheck Grid - Customer Excellence"
- "More than a Paycheck Grid - Finance Legal"  
- "More than a Paycheck Grid - E-Commerce"
- "More than a Paycheck Grid - Operations"

**Add Screenshot Here** → Example of a Grid entry with cards visible

---

### 6️⃣ Expanding Icon Card (Individual Card) - 51 entries

Cards with icons and descriptions that expand for more information.

#### Fields Breakdown:
- **internalTitle** (Text): Internal reference for content managers
  - Example: `"Careers \"Everything You Need\" Grid Item - What we value"`
- **title** (Text): Card headline displayed to users
  - Example: `"What we value"`
- **icon** (Object): FontAwesome icon specification
  - Format: `{"value": "far fa-heart"}`
  - Examples: `"far fa-heart"`, `"far fa-chart-line"`, `"far fa-laptop"`
- **description** (Rich Text): Content that appears when card expands
  - Example: Full paragraph about company values
- **theme** (Text): Card styling theme  
  - Options: `"humanity"`, `"default"`
- **classes** (Text): Additional CSS classes
  - Example: `"glass-card dark-text bg-frosted"`

#### Real Examples from Your Content:
- "What we value" (heart icon)
- "Thriving is our baseline" (chart icon)  
- "Work from anywhere" (laptop icon)
- "Career development budget" (graduation cap icon)
- "Comprehensive health coverage" (medical icon)

**Add Screenshot Here** → Icon Card entry showing icon and text fields

---

### 7️⃣ Rich Text Content (Text Blocks) - 3 entries

Simple text-only sections for headlines, descriptions, or paragraphs.

#### Fields Breakdown:
- **internalName** (Text): Internal reference
- **content** (Rich Text): The actual text content with formatting
  - Supports: headings, paragraphs, bold, italic, links, lists

#### Real Examples from Your Content:
- "So much more than just a paycheck"
- "Want to learn more?"
- Introductory text blocks for various sections

**Add Screenshot Here** → Rich Text field editor showing heading and paragraph formatting

---

### 8️⃣ Images with AI Tags (Media with Descriptions) - 33 entries

Images with AI-generated descriptions for accessibility and SEO.

#### Fields Breakdown:
- **title** (Text): Internal title for the image
  - Example: `"Role - E-Commerce - Store Experience Image"`
- **image** (Media Reference): Link to the actual image asset
- **description** (Text - Multiple Languages): AI-generated image description
  - **en-US**: English description
  - **de**: German description (when available)
  - Example: `"A woman in a yellow top and a person in a blue shirt are discussing near a large decorative tree..."`

#### Real Examples from Your Content:
- "Role - E-Commerce - Store Experience Image"
- "Team photo - Finance & Legal"
- "Office space - Technology team"
- Various team and workplace photos

**Add Screenshot Here** → Image asset view with alt text and description fields visible

---

## 🎯 Step-by-Step Management Workflows

### 🧩 Scenario 1: Update Your Department's "Meet the Team" Content

1. **Find Your Department Page**
   - Go to **Content** → **Entries**
   - Search: `"Meet the Team Page – [Your Department]"`
   - Example: `"Meet the Team Page – Technology"`

2. **Review the Page Structure**
   - Click on your department's entry
   - Look at the **content** field - this shows all linked blocks
   - Typical structure:
     - Introduction Block (50:50 layout)
     - Accordion Slider (roles showcase)  
     - Grid (benefits/values)

3. **Edit Individual Components**
   - Click into each linked entry to edit:
     - **Block**: Update left/right content
     - **Accordion Slider**: Modify or add slides
     - **Grid**: Update grid items/cards

4. **Save and Publish**
   - Save each component you edit
   - **Publish** each component (green publish button)
   - Return to main page and **Publish** the careersTab

**Add Screenshot Here** → Meet the Team entry showing linked blocks

---

### 🧑‍💻 Scenario 2: Add a New Role to Your Accordion Slider

1. **Create the Individual Slide**
   - Go to **Content** → **Add Entry** → **Slide**
   - Fill in required fields:
     - **internalTitle**: `"Role – [Department] – [Position Name]"`
     - **title**: `"[Position Name]"` (e.g., "Senior Developer")
     - **content**: Rich text description of the role
     - **image**: (optional) Upload or select role-related image

2. **Add to Your Department's Slider**  
   - Find your slider: Search `"Roles – [Department]"`
   - Open the accordion slider entry
   - In **slides** field, click **Add existing entry**
   - Search for and select your new slide
   - **Reorder** slides if needed using drag handles

3. **Publish Everything**
   - **Publish** the new slide first
   - **Publish** the accordion slider
   - **Publish** any parent block or page that contains the slider

**Field Values Example:**
```
internalTitle: "Role – Technology – Senior Full Stack Developer"
title: "Senior Full Stack Developer"  
content: "Join our technology team as a Senior Full Stack Developer..."
```

**Add Screenshot Here** → Slide entry creation form and slider field with new slide added

---

### 💰 Scenario 3: Add or Edit Benefits in Your Paycheck Grid

1. **Create a New Benefit Card**
   - Go to **Content** → **Add Entry** → **Expanding Icon Card**
   - Fill in the fields:
     - **internalTitle**: `"Paycheck Grid Item [Department] – [Benefit Name]"`
     - **title**: Short benefit name (e.g., "Work From Anywhere")
     - **icon**: FontAwesome class (e.g., `{"value": "far fa-laptop"}`)
     - **description**: 2-3 sentence explanation of the benefit
     - **theme**: `"humanity"` (for branded colors)
     - **classes**: `"glass-card dark-text bg-frosted"` (for styling)

2. **Add to Your Department's Grid**
   - Find your grid: Search `"More than a Paycheck Grid [Department]"`
   - Open the grid entry  
   - In **gridItems** field, click **Add existing entry**
   - Search for and select your new card
   - **Reorder** cards using drag handles

3. **Publish Both Entries**
   - **Publish** the new expanding icon card
   - **Publish** the grid containing it

**Real Field Values Example:**
```
internalTitle: "Paycheck Grid Item Technology – Remote Work Flexibility"
title: "Work From Anywhere"
icon: {"value": "far fa-laptop"}  
description: "Enjoy full remote work flexibility with home office stipend and co-working space allowances. Work from wherever you're most productive."
theme: "humanity"
classes: "glass-card dark-text bg-frosted"
```

**Add Screenshot Here** → Grid entry showing new Icon Card linked

---

### 🌄 Scenario 4: Change Introduction Text or Image

Your introduction sections typically use a **Block** with 50:50 layout containing:
- **Left side**: Rich text content  
- **Right side**: Image with AI tags

1. **Find Your Introduction Block**
   - Search: `"Introduction – Meet the Team [Department]"`
   - Example: `"Introduction – Meet the Team Technology"`

2. **Edit the Text Content**
   - Open the block entry
   - Click into the **left** field entry (usually rich text)
   - Edit the content using the rich text editor
   - **Save** and **Publish** the text entry

3. **Edit the Image**
   - From the same block, click into the **right** field entry (image)
   - Either:
     - Replace the image in the **image** field
     - Update the **description** for accessibility
   - **Save** and **Publish** the image entry

4. **Publish the Block**
   - Return to the block entry
   - **Publish** the block itself

**Add Screenshot Here** → Introduction block with both text and image references visible

---

## 📐 Layout & Display Options Deep Dive

### Block Layout Options
- **50:50**: Equal width columns (most common)
  - Use for: Text + image, balanced content
- **Full**: Single full-width column  
  - Use for: Wide content, single images, full-width text

### Grid Column Settings
| Device | Typical Columns | Use Case |
|--------|----------------|----------|
| Mobile | 1 | Stacked cards |
| Tablet | 2-3 | Condensed grid |
| Desktop | 3-4 | Full grid display |

### Container Sizes
- **6xl**: Narrower width, good for intro sections
- **7xl**: Wider width, good for grids and full content

### Boolean Options Explained
- **reverseOnMobile**: Swaps left/right columns on mobile devices
- **centerContentVertically**: Centers content in the vertical middle
- **centerContent**: Centers content horizontally  
- **mobileCenterContentHorizontally**: Mobile-specific horizontal centering
- **removeTopAndBottomPadding**: Removes default spacing above/below

**Add Screenshot Here** → Layout settings fields visible in Contentful editor

---

## 🎨 Styling & Themes Deep Dive

### Available Themes
- **default**: White/gray background, standard branding
- **humanity**: Branded color scheme with company colors

### Common CSS Classes
- **glass-card**: Translucent card effect
- **dark-text**: Dark text color override  
- **bg-frosted**: Frosted glass background
- **pb-8**: Bottom padding
- **mx-auto**: Horizontal centering
- **full-width-important**: Force full width

### Icon Guidelines
- Use **FontAwesome** icon classes
- Format: `{"value": "far fa-icon-name"}`
- Common prefixes:
  - `far`: Regular icons
  - `fas`: Solid icons  
  - `fal`: Light icons

**Popular Icons for Careers:**
- `far fa-heart` (values, culture)
- `far fa-laptop` (remote work, technology)
- `far fa-chart-line` (growth, analytics)
- `far fa-graduation-cap` (learning, development)
- `far fa-users` (teamwork, collaboration)

**Add Screenshot Here** → Example showing theme and class fields

---

## ✅ Publishing Checklist & Content Hierarchy

Content must be published in the correct order due to dependencies:

### Publishing Order (Inside → Out):
1. **Assets** (images, files)
2. **Rich Text Content** (text blocks)  
3. **Images with AI Tags** (linked to assets)
4. **Expanding Icon Cards** (individual cards)
5. **Slides** (individual carousel items)
6. **Grids** (containing icon cards)
7. **Accordion Sliders** (containing slides)
8. **Blocks** (containing grids, text, images)
9. **Careers Tab** (containing blocks)
10. **Careers Configuration** (site-wide settings)

### Pre-Publish Checklist:
- ☐ All linked assets uploaded and published
- ☐ All text content reviewed for typos
- ☐ All images have proper alt text/descriptions
- ☐ Icon classes are valid FontAwesome classes
- ☐ Layout settings appropriate for content
- ☐ Theme and styling classes applied correctly
- ☐ Mobile layout tested (if possible)

### Publish Status Icons:
- 🟢 **Published**: Content is live on website
- 🟠 **Changed**: Has unpublished changes  
- 🔵 **Draft**: Never been published
- 🔴 **Archived**: No longer active

**Add Screenshot Here** → Contentful list view showing published vs unpublished icons

---

## 🚨 Common Mistakes & Detailed Fixes

| Mistake | Why It Happens | How to Fix | Prevention |
|---------|---------------|------------|------------|
| **Content not appearing on site** | Forgot to publish nested entries | Publish all linked content first, then parent | Always publish inside → out |
| **Broken layout on mobile** | Wrong layout settings | Check `reverseOnMobile`, `centerContent` settings | Preview on mobile when possible |
| **Missing images** | Image asset not published | Publish asset first, then image entry | Upload and publish assets immediately |
| **Icon not displaying** | Invalid FontAwesome class | Use valid FA class: `far fa-icon-name` | Check FontAwesome documentation |
| **Inconsistent styling** | Wrong theme or missing classes | Copy classes from working examples | Keep a reference list of common classes |
| **Can't find content** | Poor naming conventions | Use consistent naming patterns | Follow: `Component Type – Department – Description` |
| **Duplicate entries** | Creating instead of editing | Search thoroughly before creating new | Use filters and search effectively |

### Specific Troubleshooting Scenarios:

**Problem**: New benefit card not showing in grid
**Solution Steps**:
1. Check card is published (🟢 status)
2. Check grid contains the card in `gridItems` field
3. Check grid is published
4. Check parent block containing grid is published
5. Check careers tab containing block is published

**Problem**: Role description formatting looks wrong  
**Solution Steps**:
1. Open the slide entry
2. Edit the `content` rich text field
3. Use proper headings (H3, H4) and paragraph breaks
4. Avoid manual line breaks, use paragraph breaks instead
5. Preview content before publishing

**Add Screenshot Here** → Example of properly named entries in list view

---

## 📞 Quick Reference Tables

### Content Type Quick Reference
| Task | Content Type | Search Pattern | Key Fields |
|------|-------------|----------------|------------|
| Add department intro | Block | "Introduction – Meet the Team..." | `title`, `left`, `right`, `layout` |
| Show team roles | Accordion Slider | "Roles – [Department]" | `internalName`, `slides` |
| Display benefits | Grid | "More than a Paycheck Grid..." | `internalName`, `gridItems`, `columnCount` |
| Individual benefit | Expanding Icon Card | "Paycheck Grid Item..." | `title`, `icon`, `description` |
| Add role description | Slide | "Role – [Department] –..." | `title`, `content`, `image` |
| Add headline/text | Rich Text Content | "[Description]" | `content` |
| Add image | Image with AI Tags | "[Description] Image" | `title`, `image`, `description` |

### Field Type Reference
| Field Type | Description | Example |
|------------|-------------|---------|
| Text | Simple text input | `"Meet the team"` |
| Rich Text | Formatted text with headings, links | Paragraph content with formatting |
| Boolean | True/false option | `true`, `false` |
| Reference (Single) | Link to one other entry | Link to specific image |
| References (Multiple) | Array of links to other entries | Array of card links |
| Media | Link to uploaded asset | Image or file upload |
| Object | Structured data | `{"value": "far fa-heart"}` |

### Department Name Consistency
Use these exact department names across all content:
- Technology
- Sales  
- Marketing
- E-Commerce
- Finance & Legal
- Operations
- Customer Excellence (formerly Customer Success)
- People & Culture
- Product

---

## 🔍 Advanced Search & Filtering

### Search Strategies
1. **By Department**: Search department name (e.g., "Technology")
2. **By Content Type**: Filter by specific type in sidebar
3. **By Status**: Filter Published/Draft/Changed in sidebar  
4. **By Date**: Sort by "Updated At" to see recent changes
5. **By Pattern**: Use naming patterns for specific content

### Naming Pattern Reference
| Content Type | Pattern | Example |
|-------------|---------|---------|
| Careers Tab | Meet the Team Page – [Department] | Meet the Team Page – Technology |
| Introduction Block | Introduction – Meet the Team [Department] | Introduction – Meet the Team Sales |
| Role Slider | Roles – [Department] | Roles – Marketing |
| Benefits Grid | More than a Paycheck Grid [Department] | More than a Paycheck Grid Product |
| Benefit Card | Paycheck Grid Item [Department] – [Benefit] | Paycheck Grid Item Sales – Health Coverage |
| Role Slide | Role – [Department] – [Position] | Role – Technology – Senior Developer |

### Useful Filters
- **Content Type = careersTab**: See all department pages
- **Content Type = expandingIconCard**: See all benefit cards
- **Updated in last week**: Find recent changes
- **Created by [Your Name]**: Find your content

**Add Screenshot Here** → Search results filtered by department and type

---

## 💡 Pro Tips & Best Practices

### 🎯 Content Strategy
- **Keep benefit descriptions concise**: 2-3 sentences maximum
- **Use action-oriented language**: "Enjoy", "Access", "Develop"
- **Focus on employee value**: What's in it for them?
- **Maintain brand voice**: Match existing content tone

### 🔄 Workflow Efficiency  
- **Use "Duplicate"**: Copy similar entries instead of starting from scratch
- **Preview frequently**: Use preview to check layout and formatting
- **Batch similar edits**: Update all department grids at once
- **Keep notes**: Use comments feature for collaboration

### 📱 Mobile Optimization
- **Test mobile layouts**: Use preview or responsive design tools
- **Consider reading length**: Shorter content works better on mobile
- **Check image sizes**: Ensure images work on small screens
- **Use mobile-specific settings**: `reverseOnMobile`, `mobileCenterContentHorizontally`

### 🔒 Content Governance
- **Follow naming conventions**: Consistency makes content findable
- **Don't delete extensively linked content**: Check references first
- **Use version history**: Revert changes if needed
- **Coordinate with team**: Use workflow features for approvals

### 🎨 Visual Consistency
- **Stick to approved themes**: `default` or `humanity`
- **Copy existing class combinations**: Don't invent new styling
- **Maintain icon style**: Use same FontAwesome prefix across sections
- **Check brand guidelines**: Ensure content aligns with brand standards

**Add Screenshot Here** → Contentful entry actions menu showing Duplicate, Preview, and Comments

---

## 🆘 Getting Help & Resources

### Internal Resources
- **Your Development Team**: Technical issues, custom fields, deployment
- **Content Team Lead**: Editorial guidelines, approval workflows  
- **Brand Team**: Visual guidelines, icon usage, theme selection

### Contentful Resources
- **Contentful University**: Free training courses
- **Help Documentation**: In-app help system (? icon)
- **Community Forum**: contentful.com/community
- **Status Page**: status.contentful.com

### Emergency Contacts
- **Content Issues**: [Your Content Team Contact]
- **Technical Issues**: [Your Dev Team Contact]  
- **Access Issues**: [Your IT/Admin Contact]

---

## 📋 Appendix: Complete Field Reference

### careersTab Fields
- `internalName` (Text, Required): Internal reference
- `name` (Text, Required): Display name for users
- `slug` (Text, Required): URL path component  
- `team` (Text, Required): Department/team name
- `content` (References Multiple): Linked content blocks

### block Fields  
- `title` (Text): Internal block name
- `left` (References Multiple): Left column content
- `right` (References Multiple): Right column content
- `theme` (Text): Visual theme selection
- `layout` (Text): Column layout ratio
- `reverseOnMobile` (Boolean): Mobile column order
- `centerContentVertically` (Boolean): Vertical alignment
- `centerContent` (Boolean): Horizontal alignment
- `mobileCenterContentHorizontally` (Boolean): Mobile alignment
- `removeTopAndBottomPadding` (Boolean): Spacing control
- `containerSize` (Text): Width constraint

### expandingIconCard Fields
- `internalTitle` (Text): Internal reference
- `title` (Text, Required): Card display title
- `icon` (Object): FontAwesome icon specification
- `description` (Rich Text, Required): Card content  
- `theme` (Text): Visual theme
- `classes` (Text): Additional CSS classes

### grid Fields
- `internalName` (Text): Internal reference
- `gridItems` (References Multiple): Array of cards
- `columnCount` (Text): Number of columns
- `theme` (Text): Visual theme
- `centerContentVertically` (Boolean): Vertical alignment
- `centerContent` (Boolean): Horizontal alignment
- `removeTopAndBottomPadding` (Boolean): Spacing control
- `containerSize` (Text): Width constraint

### accordionSlider Fields
- `internalName` (Text): Internal reference
- `slides` (References Multiple): Array of slide entries

### slide Fields  
- `internalTitle` (Text): Internal reference
- `title` (Text): Slide display title
- `content` (Rich Text): Slide description content
- `image` (Media): Optional slide image

### imageWithAiTags Fields
- `title` (Text): Internal image title
- `image` (Media, Required): Link to image asset
- `description` (Text, Localized): AI-generated descriptions

### richTextContent Fields
- `internalName` (Text): Internal reference  
- `content` (Rich Text, Required): Formatted text content

This comprehensive guide should provide everything needed to effectively manage your Contentful careers content structure!
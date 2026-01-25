# Whitespace Design System for OTC App Website

## Chat Summary

**Date:** January 24, 2026  
**Purpose:** Analyze premium SaaS/tech websites to extract whitespace and spacing patterns for the OTC app website.

**Sites Analyzed:**
- hiro.so/platform - Developer tools platform with generous section padding and floating content islands
- deepjudge.ai - Legal AI SaaS with narrow text columns and dramatic testimonial spacing
- primeintellect.ai - AI compute platform with modular 8px grid and massive hero padding
- shopify.vc - VC portfolio with minimal design and constrained content widths
- finethought.com.au - Ultra-minimalist creative site (mostly JS-rendered)

**Key Findings:**
1. All premium sites use 100-160px vertical section padding (not the typical 40-60px)
2. Text content is constrained to ~720px max-width for readability
3. Card/grid gaps are 32-48px, not the common 16-24px
4. All spacing follows an 8px base grid system
5. Hero sections get even more dramatic spacing (160px+)

---

## Claude Code Implementation Instructions

### HOW TO USE THIS DOCUMENT

When working on the OTC app website, follow these instructions to implement the whitespace system. These are step-by-step directives for achieving the premium spacing seen in the reference sites.

---

### STEP 1: Add the Spacing Scale to Global CSS

Create or update the global CSS variables file. Add these variables at the `:root` level:

```css
:root {
  /* ═══════════════════════════════════════════════════════════
     SPACING SCALE (8px base grid)
     All spacing in the app should use these values.
     ═══════════════════════════════════════════════════════════ */
  
  --space-1: 0.25rem;   /* 4px - micro adjustments only */
  --space-2: 0.5rem;    /* 8px - tight spacing */
  --space-3: 0.75rem;   /* 12px - compact elements */
  --space-4: 1rem;      /* 16px - default/base */
  --space-5: 1.5rem;    /* 24px - comfortable */
  --space-6: 2rem;      /* 32px - relaxed */
  --space-8: 3rem;      /* 48px - section gaps */
  --space-10: 4rem;     /* 64px - large gaps */
  --space-12: 5rem;     /* 80px - major sections */
  --space-16: 6rem;     /* 96px - hero spacing */
  --space-20: 8rem;     /* 128px - premium sections */
  --space-24: 10rem;    /* 160px - maximum breathing room */
  --space-32: 12rem;    /* 192px - ultra-dramatic */

  /* ═══════════════════════════════════════════════════════════
     CONTAINER WIDTHS
     ═══════════════════════════════════════════════════════════ */
  
  --container-max: 1280px;      /* Standard content max */
  --container-narrow: 720px;    /* Text-heavy sections */
  --container-wide: 1440px;     /* Full-bleed features */
  --gutter: clamp(1rem, 5vw, 4rem);  /* Responsive side margins */

  /* ═══════════════════════════════════════════════════════════
     FLUID SPACING (automatically scales with viewport)
     ═══════════════════════════════════════════════════════════ */
  
  --section-padding: clamp(4rem, 10vw, 10rem);
  --content-gap: clamp(2rem, 5vw, 5rem);
  --card-padding: clamp(1.5rem, 4vw, 3rem);
}
```

---

### STEP 2: Create Base Section Styles

Add these section styles. Apply `.section` class to all major page sections:

```css
/* ═══════════════════════════════════════════════════════════
   SECTION SPACING
   The vertical padding here creates the "premium" feel.
   DO NOT reduce these values without approval.
   ═══════════════════════════════════════════════════════════ */

.section {
  padding-top: var(--space-20);      /* 128px */
  padding-bottom: var(--space-20);   /* 128px */
}

.section--hero {
  padding-top: var(--space-24);      /* 160px */
  padding-bottom: var(--space-24);   /* 160px */
}

.section--compact {
  padding-top: var(--space-12);      /* 80px */
  padding-bottom: var(--space-12);   /* 80px */
}

/* Responsive: reduce but keep generous */
@media (max-width: 768px) {
  .section {
    padding-top: var(--space-12);    /* 80px */
    padding-bottom: var(--space-12);
  }
  
  .section--hero {
    padding-top: var(--space-16);    /* 96px */
    padding-bottom: var(--space-16);
  }
  
  .section--compact {
    padding-top: var(--space-8);     /* 48px */
    padding-bottom: var(--space-8);
  }
}
```

---

### STEP 3: Create Container Styles

```css
/* ═══════════════════════════════════════════════════════════
   CONTAINERS
   ═══════════════════════════════════════════════════════════ */

.container {
  width: 100%;
  max-width: var(--container-max);
  margin-inline: auto;
  padding-inline: var(--gutter);
}

.container--narrow {
  max-width: var(--container-narrow);
}

.container--wide {
  max-width: var(--container-wide);
}
```

---

### STEP 4: Content Spacing Rules

Apply these patterns when building content blocks:

```css
/* ═══════════════════════════════════════════════════════════
   SECTION HEADERS
   ═══════════════════════════════════════════════════════════ */

.section-header {
  text-align: center;
  max-width: var(--container-narrow);
  margin-inline: auto;
  margin-bottom: var(--space-12);    /* 80px to content below */
}

.section-header h2 {
  margin-bottom: var(--space-4);     /* 16px to subheading */
}

.section-header .subheading {
  margin-bottom: 0;
}

/* ═══════════════════════════════════════════════════════════
   TYPOGRAPHY SPACING
   ═══════════════════════════════════════════════════════════ */

h1, h2, h3, h4, h5, h6 {
  margin-top: 0;
  margin-bottom: var(--space-4);     /* 16px default */
}

p {
  margin-top: 0;
  margin-bottom: var(--space-5);     /* 24px */
}

p:last-child {
  margin-bottom: 0;
}

/* ═══════════════════════════════════════════════════════════
   CARD GRIDS
   ═══════════════════════════════════════════════════════════ */

.card-grid {
  display: grid;
  gap: var(--space-6);               /* 32px default */
}

.card-grid--spacious {
  gap: var(--space-8);               /* 48px */
}

.card {
  padding: var(--space-8);           /* 48px internal */
  border-radius: var(--space-4);     /* 16px radius */
}

@media (max-width: 768px) {
  .card {
    padding: var(--space-6);         /* 32px on mobile */
  }
}

/* ═══════════════════════════════════════════════════════════
   CTA GROUPS
   ═══════════════════════════════════════════════════════════ */

.cta-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);               /* 16px between buttons */
  margin-top: var(--space-8);        /* 48px above CTAs */
}

/* ═══════════════════════════════════════════════════════════
   CONTENT BLOCKS
   ═══════════════════════════════════════════════════════════ */

.content-block + .content-block {
  margin-top: var(--space-12);       /* 80px between blocks */
}
```

---

### STEP 5: Component-Specific Spacing

```css
/* ═══════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════ */

.nav {
  padding-block: var(--space-4);     /* 16px vertical */
  padding-inline: var(--space-6);    /* 32px horizontal */
}

.nav-links {
  display: flex;
  gap: var(--space-8);               /* 48px between items */
}

@media (max-width: 768px) {
  .nav-links {
    gap: var(--space-4);             /* 16px on mobile */
  }
}

/* ═══════════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════════ */

.btn {
  padding: var(--space-3) var(--space-6);    /* 12px 32px */
}

.btn--large {
  padding: var(--space-4) var(--space-8);    /* 16px 48px */
}

/* ═══════════════════════════════════════════════════════════
   TESTIMONIALS
   ═══════════════════════════════════════════════════════════ */

.testimonial {
  padding: var(--space-10);          /* 64px all around */
  margin-block: var(--space-12);     /* 80px vertical */
}

.testimonial-text {
  margin-bottom: var(--space-6);     /* 32px to attribution */
}

/* ═══════════════════════════════════════════════════════════
   STATS/METRICS
   ═══════════════════════════════════════════════════════════ */

.stats-grid {
  display: grid;
  gap: var(--space-8);               /* 48px between stats */
}

.stat-value {
  margin-bottom: var(--space-2);     /* 8px to label */
}

/* ═══════════════════════════════════════════════════════════
   DIVIDERS
   ═══════════════════════════════════════════════════════════ */

.divider {
  height: 1px;
  background: currentColor;
  opacity: 0.1;
  margin-block: var(--space-16);     /* 96px breathing room */
}
```

---

### STEP 6: Typography Line Heights & Letter Spacing

```css
:root {
  /* Line heights */
  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
  
  /* Letter spacing */
  --tracking-tight: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.05em;
}

h1, .h1 {
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
}

h2, .h2,
h3, .h3 {
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
}

p, .body-text {
  line-height: var(--leading-relaxed);
}

.label, .eyebrow, .overline {
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
```

---

## Implementation Checklist

When implementing on any page or component, verify:

- [ ] All sections use `.section` class with appropriate modifier
- [ ] Content is wrapped in `.container` (or narrow/wide variant)
- [ ] Spacing uses CSS variables, NOT arbitrary pixel values
- [ ] Section padding is at least 80px on mobile, 128px on desktop
- [ ] Text blocks are max 720px wide
- [ ] Card grids use 32-48px gaps
- [ ] Cards have 32-48px internal padding
- [ ] Headlines have 48-80px margin below before content
- [ ] CTAs have 48px+ margin above them

---

## Quick Reference Table

| Element | Desktop | Mobile |
|---------|---------|--------|
| Section padding | 128-160px | 64-96px |
| Container max-width | 1280px | 100% - 32px |
| Text max-width | 720px | 100% |
| Card padding | 48-64px | 32-48px |
| Grid gaps | 32-48px | 24-32px |
| Heading margin-bottom | 64-80px | 48px |
| Button padding | 16px 48px | 12px 32px |
| Nav item spacing | 48px | 16-24px |

---

## Golden Rules (DO NOT VIOLATE)

1. **Section padding minimum: 80px** - Never go below this on desktop
2. **Use the 8px grid** - All values must be multiples of 8
3. **Text width max: 720px** - Paragraphs should never span wider
4. **Double what feels right** - If 40px seems good, try 80px first
5. **Maintain consistency** - Same spacing for same element types
6. **Mobile ≠ cramped** - Reduce by ~1.5x, not 3x

---

## Tailwind CSS Equivalents (If Using Tailwind)

If the project uses Tailwind, extend the config:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      spacing: {
        '18': '4.5rem',   // 72px
        '22': '5.5rem',   // 88px
        '26': '6.5rem',   // 104px
        '30': '7.5rem',   // 120px
        '34': '8.5rem',   // 136px
        '38': '9.5rem',   // 152px
        '42': '10.5rem',  // 168px
      },
      maxWidth: {
        'content': '1280px',
        'text': '720px',
        'wide': '1440px',
      }
    }
  }
}
```

Then use classes like:
- `py-32` or `py-40` for section padding (128px / 160px)
- `max-w-text` for text columns
- `gap-8` or `gap-12` for card grids (32px / 48px)
- `p-12` or `p-16` for card internal padding (48px / 64px)

---

## Notes for Future Reference

- The analyzed sites (Hiro, DeepJudge, Prime Intellect, Shopify VC) all share this generous spacing philosophy
- The "premium" feel comes almost entirely from the vertical section padding
- Don't be afraid of "too much" whitespace - these sites use 2-3x what feels intuitive
- Alternating background colors between sections can create rhythm without additional spacing

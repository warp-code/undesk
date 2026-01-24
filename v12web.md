# OTC Marketing Website - Design Session v12

## Date
January 24, 2026

## Summary

Version 12 implements the P2P ping interaction for the OTC hero section with optimized 1.5x line thickness. The design visualizes peer-to-peer trades through synchronized line animations across a 3-tier barcode pattern.

### Key Features
- **P2P Ping Animation**: Two distant lines light up with a 150ms handshake delay
- **1.5x Line Thickness**: Improved visibility while maintaining fine aesthetic
- **Auto-ping**: Background trades animate every 3 seconds
- **Hover Interaction**: User-triggered pings on line hover
- **Text Safe Zone**: Left 48% kept clear for content
- **Accent Colors**: Purple (#a78bfa) and orange (#f97316) highlights

---

## Implementation Instructions

### Step 1: Create the Component File

Create a new file `OTCHero.jsx` (or `OTCHero.tsx` for TypeScript) in your components directory.

### Step 2: Install Dependencies

Ensure you have React 18+ installed. No additional dependencies required.

```bash
npm install react react-dom
```

If using Tailwind CSS (recommended):
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### Step 3: Copy the Component Code

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react';

const OTCHero = () => {
  const [activeLines, setActiveLines] = useState(new Set());
  const [dimensions, setDimensions] = useState({ width: 1200, height: 600 });
  
  const getLineKey = (tierIdx, lineIdx) => `${tierIdx}-${lineIdx}`;
  
  // Generate lines for each tier
  const tierLines = useMemo(() => {
    const tiers = [
      { yStart: 0.18, yEnd: 0.32, spacing: 6, offset: 0 },
      { yStart: 0.34, yEnd: 0.48, spacing: 6.5, offset: 3 },
      { yStart: 0.50, yEnd: 0.64, spacing: 5.5, offset: 6 },
    ];
    
    return tiers.map((tier, tierIdx) => {
      const lines = [];
      const lineCount = Math.floor(dimensions.width / tier.spacing);
      
      for (let i = 0; i < lineCount; i++) {
        const x = tier.offset + i * tier.spacing;
        const xPercent = x / dimensions.width;
        
        // Text safe zone: skip lines in left 48%
        if (xPercent < 0.48) continue;
        
        // Calculate opacity for transition zone (48-58%)
        let opacity = 1;
        if (xPercent < 0.58) {
          opacity = (xPercent - 0.48) / 0.10;
        }
        
        // Random weight distribution: 60% thin, 30% medium, 10% thick
        const rand = Math.random();
        let weight = 'thin';
        if (rand > 0.9) weight = 'thick';
        else if (rand > 0.6) weight = 'medium';
        
        // Accent lines (8% chance) - purple or orange
        const isAccent = Math.random() > 0.92;
        const accentColor = Math.random() > 0.5 ? '#a78bfa' : '#f97316';
        
        lines.push({
          x,
          yStart: tier.yStart * dimensions.height,
          yEnd: tier.yEnd * dimensions.height,
          weight,
          opacity,
          isAccent,
          accentColor,
        });
      }
      return lines;
    });
  }, [dimensions]);
  
  // Trigger P2P ping animation
  const triggerPing = useCallback((key1, key2) => {
    // First line lights up
    setActiveLines(new Set([key1]));
    // Second line lights up after 150ms (handshake effect)
    setTimeout(() => {
      setActiveLines(new Set([key1, key2]));
    }, 150);
    // Both fade out after 1800ms
    setTimeout(() => {
      setActiveLines(new Set());
    }, 1800);
  }, []);
  
  // Auto-ping every 3 seconds (background trades)
  useEffect(() => {
    const interval = setInterval(() => {
      // Pick two different tiers
      const t1 = Math.floor(Math.random() * 3);
      const t2 = (t1 + 1 + Math.floor(Math.random() * 2)) % 3;
      // Pick distant lines
      const maxL1 = Math.min(100, tierLines[t1]?.length - 1 || 0);
      const maxL2 = tierLines[t2]?.length - 1 || 0;
      const l1 = Math.floor(Math.random() * Math.max(1, maxL1 / 3));
      const l2 = Math.min(maxL2, Math.floor(maxL2 * 0.6) + Math.floor(Math.random() * (maxL2 * 0.4)));
      triggerPing(getLineKey(t1, l1), getLineKey(t2, l2));
    }, 3000);
    return () => clearInterval(interval);
  }, [triggerPing, tierLines]);
  
  // Hover ping handler
  const handleLineHover = useCallback((tierIdx, lineIdx) => {
    const otherTier = (tierIdx + 1 + Math.floor(Math.random() * 2)) % 3;
    const maxIdx = tierLines[otherTier]?.length - 1 || 0;
    let partnerIdx;
    if (lineIdx < maxIdx / 2) {
      partnerIdx = Math.min(maxIdx, lineIdx + 20 + Math.floor(Math.random() * 30));
    } else {
      partnerIdx = Math.max(0, lineIdx - 20 - Math.floor(Math.random() * 30));
    }
    triggerPing(getLineKey(tierIdx, lineIdx), getLineKey(otherTier, partnerIdx));
  }, [triggerPing, tierLines]);
  
  // 1.5x stroke widths
  const getStrokeWidth = (line, isActive) => {
    if (isActive) return 1.8;
    if (line.isAccent) return 0.75;
    if (line.weight === 'thick') return 0.6;
    if (line.weight === 'medium') return 0.42;
    return 0.22;
  };

  return (
    <div className="relative w-full h-96 bg-zinc-950 overflow-hidden">
      {/* Background Pattern */}
      <svg 
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <filter id="pingGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {tierLines.map((lines, tierIdx) =>
          lines.map((line, lineIdx) => {
            const key = getLineKey(tierIdx, lineIdx);
            const isActive = activeLines.has(key);
            
            let strokeColor = `rgba(255,255,255,${line.opacity * 0.7})`;
            if (isActive) {
              strokeColor = '#f97316';
            } else if (line.isAccent) {
              strokeColor = line.accentColor;
            }
            
            return (
              <line
                key={key}
                x1={line.x}
                y1={line.yStart}
                x2={line.x}
                y2={line.yEnd}
                stroke={strokeColor}
                strokeWidth={getStrokeWidth(line, isActive)}
                strokeLinecap="round"
                filter={isActive ? 'url(#pingGlow)' : 'none'}
                style={{
                  transition: 'stroke 0.3s ease, stroke-width 0.3s ease, filter 0.3s ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => handleLineHover(tierIdx, lineIdx)}
              />
            );
          })
        )}
      </svg>
      
      {/* Content Overlay - Customize this section */}
      <div className="relative z-10 h-full flex flex-col justify-center px-12">
        <h1 className="text-5xl font-bold text-white mb-4">
          OTC Trading
        </h1>
        <p className="text-xl text-zinc-400 max-w-md">
          Peer-to-peer trades visualized in real-time. 
          Hover over lines to trigger connections.
        </p>
        <div className="mt-8 flex gap-4">
          <button className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition">
            Start Trading
          </button>
          <button className="px-6 py-3 border border-zinc-600 text-zinc-300 font-semibold rounded-lg hover:border-zinc-400 transition">
            Learn More
          </button>
        </div>
      </div>
    </div>
  );
};

export default OTCHero;
```

### Step 4: Import and Use the Component

```jsx
// In your page file (e.g., pages/index.jsx or app/page.jsx)
import OTCHero from '@/components/OTCHero';

export default function Home() {
  return (
    <main>
      <OTCHero />
      {/* Rest of your page content */}
    </main>
  );
}
```

### Step 5: Tailwind Configuration (if using Tailwind)

Ensure your `tailwind.config.js` includes the zinc color palette:

```js
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

---

## Customization Guide

### Adjusting Line Thickness

Modify the `getStrokeWidth` function to change line weights:

```jsx
const getStrokeWidth = (line, isActive) => {
  if (isActive) return 1.8;      // Active ping state
  if (line.isAccent) return 0.75; // Colored accent lines
  if (line.weight === 'thick') return 0.6;
  if (line.weight === 'medium') return 0.42;
  return 0.22;                   // Default thin lines
};
```

**Thickness presets:**
| Preset | Thin | Medium | Thick | Accent | Active |
|--------|------|--------|-------|--------|--------|
| 1x (original) | 0.15 | 0.28 | 0.4 | 0.5 | 1.2 |
| 1.5x (current) | 0.22 | 0.42 | 0.6 | 0.75 | 1.8 |
| 2x | 0.3 | 0.56 | 0.8 | 1.0 | 2.4 |
| 3x | 0.45 | 0.84 | 1.2 | 1.5 | 3.6 |

### Adjusting Ping Timing

```jsx
// In triggerPing function:
setTimeout(() => { ... }, 150);   // Delay between first and second line
setTimeout(() => { ... }, 1800);  // Total duration before fade

// In useEffect interval:
setInterval(() => { ... }, 3000); // Auto-ping frequency
```

### Changing Colors

```jsx
// Ping color (in render)
if (isActive) {
  strokeColor = '#f97316'; // Orange - change this
}

// Accent colors (in line generation)
const accentColor = Math.random() > 0.5 ? '#a78bfa' : '#f97316'; // Purple or orange
```

### Adjusting Text Safe Zone

```jsx
// Skip lines in left portion
if (xPercent < 0.48) continue; // Change 0.48 to adjust safe zone width

// Transition zone opacity fade
if (xPercent < 0.58) { // Change 0.58 to adjust fade end point
  opacity = (xPercent - 0.48) / 0.10;
}
```

---

## Technical Specifications

### Line Pattern (1.5x Thickness)

| Weight | Stroke Width | Distribution |
|--------|--------------|--------------|
| Thin | 0.22 | 60% |
| Medium | 0.42 | 30% |
| Thick | 0.6 | 10% |
| Accent | 0.75 | 8% (special) |
| Active | 1.8 | On ping |

### 3-Tier Layout

| Tier | Y Position | Spacing | Offset |
|------|------------|---------|--------|
| 1 | 18–32% | 6px | 0 |
| 2 | 34–48% | 6.5px | 3px |
| 3 | 50–64% | 5.5px | 6px |

### P2P Ping Animation

| Property | Value |
|----------|-------|
| Ping color | #f97316 (orange) |
| First→Second delay | 150ms |
| Total duration | 1800ms |
| Auto-ping interval | 3000ms |
| Glow blur | 3 |
| CSS transition | 0.3s ease |

### Text Safe Area

| Zone | X Position | Effect |
|------|------------|--------|
| Safe | 0–48% | No lines |
| Transition | 48–58% | Fade in |
| Full | 58–100% | Full opacity |

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

SVG filters and CSS transitions are well-supported in modern browsers.

---

## Performance Notes

- Lines are generated once via `useMemo` and cached
- Only `activeLines` state changes during animation
- SVG rendering is hardware-accelerated
- Consider reducing line count on mobile for better performance

---

## Status

- ✅ P2P auto-ping (every 3s)
- ✅ P2P hover-ping
- ✅ Sequential light-up (150ms delay)
- ✅ Orange glow effect
- ✅ 1.5x line thickness
- ✅ Text safe area mask
- ✅ Smooth transitions
- ⏳ Mobile responsive refinements
- ⏳ Right column visual TBD

---

## Changelog

### v12 (January 24, 2026)
- Updated line thickness to 1.5x for improved visibility
- Added comprehensive implementation instructions
- Documented all customization options

### v11
- Implemented P2P ping animation
- Added auto-ping and hover interactions
- Created text safe zone mask

### v10
- Initial barcode pattern design
- Variable stroke widths
- 3-tier layout system

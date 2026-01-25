# OTC Marketing Website - Design Session v11

## Date
January 24, 2026

## Objective
Implement P2P ping interaction where two distant lines light up simultaneously (with minimal delay) to visualize peer-to-peer trades happening on the platform.

---

## Evolution from v10

### v10 State
- Text safe area mask working
- Lines only on right side
- No visible ping interaction (was broken)

### v11 Direction
- Fix and enhance P2P ping animation
- Two lines light up with slight delay (handshake effect)
- Bright orange color for visibility
- Auto-ping every 3 seconds + hover trigger

---

## P2P Ping Implementation Instructions

### Core Concept
When a "trade" happens, two lines in different tiers light up:
1. First line lights up (initiator)
2. After 150ms delay, second line lights up (responder)
3. Both stay lit together for ~1.8 seconds
4. Both fade out

This visualizes a P2P connection across distance/tiers.

### Step-by-Step Implementation

#### 1. State Management
```javascript
const [activeLines, setActiveLines] = useState(new Set());
const getLineKey = (tierIdx, lineIdx) => `${tierIdx}-${lineIdx}`;
```

#### 2. Trigger Ping Function
```javascript
const triggerPing = useCallback((key1, key2) => {
  // First line lights up
  setActiveLines(new Set([key1]));
  // Second line lights up after small delay (P2P connection effect)
  setTimeout(() => {
    setActiveLines(new Set([key1, key2]));
  }, 150);
  // Both fade out
  setTimeout(() => {
    setActiveLines(new Set());
  }, 1800);
}, []);
```

#### 3. Auto-Ping Effect (Background Trades)
```javascript
useEffect(() => {
  const interval = setInterval(() => {
    // Pick two different tiers
    const t1 = Math.floor(Math.random() * 3);
    const t2 = (t1 + 1 + Math.floor(Math.random() * 2)) % 3;
    // Pick lines that are far apart: one in first third, one in last third
    const l1 = Math.floor(Math.random() * 100);
    const l2 = 200 + Math.floor(Math.random() * 100);
    triggerPing(getLineKey(t1, l1), getLineKey(t2, l2));
  }, 3000);
  return () => clearInterval(interval);
}, [triggerPing]);
```

#### 4. Hover Ping (User-Triggered)
```javascript
const handleLineHover = useCallback((tierIdx, lineIdx, tierLines) => {
  const otherTier = (tierIdx + 1 + Math.floor(Math.random() * 2)) % 3;
  const maxIdx = tierLines[otherTier].length - 1;
  // Pick a distant partner (at least 50 lines away)
  let partnerIdx;
  if (lineIdx < maxIdx / 2) {
    partnerIdx = Math.min(maxIdx, lineIdx + 50 + Math.floor(Math.random() * 100));
  } else {
    partnerIdx = Math.max(0, lineIdx - 50 - Math.floor(Math.random() * 100));
  }
  triggerPing(getLineKey(tierIdx, lineIdx), getLineKey(otherTier, partnerIdx));
}, [triggerPing]);
```

#### 5. SVG Glow Filter for Active Lines
```jsx
<filter id="pingGlow" x="-200%" y="-200%" width="500%" height="500%">
  <feGaussianBlur stdDeviation="2" result="blur" />
  <feMerge>
    <feMergeNode in="blur" />
    <feMergeNode in="blur" />
    <feMergeNode in="blur" />
    <feMergeNode in="SourceGraphic" />
  </feMerge>
</filter>
```

#### 6. Line Rendering with Active State
```jsx
const isActive = activeLines.has(key);

// Color
let strokeColor = `rgba(255,255,255,${baseOpacity})`;
if (isActive) {
  strokeColor = '#f97316'; // Bright orange
} else if (line.isAccent) {
  strokeColor = `${line.accentColor}${accentOpacity}`;
}

// Stroke width - thicker when active
strokeWidth={
  isActive ? 1.2 :
  line.isAccent ? 0.5 :
  line.weight === 'thick' ? 0.4 :
  line.weight === 'medium' ? 0.28 : 0.15
}

// Glow filter
filter={isActive ? 'url(#pingGlow)' : 'none'}

// Smooth transitions
style={{ 
  transition: 'stroke 0.3s ease, stroke-width 0.3s ease, filter 0.3s ease',
  cursor: 'pointer',
  pointerEvents: 'auto'
}}

// Hover handler
onMouseEnter={() => onLineHover(tierIndex, lineIndex, tierLines)}
```

### Critical Implementation Notes

1. **Index Tracking**: After implementing text safe zone (skipping left 48%), use `visibleIndex` that starts at 0 for first visible line, not the original x-based index.

2. **Line Distance**: Ensure ping partners are far apart:
   - Auto-ping: l1 from 0-100, l2 from 200-300
   - Hover: partner at least 50 indices away

3. **Different Tiers**: Partners should always be in different tiers:
   ```javascript
   const otherTier = (tierIdx + 1 + Math.floor(Math.random() * 2)) % 3;
   ```

4. **Timing**:
   - 150ms delay between first and second line
   - 1800ms total duration before fade
   - 3000ms interval for auto-ping
   - 0.3s CSS transition for smooth effect

5. **Visual Enhancement**:
   - Orange color (#f97316) for high visibility on dark background
   - Stroke width increases from 0.15-0.4 to 1.2 when active
   - Strong glow filter (stdDeviation="2")

---

## Final Design (v11)

### P2P Ping Effect

| Property | Value |
|----------|-------|
| Ping color | #f97316 (orange) |
| Active stroke width | 1.2 |
| Glow blur | 2 |
| First→Second delay | 150ms |
| Total ping duration | 1800ms |
| Auto-ping interval | 3000ms |
| Min partner distance | 50 indices |
| CSS transition | 0.3s ease |

### Behavior Summary

**Auto-ping (every 3 seconds):**
1. Random line in tier A lights up orange
2. 150ms later, distant line in tier B lights up orange
3. Both glow together for 1.65 seconds
4. Both fade out smoothly

**Hover-ping:**
1. User hovers over a line → it lights up orange
2. 150ms later, a distant partner in different tier lights up
3. Both glow together
4. Both fade out after 1.8 seconds

---

## Background Pattern (unchanged from v10)

### Text Safe Area
| Zone | X Position | Effect |
|------|------------|--------|
| Text safe | 0–48% | No lines |
| Transition | 48–58% | Fade-in |
| Full | 58–100% | Full opacity |

### Dense 3-Tier Barcode
| Tier | Position | Offset | Spacing |
|------|----------|--------|---------|
| 1 | 18–32% | 0 | 1.5px |
| 2 | 34–48% | +0.75px | 1.65px |
| 3 | 50–64% | +1.5px | 1.35px |

### Variable Stroke Widths
| Weight | Width | Distribution |
|--------|-------|--------------|
| Thin | 0.15 | 60% |
| Medium | 0.28 | 30% |
| Thick | 0.4 | 10% |
| Accent | 0.5 | special |
| **Active** | **1.2** | on ping |

---

## Component Structure

```
OTCHero
├── State: activeLines (Set of line keys)
├── triggerPing(key1, key2) - Sequential light-up with delay
├── Auto-ping useEffect (3s interval)
├── handleLineHover callback
│
├── BackgroundPattern
│   ├── SVG with pingGlow filter
│   └── Lines check activeLines.has(key) for styling
│
└── Content (unchanged)
```

---

## Debugging Checklist

If pings don't appear:

1. **Check index range**: Are auto-ping indices (0-100, 200-300) within actual visible line count?
2. **Check key format**: `getLineKey(tierIdx, lineIdx)` must match between trigger and render
3. **Check activeLines state**: Console.log to verify Set contains keys
4. **Check CSS transitions**: Ensure not overridden
5. **Check filter**: Verify `pingGlow` filter is defined in `<defs>`
6. **Check color contrast**: Orange should be visible on dark bg

---

## Status
- ✅ Text safe area mask
- ✅ Variable stroke widths
- ✅ P2P auto-ping (every 3s)
- ✅ P2P hover-ping
- ✅ Sequential light-up (150ms delay)
- ✅ Orange glow effect
- ✅ Smooth transitions
- ⏳ Right column visual TBD
- ⏳ Mobile responsive refinements

---

## Next Steps
1. Verify ping is visible across different screen sizes
2. Consider adding a subtle connection line between pinging pairs (optional)
3. Design right column visual
4. Test hover interaction on touch devices

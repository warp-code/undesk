# OTC Page Analysis

**File:** `frontend/app/otc/page.tsx`
**Lines:** 1063
**Date:** 2026-01-22

---

## Executive Summary

The OTC page is a monolithic 1000+ line component that handles multiple responsibilities. While functional, it would benefit significantly from decomposition, extraction of reusable patterns, and better separation of concerns.

---

## Critical Issues

### 1. Component Size & Single Responsibility Violation

The component is responsible for:
- Navbar rendering
- Create Deal form (with token selection dropdowns)
- Make Offer form
- Your Deals table
- Open Market table
- Your Offers table
- Deal details expanded view
- FAQ accordion
- Tab navigation with animated underline

**Recommendation:** Split into 8-12 smaller components.

### 2. Excessive State (20+ useState Hooks)

```typescript
// Lines 110-144: 20+ separate useState calls
const [sellToken, setSellToken] = useState<Token>("META");
const [quoteToken, setQuoteToken] = useState<Token>("USDC");
const [sellAmount, setSellAmount] = useState("4444");
const [pricePerUnit, setPricePerUnit] = useState("444");
const [expiresIn, setExpiresIn] = useState("24");
const [allowPartial, setAllowPartial] = useState(true);
const [isLocked, setIsLocked] = useState(false);
const [isLoading, setIsLoading] = useState(false);
const [sellTokenDropdownOpen, setSellTokenDropdownOpen] = useState(false);
const [quoteTokenDropdownOpen, setQuoteTokenDropdownOpen] = useState(false);
const [activeTab, setActiveTab] = useState<"deals" | "market" | "offers">("market");
const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS);
const [marketDeals] = useState<MarketDeal[]>(MOCK_MARKET_DEALS);
const [offers] = useState<Offer[]>(MOCK_OFFERS);
const [pairFilter, setPairFilter] = useState<string>("all");
const [selectedMarketDeal, setSelectedMarketDeal] = useState<MarketDeal | null>(null);
const [offerAmount, setOfferAmount] = useState("");
const [offerPrice, setOfferPrice] = useState("");
const [isOfferLoading, setIsOfferLoading] = useState(false);
const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
// ... plus refs
```

**Recommendation:**
- Group related state with custom hooks (e.g., `useCreateDealForm`, `useMakeOfferForm`)
- Consider `useReducer` for complex state transitions
- Extract form state into form-specific components

### 3. Inline Mock Data (Lines 86-106)

Mock data is defined at module level in the component file. This mixes test/development concerns with production code.

**Recommendation:** Move to `lib/mocks/` or `__mocks__/` directory.

---

## Code Smells

### 4. Duplicated Token Dropdown Logic

Lines 477-514 and 533-570 contain nearly identical dropdown implementations for sell and quote tokens.

```typescript
// Sell token dropdown (477-514)
<div className="relative" ref={sellDropdownRef}>
  <button onClick={() => { setSellTokenDropdownOpen(!sellTokenDropdownOpen); ... }}>
    ...
  </button>
  {sellTokenDropdownOpen && (
    <div className="absolute ...">
      {TOKENS.filter(t => t !== quoteToken).map((token) => ( ... ))}
    </div>
  )}
</div>

// Quote token dropdown (533-570) - nearly identical
```

**Recommendation:** Extract `<TokenDropdown>` component:
```typescript
interface TokenDropdownProps {
  selected: Token;
  onSelect: (token: Token) => void;
  exclude?: Token;
  disabled?: boolean;
}
```

### 5. Inline SVG Icons

Multiple SVGs are defined inline throughout the component:
- Chevron icons (lines 491, 547, 674, 1030)
- Close/X icon (line 361)
- Spinner icon (lines 446, 644)
- Back arrow (line 668)

**Recommendation:** Create an `icons/` directory with reusable icon components:
```typescript
// components/icons/ChevronDown.tsx
// components/icons/Spinner.tsx
// components/icons/Close.tsx
// components/icons/ArrowLeft.tsx
```

### 6. Magic Numbers

```typescript
// Line 275-276
const isUrgent = (expiresAt: number) => {
  const diff = expiresAt - Date.now();
  return diff > 0 && diff < 7200000; // What is 7200000?
};

// Line 239
expiresAt: Date.now() + parseFloat(expiresIn) * 3600000, // 3600000 = 1 hour in ms
```

**Recommendation:** Extract to constants:
```typescript
const MS_PER_HOUR = 3600000;
const URGENT_THRESHOLD_MS = 2 * MS_PER_HOUR;
```

### 7. Long Conditional Rendering Chains

Lines 351-654 contain a massive ternary for showing either Make Offer or Create Deal forms.
Lines 661-993 contain another large conditional for Deal Details vs Tabs.

**Recommendation:** Extract to separate components:
```typescript
{selectedMarketDeal ? (
  <MakeOfferForm deal={selectedMarketDeal} onSubmit={...} onClose={...} />
) : (
  <CreateDealForm onSubmit={...} />
)}
```

### 8. Repeated Input Field Patterns

The input fields follow a consistent pattern but are duplicated:
```typescript
<div className="bg-input rounded-md px-3 py-2 flex justify-between border border-transparent hover:border-border focus-within:border-primary hover:focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
  <input ... />
  <span className="text-muted-foreground">{unit}</span>
</div>
```

This pattern appears at least 6 times.

**Recommendation:** Create `<FormInput>` component:
```typescript
interface FormInputProps {
  value: string;
  onChange: (value: string) => void;
  suffix?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'number';
}
```

### 9. Repeated Table Structures

Three tables share similar structures (Your Deals, Open Market, Your Offers). Each has:
- Empty state handling
- Consistent header styling
- Row hover effects
- Status rendering

**Recommendation:** Create `<DataTable>` component with column definitions.

---

## Moderate Issues

### 10. Mixed Business Logic in Component

Functions like `handleSubmit` (lines 222-246) and `handlePlaceOffer` (lines 248-260) contain business logic mixed with UI concerns.

**Recommendation:** Extract to custom hooks:
```typescript
const { createDeal, isCreating } = useCreateDeal();
const { placeOffer, isPlacing } = usePlaceOffer();
```

### 11. FAQ Data Hardcoded in Component

Lines 182-199 define FAQ content inline.

**Recommendation:** Move to a constants file or CMS.

### 12. Time Formatting Logic Inline

`formatTimeRemaining` (lines 263-271) is a general utility defined inside the component.

**Recommendation:** Move to `lib/utils/time.ts` or `lib/format.ts`.

### 13. Inconsistent Status Rendering

Status badges are rendered with inline logic in multiple places:
- Lines 821-831 (Your Deals status)
- Lines 900-905 (Open Market status)
- Lines 964-975 (Your Offers status)

Each has different styling and logic.

**Recommendation:** Create `<StatusBadge>` component with variants.

### 14. Tab Navigation Logic

Lines 139-161 handle tab underline animation with refs and effects. This is a reusable pattern.

**Recommendation:** Extract to `<TabNavigation>` or use a hook like `useAnimatedTabs`.

---

## Minor Issues

### 15. Unused `setTick` Pattern

```typescript
// Lines 143-150
const [, setTick] = useState(0);

useEffect(() => {
  if (!selectedMarketDeal) return;
  const interval = setInterval(() => setTick((t) => t + 1), 1000);
  return () => clearInterval(interval);
}, [selectedMarketDeal]);
```

This forces re-renders every second. Consider using a more targeted approach.

**Recommendation:** Use `useCountdown` hook that returns the formatted time directly.

### 16. `handleNumberInput` Could Use Debouncing

Lines 214-220 validate on every keystroke. For performance, consider debouncing or using `onBlur` validation.

### 17. Type Assertion in Click Handler

```typescript
// Lines 169-170
const handleClickOutside = (e: MouseEvent) => {
  if (sellDropdownRef.current && !sellDropdownRef.current.contains(e.target as Node)) {
```

**Recommendation:** Use type guards or event delegation.

### 18. Potential Memory Leak in Dropdown Effect

Lines 168-179 add event listener but rely on cleanup. If component unmounts during async operation, this is fine, but the pattern could be cleaner with a hook.

**Recommendation:** Use `useClickOutside` hook.

### 19. Loading State Could Be Better

Current loading shows a spinner inside the button. Consider skeleton states for tables during data fetching.

### 20. No Error Handling

`handleSubmit` and `handlePlaceOffer` don't handle errors. When real API calls replace setTimeout, this will be critical.

---

## Accessibility Issues

### 21. Missing Form Labels Association

Inputs use adjacent `<label>` but without `htmlFor`/`id` association:
```typescript
<label className="text-muted-foreground text-base mb-1 block">
  You sell
</label>
<div className="...">
  <input ... /> // No id, label not associated
</div>
```

### 22. Table Rows as Buttons

```typescript
// Line 892-895
<tr
  className="... cursor-pointer ..."
  onClick={() => handleMarketDealClick(deal)}
>
```

Clickable rows should be keyboard accessible (`onKeyDown`, `tabIndex`, `role="button"`).

### 23. Status Information Not Screen Reader Friendly

Status badges use colors alone to convey meaning.

**Recommendation:** Add `aria-label` or visually hidden text.

---

## Performance Considerations

### 24. Unnecessary Re-renders

The countdown timer causes the entire component to re-render every second when a deal is selected. With 20+ state variables, this could cause performance issues.

### 25. Large Component Tree

A single component managing this much state means React's reconciliation has more work to do on each render.

---

## Proposed Component Structure

```
components/
├── otc/
│   ├── OTCPage.tsx              # Main layout, orchestrates sub-components
│   ├── Navbar.tsx               # Top navigation
│   ├── forms/
│   │   ├── CreateDealForm.tsx   # Create deal form
│   │   ├── MakeOfferForm.tsx    # Make offer form
│   │   └── FormInput.tsx        # Reusable input component
│   ├── tables/
│   │   ├── DealsTable.tsx       # Your Deals table
│   │   ├── MarketTable.tsx      # Open Market table
│   │   ├── OffersTable.tsx      # Your Offers table
│   │   └── DataTable.tsx        # Base table component
│   ├── DealDetails.tsx          # Expanded deal view
│   ├── TokenDropdown.tsx        # Token selector dropdown
│   ├── TabNavigation.tsx        # Animated tabs
│   ├── StatusBadge.tsx          # Status indicators
│   └── FAQ.tsx                  # FAQ accordion
├── icons/
│   ├── ChevronDown.tsx
│   ├── Spinner.tsx
│   ├── Close.tsx
│   └── ArrowLeft.tsx
└── ui/
    └── ... (shared UI primitives)

hooks/
├── useCreateDeal.ts
├── usePlaceOffer.ts
├── useClickOutside.ts
├── useCountdown.ts
└── useAnimatedTabs.ts

lib/
├── constants/
│   └── time.ts                  # Time-related constants
├── utils/
│   └── format.ts                # formatTimeRemaining, etc.
└── mocks/
    └── otc.ts                   # Mock data for development
```

---

## Priority Matrix

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| High | Split into components (#1) | High | High |
| High | Extract forms (#2, #4, #8) | Medium | High |
| High | Extract custom hooks (#10) | Medium | High |
| Medium | Create icon components (#5) | Low | Medium |
| Medium | Extract constants (#6) | Low | Medium |
| Medium | Create StatusBadge (#13) | Low | Medium |
| Medium | Move mock data (#3) | Low | Medium |
| Low | Accessibility fixes (#21-23) | Medium | Medium |
| Low | Performance optimizations (#24-25) | Medium | Low |

---

## Next Steps

1. **Phase 1:** Extract reusable primitives (FormInput, TokenDropdown, icons)
2. **Phase 2:** Extract forms (CreateDealForm, MakeOfferForm)
3. **Phase 3:** Extract tables and table-related components
4. **Phase 4:** Extract business logic into hooks
5. **Phase 5:** Clean up main component, add accessibility improvements

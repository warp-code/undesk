# OTC Page Component Decomposition Plan

## Goal
Break down the 1063-line monolithic `frontend/app/otc/page.tsx` into smaller, focused components through safe, incremental steps.

## Principles
- **One extraction per step** - each step does one thing
- **App remains functional after each step** - no broken intermediate states
- **Test visually after each step** - verify nothing regressed
- **Extract, don't rewrite** - move code as-is first, improve later

## Directory Structure to Create
```
frontend/app/otc/
├── page.tsx              (slim orchestrator)
├── _components/
│   ├── Navbar.tsx
│   ├── TokenIcon.tsx
│   ├── TokenDropdown.tsx
│   ├── FormInput.tsx
│   ├── CreateDealForm.tsx
│   ├── MakeOfferForm.tsx
│   ├── TabNavigation.tsx
│   ├── DealsTable.tsx
│   ├── MarketTable.tsx
│   ├── OffersTable.tsx
│   ├── DealDetails.tsx
│   ├── FAQPanel.tsx
│   └── StatusBadge.tsx
└── _lib/
    ├── constants.ts
    ├── types.ts
    └── format.ts
```

**Why this structure:**
- Everything OTC-related is co-located in `app/otc/`
- `_` prefix excludes from Next.js routing
- Junior devs can find everything in one folder
- Easy to move/promote to shared later if needed

---

## Phase 1: Foundation Setup

### Step 1.1: Create directory structure and extract types/constants
**Files to create:**
- `frontend/app/otc/_lib/types.ts` - Move `Token`, `Pair`, `Deal`, `MarketDeal`, `Offer` types
- `frontend/app/otc/_lib/constants.ts` - Move `TOKENS`, `PAIRS`, mock data

**Changes to `otc/page.tsx`:**
- Add imports from new files
- Remove moved code

**Risk:** Low - just moving declarations

---

### Step 1.2: Extract utility functions
**Files to create:**
- `frontend/app/otc/_lib/format.ts` - Move `formatTimeRemaining`, `isUrgent`, `getTimeProgress`, `getPairFromLabel`

**Changes to `otc/page.tsx`:**
- Import utilities
- Remove function definitions

**Risk:** Low - pure functions with no dependencies

---

## Phase 2: Extract Leaf Components (no children, no state)

### Step 2.1: Extract TokenIcon
**File:** `frontend/app/otc/_components/TokenIcon.tsx`

Move the existing `TokenIcon` component (lines 17-42). Already self-contained.

**Risk:** Very low

---

### Step 2.2: Extract StatusBadge
**File:** `frontend/app/otc/_components/StatusBadge.tsx`

Create a component to handle the various status badge patterns:
- Deal status: open, executed, expired
- Offer status: pending, passed, partial, failed
- Market status: open, has offers

Currently inline in 3 places with different logic.

**Risk:** Low - presentational only

---

### Step 2.3: Extract FormInput
**File:** `frontend/app/otc/_components/FormInput.tsx`

Extract the repeated input pattern (appears 6+ times):
```tsx
<div className="bg-input rounded-md px-3 py-2 flex justify-between border...">
  <input ... />
  <span className="text-muted-foreground">{suffix}</span>
</div>
```

**Risk:** Low - presentational with controlled input

---

## Phase 3: Extract Interactive Components

### Step 3.1: Extract TokenDropdown
**File:** `frontend/app/otc/_components/TokenDropdown.tsx`

Props: `selected`, `onSelect`, `exclude`, `disabled`

Includes click-outside logic. Will need to move the `useClickOutside` pattern or create a hook.

**Risk:** Medium - has internal state and refs

---

### Step 3.2: Extract TabNavigation
**File:** `frontend/app/otc/_components/TabNavigation.tsx`

Extract the animated tab bar (lines 751-777) with its underline animation logic.

Props: `tabs`, `activeTab`, `onTabChange`

**Risk:** Medium - has refs and resize effects

---

### Step 3.3: Extract FAQPanel
**File:** `frontend/app/otc/_components/FAQPanel.tsx`

Extract the entire right panel (lines 996-1056) including FAQ accordion state.

**Risk:** Low - self-contained with own state

---

## Phase 4: Extract Form Components

### Step 4.1: Extract CreateDealForm
**File:** `frontend/app/otc/_components/CreateDealForm.tsx`

Extract lines 456-653. This is the larger form.

Props: `onDealCreated: (deal: Deal) => void`

Internal state: sellToken, quoteToken, sellAmount, pricePerUnit, expiresIn, allowPartial, isLocked, isLoading, dropdown states

**Risk:** Medium-High - significant state, uses TokenDropdown, FormInput

---

### Step 4.2: Extract MakeOfferForm
**File:** `frontend/app/otc/_components/MakeOfferForm.tsx`

Extract lines 352-454.

Props: `deal: MarketDeal`, `onOfferPlaced: () => void`, `onClose: () => void`

Internal state: offerAmount, offerPrice, isOfferLoading

**Risk:** Medium - less state than CreateDealForm

---

## Phase 5: Extract Table Components

### Step 5.1: Extract DealsTable
**File:** `frontend/app/otc/_components/DealsTable.tsx`

Extract lines 782-847.

Props: `deals: Deal[]`

**Risk:** Low - presentational, receives data via props

---

### Step 5.2: Extract MarketTable
**File:** `frontend/app/otc/_components/MarketTable.tsx`

Extract lines 850-921.

Props: `deals: MarketDeal[]`, `filter: string`, `onFilterChange`, `onDealSelect`

**Risk:** Low-Medium - has filter state interaction

---

### Step 5.3: Extract OffersTable
**File:** `frontend/app/otc/_components/OffersTable.tsx`

Extract lines 924-989.

Props: `offers: Offer[]`

**Risk:** Low - presentational

---

## Phase 6: Extract Remaining Components

### Step 6.1: Extract DealDetails
**File:** `frontend/app/otc/_components/DealDetails.tsx`

Extract lines 661-747.

Props: `deal: MarketDeal`, `onBack: () => void`

**Risk:** Low - presentational with countdown

---

### Step 6.2: Extract Navbar
**File:** `frontend/app/otc/_components/Navbar.tsx`

Extract lines 328-344.

**Risk:** Very low - static presentational

---

## Phase 7: Final Cleanup

### Step 7.1: Slim down page.tsx
After all extractions, `page.tsx` should be ~100-150 lines:
- Imports
- Top-level state (activeTab, selectedMarketDeal, deals, offers, pairFilter)
- Layout orchestration
- Passing props between components

### Step 7.2: Review and polish
- Ensure consistent prop naming
- Add missing TypeScript types
- Verify all imports are clean

---

## Execution Approach
**One step at a time** - After each extraction, pause for user verification before proceeding.

## Verification After Each Step
1. Run `yarn dev`
2. Navigate to `/otc`
3. Test the specific functionality that was extracted
4. Verify no console errors
5. User confirms before next step

## Files Modified
- `frontend/app/otc/page.tsx` (incrementally reduced)
- New files created as listed above

## Estimated Steps: 15 discrete changes

# Future Enhancements

Ideas and improvements to consider for later phases.

---

## Optimistic UI Updates

**Context:** Currently we rely on Supabase Realtime subscriptions to update the UI after on-chain mutations. The indexer may not immediately pick up changes, so there can be a delay between a user creating a deal/submitting an offer and seeing it reflected in the UI.

**Idea:** Implement optimistic updates where we immediately add the new deal/offer to the local state while waiting for the realtime subscription to confirm. This provides instant feedback to the user.

**Considerations:**
- Need to handle rollback if the on-chain transaction fails
- Need to reconcile optimistic state with actual data when realtime update arrives
- May need to mark optimistic entries differently in the UI (e.g., "pending" indicator)
- Need to handle edge cases like duplicate entries if realtime arrives before optimistic cleanup

**Priority:** Low - current realtime approach works, this is a UX polish item.

---

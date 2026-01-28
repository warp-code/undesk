"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { TabId } from "../_components/TabNavigation";

interface UrlState {
  view: TabId;
  dealId: string | null;
  offerId: string | null;
}

interface UseUrlStateReturn {
  state: UrlState;
  setView: (view: TabId) => void;
  navigateToDeal: (dealId: string) => void;
  navigateToOffer: (offerId: string) => void;
  navigateBack: () => void;
  navigateBackFromOffer: () => void;
}

export function useUrlState(): UseUrlStateReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const viewParam = searchParams.get("view");
  const validViews: TabId[] = ["market", "deals", "offers"];
  const view = validViews.includes(viewParam as TabId)
    ? (viewParam as TabId)
    : "market";

  const state: UrlState = {
    view,
    dealId: searchParams.get("deal"),
    offerId: searchParams.get("offer"),
  };

  const updateParams = (updates: Partial<UrlState>) => {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.view !== undefined) {
      params.set("view", updates.view);
    }

    if (updates.dealId !== undefined) {
      if (updates.dealId === null) {
        params.delete("deal");
      } else {
        params.set("deal", updates.dealId);
      }
    }

    if (updates.offerId !== undefined) {
      if (updates.offerId === null) {
        params.delete("offer");
      } else {
        params.set("offer", updates.offerId);
      }
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  return {
    state,
    setView: (view) => updateParams({ view, dealId: null, offerId: null }),
    navigateToDeal: (dealId) =>
      updateParams({ view: state.view, dealId, offerId: null }),
    navigateToOffer: (offerId) =>
      updateParams({ view: "offers", offerId, dealId: null }),
    navigateBack: () => updateParams({ dealId: null }),
    navigateBackFromOffer: () => updateParams({ offerId: null }),
  };
}

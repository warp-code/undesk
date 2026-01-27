"use client";

import { useState, useEffect, Suspense } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { MOCK_DEALS, MOCK_MARKET_DEALS, MOCK_OFFERS } from "./_lib/constants";
import type { Deal, MarketDeal, Offer } from "./_lib/types";
import { FAQPanel } from "./_components/FAQPanel";
import { TabNavigation } from "./_components/TabNavigation";
import { Navbar } from "./_components/Navbar";
import { DealsTable } from "./_components/DealsTable";
import { MarketTable } from "./_components/MarketTable";
import { OffersTable } from "./_components/OffersTable";
import { DealDetails } from "./_components/DealDetails";
import { MakeOfferForm } from "./_components/MakeOfferForm";
import { CreateDealForm } from "./_components/CreateDealForm";
import { DealNotFound } from "./_components/DealNotFound";
import { ConnectPrompt } from "./_components/ConnectPrompt";
import { useUrlState } from "./_hooks/useUrlState";
import { useMyDeals } from "./_hooks/useMyDeals";
import { useMyOffers } from "./_hooks/useMyOffers";
import { useMarketDeals } from "./_hooks/useMarketDeals";
import { useDerivedKeysContext } from "./_providers/DerivedKeysProvider";
import { useMxePublicKey } from "./_providers/OtcProvider";

// Toggle for mock data mode
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <svg
        className="w-8 h-8 animate-spin text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        Something went wrong
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
    </div>
  );
}

function OTCPageContent() {
  const { state, setView, navigateToDeal, navigateBack } = useUrlState();

  // Wallet and key state
  const { connected } = useWallet();
  const { hasDerivedKeys, deriveKeysFromWallet, isDerivingKeys } =
    useDerivedKeysContext();
  const mxePublicKey = useMxePublicKey();

  // Call hooks unconditionally (React rules)
  const realDeals = useMyDeals();
  const realMarket = useMarketDeals();
  const realOffers = useMyOffers();

  // Choose data source based on mock toggle
  const deals = USE_MOCK ? MOCK_DEALS : realDeals.deals;
  const marketDeals = USE_MOCK ? MOCK_MARKET_DEALS : realMarket.marketDeals;
  const offers = USE_MOCK ? MOCK_OFFERS : realOffers.offers;

  // Loading and error states
  const dealsLoading = USE_MOCK ? false : realDeals.isLoading;
  const dealsError = USE_MOCK ? null : realDeals.error;
  const marketLoading = USE_MOCK ? false : realMarket.isLoading;
  const marketError = USE_MOCK ? null : realMarket.error;
  const offersLoading = USE_MOCK ? false : realOffers.isLoading;
  const offersError = USE_MOCK ? null : realOffers.error;

  // Can view private data (deals/offers that require decryption)
  const canViewPrivateData =
    USE_MOCK || (connected && hasDerivedKeys && mxePublicKey !== null);

  // Refetch function for after deal creation
  const refetchDeals = realDeals.refetch;

  const [baseMintFilter, setBaseMintFilter] = useState<string | null>(null);

  // Check if selected deal is user's own deal (for showing decrypted data)
  const selectedUserDeal = state.dealId
    ? deals.find((d) => d.id === state.dealId)
    : undefined;

  // Derive selected deal from URL - check marketDeals first, then user's deals
  const selectedMarketDeal: MarketDeal | null = state.dealId
    ? marketDeals.find((d) => d.id === state.dealId) ??
      // If not in market (e.g., executed/expired), create from user's deal
      (selectedUserDeal
        ? {
            id: selectedUserDeal.id,
            baseMint: selectedUserDeal.baseMint,
            quoteMint: selectedUserDeal.quoteMint,
            expiresAt: selectedUserDeal.expiresAt,
            createdAt: selectedUserDeal.createdAt,
            allowPartial: selectedUserDeal.allowPartial,
            offerCount: selectedUserDeal.offerCount,
          }
        : null)
    : null;

  // Check if deal ID is in URL but deal not found
  const dealNotFound = state.dealId !== null && selectedMarketDeal === null;

  // Real-time countdown state for DealDetails
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!selectedMarketDeal) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [selectedMarketDeal]);

  // Filter market deals
  const filteredMarketDeals =
    baseMintFilter === null
      ? marketDeals
      : marketDeals.filter((d) => d.baseMint === baseMintFilter);

  // Handle row click
  const handleMarketDealClick = (deal: MarketDeal) => {
    navigateToDeal(deal.id);
  };

  const handleDealClick = (deal: Deal) => {
    navigateToDeal(deal.id);
  };

  const handleOfferClick = (offer: Offer) => {
    navigateToDeal(offer.dealId);
  };

  // Collapse back to table
  const handleCollapse = () => {
    navigateBack();
  };

  // Handle new deal created
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDealCreated = (_newDeal: Deal) => {
    refetchDeals();
    setView("deals");
  };

  // Handle offer placed
  const handleOfferPlaced = () => {
    navigateBack();
    setView("offers");
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Navbar */}
      <Navbar />

      {/* Three-column layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left Panel - Create Deal or Make Offer form */}
        <div className="w-[440px] shrink-0 border-r border-border p-4 overflow-y-auto">
          <div className="bg-card/50 border border-border rounded-lg p-4">
            {/* Show Make Offer form when deal is selected, otherwise Create Deal */}
            {selectedMarketDeal ? (
              <MakeOfferForm
                deal={selectedMarketDeal}
                onOfferPlaced={handleOfferPlaced}
                onClose={handleCollapse}
              />
            ) : (
              <CreateDealForm onDealCreated={handleDealCreated} />
            )}
          </div>
        </div>

        {/* Center Panel - Tables or Deal Details */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="bg-card/50 border border-border rounded-lg">
            {/* Show Deal Not Found error */}
            {dealNotFound ? (
              <DealNotFound dealId={state.dealId!} onBack={handleCollapse} />
            ) : selectedMarketDeal ? (
              <DealDetails
                deal={selectedMarketDeal}
                userDeal={selectedUserDeal}
                onBack={handleCollapse}
              />
            ) : (
              <>
                {/* Tab Navigation */}
                <TabNavigation activeTab={state.view} onTabChange={setView} />

                {/* Tab Content */}
                <div className="p-4">
                  {state.view === "deals" &&
                    (dealsError ? (
                      <ErrorMessage message={dealsError} />
                    ) : dealsLoading ? (
                      <LoadingSpinner />
                    ) : canViewPrivateData ? (
                      <DealsTable deals={deals} onDealClick={handleDealClick} />
                    ) : (
                      <ConnectPrompt
                        connected={connected}
                        hasDerivedKeys={hasDerivedKeys}
                        onDeriveKeys={deriveKeysFromWallet}
                        isDerivingKeys={isDerivingKeys}
                        mxeKeyLoading={connected && hasDerivedKeys && mxePublicKey === null}
                      />
                    ))}
                  {state.view === "market" &&
                    (marketError ? (
                      <ErrorMessage message={marketError} />
                    ) : marketLoading ? (
                      <LoadingSpinner />
                    ) : (
                      <MarketTable
                        deals={marketDeals}
                        filteredDeals={filteredMarketDeals}
                        baseMintFilter={baseMintFilter}
                        onBaseMintFilterChange={setBaseMintFilter}
                        onDealClick={handleMarketDealClick}
                      />
                    ))}
                  {state.view === "offers" &&
                    (offersError ? (
                      <ErrorMessage message={offersError} />
                    ) : offersLoading ? (
                      <LoadingSpinner />
                    ) : canViewPrivateData ? (
                      <OffersTable offers={offers} onOfferClick={handleOfferClick} />
                    ) : (
                      <ConnectPrompt
                        connected={connected}
                        hasDerivedKeys={hasDerivedKeys}
                        onDeriveKeys={deriveKeysFromWallet}
                        isDerivingKeys={isDerivingKeys}
                        mxeKeyLoading={connected && hasDerivedKeys && mxePublicKey === null}
                      />
                    ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Negotiation */}
        <FAQPanel />
      </div>

      {/* Footer border */}
      <div className="border-t border-border h-3 shrink-0" />
    </div>
  );
}

export default function OTCPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <OTCPageContent />
    </Suspense>
  );
}

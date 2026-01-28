"use client";

interface OfferNotFoundProps {
  offerId: string;
  error?: string | null;
  onBack: () => void;
}

export const OfferNotFound = ({
  offerId,
  error,
  onBack,
}: OfferNotFoundProps) => {
  return (
    <div className="p-8 text-center">
      <div className="text-muted-foreground mb-2">
        {error || "Offer not found"}
      </div>
      <div className="text-sm text-muted-foreground/70 mb-4">
        The offer &quot;{offerId.slice(0, 8)}...&quot; does not exist, has been
        removed, or you do not have access to it.
      </div>
      <button onClick={onBack} className="text-sm text-primary hover:underline">
        Back to your offers
      </button>
    </div>
  );
};

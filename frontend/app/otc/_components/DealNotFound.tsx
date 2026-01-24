"use client";

interface DealNotFoundProps {
  dealId: string;
  onBack: () => void;
}

export const DealNotFound = ({ dealId, onBack }: DealNotFoundProps) => {
  return (
    <div className="p-8 text-center">
      <div className="text-muted-foreground mb-2">Deal not found</div>
      <div className="text-sm text-muted-foreground/70 mb-4">
        The deal &quot;{dealId}&quot; does not exist or has been removed.
      </div>
      <button onClick={onBack} className="text-sm text-primary hover:underline">
        Back to market
      </button>
    </div>
  );
};

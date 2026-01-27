"use client";

interface ConnectPromptProps {
  connected: boolean;
  hasDerivedKeys: boolean;
  onDeriveKeys: () => void;
  isDerivingKeys: boolean;
  mxeKeyLoading?: boolean;
}

export function ConnectPrompt({
  connected,
  hasDerivedKeys,
  onDeriveKeys,
  isDerivingKeys,
  mxeKeyLoading = false,
}: ConnectPromptProps) {
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
          <svg
            className="w-6 h-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          Connect your wallet
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Connect your wallet to view your deals and offers. Your data is
          encrypted and only visible to you.
        </p>
      </div>
    );
  }

  if (!hasDerivedKeys) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
          <svg
            className="w-6 h-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          Derive encryption keys
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          Sign a message to derive your encryption keys. This allows you to
          decrypt your private deal data.
        </p>
        <button
          onClick={onDeriveKeys}
          disabled={isDerivingKeys}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isDerivingKeys ? (
            <span className="flex items-center gap-2">
              <svg
                className="w-4 h-4 animate-spin"
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
              Signing...
            </span>
          ) : (
            "Derive Keys"
          )}
        </button>
      </div>
    );
  }

  if (mxeKeyLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="w-8 h-8 animate-spin text-muted-foreground mb-4"
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
        <p className="text-sm text-muted-foreground">
          Loading encryption keys...
        </p>
      </div>
    );
  }

  return null;
}

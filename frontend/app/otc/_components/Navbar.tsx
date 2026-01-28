import { WalletButton } from "./WalletButton";

export const Navbar = () => {
  return (
    <nav className="border-b border-border bg-card/50 shrink-0">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a
            href="/"
            className="text-foreground font-semibold text-lg hover:text-primary transition-colors"
          >
            Undesk
          </a>
          <div className="flex gap-4 text-sm">
            <a href="/otc" className="text-foreground font-medium">
              Trade
            </a>
          </div>
        </div>
        <WalletButton />
      </div>
    </nav>
  );
};

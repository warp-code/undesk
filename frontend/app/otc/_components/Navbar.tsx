export const Navbar = () => {
  return (
    <nav className="border-b border-border bg-card/50 shrink-0">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a
            href="/"
            className="text-foreground font-semibold text-lg hover:text-primary transition-colors"
          >
            Veil OTC
          </a>
          <div className="flex gap-4 text-sm">
            <a href="/otc" className="text-foreground font-medium">
              Trade
            </a>
            <a
              href="#"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              History
            </a>
            <a
              href="#"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </a>
            <a
              href="#"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Settings
            </a>
          </div>
        </div>
        <button className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 px-3 py-1.5 rounded-md font-medium text-sm transition-colors">
          Connect Wallet
        </button>
      </div>
    </nav>
  );
};

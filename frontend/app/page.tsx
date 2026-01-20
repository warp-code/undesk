import Link from "next/link";

export default function HomePage() {
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-card/50 shrink-0">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Logo */}
            <span className="text-foreground font-semibold text-lg">Veil OTC</span>
            {/* Nav Links */}
            <div className="flex gap-4 text-sm">
              <Link href="/otc" className="text-muted-foreground hover:text-foreground transition-colors">
                Trade
              </Link>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                History
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                FAQ
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                Settings
              </a>
            </div>
          </div>
          {/* Connect Wallet Button */}
          <button className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 px-3 py-1.5 rounded font-medium text-sm transition-colors">
            Connect Wallet
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="max-w-2xl text-center space-y-6">
          <h1 className="text-5xl font-bold text-foreground">
            Private OTC Trading
          </h1>
          <p className="text-xl text-muted-foreground">
            Execute large trades with complete privacy. No slippage, no front-running,
            no information leakage.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Link
              href="/otc"
              className="bg-primary hover:bg-primary/80 text-primary-foreground px-6 py-3 rounded font-medium transition-colors"
            >
              Start Trading
            </Link>
            <a
              href="#"
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-6 py-3 rounded font-medium transition-colors"
            >
              Learn More
            </a>
          </div>
        </div>
      </main>

      {/* Footer border */}
      <div className="border-t border-border h-3 shrink-0" />
    </div>
  );
}

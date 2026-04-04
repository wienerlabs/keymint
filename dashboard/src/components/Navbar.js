import WalletConnect from "./WalletConnect";

export default function Navbar({ activePage, onNavigate, wallet, onWalletConnect, onWalletDisconnect, walletLoading }) {
  const pages = [
    { key: "overview", label: "Overview" },
    { key: "analytics", label: "Analytics" },
    { key: "query", label: "Query" },
    { key: "feed", label: "Live Feed" },
    { key: "pricing", label: "Pricing" },
  ];

  return (
    <nav className="border-b-2 border-black bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
        <div className="flex items-center gap-6">
          <button
            onClick={() => onNavigate("overview")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img
              src="/keymint.png"
              alt="Keymint"
              className="h-14 w-auto"
            />
            <span className="font-bold text-lg tracking-tight">Keymint</span>
          </button>
          <div className="flex gap-1">
            {pages.map((page) => (
              <button
                key={page.key}
                onClick={() => onNavigate(page.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border-2 ${
                  activePage === page.key
                    ? "border-black bg-black text-white"
                    : "border-transparent hover:border-black"
                }`}
              >
                {page.label}
              </button>
            ))}
          </div>
        </div>

        <WalletConnect
          wallet={wallet}
          onConnect={onWalletConnect}
          onDisconnect={onWalletDisconnect}
          loading={walletLoading}
        />
      </div>
    </nav>
  );
}

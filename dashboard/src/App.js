import { useState, useCallback } from "react";
import Navbar from "./components/Navbar";
import Overview from "./pages/Overview";
import Analytics from "./pages/Analytics";
import Query from "./pages/Query";
import LiveFeed from "./pages/LiveFeed";
import Pricing from "./pages/Pricing";
import { useWallet } from "./hooks/useWallet";

function App() {
  const [page, setPage] = useState("overview");
  const { wallet, loading, connect, disconnect, refreshBalance } = useWallet();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    refreshBalance();
  }, [refreshBalance]);

  const pages = {
    overview: <Overview key={refreshKey} />,
    analytics: <Analytics key={refreshKey} />,
    query: <Query wallet={wallet} onRefresh={handleRefresh} />,
    feed: <LiveFeed key={refreshKey} />,
    pricing: <Pricing />,
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar
        activePage={page}
        onNavigate={setPage}
        wallet={wallet}
        onWalletConnect={connect}
        onWalletDisconnect={disconnect}
        walletLoading={loading}
      />
      {pages[page]}
    </div>
  );
}

export default App;

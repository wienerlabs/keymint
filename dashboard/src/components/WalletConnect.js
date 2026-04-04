import { useState, useEffect } from "react";
import { fetchWalletList } from "../hooks/useWallet";
import { shortenAddress } from "../utils/format";
import StatusDot from "./StatusDot";

export default function WalletConnect({ wallet, onConnect, onDisconnect, loading }) {
  const [walletList, setWalletList] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fetchingList, setFetchingList] = useState(false);

  async function loadWallets() {
    setFetchingList(true);
    try {
      const list = await fetchWalletList();
      setWalletList(list);
      setShowDropdown(true);
    } catch {
      setWalletList([]);
    } finally {
      setFetchingList(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest(".wallet-dropdown")) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (wallet) {
    return (
      <div className="flex items-center gap-3">
        <div className="border-2 border-black rounded-xl px-4 py-2 flex items-center gap-3">
          <StatusDot status="online" pulse />
          <div>
            <div className="text-xs text-gray-500">{wallet.name}</div>
            <div className="text-sm font-bold">
              {shortenAddress(wallet.solanaAddress)}
            </div>
          </div>
          <div className="border-l-2 border-black pl-3 ml-1">
            <div className="text-xs text-gray-500">USDC</div>
            <div className="font-bold text-sm">
              ${wallet.balance?.usdc?.toFixed(4) || "0.0000"}
            </div>
          </div>
        </div>
        <button
          onClick={onDisconnect}
          className="border-2 border-black rounded-xl px-3 py-2 text-xs hover:bg-accent2/20 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="relative wallet-dropdown">
      <button
        onClick={loadWallets}
        disabled={loading || fetchingList}
        className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-accent1 hover:bg-accent1/80 transition-colors"
      >
        {loading ? "Connecting..." : fetchingList ? "Loading..." : "Connect Wallet"}
      </button>

      {showDropdown && walletList.length > 0 && (
        <div className="absolute right-0 mt-2 w-72 border-2 border-black rounded-xl bg-white z-50 overflow-hidden">
          <div className="px-4 py-2 border-b-2 border-black bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
            OWS Wallets
          </div>
          {walletList.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                onConnect(w.name);
                setShowDropdown(false);
              }}
              className="w-full px-4 py-3 text-left hover:bg-accent1/10 transition-colors border-b border-gray-100 last:border-0"
            >
              <div className="font-bold text-sm">{w.name}</div>
              <div className="text-xs text-gray-500 mt-1">
                {shortenAddress(w.solanaAddress)}
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && walletList.length === 0 && !fetchingList && (
        <div className="absolute right-0 mt-2 w-64 border-2 border-black rounded-xl bg-white z-50 p-4 text-sm text-gray-500">
          No OWS wallets found. Run <code className="bg-gray-100 px-1 rounded">node cli.js setup</code> in agent-sdk/
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { fetchWalletList, createWallet } from "../hooks/useWallet";
import { shortenAddress } from "../utils/format";
import StatusDot from "./StatusDot";
import Badge from "./Badge";

export default function WalletConnect({
  wallet,
  onConnect,
  onConnectPhantom,
  onDisconnect,
  loading,
  phantomAvailable,
}) {
  const [walletList, setWalletList] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showOws, setShowOws] = useState(false);
  const [fetchingList, setFetchingList] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState(null);
  const [createdInfo, setCreatedInfo] = useState(null);

  async function loadOwsWallets() {
    setFetchingList(true);
    try {
      const list = await fetchWalletList();
      setWalletList(list);
    } catch {
      setWalletList([]);
    } finally {
      setFetchingList(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createWallet(newName.trim(), "");
      setCreatedInfo(created);
      setNewName("");
      const list = await fetchWalletList();
      setWalletList(list);
      onConnect(created.name);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest(".wallet-dropdown")) {
        setShowDropdown(false);
        setShowCreateForm(false);
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
            <div className="text-xs text-gray-500 flex items-center gap-1">
              {wallet.name}
              {wallet.type === "phantom" && (
                <span className="text-[10px] text-gray-400">· non-custodial</span>
              )}
              {wallet.type === "ows" && (
                <span className="text-[10px] text-accent2">· local dev</span>
              )}
            </div>
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
        onClick={async () => {
          if (showDropdown) {
            setShowDropdown(false);
            return;
          }
          setShowDropdown(true);
        }}
        disabled={loading}
        className="border-2 border-black rounded-xl px-4 py-2 text-sm font-bold bg-accent1 hover:bg-accent1/80 transition-colors"
      >
        {loading ? "Connecting..." : "Connect Wallet"}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 border-2 border-black rounded-xl bg-white z-50 overflow-hidden">
          {/* Phantom — primary */}
          <div className="px-4 py-2 border-b-2 border-black bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
            Browser Wallet
          </div>
          {phantomAvailable ? (
            <button
              onClick={() => {
                onConnectPhantom();
                setShowDropdown(false);
              }}
              className="w-full px-4 py-3 text-left hover:bg-accent1/10 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-sm">Phantom</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Non-custodial · keys stay in your browser
                </div>
              </div>
              <Badge variant="green">Recommended</Badge>
            </button>
          ) : (
            <div className="px-4 py-3 text-sm">
              <div className="font-bold mb-1">Phantom not detected</div>
              <a
                href="https://phantom.app/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline text-gray-600"
              >
                Install Phantom →
              </a>
            </div>
          )}

          {/* OWS — collapsible, dev only */}
          <div className="border-t-2 border-black">
            <button
              onClick={async () => {
                const next = !showOws;
                setShowOws(next);
                if (next && walletList.length === 0) await loadOwsWallets();
              }}
              className="w-full px-4 py-2 text-left bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center justify-between"
            >
              <span>Local OWS · dev only</span>
              <span className="text-gray-400">{showOws ? "▲" : "▼"}</span>
            </button>

            {showOws && (
              <div>
                <div className="px-4 py-2 text-xs text-gray-500 bg-accent2/5 border-b border-gray-200">
                  Wallets stored on the proxy machine. Use only when running
                  Keymint locally for development.
                </div>

                {!showCreateForm && walletList.length > 0 && walletList.map((w) => (
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

                {!showCreateForm && walletList.length === 0 && !fetchingList && (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    No local OWS wallets.
                  </div>
                )}

                {!showCreateForm ? (
                  <div className="px-4 py-2 border-t border-gray-200">
                    <button
                      onClick={() => {
                        setShowCreateForm(true);
                        setCreateError(null);
                        setCreatedInfo(null);
                      }}
                      className="text-xs underline text-gray-600 hover:text-black"
                    >
                      + Create new local wallet
                    </button>
                  </div>
                ) : (
                  <div className="p-4 space-y-3 border-t border-gray-200">
                    {createdInfo ? (
                      <div className="text-sm">
                        <div className="font-bold mb-1">Wallet created ✓</div>
                        <div className="text-xs text-gray-600 mb-2">
                          {createdInfo.solanaAddress}
                        </div>
                        <div className="text-xs text-gray-700 bg-accent3/20 border border-black rounded-lg p-2">
                          <div className="font-bold mb-1">Fund it on devnet:</div>
                          <div>SOL: <a className="underline" target="_blank" rel="noopener noreferrer" href="https://faucet.solana.com">faucet.solana.com</a></div>
                          <div>USDC: <a className="underline" target="_blank" rel="noopener noreferrer" href="https://faucet.circle.com">faucet.circle.com</a></div>
                        </div>
                        <button
                          onClick={() => {
                            setShowCreateForm(false);
                            setCreatedInfo(null);
                            setShowDropdown(false);
                          }}
                          className="mt-2 w-full border-2 border-black rounded-lg py-2 text-sm font-bold hover:bg-gray-50"
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Wallet name (e.g. my-agent)"
                          autoFocus
                          disabled={creating}
                          className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newName.trim()) handleCreate();
                            if (e.key === "Escape") setShowCreateForm(false);
                          }}
                        />
                        {createError && (
                          <div className="text-xs text-red-600">{createError}</div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={handleCreate}
                            disabled={creating || newName.trim().length < 2}
                            className="flex-1 border-2 border-black rounded-lg py-2 text-sm font-bold bg-accent1 hover:bg-accent1/80 disabled:opacity-40"
                          >
                            {creating ? "Creating..." : "Create"}
                          </button>
                          <button
                            onClick={() => setShowCreateForm(false)}
                            disabled={creating}
                            className="border-2 border-black rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

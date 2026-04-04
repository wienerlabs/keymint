import { useState, useCallback } from "react";

const API_BASE = process.env.REACT_APP_PROXY_API_URL || "http://localhost:4001";

export function useWallet() {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async (walletName) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/wallets/${walletName}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setWallet(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/balance/${wallet.solanaAddress}`
      );
      if (res.ok) {
        const balance = await res.json();
        setWallet((prev) => ({ ...prev, balance }));
      }
    } catch {
      // silent
    }
  }, [wallet]);

  const disconnect = useCallback(() => {
    setWallet(null);
    setError(null);
  }, []);

  return { wallet, loading, error, connect, disconnect, refreshBalance };
}

export async function fetchWalletList() {
  const res = await fetch(`${API_BASE}/api/wallets`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

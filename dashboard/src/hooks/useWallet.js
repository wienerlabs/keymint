import { useState, useCallback, useEffect } from "react";
import { usePhantom } from "./usePhantom";

const API_BASE = process.env.REACT_APP_PROXY_API_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:4001");

/**
 * Unified wallet hook supporting two sources:
 *   - "phantom": browser extension, non-custodial (preferred)
 *   - "ows":     local OWS wallet on the proxy machine (dev only)
 *
 * `wallet` shape: { type, name, solanaAddress, balance?, provider? }
 */
export function useWallet() {
  const phantom = usePhantom();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Mirror phantom connection state into the unified wallet object.
  useEffect(() => {
    if (phantom.publicKey && (!wallet || wallet.type !== "phantom" ||
        wallet.solanaAddress !== phantom.publicKey)) {
      setWallet({
        type: "phantom",
        name: "Phantom",
        solanaAddress: phantom.publicKey,
        provider: phantom.provider,
      });
    }
    if (!phantom.publicKey && wallet?.type === "phantom") {
      setWallet(null);
    }
  }, [phantom.publicKey, phantom.provider, wallet]);

  const connectPhantom = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const addr = await phantom.connect();
      if (!addr) {
        if (phantom.error) setError(phantom.error);
        return null;
      }
      const next = {
        type: "phantom",
        name: "Phantom",
        solanaAddress: addr,
        provider: phantom.provider,
      };
      setWallet(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [phantom]);

  const connectOws = useCallback(async (walletName) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/wallets/${walletName}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const next = { ...data, type: "ows" };
      setWallet(next);
      return next;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!wallet?.solanaAddress) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/balance/${wallet.solanaAddress}`
      );
      if (res.ok) {
        const balance = await res.json();
        setWallet((prev) => (prev ? { ...prev, balance } : prev));
      }
    } catch {
      // silent
    }
  }, [wallet]);

  // Auto-fetch balance whenever a wallet connects.
  useEffect(() => {
    if (wallet?.solanaAddress && !wallet.balance) {
      refreshBalance();
    }
  }, [wallet, refreshBalance]);

  const disconnect = useCallback(async () => {
    if (wallet?.type === "phantom") {
      await phantom.disconnect();
    }
    setWallet(null);
    setError(null);
  }, [wallet, phantom]);

  return {
    wallet,
    loading,
    error,
    connect: connectOws,         // back-compat: name-based OWS connect
    connectPhantom,
    phantomAvailable: phantom.available,
    disconnect,
    refreshBalance,
  };
}

export async function fetchWalletList() {
  const res = await fetch(`${API_BASE}/api/wallets`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function createWallet(name, passphrase) {
  const res = await fetch(`${API_BASE}/api/wallets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, passphrase: passphrase || "" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || body.error || `HTTP ${res.status}`);
  }
  return body;
}

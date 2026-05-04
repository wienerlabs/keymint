import { useEffect, useState, useCallback } from "react";

function getProvider() {
  if (typeof window === "undefined") return null;
  const provider = window?.phantom?.solana || window?.solana;
  return provider?.isPhantom ? provider : null;
}

export function usePhantom() {
  const [provider, setProvider] = useState(getProvider());
  const [publicKey, setPublicKey] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!provider) {
      const id = setInterval(() => {
        const p = getProvider();
        if (p) {
          setProvider(p);
          clearInterval(id);
        }
      }, 500);
      return () => clearInterval(id);
    }
    if (provider.publicKey) {
      setPublicKey(provider.publicKey);
    }
    const onConnect = (pk) => setPublicKey(pk);
    const onDisconnect = () => setPublicKey(null);
    provider.on?.("connect", onConnect);
    provider.on?.("disconnect", onDisconnect);
    return () => {
      provider.off?.("connect", onConnect);
      provider.off?.("disconnect", onDisconnect);
    };
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) {
      setError("Phantom not installed");
      return null;
    }
    setError(null);
    setConnecting(true);
    try {
      const resp = await provider.connect();
      setPublicKey(resp.publicKey);
      return resp.publicKey.toBase58();
    } catch (e) {
      setError(e.message || "Connection rejected");
      return null;
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(async () => {
    if (provider?.disconnect) {
      try {
        await provider.disconnect();
      } catch {
        /* noop */
      }
    }
    setPublicKey(null);
  }, [provider]);

  return {
    available: !!provider,
    provider,
    publicKey: publicKey ? publicKey.toBase58() : null,
    connect,
    disconnect,
    connecting,
    error,
  };
}

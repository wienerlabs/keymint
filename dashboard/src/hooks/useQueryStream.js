import { useState, useCallback } from "react";

const API_BASE = process.env.REACT_APP_PROXY_API_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:4001");

/**
 * Hook for executing x402 queries with real-time SSE step streaming.
 * Returns steps array that updates live as each step completes.
 */
export function useQueryStream() {
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(
    (walletName, endpoint, passphrase) => {
      setSteps([]);
      setResult(null);
      setError(null);
      setRunning(true);

      const params = new URLSearchParams({
        wallet: walletName,
        endpoint,
        passphrase: passphrase || "",
      });

      const eventSource = new EventSource(
        `${API_BASE}/api/query/stream?${params.toString()}`
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.step === "error") {
          setError(data.message);
          setRunning(false);
          eventSource.close();
          return;
        }

        if (data.step === "result") {
          setResult(data);
          setRunning(false);
          eventSource.close();
          return;
        }

        setSteps((prev) => [...prev, data]);
      };

      eventSource.onerror = () => {
        setRunning(false);
        eventSource.close();
      };

      return () => {
        eventSource.close();
        setRunning(false);
      };
    },
    []
  );

  const reset = useCallback(() => {
    setSteps([]);
    setResult(null);
    setError(null);
    setRunning(false);
  }, []);

  /**
   * Run a fully client-side x402 flow (e.g. Phantom signing in the browser).
   * The supplied `runner(onStep)` returns `{data, txSignature, price}`.
   * Steps emitted by the runner populate the same UI as the SSE flow.
   */
  const runClientFlow = useCallback(async (runner) => {
    setSteps([]);
    setResult(null);
    setError(null);
    setRunning(true);

    const onStep = (name, detail = {}) => {
      const evt = { step: name, ...detail, timestamp: Date.now() };
      setSteps((prev) => [...prev, evt]);
    };

    try {
      const out = await runner(onStep);
      setResult({ data: out.data, txSignature: out.txSignature, price: out.price });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setRunning(false);
    }
  }, []);

  const hydrate = useCallback((snapshot) => {
    if (!snapshot) return;
    setSteps(snapshot.steps || []);
    setResult(snapshot.result || null);
    setRunning(false);
    setError(null);
  }, []);

  return { steps, result, running, error, execute, reset, hydrate, runClientFlow };
}

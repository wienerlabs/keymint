import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Badge from "./Badge";
import CopyButton from "./CopyButton";
import { useApi } from "../hooks/useApi";
import { useQueryStream } from "../hooks/useQueryStream";
import { runPhantomQuery } from "../lib/phantomPay";

const PROXY_URL =
  process.env.REACT_APP_PROXY_API_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:4001");

const STEP_LABELS = {
  matching: "Matching endpoint...",
  price_found: "Price found",
  wallet_resolved: "Wallet resolved",
  building_tx: "Building transaction...",
  tx_built: "Transaction built",
  signed: "OWS signed",
  broadcast: "Broadcast to Solana",
  confirming: "Confirming on-chain...",
  confirmed: "Payment confirmed!",
  forwarding: "Forwarding to API...",
  complete: "Complete!",
};

function buildEndpointOptions(configEndpoints) {
  return (configEndpoints || []).map((ep) => {
    const value = ep.pattern.replace(/:(\w+)/g, "{$1}");
    const params = [...ep.pattern.matchAll(/:(\w+)/g)].map((m) => m[1]);
    const needsAddress = params.includes("address");
    const needsId = params.includes("id") && !needsAddress;
    const labelBase = ep.pattern
      .replace("/v1/", "")
      .replace(/\/?:\w+/g, "")
      .replace(/^\//, "")
      .replace(/\/$/, "")
      .replace(/\//g, " · ") || ep.pattern;
    return {
      value,
      label: `${labelBase} ($${ep.priceUSD.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")})`,
      needsAddress,
      needsId,
    };
  });
}

const LAST_RESULT_KEY = "keymint:lastQueryResult";

export default function QueryPanel({ wallet, onComplete }) {
  const { data: cfg } = useApi("/api/config");
  const endpoints = useMemo(() => buildEndpointOptions(cfg?.endpoints), [cfg]);

  const [address, setAddress] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("keymint:lastAddress") || ""
      : ""
  );
  const [fungibleId, setFungibleId] = useState("eth");
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const { steps, result, running, error, execute, reset, hydrate, runClientFlow } =
    useQueryStream();
  const [wasRestored, setWasRestored] = useState(false);

  useEffect(() => {
    if (!selectedEndpoint && endpoints.length > 0) {
      setSelectedEndpoint(endpoints[0].value);
    }
  }, [endpoints, selectedEndpoint]);

  // Restore last query state on mount so users don't lose their work on F5 / tab switch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return;
    try {
      const snap = JSON.parse(raw);
      if (snap.steps && snap.result) {
        hydrate(snap);
        setWasRestored(true);
      }
    } catch {
      localStorage.removeItem(LAST_RESULT_KEY);
    }
  }, [hydrate]);

  // Persist the latest completed query so it survives reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!result || running) return;
    const completeStep = steps.find((s) => s.step === "complete");
    if (!completeStep) return;
    const snap = {
      steps,
      result,
      savedAt: Date.now(),
      endpointLabel: completeStep.endpoint || selectedEndpoint,
    };
    localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(snap));
  }, [result, running, steps, selectedEndpoint]);

  const selectedMeta = endpoints.find((e) => e.value === selectedEndpoint);
  const needsAddress = selectedMeta?.needsAddress;
  const needsId = selectedMeta?.needsId;

  function handleQuery() {
    if (!wallet) return;

    let endpoint = selectedEndpoint;
    if (endpoint.includes("{address}")) {
      if (!address.trim()) return;
      endpoint = endpoint.replace("{address}", address.trim());
      if (typeof window !== "undefined") {
        localStorage.setItem("keymint:lastAddress", address.trim());
      }
    }
    if (endpoint.includes("{id}")) {
      if (!fungibleId.trim()) return;
      endpoint = endpoint.replace("{id}", fungibleId.trim());
    }

    setProofOpen(false);
    setWasRestored(false);

    if (wallet.type === "phantom") {
      runClientFlow(async (onStep) =>
        runPhantomQuery({
          proxyUrl: PROXY_URL,
          rpcUrl: "https://api.devnet.solana.com",
          endpoint,
          phantom: wallet.provider,
          onStep,
        })
      );
      return;
    }

    // Default: OWS via SSE on the proxy
    execute(wallet.name, endpoint, passphrase);
  }

  function handleReset() {
    setProofOpen(false);
    setWasRestored(false);
    reset();
    if (typeof window !== "undefined") {
      localStorage.removeItem(LAST_RESULT_KEY);
    }
  }

  const priceStep = steps.find((s) => s.step === "price_found");
  const completeStep = steps.find((s) => s.step === "complete");

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Live Query</h2>
        <div className="flex items-center gap-2">
          {running && <Badge variant="yellow">Running</Badge>}
          {completeStep && !running && wasRestored && (
            <Badge variant="gray">Restored from last session</Badge>
          )}
          {completeStep && !running && !wasRestored && (
            <Badge variant="green">Complete</Badge>
          )}
        </div>
      </div>

      {!wallet ? (
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
          <div className="text-gray-400 text-sm">
            Connect an OWS wallet to start querying.
          </div>
        </div>
      ) : (
        <>
          {/* Input form */}
          <div className="space-y-3 mb-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block mb-1">
                Endpoint
              </label>
              <select
                value={selectedEndpoint}
                onChange={(e) => setSelectedEndpoint(e.target.value)}
                disabled={running || endpoints.length === 0}
                className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm bg-white"
              >
                {endpoints.length === 0 ? (
                  <option>Loading endpoints…</option>
                ) : (
                  endpoints.map((ep) => (
                    <option key={ep.value} value={ep.value}>
                      {ep.label}
                    </option>
                  ))
                )}
              </select>
            </div>

            {needsAddress && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block mb-1">
                  Wallet Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={running}
                  placeholder="0x..."
                  className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}

            {needsId && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block mb-1">
                  Asset ID
                </label>
                <input
                  type="text"
                  value={fungibleId}
                  onChange={(e) => setFungibleId(e.target.value)}
                  disabled={running}
                  placeholder="eth, bitcoin, solana..."
                  className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-xs text-gray-500 hover:text-black underline"
              >
                {showAdvanced ? "Hide" : "Show"} advanced
              </button>
              {showAdvanced && (
                <div className="mt-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block mb-1">
                    OWS Passphrase (optional)
                  </label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    disabled={running}
                    placeholder="Leave empty if your OWS wallet has no passphrase"
                    autoComplete="off"
                    className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleQuery}
                disabled={running || (needsAddress && !address.trim()) || (needsId && !fungibleId.trim())}
                className={`border-2 border-black rounded-lg px-6 py-2 text-sm font-bold transition-colors ${
                  running
                    ? "bg-gray-100 text-gray-400"
                    : "bg-accent1 hover:bg-accent1/80"
                }`}
              >
                {running ? "Running..." : "Query"}
              </button>
              {(steps.length > 0 || result || error) && !running && (
                <button
                  onClick={() => {
                    handleReset();
                    if (onComplete) onComplete();
                  }}
                  className="border-2 border-black rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Live step display */}
          {steps.length > 0 && (
            <div className="border-2 border-black rounded-xl p-4 mb-4 bg-gray-50">
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">
                x402 Flow
              </div>
              <div className="space-y-2">
                {steps.map((step, i) => {
                  const isLast = i === steps.length - 1;
                  return (
                    <div
                      key={`${step.step}-${i}`}
                      className={`flex items-start gap-2 text-sm ${
                        isLast && running ? "text-black font-bold" : "text-gray-600"
                      }`}
                    >
                      <span className={isLast && running ? "animate-pulse-dot" : ""}>
                        {step.step === "confirmed" || step.step === "complete"
                          ? "\u2713"
                          : isLast && running
                            ? "\u25CF"
                            : "\u2713"}
                      </span>
                      <div>
                        <span>{STEP_LABELS[step.step] || step.step}</span>
                        {step.priceUSD !== undefined && (
                          <span className="ml-2 text-xs text-gray-500">
                            ${step.priceUSD} USDC
                          </span>
                        )}
                        {step.step === "complete" && step.explorerUrl && (
                          <div className="mt-1">
                            <a
                              href={step.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-bold border border-black rounded px-2 py-0.5 hover:bg-accent1/20 transition-colors"
                            >
                              View on Explorer
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {running && (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="animate-pulse-dot">{"\u25CF"}</span>
                    <span>Processing...</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="border-2 border-black rounded-xl p-4 mb-4 bg-accent2/10">
              <div className="text-sm font-bold text-red-600">Error</div>
              <div className="text-sm mt-1">{error}</div>
            </div>
          )}

          {/* x402 Proof */}
          {completeStep && (
            <div className="border-2 border-black rounded-xl mb-4 overflow-hidden">
              <button
                onClick={() => setProofOpen((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between bg-accent3/10 hover:bg-accent3/20 transition-colors text-left"
              >
                <span className="text-sm font-bold">x402 Proof</span>
                <span className="text-xs">{proofOpen ? "\u25B2" : "\u25BC"}</span>
              </button>
              {proofOpen && (
                <div className="px-4 py-3 space-y-3 text-sm">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                      HTTP 402 Response
                    </div>
                    <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-auto">
{`HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "status": 402,
  "message": "Payment Required",
  "price": ${priceStep?.price || "\u2014"},
  "priceUSD": ${priceStep?.priceUSD || "\u2014"},
  "currency": "USDC",
  "network": "solana-devnet"
}`}
                    </pre>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                        Payment Amount
                      </div>
                      <div className="font-bold">
                        ${completeStep.priceUSD} USDC
                        <span className="text-gray-400 font-normal ml-1">
                          ({completeStep.price} base units)
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                        Payer (OWS Wallet)
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs break-all">
                          {completeStep.payer}
                        </span>
                        <CopyButton text={completeStep.payer} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                      Solana TX Hash
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs break-all">
                        {completeStep.txSignature}
                      </span>
                      <CopyButton text={completeStep.txSignature} />
                    </div>
                    <a
                      href={completeStep.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-xs font-bold border-2 border-black rounded-lg px-3 py-1 hover:bg-accent1 transition-colors"
                    >
                      Verify on Solana Explorer
                    </a>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                      Payment Receiver (Publisher)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs break-all">
                        {completeStep.publisher || "\u2014"}
                      </span>
                      {completeStep.publisher && <CopyButton text={completeStep.publisher} />}
                    </div>
                    {completeStep.publisherPDA && (
                      <div className="text-xs text-gray-400 mt-1">
                        PDA: {completeStep.publisherPDA}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="border-2 border-black rounded-xl p-4 bg-accent1/5">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Response Data
                </div>
                {result.txSignature && (
                  <a
                    href={`https://explorer.solana.com/tx/${result.txSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold border-2 border-black rounded-lg px-3 py-1 hover:bg-accent1 transition-colors"
                  >
                    Solana Explorer
                  </a>
                )}
              </div>
              <pre className="text-xs overflow-auto max-h-64 bg-white border border-gray-200 rounded-lg p-3">
                {JSON.stringify(result.data, null, 2)?.slice(0, 3000)}
                {JSON.stringify(result.data, null, 2)?.length > 3000
                  ? "\n... (truncated)"
                  : ""}
              </pre>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

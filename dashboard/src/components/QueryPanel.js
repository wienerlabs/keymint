import { useState } from "react";
import Card from "./Card";
import Badge from "./Badge";
import CopyButton from "./CopyButton";
import { useQueryStream } from "../hooks/useQueryStream";

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

const ENDPOINTS = [
  { value: "/v1/address/{address}/portfolio", label: "Portfolio ($0.01)", needsAddress: true },
  { value: "/v1/address/{address}/positions", label: "Positions ($0.02)", needsAddress: true },
  { value: "/v1/wallets/{address}/transactions", label: "Transactions ($0.01)", needsAddress: true },
  { value: "/v1/wallets/{address}/pnl", label: "PnL ($0.01)", needsAddress: true },
  { value: "/v1/tokens/price", label: "Token Prices ($0.005)", needsAddress: false },
  { value: "/v1/fungibles/{id}", label: "Fungible Asset ($0.005)", needsId: true },
];

export default function QueryPanel({ wallet, onComplete }) {
  const [address, setAddress] = useState(
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
  );
  const [fungibleId, setFungibleId] = useState("eth");
  const [selectedEndpoint, setSelectedEndpoint] = useState(ENDPOINTS[0].value);
  const [proofOpen, setProofOpen] = useState(false);
  const { steps, result, running, error, execute, reset } = useQueryStream();

  const selectedMeta = ENDPOINTS.find((e) => e.value === selectedEndpoint);
  const needsAddress = selectedMeta?.needsAddress;
  const needsId = selectedMeta?.needsId;

  function handleQuery() {
    if (!wallet) return;

    let endpoint = selectedEndpoint;
    if (endpoint.includes("{address}")) {
      if (!address.trim()) return;
      endpoint = endpoint.replace("{address}", address.trim());
    }
    if (endpoint.includes("{id}")) {
      if (!fungibleId.trim()) return;
      endpoint = endpoint.replace("{id}", fungibleId.trim());
    }

    setProofOpen(false);
    execute(wallet.name, endpoint, "");
  }

  function handleReset() {
    setProofOpen(false);
    reset();
  }

  const priceStep = steps.find((s) => s.step === "price_found");
  const completeStep = steps.find((s) => s.step === "complete");

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Live Query</h2>
        {running && <Badge variant="yellow">Running</Badge>}
        {completeStep && !running && <Badge variant="green">Complete</Badge>}
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
                disabled={running}
                className="w-full border-2 border-black rounded-lg px-3 py-2 text-sm bg-white"
              >
                {ENDPOINTS.map((ep) => (
                  <option key={ep.value} value={ep.value}>
                    {ep.label}
                  </option>
                ))}
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

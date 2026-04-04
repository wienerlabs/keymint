import { useState } from "react";
import { useApi, updatePrice } from "../hooks/useApi";
import Card from "../components/Card";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import ErrorBanner from "../components/ErrorBanner";
import { SkeletonCard } from "../components/Skeleton";

export default function Pricing() {
  const { data: endpoints, loading, error, refetch } = useApi("/api/endpoints");
  const [editing, setEditing] = useState(null);
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSave(endpointPattern) {
    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setMessage({ type: "error", text: "Enter a valid price (USDC)" });
      return;
    }

    setSaving(true);
    try {
      const priceInSmallest = Math.round(priceNum * 1_000_000);
      await updatePrice(endpointPattern, priceInSmallest);
      setMessage({ type: "success", text: "Price updated!" });
      setEditing(null);
      setNewPrice("");
      refetch();
    } catch (err) {
      setMessage({ type: "error", text: `Error: ${err.message}` });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Pricing"
        description="Update USDC prices per endpoint"
        action={
          endpoints && (
            <Badge variant="yellow">{endpoints.length} endpoints</Badge>
          )
        }
      />

      {error && !loading && (
        <div className="mb-6">
          <ErrorBanner message={error} onRetry={refetch} />
        </div>
      )}

      {message && (
        <div
          className={`mb-4 p-3 rounded-xl border-2 border-black text-sm font-medium ${
            message.type === "error" ? "bg-accent2/20" : "bg-accent1/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {(endpoints || []).map((ep) => (
            <Card key={ep.pattern}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">
                      {ep.pattern}
                    </span>
                    {ep.count > 0 && (
                      <Badge variant="blue">{ep.count} queries</Badge>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Current price:{" "}
                    <span className="font-bold text-black">
                      ${ep.priceUSD.toFixed(4)} USDC
                    </span>
                  </div>
                </div>

                {editing === ep.pattern ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      placeholder="0.01"
                      className="border-2 border-black rounded-lg px-3 py-2 w-28 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave(ep.pattern);
                        if (e.key === "Escape") {
                          setEditing(null);
                          setNewPrice("");
                        }
                      }}
                    />
                    <span className="text-xs text-gray-500">USDC</span>
                    <button
                      onClick={() => handleSave(ep.pattern)}
                      disabled={saving}
                      className="border-2 border-black rounded-lg px-4 py-2 text-sm font-bold bg-accent1 hover:bg-accent1/80 transition-colors"
                    >
                      {saving ? "..." : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(null);
                        setNewPrice("");
                      }}
                      className="border-2 border-black rounded-lg px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditing(ep.pattern);
                      setNewPrice(ep.priceUSD.toFixed(4));
                    }}
                    className="border-2 border-black rounded-lg px-4 py-2 text-sm font-bold hover:bg-gray-50 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pricing info */}
      <div className="mt-8">
        <Card className="bg-gray-50">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-bold mb-2">How Pricing Works</div>
          <div className="text-sm text-gray-600 space-y-1">
            <p>Prices are stored in <code className="bg-gray-200 px-1 rounded text-xs">proxy/config.json</code> and applied immediately.</p>
            <p>When a request hits an endpoint, the proxy returns HTTP 402 with the configured price.</p>
            <p>The agent's OWS wallet pays the exact amount in USDC on Solana, then gets the data.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

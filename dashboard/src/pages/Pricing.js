import { useEffect, useState } from "react";
import { useApi, updatePrice } from "../hooks/useApi";
import Card from "../components/Card";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import ErrorBanner from "../components/ErrorBanner";
import { SkeletonCard } from "../components/Skeleton";

const PUBLISHER_KEY_STORAGE = "keymint:publisherKey";

export default function Pricing() {
  const { data: endpoints, loading, error, refetch } = useApi("/api/endpoints");
  const { data: cfg } = useApi("/api/config");
  const [editing, setEditing] = useState(null);
  const [newPrice, setNewPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [publisherKey, setPublisherKey] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPublisherKey(localStorage.getItem(PUBLISHER_KEY_STORAGE) || "");
    }
  }, []);

  function persistPublisherKey(value) {
    setPublisherKey(value);
    if (typeof window !== "undefined") {
      if (value) localStorage.setItem(PUBLISHER_KEY_STORAGE, value);
      else localStorage.removeItem(PUBLISHER_KEY_STORAGE);
    }
  }

  async function handleSave(endpointPattern) {
    const priceNum = parseFloat(newPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setMessage({ type: "error", text: "Enter a valid price (USDC)" });
      return;
    }
    if (cfg?.runtime?.pricingApiEnabled && !publisherKey) {
      setMessage({ type: "error", text: "Publisher key required" });
      return;
    }

    setSaving(true);
    try {
      const priceInSmallest = Math.round(priceNum * 1_000_000);
      await updatePrice(endpointPattern, priceInSmallest, publisherKey);
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

      {cfg?.runtime?.vercel && (
        <div className="mb-4 p-3 rounded-xl border-2 border-black bg-accent3/20 text-sm">
          <div className="font-bold mb-1">Heads up — ephemeral pricing</div>
          <div className="text-gray-700">
            This is a serverless deployment. Price updates apply to in-flight requests
            but reset on the next deploy. For permanent changes, edit{" "}
            <code className="bg-white border px-1 rounded text-xs">proxy/config.json</code>{" "}
            and redeploy.
          </div>
        </div>
      )}

      {cfg?.runtime?.pricingApiEnabled && (
        <Card
          className={`mb-4 ${
            publisherKey ? "bg-gray-50" : "bg-accent2/10"
          }`}
        >
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500 block mb-1">
            Publisher Key
          </label>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={publisherKey}
              onChange={(e) => persistPublisherKey(e.target.value)}
              placeholder="Required for price updates"
              autoComplete="off"
              className="flex-1 border-2 border-black rounded-lg px-3 py-2 text-sm"
            />
            {publisherKey ? (
              <Badge variant="green">Saved locally</Badge>
            ) : (
              <Badge variant="pink">Required</Badge>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {publisherKey ? (
              <>
                Stored in browser localStorage only. Matches{" "}
                <code className="bg-white border px-1 rounded text-xs">PUBLISHER_API_KEY</code>{" "}
                from <code className="bg-white border px-1 rounded text-xs">.env</code>.
              </>
            ) : (
              <span className="text-gray-700">
                Enter your <code className="bg-white border px-1 rounded text-xs">PUBLISHER_API_KEY</code>{" "}
                from <code className="bg-white border px-1 rounded text-xs">.env</code> to enable Edit.
              </span>
            )}
          </div>
        </Card>
      )}

      {!cfg?.runtime?.pricingApiEnabled && cfg && (
        <div className="mb-4 p-3 rounded-xl border-2 border-black bg-accent2/10 text-sm">
          <div className="font-bold mb-1">Pricing API disabled</div>
          <div className="text-gray-700">
            Set <code className="bg-white border px-1 rounded text-xs">PUBLISHER_API_KEY</code>{" "}
            in your <code className="bg-white border px-1 rounded text-xs">.env</code>{" "}
            to enable price edits from the dashboard.
          </div>
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
                    disabled={
                      !cfg ||
                      !cfg.runtime?.pricingApiEnabled ||
                      !publisherKey
                    }
                    title={
                      cfg && cfg.runtime?.pricingApiEnabled && !publisherKey
                        ? "Enter publisher key first"
                        : undefined
                    }
                    className="border-2 border-black rounded-lg px-4 py-2 text-sm font-bold hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

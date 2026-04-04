import { useApi } from "../hooks/useApi";
import Card from "../components/Card";

function shortenAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTimestamp(ts) {
  const date = new Date(ts);
  return date.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function LiveFeed() {
  const { data: payments, loading } = useApi("/api/payments?limit=20", 3000);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Live Feed</h1>
      <p className="text-sm text-gray-500 mb-6">
        Last 20 on-chain transactions — refreshes every 3 seconds
      </p>

      {!payments || payments.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-4">---</div>
            <p>No payments yet. Send your first request!</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {payments.map((payment, i) => (
            <Card key={payment.publicKey || i}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-accent1 border border-black" />
                  <div>
                    <div className="font-mono text-sm font-bold">
                      {shortenAddress(payment.payer)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {payment.endpoint}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">
                    ${(payment.amount / 1_000_000).toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatTimestamp(payment.timestamp)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-gray-400 font-mono truncate max-w-[60%]">
                  {payment.txSignature
                    ? `tx: ${shortenAddress(payment.txSignature)}`
                    : `audit: ${shortenAddress(payment.publicKey)}`}
                </div>
                {payment.explorerUrl && (
                  <a
                    href={payment.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold border-2 border-black rounded-lg px-3 py-1 hover:bg-accent1 transition-colors"
                  >
                    Solana Explorer
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

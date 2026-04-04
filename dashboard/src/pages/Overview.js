import StatBox from "../components/StatBox";
import Card from "../components/Card";
import { useApi } from "../hooks/useApi";

export default function Overview() {
  const { data: stats, loading } = useApi("/api/stats", 5000);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading...</div>;
  }

  const totalEarnedUSDC = stats
    ? (stats.totalEarned / 1_000_000).toFixed(4)
    : "0.0000";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">
          We didn't make API keys cheaper. We made them unnecessary.
        </h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          Access any API without signing up, without registering, using only an OWS wallet.
          Every payment is on-chain on Solana transparent and tamper-proof.
        </p>
      </div>

      {/* 3-step flow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Card className="bg-accent1/10">
          <div className="text-3xl font-bold mb-3">1</div>
          <div className="font-bold mb-1">Send Request</div>
          <div className="text-sm text-gray-600">
            Call any monetized API endpoint. The proxy checks for payment.
          </div>
        </Card>
        <Card className="bg-accent2/10">
          <div className="text-3xl font-bold mb-3">2</div>
          <div className="font-bold mb-1">Get 402 &amp; Pay with OWS</div>
          <div className="text-sm text-gray-600">
            Receive a 402 with price and payment instruction. Your OWS wallet signs and sends USDC on Solana.
          </div>
        </Card>
        <Card className="bg-accent3/10">
          <div className="text-3xl font-bold mb-3">3</div>
          <div className="font-bold mb-1">Get Data</div>
          <div className="text-sm text-gray-600">
            Payment verified on-chain. The proxy forwards your request and returns live API data.
          </div>
        </Card>
      </div>

      {/* Stats */}
      <h2 className="text-xl font-bold mb-4">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatBox
          label="Total Earnings"
          value={`$${totalEarnedUSDC} USDC`}
          accent={1}
        />
        <StatBox
          label="Total Queries"
          value={stats?.totalRequests || 0}
          accent={2}
        />
        <StatBox
          label="Active Callers"
          value={stats?.activeCallers || 0}
          accent={3}
        />
      </div>

      {stats?.onChain && (
        <div className="mt-8">
          <h2 className="text-lg font-bold mb-4">On-Chain Data</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StatBox
              label="On-Chain Earnings"
              value={`$${(stats.onChain.totalEarned / 1_000_000).toFixed(4)} USDC`}
              accent={1}
            />
            <StatBox
              label="On-Chain Queries"
              value={stats.onChain.totalRequests}
              accent={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}

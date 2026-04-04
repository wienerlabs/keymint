import { useApi } from "../hooks/useApi";
import Card from "../components/Card";
import Badge from "../components/Badge";
import PageHeader from "../components/PageHeader";
import ErrorBanner from "../components/ErrorBanner";
import { SkeletonChart, SkeletonTable } from "../components/Skeleton";
import { formatEndpointName, formatUSDC } from "../utils/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const COLORS = ["#7DD8FF", "#FF7D97", "#FFE57D", "#7DD8FF", "#FF7D97", "#FFE57D"];

export default function Analytics() {
  const { data: endpoints, loading, error, refetch } = useApi("/api/endpoints", 5000);

  const chartData = (endpoints || []).map((ep) => ({
    name: formatEndpointName(ep.pattern),
    count: ep.count,
    earned: ep.earned / 1_000_000,
    fullName: ep.pattern,
  }));

  const totalQueries = chartData.reduce((sum, ep) => sum + ep.count, 0);
  const totalEarned = chartData.reduce((sum, ep) => sum + ep.earned, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Endpoint Analytics"
        description="Per-endpoint usage and earnings from on-chain audit logs"
        action={
          <div className="flex items-center gap-2">
            <Badge variant="blue">{chartData.length} endpoints</Badge>
            <Badge variant="pink">{totalQueries} total queries</Badge>
          </div>
        }
      />

      {error && !loading && (
        <div className="mb-6">
          <ErrorBanner message={error} onRetry={refetch} />
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <SkeletonChart />
          <SkeletonChart />
          <SkeletonTable rows={6} />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-accent1/10">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Total Queries</div>
              <div className="text-2xl font-bold">{totalQueries}</div>
            </Card>
            <Card className="bg-accent2/10">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Total Earned</div>
              <div className="text-2xl font-bold">${totalEarned.toFixed(4)}</div>
            </Card>
            <Card className="bg-accent3/10">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Avg per Query</div>
              <div className="text-2xl font-bold">
                ${totalQueries > 0 ? (totalEarned / totalQueries).toFixed(4) : "0.0000"}
              </div>
            </Card>
          </div>

          <Card className="mb-6">
            <h2 className="text-lg font-bold mb-4">Query Count</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fontFamily: "AuxMono, monospace" }}
                  stroke="#111"
                />
                <YAxis stroke="#111" tick={{ fontSize: 11, fontFamily: "AuxMono, monospace" }} />
                <Tooltip
                  contentStyle={{
                    border: "2px solid black",
                    borderRadius: "8px",
                    background: "white",
                    fontFamily: "AuxMono, monospace",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    if (name === "count") return [value, "Queries"];
                    return [value, name];
                  }}
                  labelFormatter={(label) => label}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      stroke="black"
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="mb-6">
            <h2 className="text-lg font-bold mb-4">Earnings (USDC)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fontFamily: "AuxMono, monospace" }}
                  stroke="#111"
                />
                <YAxis stroke="#111" tick={{ fontSize: 11, fontFamily: "AuxMono, monospace" }} />
                <Tooltip
                  contentStyle={{
                    border: "2px solid black",
                    borderRadius: "8px",
                    background: "white",
                    fontFamily: "AuxMono, monospace",
                    fontSize: "12px",
                  }}
                  formatter={(value) => [`$${value.toFixed(4)}`, "USDC"]}
                />
                <Bar dataKey="earned" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      stroke="black"
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="text-lg font-bold mb-4">Details</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left py-2">Endpoint</th>
                    <th className="text-right py-2">Price</th>
                    <th className="text-right py-2">Queries</th>
                    <th className="text-right py-2">Earnings</th>
                    <th className="text-right py-2">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {(endpoints || []).map((ep) => (
                    <tr key={ep.pattern} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <td className="py-3 text-xs">{ep.pattern}</td>
                      <td className="text-right py-3">
                        ${ep.priceUSD.toFixed(4)}
                      </td>
                      <td className="text-right py-3">{ep.count}</td>
                      <td className="text-right py-3">
                        ${formatUSDC(ep.earned)}
                      </td>
                      <td className="text-right py-3">
                        <Badge variant={ep.count > 0 ? "blue" : "gray"}>
                          {totalQueries > 0
                            ? `${((ep.count / totalQueries) * 100).toFixed(0)}%`
                            : "0%"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

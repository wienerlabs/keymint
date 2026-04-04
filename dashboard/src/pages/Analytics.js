import { useApi } from "../hooks/useApi";
import Card from "../components/Card";
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

const COLORS = ["#7DD8FF", "#FF7D97", "#FFE57D"];

export default function Analytics() {
  const { data: endpoints, loading } = useApi("/api/endpoints", 5000);

  if (loading) {
    return <div className="p-6 text-gray-400">Loading...</div>;
  }

  const chartData = (endpoints || []).map((ep) => ({
    name: ep.pattern
      .replace("/v1/address/:address/", "")
      .replace("/v1/tokens/", "tokens/"),
    count: ep.count,
    earned: ep.earned / 1_000_000,
    fullName: ep.pattern,
  }));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Endpoint Analytics</h1>

      <Card className="mb-6">
        <h2 className="text-lg font-bold mb-4">Query Count</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              stroke="#111"
            />
            <YAxis stroke="#111" />
            <Tooltip
              contentStyle={{
                border: "2px solid black",
                borderRadius: "8px",
                background: "white",
              }}
              formatter={(value, name) => {
                if (name === "count") return [value, "Queries"];
                return [value, name];
              }}
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

      <Card>
        <h2 className="text-lg font-bold mb-4">Earnings (USDC)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              stroke="#111"
            />
            <YAxis stroke="#111" />
            <Tooltip
              contentStyle={{
                border: "2px solid black",
                borderRadius: "8px",
                background: "white",
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

      <div className="mt-6">
        <Card>
          <h2 className="text-lg font-bold mb-4">Details</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left py-2">Endpoint</th>
                <th className="text-right py-2">Price</th>
                <th className="text-right py-2">Queries</th>
                <th className="text-right py-2">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {(endpoints || []).map((ep) => (
                <tr key={ep.pattern} className="border-b border-gray-200">
                  <td className="py-3 font-mono text-xs">{ep.pattern}</td>
                  <td className="text-right py-3">
                    ${ep.priceUSD.toFixed(4)}
                  </td>
                  <td className="text-right py-3">{ep.count}</td>
                  <td className="text-right py-3">
                    ${(ep.earned / 1_000_000).toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

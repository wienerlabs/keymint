import { useApi } from "../hooks/useApi";
import Card from "../components/Card";
import Badge from "../components/Badge";
import StatusDot from "../components/StatusDot";
import CopyButton from "../components/CopyButton";
import PageHeader from "../components/PageHeader";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";
import { SkeletonCard } from "../components/Skeleton";
import { shortenAddress, formatTimestamp, formatUSDC } from "../utils/format";

export default function LiveFeed() {
  const { data: payments, loading, error, refetch } = useApi("/api/payments?limit=20", 3000);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Live Feed"
        description="Publisher view — every paid query to this proxy from any wallet. Refreshes every 3s. (For your own history, use the Query tab.)"
        action={
          <div className="flex items-center gap-2">
            <StatusDot status="online" pulse size="md" />
            <span className="text-xs text-gray-500">Live</span>
          </div>
        }
      />

      {error && !loading && (
        <div className="mb-6">
          <ErrorBanner message={error} onRetry={refetch} />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : !payments || payments.length === 0 ? (
        <EmptyState
          icon="---"
          title="No payments yet"
          description="Send your first request via the Query tab or agent-sdk CLI to see transactions here."
        />
      ) : (
        <div className="space-y-3">
          {payments.map((payment, i) => {
            const isRecent = i === 0;
            return (
              <Card key={payment.publicKey || i} className={isRecent ? "border-accent1" : ""}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <StatusDot status={isRecent ? "info" : "online"} pulse={isRecent} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">
                          {shortenAddress(payment.payer)}
                        </span>
                        <CopyButton text={payment.payer} />
                        {isRecent && <Badge variant="blue">Latest</Badge>}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {payment.endpoint}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">
                      ${formatUSDC(payment.amount)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatTimestamp(payment.timestamp)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-400 truncate max-w-[300px]">
                      {payment.txSignature
                        ? `tx: ${shortenAddress(payment.txSignature)}`
                        : `audit: ${shortenAddress(payment.publicKey)}`}
                    </div>
                    {payment.txSignature && (
                      <CopyButton text={payment.txSignature} />
                    )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

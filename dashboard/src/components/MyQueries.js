import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";
import Card from "./Card";
import Badge from "./Badge";
import CopyButton from "./CopyButton";
import { SkeletonCard } from "./Skeleton";
import { shortenAddress, formatTimestamp, formatUSDC } from "../utils/format";

const API_BASE =
  process.env.REACT_APP_PROXY_API_URL ||
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:4001");

function PrettyJson({ text, truncated, totalBytes }) {
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    /* keep raw */
  }
  return (
    <div>
      <pre className="text-xs overflow-auto max-h-96 bg-white border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-all">
        {pretty}
      </pre>
      {truncated && (
        <div className="text-xs text-gray-500 mt-1">
          Showing first {Math.round(text.length / 1024)}KB of {Math.round(totalBytes / 1024)}KB. Full payload was returned at the time of payment.
        </div>
      )}
    </div>
  );
}

function ExpandedDetails({ item }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!item.txSignature) {
      setErr("No tx signature recorded for this audit log entry");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`${API_BASE}/api/payments/${item.txSignature}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (ok) setDetail(json);
        else setErr(json.detail || json.error || "Not found");
      })
      .catch((e) => !cancelled && setErr(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [item.txSignature]);

  return (
    <div className="mt-3 border-t border-gray-200 pt-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div>
          <div className="font-bold uppercase tracking-wide text-gray-500 mb-1">Endpoint</div>
          <div className="break-all">{item.endpoint}</div>
        </div>
        <div>
          <div className="font-bold uppercase tracking-wide text-gray-500 mb-1">Timestamp</div>
          <div>{new Date(item.timestamp).toLocaleString()}</div>
        </div>
        <div>
          <div className="font-bold uppercase tracking-wide text-gray-500 mb-1">Payer</div>
          <div className="flex items-center gap-2">
            <span className="break-all">{item.payer}</span>
            <CopyButton text={item.payer} />
          </div>
        </div>
        <div>
          <div className="font-bold uppercase tracking-wide text-gray-500 mb-1">Publisher</div>
          <div className="flex items-center gap-2">
            <span className="break-all">{item.publisher}</span>
            <CopyButton text={item.publisher} />
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="font-bold uppercase tracking-wide text-gray-500 mb-1">Tx Signature</div>
          <div className="flex items-center gap-2">
            <span className="break-all">{item.txSignature || "—"}</span>
            {item.txSignature && <CopyButton text={item.txSignature} />}
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="font-bold uppercase tracking-wide text-gray-500 mb-1">Audit Log PDA</div>
          <div className="flex items-center gap-2">
            <span className="break-all">{item.publicKey}</span>
            <CopyButton text={item.publicKey} />
          </div>
        </div>
      </div>

      <div>
        <div className="font-bold uppercase tracking-wide text-gray-500 mb-1 text-xs">
          Response Data (the value you paid for)
        </div>
        {loading && (
          <div className="text-xs text-gray-400">Loading payload…</div>
        )}
        {err && (
          <div className="text-xs text-gray-600 bg-accent2/10 border border-black rounded-lg p-3">
            {err}
            {item.explorerUrl && (
              <>
                {" "}
                <a
                  href={item.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold"
                >
                  View on-chain →
                </a>
              </>
            )}
          </div>
        )}
        {detail && detail.data?.preview && (
          <PrettyJson
            text={detail.data.preview}
            truncated={detail.data.truncated}
            totalBytes={detail.data.bytes}
          />
        )}
        {detail && !detail.data && (
          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
            No response payload stored for this transaction (upstream call failed
            after payment, or the proxy was restarted).
          </div>
        )}
      </div>

      <div className="flex justify-end">
        {item.explorerUrl && (
          <a
            href={item.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold border-2 border-black rounded-lg px-3 py-1 hover:bg-accent1 transition-colors"
          >
            Verify on Solana Explorer
          </a>
        )}
      </div>
    </div>
  );
}

export default function MyQueries({ wallet }) {
  const path = wallet?.solanaAddress
    ? `/api/payments?limit=10&payer=${wallet.solanaAddress}`
    : null;
  const { data: items, loading } = useApi(path, wallet?.solanaAddress ? 5000 : null);
  const [openKey, setOpenKey] = useState(null);

  if (!wallet) return null;

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">My Queries</h2>
        <Badge variant="gray">
          {wallet?.solanaAddress ? shortenAddress(wallet.solanaAddress) : ""}
        </Badge>
      </div>
      <div className="text-xs text-gray-500 mb-3">
        Your last 10 paid queries on this proxy. Click a row to see the full response and on-chain proof.
      </div>

      {loading && !items ? (
        <SkeletonCard lines={3} />
      ) : !items || items.length === 0 ? (
        <div className="text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
          No paid queries yet from this wallet.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => {
            const key = (p.txSignature || p.publicKey) + p.timestamp;
            const isOpen = openKey === key;
            return (
              <div
                key={key}
                className={`border rounded-lg transition-colors ${
                  isOpen ? "border-black" : "border-gray-200"
                }`}
              >
                <button
                  onClick={() => setOpenKey(isOpen ? null : key)}
                  className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-gray-700 truncate">
                      {p.endpoint}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatTimestamp(p.timestamp)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <div className="text-sm font-bold whitespace-nowrap">
                      ${formatUSDC(p.amount)}
                    </div>
                    <span className="text-xs text-gray-400">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3">
                    <ExpandedDetails item={p} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

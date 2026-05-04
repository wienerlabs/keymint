/**
 * In-memory payment records store.
 * Syncs with on-chain audit log for tx signature enrichment.
 */

const MAX_RECENT = 100;
const MAX_CONSUMED = 1000;

const payments = [];
const endpointStats = {};
const callers = new Set();
const consumedSignatures = new Set();
const consumedOrder = [];

const lookupIndex = new Map();

function lookupKey(payer, amount, isoTimestamp) {
  const minute = Math.floor(new Date(isoTimestamp).getTime() / 60000);
  return `${payer}|${amount}|${minute}`;
}

// Cap stored response payloads to keep memory bounded. Anything larger is
// truncated so the user sees the start of the data and a clear notice.
const MAX_DATA_BYTES = 50 * 1024;

function captureData(data) {
  if (data === undefined || data === null) return null;
  let json;
  try {
    json = JSON.stringify(data);
  } catch {
    return { truncated: false, bytes: 0, preview: "[unserializable]" };
  }
  if (json.length <= MAX_DATA_BYTES) {
    return { truncated: false, bytes: json.length, preview: json };
  }
  return {
    truncated: true,
    bytes: json.length,
    preview: json.slice(0, MAX_DATA_BYTES),
  };
}

/** Record a new payment */
function recordPayment({ payer, endpoint, amount, txSignature, data }) {
  const record = {
    payer,
    endpoint,
    amount,
    txSignature,
    timestamp: new Date().toISOString(),
    data: captureData(data),
  };

  payments.unshift(record);
  if (payments.length > MAX_RECENT) {
    const evicted = payments.pop();
    if (evicted) {
      const k = lookupKey(evicted.payer, evicted.amount, evicted.timestamp);
      const arr = lookupIndex.get(k);
      if (arr) {
        const idx = arr.indexOf(evicted);
        if (idx !== -1) arr.splice(idx, 1);
        if (arr.length === 0) lookupIndex.delete(k);
      }
    }
  }

  const key = lookupKey(payer, amount, record.timestamp);
  if (!lookupIndex.has(key)) lookupIndex.set(key, []);
  lookupIndex.get(key).push(record);

  if (!endpointStats[endpoint]) {
    endpointStats[endpoint] = { count: 0, earned: 0 };
  }
  endpointStats[endpoint].count += 1;
  endpointStats[endpoint].earned += amount;

  callers.add(payer);

  return record;
}

/** Look up a stored payment by tx signature. */
function getByTxSignature(txSignature) {
  return payments.find((p) => p.txSignature === txSignature) || null;
}

/** Find a recent in-memory payment record for an on-chain audit log entry */
function findMatchingRecord(payer, amount, onChainIsoTimestamp) {
  const targetMs = new Date(onChainIsoTimestamp).getTime();
  for (const offset of [0, -1, 1]) {
    const minute = Math.floor(targetMs / 60000) + offset;
    const k = `${payer}|${amount}|${minute}`;
    const arr = lookupIndex.get(k);
    if (!arr || arr.length === 0) continue;
    let best = null;
    let bestDelta = Infinity;
    for (const rec of arr) {
      const delta = Math.abs(new Date(rec.timestamp).getTime() - targetMs);
      if (delta < bestDelta) {
        best = rec;
        bestDelta = delta;
      }
    }
    if (best && bestDelta < 60000) return best;
  }
  return null;
}

/** Get last N payment records */
function getRecentPayments(limit = 20) {
  return payments.slice(0, limit);
}

/** Get per-endpoint statistics */
function getEndpointStats() {
  return Object.entries(endpointStats).map(([endpoint, stats]) => ({
    endpoint,
    count: stats.count,
    earned: stats.earned,
  }));
}

/** Get summary statistics */
function getSummary() {
  const totalEarned = Object.values(endpointStats).reduce(
    (sum, s) => sum + s.earned,
    0
  );
  const totalRequests = Object.values(endpointStats).reduce(
    (sum, s) => sum + s.count,
    0
  );
  return {
    totalEarned,
    totalRequests,
    activeCallers: callers.size,
  };
}

/** Has this txSignature already been used to unlock a request? */
function isConsumed(txSignature) {
  return consumedSignatures.has(txSignature);
}

/** Mark a txSignature as consumed (one-shot replay protection) */
function markConsumed(txSignature) {
  if (consumedSignatures.has(txSignature)) return;
  consumedSignatures.add(txSignature);
  consumedOrder.push(txSignature);
  if (consumedOrder.length > MAX_CONSUMED) {
    const evicted = consumedOrder.shift();
    consumedSignatures.delete(evicted);
  }
}

module.exports = {
  recordPayment,
  getRecentPayments,
  getEndpointStats,
  getSummary,
  isConsumed,
  markConsumed,
  findMatchingRecord,
  getByTxSignature,
};

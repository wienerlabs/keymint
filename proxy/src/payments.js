/**
 * In-memory payment records store.
 * Syncs with on-chain audit log for tx signature enrichment.
 */

const MAX_RECENT = 100;

const payments = [];
const endpointStats = {};
const callers = new Set();

/** Record a new payment */
function recordPayment({ payer, endpoint, amount, txSignature }) {
  const record = {
    payer,
    endpoint,
    amount,
    txSignature,
    timestamp: new Date().toISOString(),
  };

  payments.unshift(record);
  if (payments.length > MAX_RECENT) {
    payments.pop();
  }

  if (!endpointStats[endpoint]) {
    endpointStats[endpoint] = { count: 0, earned: 0 };
  }
  endpointStats[endpoint].count += 1;
  endpointStats[endpoint].earned += amount;

  callers.add(payer);

  return record;
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

module.exports = {
  recordPayment,
  getRecentPayments,
  getEndpointStats,
  getSummary,
};

export function shortenAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatTimestamp(ts) {
  const date = new Date(ts);
  return date.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export function formatUSDC(amount) {
  return (amount / 1_000_000).toFixed(4);
}

export function formatEndpointName(pattern) {
  return pattern
    .replace("/v1/address/:address/", "")
    .replace("/v1/tokens/", "tokens/")
    .replace("/v1/wallets/:address/", "wallets/")
    .replace("/v1/fungibles/", "fungibles/");
}

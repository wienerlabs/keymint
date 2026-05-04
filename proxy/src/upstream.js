const axios = require("axios");

let _client = null;

/** Initialize Zerion API client */
function initialize() {
  const apiKey = process.env.ZERION_API_KEY;
  const baseURL = process.env.ZERION_BASE_URL;

  if (!apiKey || !baseURL) {
    throw new Error("ZERION_API_KEY and ZERION_BASE_URL env variables are required");
  }

  _client = axios.create({
    baseURL,
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
    },
    timeout: 15000,
  });

  console.log(`[upstream] Zerion base URL: ${baseURL}`);
}

/**
 * Forward request to Zerion API
 * @param {string} upstreamPath - Zerion endpoint path (from config)
 * @param {string} address - Wallet address (if applicable)
 * @param {object} queryParams - Additional query parameters
 * @returns {Promise<object>} API response
 */
async function forward(upstreamPath, params = {}, queryParams = {}) {
  let url;

  if (params.address && !upstreamPath.startsWith("/v1/")) {
    url = `/v1/wallets/${params.address}${upstreamPath}`;
  } else if (params.id && upstreamPath.startsWith("/v1/fungibles/")) {
    url = `${upstreamPath}${params.id}`;
  } else {
    url = upstreamPath;
  }

  try {
    const response = await _client.get(url, { params: queryParams });
    return response.data;
  } catch (err) {
    throw normalizeUpstreamError(err);
  }
}

function normalizeUpstreamError(err) {
  const status = err.response?.status;
  let kind;
  let message;
  switch (status) {
    case 401:
    case 403:
      kind = "upstream_auth_failed";
      message = "Upstream authentication failed (check ZERION_API_KEY)";
      break;
    case 404:
      kind = "upstream_not_found";
      message = "Upstream resource not found";
      break;
    case 429:
      kind = "upstream_rate_limited";
      message = "Upstream rate limit exceeded";
      break;
    case 502:
    case 503:
    case 504:
      kind = "upstream_unavailable";
      message = "Upstream temporarily unavailable";
      break;
    default:
      kind = status ? "upstream_error" : "upstream_network_error";
      message = status
        ? `Upstream returned ${status}`
        : err.message || "Upstream network error";
  }
  const wrapped = new Error(message);
  wrapped.kind = kind;
  wrapped.status = status || 502;
  return wrapped;
}

module.exports = {
  initialize,
  forward,
};

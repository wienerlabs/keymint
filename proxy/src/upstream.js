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
    // Wallet-scoped endpoint: /v1/wallets/{address}{upstreamPath}
    url = `/v1/wallets/${params.address}${upstreamPath}`;
  } else if (params.id && upstreamPath.startsWith("/v1/fungibles/")) {
    // Fungible asset by ID: /v1/fungibles/{id}
    url = `${upstreamPath}${params.id}`;
  } else {
    url = upstreamPath;
  }

  const response = await _client.get(url, { params: queryParams });
  return response.data;
}

module.exports = {
  initialize,
  forward,
};

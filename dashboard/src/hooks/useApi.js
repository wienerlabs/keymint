import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.REACT_APP_PROXY_API_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:4001");

export function useApi(path, interval = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!path) return;
    try {
      const res = await fetch(`${API_BASE}${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    fetchData();

    if (interval) {
      const id = setInterval(fetchData, interval);
      return () => clearInterval(id);
    }
  }, [path, fetchData, interval]);

  return { data, loading, error, refetch: fetchData };
}

export async function updatePrice(endpoint, price, publisherKey) {
  const headers = { "Content-Type": "application/json" };
  if (publisherKey) headers["x-publisher-key"] = publisherKey;
  const res = await fetch(`${API_BASE}/api/endpoints/price`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ endpoint, price }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || body.detail || `HTTP ${res.status}`);
  }
  return body;
}

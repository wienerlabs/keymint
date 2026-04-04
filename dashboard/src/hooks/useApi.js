import { useState, useEffect, useCallback } from "react";

const API_BASE = process.env.REACT_APP_PROXY_API_URL || "http://localhost:4001";

export function useApi(path, interval = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
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
    fetchData();

    if (interval) {
      const id = setInterval(fetchData, interval);
      return () => clearInterval(id);
    }
  }, [fetchData, interval]);

  return { data, loading, error, refetch: fetchData };
}

export async function updatePrice(endpoint, price) {
  const res = await fetch(`${API_BASE}/api/endpoints/price`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, price }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

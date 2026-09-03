"use client";

import { useEffect, useState } from "react";

export function useAsync<T>(fn: () => Promise<T | undefined>) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    setData(await fn());
    setLoading(false);
  };

  useEffect(() => {
    refetch();
  }, []);

  return { data, setData, loading, refetch };
}

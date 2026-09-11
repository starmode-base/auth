import { useState } from "react";

const KEY = "session-token";

/** The session token lives in localStorage and is passed as a function arg */
export function useToken() {
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem(KEY),
  );

  const setToken = (value: string | null) => {
    if (value === null) {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, value);
    }
    setTokenState(value);
  };

  return { token, setToken };
}

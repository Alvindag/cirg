"use client";

import { useState } from "react";

import { errorText } from "./format";

/** Shared message/error state and an action runner that reloads afterwards. */
export function useActions(reload: () => void) {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function act<T>(fn: () => Promise<T>, ok: string | ((r: T) => string)) {
    setError(undefined);
    setMessage(undefined);
    try {
      const r = await fn();
      setMessage(typeof ok === "function" ? ok(r) : ok);
      reload();
      return r;
    } catch (e) {
      setError(errorText(e));
      return undefined;
    }
  }
  return { message, error, setError, setMessage, act };
}

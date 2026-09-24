"use client";

import { useCallback, useState, useTransition } from "react";
import type { ActionResult } from "@/app/dashboard/actions";

/** Runs server actions in a transition and keeps the last error message for display. */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = useCallback((fn: () => Promise<ActionResult | void>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  }, []);
  return { pending, error, setError, run };
}

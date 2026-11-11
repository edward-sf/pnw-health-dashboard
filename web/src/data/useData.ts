import { useCallback, useEffect, useState } from "react";
import { loadData, type AppData } from "./loadData";

export type DataState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; data: AppData };

type Result =
  | { status: "error"; message: string }
  | { status: "ready"; data: AppData };

export function useData(): DataState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; value: Result }>();
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    loadData(import.meta.env.BASE_URL, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setResult({ attempt, value: { status: "ready", data } });
        }
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setResult({ attempt, value: { status: "error", message } });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  // A result from an earlier attempt means the current attempt is in flight.
  if (!result || result.attempt !== attempt) return { status: "loading" };
  return result.value.status === "ready"
    ? result.value
    : { ...result.value, retry };
}

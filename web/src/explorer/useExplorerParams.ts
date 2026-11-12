import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import type { Manifest } from "../types";
import { defaultTargetId, parseParams, type ExplorerParams } from "./parseParams";

export function useExplorerParams(
  manifest: Manifest,
  fipsSet: ReadonlySet<string>,
  targetIds: readonly string[],
): {
  params: ExplorerParams;
  setIndicator: (id: string) => void;
  setCounty: (fips: string | null) => void;
  setTarget: (id: string) => void;
  setView: (view: "map" | "table") => void;
  setMode: (mode: "values" | "model") => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString();
  const params = useMemo(
    () => parseParams(search, manifest, fipsSet, targetIds),
    [search, manifest, fipsSet, targetIds],
  );

  const hasInvalid = params.invalid.length > 0;
  useEffect(() => {
    if (!hasInvalid) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const k of params.invalid) next.delete(k);
        return next;
      },
      { replace: true },
    );
  }, [hasInvalid, params.invalid, setSearchParams]);

  const setIndicator = useCallback(
    (id: string) => {
      if (id === params.indicator) return;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("i", id);
        return next;
      });
    },
    [setSearchParams, params.indicator],
  );
  const setCounty = useCallback(
    (fips: string | null) => {
      if (fips === params.county) return;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (fips === null) next.delete("c");
        else next.set("c", fips);
        return next;
      });
    },
    [setSearchParams, params.county],
  );

  const setTarget = useCallback(
    (id: string) => {
      if (id === params.target) return;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id === defaultTargetId(targetIds)) next.delete("t");
        else next.set("t", id);
        return next;
      });
    },
    [setSearchParams, params.target, targetIds],
  );

  const setView = useCallback(
    (view: "map" | "table") => {
      if (view === params.view) return;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (view === "map") next.delete("view");
        else next.set("view", view);
        return next;
      });
    },
    [setSearchParams, params.view],
  );

  const setMode = useCallback(
    (mode: "values" | "model") => {
      if (mode === params.mode) return;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (mode === "values") next.delete("mode");
        else next.set("mode", mode);
        return next;
      });
    },
    [setSearchParams, params.mode],
  );

  return { params, setIndicator, setCounty, setTarget, setView, setMode };
}

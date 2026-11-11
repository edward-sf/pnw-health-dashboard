import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import type { Manifest } from "../types";
import { parseParams, type ExplorerParams } from "./parseParams";

export function useExplorerParams(
  manifest: Manifest,
  fipsSet: ReadonlySet<string>,
): {
  params: ExplorerParams;
  setIndicator: (id: string) => void;
  setCounty: (fips: string | null) => void;
  setView: (view: "map" | "table") => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString();
  const params = useMemo(
    () => parseParams(search, manifest, fipsSet),
    [search, manifest, fipsSet],
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

  return { params, setIndicator, setCounty, setView };
}

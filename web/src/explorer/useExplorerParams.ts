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
  setCounty: (fips: string) => void;
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
    (id: string) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("i", id);
        return next;
      }),
    [setSearchParams],
  );
  const setCounty = useCallback(
    (fips: string) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("c", fips);
        return next;
      }),
    [setSearchParams],
  );

  return { params, setIndicator, setCounty };
}

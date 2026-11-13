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
  setShow: (show: "observed" | "expected") => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString();
  const params = useMemo(
    () => parseParams(search, manifest, fipsSet, targetIds),
    [search, manifest, fipsSet, targetIds],
  );

  const { canonical } = params;
  useEffect(() => {
    if (canonical === null) return;
    setSearchParams(new URLSearchParams(canonical), { replace: true });
  }, [canonical, setSearchParams]);

  const setIndicator = useCallback(
    (id: string) => {
      if (id === params.indicator) return;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("i", id);
        // A model target is its own outcome; any other measure has no model to compare with.
        next.delete(targetIds.includes(id) ? "t" : "show");
        return next;
      });
    },
    [setSearchParams, params.indicator, targetIds],
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

  const setShow = useCallback(
    (show: "observed" | "expected") => {
      if (show === params.show) return;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (show === "observed") next.delete("show");
        else next.set("show", show);
        return next;
      });
    },
    [setSearchParams, params.show],
  );

  return { params, setIndicator, setCounty, setTarget, setView, setShow };
}

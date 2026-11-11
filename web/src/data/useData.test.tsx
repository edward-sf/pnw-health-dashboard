import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { manifest, topology, values } from "../test/fixtures";
import { useData } from "./useData";

const bodies: Record<string, unknown> = {
  "manifest.json": manifest,
  "values.json": values,
  "counties.topojson": topology,
};
const ok = (url: string) =>
  new Response(JSON.stringify(bodies[url.split("/").pop() as string]));

afterEach(() => vi.unstubAllGlobals());

describe("useData", () => {
  it("reaches ready", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ok(url)));
    const { result } = renderHook(() => useData(), { wrapper: StrictMode });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status === "ready") {
      expect(result.current.data.manifest).toEqual(manifest);
    }
  });

  it("reports error, and retry refetches and reaches ready", async () => {
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        fail ? new Response("boom", { status: 500 }) : ok(url),
      ),
    );
    const { result } = renderHook(() => useData());
    await waitFor(() => expect(result.current.status).toBe("error"));
    fail = false;
    const state = result.current;
    if (state.status !== "error") throw new Error("expected error");
    act(() => state.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("aborts the in-flight request on unmount", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>(() => {
            signals.push(init?.signal as AbortSignal);
          }),
      ),
    );
    const { unmount } = renderHook(() => useData());
    await waitFor(() => expect(signals.length).toBeGreaterThan(0));
    expect(signals.every((s) => !s.aborted)).toBe(true);
    unmount();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

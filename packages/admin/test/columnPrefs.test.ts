import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useColumnPrefs, type ToggleableColumn } from "../src/lib/columnPrefs.js";

const COLS: ToggleableColumn[] = [
  { key: "title", label: "Title", defaultOn: false },
  { key: "locales", label: "Locales", defaultOn: true },
  { key: "updated", label: "Updated", defaultOn: true },
];

// jsdom in this project's vitest setup doesn't expose localStorage; back it with
// a minimal in-memory implementation for these tests.
function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("useColumnPrefs", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("applies per-column defaults when nothing is stored", () => {
    const { result } = renderHook(() => useColumnPrefs("posts", COLS));
    expect(result.current.cols).toEqual({ title: false, locales: true, updated: true });
  });

  it("persists a toggle to localStorage and reflects it", () => {
    const { result } = renderHook(() => useColumnPrefs("posts", COLS));
    act(() => result.current.toggle("title"));
    expect(result.current.cols.title).toBe(true);

    // A fresh mount reads the stored override back.
    const { result: reread } = renderHook(() => useColumnPrefs("posts", COLS));
    expect(reread.current.cols.title).toBe(true);
  });

  it("keeps preferences isolated per collection", () => {
    const { result: posts } = renderHook(() => useColumnPrefs("posts", COLS));
    act(() => posts.current.toggle("updated")); // turn off for posts only

    const { result: pages } = renderHook(() => useColumnPrefs("pages", COLS));
    expect(pages.current.cols.updated).toBe(true);
    expect(posts.current.cols.updated).toBe(false);
  });

  it("drops stored keys no longer in the current config (schema drift)", () => {
    localStorage.setItem("kalayaan-cols:posts", JSON.stringify({ removed: true, title: true }));
    const { result } = renderHook(() => useColumnPrefs("posts", COLS));
    // `removed` is not a current column, so it never surfaces...
    expect(result.current.cols).toEqual({ title: true, locales: true, updated: true });
    // ...and a subsequent write prunes it from storage.
    act(() => result.current.toggle("locales"));
    expect(JSON.parse(localStorage.getItem("kalayaan-cols:posts")!)).not.toHaveProperty("removed");
  });

  it("tolerates malformed stored JSON by falling back to defaults", () => {
    localStorage.setItem("kalayaan-cols:posts", "{not json");
    const { result } = renderHook(() => useColumnPrefs("posts", COLS));
    expect(result.current.cols).toEqual({ title: false, locales: true, updated: true });
  });
});

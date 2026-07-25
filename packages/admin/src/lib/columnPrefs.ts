import { useCallback, useEffect, useMemo, useState } from "react";

/** A column the user can show or hide, with its default visibility. */
export interface ToggleableColumn {
  key: string;
  label: string;
  defaultOn: boolean;
}

const keyFor = (collection: string) => `kalayaan-cols:${collection}`;

/**
 * Reads the stored visibility map for a collection, tolerating absent/corrupt
 * storage (returns `{}` so callers fall back to per-column defaults).
 */
function readStored(collection: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(keyFor(collection));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, boolean>;
  } catch {
    // ignore malformed storage
  }
  return {};
}

/**
 * Persists per-collection column visibility in localStorage (mirrors the
 * `theme.tsx` pattern). The visible set is always the *current* toggleable
 * columns: stored booleans override defaults when present, and stored keys no
 * longer in the config are dropped — so adding/removing config fields Just Works.
 */
export function useColumnPrefs(
  collection: string,
  toggleable: ToggleableColumn[],
): { cols: Record<string, boolean>; toggle: (key: string) => void } {
  // Overrides the user has set; defaults live in `toggleable`. Keyed by collection.
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => readStored(collection));

  // Re-read when switching collections (each has its own storage key).
  useEffect(() => {
    setOverrides(readStored(collection));
  }, [collection]);

  const cols = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const c of toggleable) {
      const stored = overrides[c.key];
      out[c.key] = typeof stored === "boolean" ? stored : c.defaultOn;
    }
    return out;
  }, [toggleable, overrides]);

  const toggle = useCallback(
    (key: string) => {
      setOverrides((prev) => {
        const stored = prev[key];
        const current = typeof stored === "boolean" ? stored : (toggleable.find((c) => c.key === key)?.defaultOn ?? false);
        // Prune keys absent from the current config before writing.
        const validKeys = new Set(toggleable.map((c) => c.key));
        const next: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(prev)) if (validKeys.has(k)) next[k] = v;
        next[key] = !current;
        try {
          localStorage.setItem(keyFor(collection), JSON.stringify(next));
        } catch {
          // ignore write failures (e.g. private mode quota)
        }
        return next;
      });
    },
    [collection, toggleable],
  );

  return { cols, toggle };
}

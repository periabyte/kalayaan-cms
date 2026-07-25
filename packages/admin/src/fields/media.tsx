import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "../components/ui.js";
import { MediaPicker } from "../components/MediaPicker.js";
import { useMediaList } from "../lib/hooks.js";
import type { MediaRecord } from "../lib/types.js";
import { mediaKind, type MediaKind } from "../lib/media.js";
import type { FieldEditorProps } from "./registry.js";

/**
 * Media field editor. Single mode stores one media id (or null); `many` mode
 * stores an ordered array of ids (gallery / attachments). Both pick from the
 * shared `MediaPicker`, constrained by the field's `accept` list.
 */
export function MediaField({ field, value, onChange }: FieldEditorProps) {
  const many = field.many === true;
  const accept = field.accept as readonly MediaKind[] | undefined;
  const [open, setOpen] = useState(false);
  const { data: media } = useMediaList();
  const byId = (id: string): MediaRecord | undefined => media?.find((m) => m.id === id);

  const ids: string[] = many
    ? Array.isArray(value)
      ? (value as string[])
      : []
    : [];
  const single = !many && typeof value === "string" ? value : null;

  const toggle = (m: MediaRecord) => {
    if (ids.includes(m.id)) onChange(ids.filter((x) => x !== m.id));
    else onChange([...ids, m.id]);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {many ? (
        ids.length === 0 ? (
          <p className="text-sm text-subtle-foreground">No files selected</p>
        ) : (
          <ul className="space-y-1">
            {ids.map((id, i) => {
              const m = byId(id);
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                  {m && mediaKind(m.mime) === "image" ? (
                    <img src={`/media/${id}`} alt={m.alt ?? m.filename} className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded bg-muted text-[9px] uppercase text-muted-foreground">
                      {m ? (mediaKind(m.mime) === "video" ? "vid" : "file") : "?"}
                    </span>
                  )}
                  <span className="flex-1 truncate text-sm text-foreground">{m?.filename ?? id}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp size={14} />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === ids.length - 1}>
                    <ArrowDown size={14} />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => onChange(ids.filter((x) => x !== id))}>
                    <X size={14} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="flex items-center gap-2">
          {single ? (
            <span className="truncate text-sm text-foreground">{byId(single)?.filename ?? single}</span>
          ) : (
            <span className="text-sm text-subtle-foreground">No file selected</span>
          )}
          {single ? (
            <Button type="button" variant="ghost" onClick={() => onChange(null)}>
              Clear
            </Button>
          ) : null}
        </div>
      )}

      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {many ? "Add media" : single ? "Replace" : "Choose"}
      </Button>

      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        accept={accept}
        multiple={many}
        selectedIds={many ? ids : undefined}
        onPick={(m) => {
          if (many) toggle(m);
          else onChange(m.id);
        }}
      />
    </div>
  );
}

import { Button } from "./ui.js";
import { useMediaList, useUploadMedia } from "../lib/hooks.js";
import type { MediaRecord } from "../lib/types.js";
import { acceptAttr, matchesAccept, mediaKind, type MediaKind } from "../lib/media.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog.js";

/**
 * Modal gallery for picking an asset (or uploading a new one) from the
 * R2-backed media library. Images show a thumbnail; other files show an icon.
 *
 * Two modes: single-pick (default) calls `onPick` then closes — used by the
 * rich-text image button; multi-pick (`multiple`) keeps the dialog open, calls
 * `onPick` as a toggle against `selectedIds`, and shows a Done button.
 */
export function MediaPicker({
  open,
  onClose,
  onPick,
  accept,
  multiple = false,
  selectedIds,
  title = "Select media",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (media: MediaRecord) => void;
  /** Restrict which kinds are shown/uploadable. Omit for any. */
  accept?: readonly MediaKind[] | undefined;
  /** Keep the dialog open and toggle selection instead of closing on pick. */
  multiple?: boolean;
  /** Currently-picked ids (multi mode) to render selection state. */
  selectedIds?: readonly string[] | undefined;
  title?: string;
}) {
  const { data: media } = useMediaList();
  const upload = useUploadMedia();
  const items = (media ?? []).filter((m) => matchesAccept(m.mime, accept));
  const selected = new Set(selectedIds ?? []);

  const pick = (m: MediaRecord) => {
    onPick(m);
    if (!multiple) onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="h-14 flex-shrink-0 flex-row items-center gap-3 px-4 border-b border-border space-y-0">
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <label className="ml-auto mr-8 inline-flex items-center h-8 px-3 rounded-lg border border-input bg-card-2 text-[13px] text-foreground cursor-pointer hover:bg-accent">
            {upload.isPending ? "Uploading…" : "Upload new"}
            <input
              type="file"
              accept={acceptAttr(accept)}
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const { doc } = await upload.mutateAsync(file);
                pick(doc);
              }}
            />
          </label>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nothing here yet — use “Upload new” to add one.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m)}
                  aria-pressed={multiple ? selected.has(m.id) : undefined}
                  className={`group rounded-lg border overflow-hidden text-left outline-none hover:border-brand focus:border-brand ${
                    multiple && selected.has(m.id) ? "border-brand ring-2 ring-brand/40" : "border-border"
                  }`}
                >
                  <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                    {mediaKind(m.mime) === "image" ? (
                      <img src={`/media/${m.id}`} alt={m.alt ?? m.filename} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {mediaKind(m.mime) === "video" ? "▶ video" : "file"}
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground truncate group-hover:text-foreground">{m.filename}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {multiple && (
          <div className="h-14 flex-shrink-0 flex items-center justify-end px-4 border-t border-border">
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

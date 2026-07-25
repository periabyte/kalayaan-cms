/** Shared media-kind helpers for the media field editor and picker. */

export type MediaKind = "image" | "video" | "file";

/** Classify a stored asset by its mime type. Anything not image/video is a "file". */
export function mediaKind(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

/** Whether an asset's mime is allowed by a field's `accept` list (empty/undefined = any). */
export function matchesAccept(mime: string, accept?: readonly MediaKind[]): boolean {
  if (!accept || accept.length === 0) return true;
  return accept.includes(mediaKind(mime));
}

/**
 * HTML file-input `accept` attribute for the allowed kinds — a hint for the OS
 * file dialog. When "file" is allowed we can't enumerate every mime, so we leave
 * it unconstrained; the picker's own filtering remains the real gate.
 */
export function acceptAttr(accept?: readonly MediaKind[]): string | undefined {
  if (!accept || accept.length === 0 || accept.includes("file")) return undefined;
  const globs: string[] = [];
  if (accept.includes("image")) globs.push("image/*");
  if (accept.includes("video")) globs.push("video/*");
  return globs.length ? globs.join(",") : undefined;
}

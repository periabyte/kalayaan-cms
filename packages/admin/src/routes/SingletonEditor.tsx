import { useParams } from "react-router-dom";
import { useCollectionDocs } from "../lib/hooks.js";
import { Skeleton } from "../components/ui.js";
import { DocumentEditor } from "./DocumentEditor.js";

/**
 * Renders a singleton collection's sole entry directly (About/Home/Contact),
 * with no list in between. Resolves the one existing row's id and hands it to
 * `DocumentEditor` in singleton mode; when none exists yet, the editor starts a
 * fresh entry ("new") and the server enforces the one-per-locale invariant on
 * save. Per-locale variants are reached via the editor's own locale switcher.
 */
export function SingletonEditor() {
  const { collection = "" } = useParams();
  const { data, isLoading } = useCollectionDocs(collection, "");

  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col p-6 gap-6">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  const soleId = data?.docs[0]?.id ?? "new";
  // Remount when the resolved id changes (none → created) so the editor re-seeds.
  return <DocumentEditor key={soleId} docId={soleId} singleton />;
}

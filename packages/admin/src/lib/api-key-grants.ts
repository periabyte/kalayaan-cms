import type { PermissionAction, PermissionGrant } from "@kalayaan/config";

export interface ApiKeyGrantInput {
  /** Collection names the key is scoped to; empty = all collections (unless media-only). */
  collections: string[];
  /** Grant the `media` system subject (upload/list/manage assets). */
  media: boolean;
  /** Actions the key may perform on its subjects. */
  actions: PermissionAction[];
}

/**
 * Build the permission grants for a new API key from the key form's selections.
 *
 * `subjects: "*"` matches collections only, never a system subject like `media`,
 * so the media library needs its own grant. Rules:
 * - explicit collections → a grant on exactly those;
 * - no collections and media not chosen → the all-collections (`"*"`) default;
 * - no collections and media chosen → media only (no collection access);
 * - media chosen → an additional `["media"]` grant.
 */
export function buildApiKeyGrants({ collections, media, actions }: ApiKeyGrantInput): PermissionGrant[] {
  const grants: PermissionGrant[] = [];
  if (collections.length) grants.push({ subjects: collections, actions });
  else if (!media) grants.push({ subjects: "*", actions });
  if (media) grants.push({ subjects: ["media"], actions });
  return grants;
}

/**
 * Build-time client for the Kalayaan CMS that backs the blog.
 *
 * The docs site is a static build, so every one of these calls happens on the
 * build machine, never in the browser — no API key is involved. The content API
 * only ever returns published documents to an anonymous reader (the `public`
 * role's default `read` grant), so a draft can't leak into a build.
 *
 * Publishing in the admin fires a webhook that triggers this site's workflow,
 * which is what makes content editable without touching this repo.
 */
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";

/**
 * Public origin for media the browser loads — the custom domain.
 * Override for local development against `kalayaan dev`.
 */
export const CMS_URL = (
  import.meta.env.CMS_URL ?? "https://kalayaan-admin.periabyte.dev"
).replace(/\/$/, "");

/**
 * Origin the *build* reads the API from, which is deliberately not the custom
 * domain. kalayaan-admin.periabyte.dev sits behind the zone's bot/WAF settings,
 * and those reject the datacenter IPs GitHub Actions runs on — the first CI
 * build after this landed got a 403 while the same request from a laptop got
 * 200. The workers.dev hostname serves the same Worker without zone-level
 * rules in front of it, so it's the reliable origin for machine reads.
 */
const CMS_API_URL = (
  import.meta.env.CMS_API_URL ?? "https://kalayaan-docs.periabytes.workers.dev"
).replace(/\/$/, "");

export interface Media {
  id: string;
  url: string;
  alt?: string | null;
}

export interface Author {
  id: string;
  name: string;
  bio?: string | null;
  avatar?: Media | null;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  seo_title?: string | null;
  description: string;
  body?: unknown;
  cover?: Media | null;
  author?: Author | null;
  tags?: Array<{ id: string; name: string }> | null;
  published_at: number;
}

/**
 * The editor's extension set, minus Placeholder (editor-only chrome that
 * renders nothing). This list must track `packages/admin/src/fields/
 * rich-text.tsx` — an extension the editor can produce but this can't parse
 * makes `generateHTML` throw on an otherwise valid post.
 */
const EXTENSIONS = [
  StarterKit,
  Image.configure({ HTMLAttributes: { class: "rte-image" } }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
  }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
];

/** Rich text is stored as portable TipTap JSON, not HTML — render it here. */
export function renderBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  try {
    return generateHTML(body as Parameters<typeof generateHTML>[0], EXTENSIONS);
  } catch (err) {
    // A post that renders as an empty body is a visible bug; a build that dies
    // on one malformed document takes the whole site down. Prefer the former,
    // loudly.
    console.warn(`[cms] could not render rich text: ${(err as Error).message}`);
    return "";
  }
}

async function get<T>(path: string, attempt = 1): Promise<T> {
  const res = await fetch(`${CMS_API_URL}/api/v1${path}`, {
    // Default `undici` sends no User-Agent, which is itself a bot signal to
    // some edge rules. Identify the caller honestly instead.
    headers: { "user-agent": "kalayaan-docs-site build (+https://kalayaan.periabyte.dev)" },
  });

  if (!res.ok) {
    // One retry on 5xx/429 — a cold Worker or a rate limit shouldn't take the
    // whole docs deploy down. 4xx is a real misconfiguration; fail immediately.
    if (attempt === 1 && (res.status >= 500 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, 2000));
      return get<T>(path, 2);
    }
    // The status alone doesn't distinguish "the CMS said no" from "Cloudflare
    // blocked us before the Worker ever ran" — the body does, so include it.
    const body = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(
      `CMS request failed: GET ${path} → ${res.status} ${res.statusText} ` +
        `(origin ${CMS_API_URL}).\nResponse body: ${body || "<empty>"}`,
    );
  }
  return (await res.json()) as T;
}

/** Published posts, newest first. */
export async function getPosts(): Promise<Post[]> {
  const { docs } = await get<{ docs: Post[] }>(
    "/posts?populate=author,tags,cover&sort=-published_at&limit=100",
  );
  return docs;
}

/** One post by slug, with relations populated. Null when it isn't published. */
export async function getPost(slug: string): Promise<Post | null> {
  try {
    const { doc } = await get<{ doc: Post }>(
      `/posts/${encodeURIComponent(slug)}?populate=author,tags,cover`,
    );
    return doc;
  } catch {
    return null;
  }
}

/** Absolute media URL — the API returns paths relative to the CMS origin. */
export function mediaUrl(media: Media | null | undefined): string | undefined {
  if (!media?.url) return undefined;
  return media.url.startsWith("http") ? media.url : `${CMS_URL}${media.url}`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

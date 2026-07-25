import { describe, expect, it } from "vitest";
import { buildApiKeyGrants } from "../src/lib/api-key-grants.js";

describe("buildApiKeyGrants", () => {
  const actions = ["read", "create"] as const;

  it("defaults to all collections when nothing is scoped", () => {
    expect(buildApiKeyGrants({ collections: [], media: false, actions: [...actions] })).toEqual([
      { subjects: "*", actions: [...actions] },
    ]);
  });

  it("scopes to explicit collections", () => {
    expect(buildApiKeyGrants({ collections: ["posts", "authors"], media: false, actions: [...actions] })).toEqual([
      { subjects: ["posts", "authors"], actions: [...actions] },
    ]);
  });

  it("grants media only (no collection access) when media is chosen with no collections", () => {
    expect(buildApiKeyGrants({ collections: [], media: true, actions: ["read", "create"] })).toEqual([
      { subjects: ["media"], actions: ["read", "create"] },
    ]);
  });

  it("grants both collections and media when both are chosen", () => {
    expect(buildApiKeyGrants({ collections: ["posts"], media: true, actions: [...actions] })).toEqual([
      { subjects: ["posts"], actions: [...actions] },
      { subjects: ["media"], actions: [...actions] },
    ]);
  });
});

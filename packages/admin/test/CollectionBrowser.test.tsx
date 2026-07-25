import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { CollectionBrowser } from "../src/routes/CollectionBrowser.js";
import { ToastProvider } from "../src/components/toast.js";

const SCHEMA = {
  name: "Test",
  ui: { brandColor: null, logo: null },
  auth: { providers: [] },
  ai: { enabled: false, features: [] },
  collections: [
    {
      name: "posts",
      titleField: "title",
      versioning: false,
      locales: [],
      fields: [
        { name: "title", type: "text" },
        { name: "slug", type: "slug" },
        { name: "body", type: "richText", label: "Body" },
        { name: "views", type: "number", label: "Views" },
      ],
    },
  ],
};

const DOCS = {
  docs: [
    { id: "post_abc123", updated_at: Date.now(), publishStatus: "published", title: "Hello", slug: "hello", views: 42 },
  ],
  cursor: null,
};

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

function mockFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("/admin/api/schema")) return json(SCHEMA);
    if (url.includes("/admin/api/saved-filters")) return json({ filters: [] });
    if (url.includes("/admin/api/posts")) return json(DOCS);
    return json({});
  }) as unknown as typeof fetch;
}

function renderBrowser() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/posts"]}>
          <Routes>
            <Route path="/:collection" element={<CollectionBrowser />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("CollectionBrowser columns", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("fetch", mockFetch());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders ID as the first column, always visible", async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());

    const headers = screen.getAllByRole("columnheader");
    expect(headers[0]).toHaveTextContent("ID");
    expect(headers[1]).toHaveTextContent("Title");

    // First body cell of the first row is the document id.
    const firstRow = screen.getByText("Hello").closest("tr")!;
    expect(within(firstRow).getAllByRole("cell")[0]).toHaveTextContent("post_abc123");
  });

  it("toggles a content-field column on and persists it", async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText("Hello")).toBeInTheDocument());

    // "Views" is off by default — not a header yet.
    expect(screen.queryByRole("columnheader", { name: "Views" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Views" }));

    // Column now shows with its value, and the choice is persisted per collection.
    expect(await screen.findByRole("columnheader", { name: "Views" })).toBeInTheDocument();
    const firstRow = screen.getByText("Hello").closest("tr")!;
    expect(within(firstRow).getByText("42")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("kalayaan-cols:posts")!)).toMatchObject({ views: true });
  });
});

import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, Columns3, Plus } from "lucide-react";
import {
  useCollectionDocs,
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
  useSchema,
} from "../lib/hooks.js";
import { Button, EmptyState, ErrorState, Input, Skeleton, StatusBadge, cn } from "../components/ui.js";
import { Popover } from "../components/Popover.js";
import { useToast } from "../components/toast.js";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog.js";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form.js";
import { savedFilterNameSchema, type SavedFilterNameValues } from "../lib/schemas.js";
import { useColumnPrefs, type ToggleableColumn } from "../lib/columnPrefs.js";
import type { Doc, PublishStatus, SchemaField } from "../lib/types.js";

type FilterId = "all" | "published" | "draft" | "scheduled" | "mt";
const FILTERS: { id: FilterId; label: string; dot?: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published", dot: "hsl(var(--published))" },
  { id: "draft", label: "Drafts", dot: "hsl(var(--draft))" },
  { id: "scheduled", label: "Scheduled", dot: "hsl(var(--brand))" },
  { id: "mt", label: "Needs review", dot: "hsl(var(--mt))" },
];

/** Synthetic (non-config) columns the user can toggle, shown after the config fields. */
const EXTRA_COLS = { locales: "Locales", updated: "Updated" } as const;

function matchesFilter(doc: Doc, f: FilterId): boolean {
  if (f === "all") return true;
  if (f === "mt") return Boolean(doc.mt);
  return (doc.publishStatus as PublishStatus) === f;
}

function relativeTime(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

/** Renders an arbitrary config-field value as a short, readable table cell string. */
function formatCell(value: unknown, type: SchemaField["type"]): string {
  if (value == null || value === "") return "";
  switch (type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      return typeof value === "number" ? relativeTime(value) : String(value);
    case "richText":
    case "media":
    case "relation":
    case "custom":
      // Objects/HTML don't belong in a cell — show a plain preview or a dash.
      return typeof value === "string" ? value : "—";
    default:
      return String(value);
  }
}

export function CollectionBrowser() {
  const { collection = "" } = useParams();
  const navigate = useNavigate();
  const { data: schema } = useSchema();
  const toast = useToast();
  const def = schema?.collections.find((c) => c.name === collection);

  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data: page, isLoading, isError, refetch } = useCollectionDocs(collection, search);

  const [filter, setFilter] = useState<FilterId>("all");
  const [colMenu, setColMenu] = useState(false);
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);

  const savedFilters = useSavedFilters(collection);
  const createFilter = useCreateSavedFilter();
  const deleteFilter = useDeleteSavedFilter(collection);

  const hasLocales = (def?.locales.length ?? 0) > 0;
  const titleField = def?.titleField ?? def?.fields.find((f) => f.type === "text")?.name;
  const slugField = def?.fields.find((f) => f.type === "slug")?.name;

  // Config fields shown as their own columns — skip the title/slug fields, which
  // already appear in the Title cell. Config order is preserved.
  const fieldCols = useMemo(
    () => (def?.fields ?? []).filter((f) => f.name !== titleField && f.name !== slugField),
    [def, titleField, slugField],
  );

  // Everything the user can toggle: config fields (default off), then the
  // synthetic Locales/Updated extras (default on). ID is pinned, never here.
  const toggleable = useMemo<ToggleableColumn[]>(() => {
    const list: ToggleableColumn[] = fieldCols.map((f) => ({
      key: f.name,
      label: f.label ?? f.name,
      defaultOn: false,
    }));
    if (hasLocales) list.push({ key: "locales", label: EXTRA_COLS.locales, defaultOn: true });
    list.push({ key: "updated", label: EXTRA_COLS.updated, defaultOn: true });
    return list;
  }, [fieldCols, hasLocales]);

  const { cols, toggle } = useColumnPrefs(collection, toggleable);

  const docs = page?.docs ?? [];
  const counts = useMemo(() => {
    const c: Record<FilterId, number> = { all: docs.length, published: 0, draft: 0, scheduled: 0, mt: 0 };
    for (const d of docs) {
      if (d.mt) c.mt++;
      const s = d.publishStatus as PublishStatus;
      if (s === "published") c.published++;
      else if (s === "scheduled") c.scheduled++;
      else c.draft++;
    }
    return c;
  }, [docs]);

  const rows = useMemo(() => docs.filter((d) => matchesFilter(d, filter)), [docs, filter]);

  if (!def) return null;

  const showEmpty = !isLoading && !isError && docs.length === 0 && cursors.length === 1;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* header */}
      <header className="h-14 flex-shrink-0 flex items-center gap-3 px-4 sm:px-5 border-b border-border">
        <h1 className="text-base font-semibold whitespace-nowrap">{def.name}</h1>
        <span className="font-mono text-xs text-muted-foreground bg-muted rounded-md px-1.5 py-0.5 tabular-nums">{docs.length}</span>
        <div className="ml-auto flex items-center gap-2 relative">
          <Button className="hidden sm:inline-flex" onClick={() => setColMenu((o) => !o)}>
            <Columns3 size={14} />
            Columns
          </Button>
          <Popover open={colMenu} onClose={() => setColMenu(false)} className="absolute top-10 right-0 w-52">
            <div className="px-2.5 pt-1.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle-foreground">Toggle columns</div>
            <div className="max-h-72 overflow-y-auto">
              {toggleable.map((c) => (
                <button
                  key={c.key}
                  onClick={() => toggle(c.key)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] hover:bg-accent text-left"
                >
                  <span
                    className={cn(
                      "w-4 h-4 shrink-0 rounded border border-border-strong flex items-center justify-center text-brand-foreground",
                      cols[c.key] && "bg-brand border-brand",
                    )}
                  >
                    {cols[c.key] && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{c.label}</span>
                </button>
              ))}
            </div>
          </Popover>
          <Button variant="default" onClick={() => navigate(`/${collection}/new`)}>
            <Plus size={15} strokeWidth={2.2} />
            New entry
          </Button>
        </div>
      </header>

      {/* filter bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-border flex-wrap">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "h-[30px] inline-flex items-center gap-1.5 px-3 rounded-full text-[12.5px] font-medium border",
                active ? "border-brand bg-brand-subtle text-brand-subtle-fg" : "border-border bg-card text-foreground hover:border-border-strong",
              )}
            >
              {f.dot && <span className="w-[7px] h-[7px] rounded-full" style={{ background: f.dot }} />}
              {f.label}
              <span className="font-mono text-[11px] opacity-70 tabular-nums">{counts[f.id]}</span>
            </button>
          );
        })}
        {savedFilters.data?.map((sf) => (
          <span key={sf.id} className="h-[30px] inline-flex items-center gap-1.5 px-3 rounded-full text-[12.5px] border border-border bg-card">
            {sf.name}
            <button className="text-subtle-foreground hover:text-danger" onClick={() => deleteFilter.mutate(sf.id)}>
              ×
            </button>
          </span>
        ))}
        <button
          onClick={() => {
            if (filter === "all") {
              toast({ title: "Pick a filter first", kind: "info" });
              return;
            }
            setSaveFilterOpen(true);
          }}
          className="h-[30px] inline-flex items-center gap-1.5 px-2.5 rounded-full text-[12px] border border-dashed border-border-strong text-muted-foreground hover:text-foreground"
        >
          <Plus size={12} />
          Save filter
        </button>
      </div>

      <SaveFilterDialog
        open={saveFilterOpen}
        onOpenChange={setSaveFilterOpen}
        defaultName={FILTERS.find((f) => f.id === filter)?.label ?? "Filter"}
        onSave={(name) => {
          createFilter.mutate(
            { collection, name, query: { filter } },
            { onSuccess: () => toast({ title: "Filter saved", kind: "published" }) },
          );
        }}
      />

      {/* body */}
      <div className="flex-1 min-h-0 overflow-auto relative">
        {isLoading ? (
          <div className="px-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 h-[52px] border-b border-border">
                <Skeleton className="w-[34%] h-3" />
                <Skeleton className="w-[70px] h-5 rounded-full" />
                <Skeleton className="w-[120px] h-3" />
                <Skeleton className="w-[60px] h-3 ml-auto mr-2" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState title="Couldn’t load entries" description="The content API returned an error. Your work is safe." onRetry={() => refetch()} />
        ) : showEmpty ? (
          <EmptyState
            icon={
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 4h16v16H4z" />
                <path d="M4 9h16M9 9v11" />
              </svg>
            }
            title={`No entries in ${def.name} yet`}
            description="Create the first entry — changes hot-reload the dashboard."
            action={
              <Button variant="default" onClick={() => navigate(`/${collection}/new`)}>
                Create first entry
              </Button>
            }
          />
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="sticky top-0 bg-card z-[1] shadow-[inset_0_-1px_0_hsl(var(--border))]">
                <Th className="w-[130px] pl-5">ID</Th>
                <Th>Title</Th>
                <Th className="w-[130px]">Status</Th>
                {fieldCols.map((f) => cols[f.name] && <Th key={f.name} className="w-[140px]">{f.label ?? f.name}</Th>)}
                {hasLocales && cols.locales && <Th className="w-[120px]">Locales</Th>}
                {cols.updated && <Th className="w-[120px] text-right pr-5">Updated</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const title = titleField ? String(r[titleField] ?? r.id) : r.id;
                const slug = slugField ? String(r[slugField] ?? "") : "";
                return (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/${collection}/${r.id}`)}
                    className="cursor-pointer border-b border-border hover:bg-card-2"
                  >
                    <td className="py-[11px] pl-5 pr-3 font-mono text-[11px] text-muted-foreground truncate max-w-[130px]">{r.id}</td>
                    <td className="py-[11px] px-3 max-w-0">
                      <div className="truncate font-medium">{title}</div>
                      {slug && <div className="font-mono text-[11px] text-muted-foreground truncate">/{slug}</div>}
                    </td>
                    <td className="py-[11px] px-3">
                      <StatusBadge status={r.publishStatus} mt={r.mt} />
                    </td>
                    {fieldCols.map(
                      (f) =>
                        cols[f.name] && (
                          <td key={f.name} className="py-[11px] px-3 text-muted-foreground truncate max-w-[140px]">
                            {formatCell(r[f.name], f.type)}
                          </td>
                        ),
                    )}
                    {hasLocales && cols.locales && (
                      <td className="py-[11px] px-3 font-mono text-[11px] text-muted-foreground">{String(r.locale ?? def.locales[0] ?? "")}</td>
                    )}
                    {cols.updated && (
                      <td className="py-[11px] pl-3 pr-5 text-right text-muted-foreground tabular-nums">{relativeTime(r.updated_at)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* pagination */}
      {!isLoading && !isError && !showEmpty && (
        <div className="flex-shrink-0 h-12 flex items-center gap-3.5 px-4 sm:px-5 border-t border-border text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {rows.length} of {docs.length} shown
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" disabled={cursors.length === 1} onClick={() => setCursors((c) => c.slice(0, -1))}>
              Previous
            </Button>
            <Button size="sm" disabled={!page?.cursor} onClick={() => setCursors((c) => [...c, page?.cursor ?? undefined])}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("py-2.5 px-3 text-left font-semibold text-muted-foreground text-xs", className)}>{children}</th>;
}

function SaveFilterDialog({
  open,
  onOpenChange,
  defaultName,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onSave: (name: string) => void;
}) {
  const form = useForm<SavedFilterNameValues>({
    resolver: zodResolver(savedFilterNameSchema),
    defaultValues: { name: defaultName },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset({ name: defaultName });
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save filter</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(({ name }) => {
              onSave(name);
              onOpenChange(false);
            })}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default">
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Clock, Eye, History, Send, Sparkles, Trash2 } from "lucide-react";
import {
  useAiImprove,
  useAiSeo,
  useAiSummarize,
  useAiTranslate,
  useCreateDoc,
  useCurrentUser,
  useDeleteDoc,
  useDoc,
  useRelationOptions,
  useRestoreVersion,
  useSchema,
  useUpdateDoc,
  useVersions,
} from "../lib/hooks.js";
import { FieldEditor } from "../fields/registry.js";
import { api, ApiError } from "../lib/api.js";
import { slugify } from "../lib/slug.js";
import { Badge, Button, Card, ErrorBanner, Skeleton, StatusBadge, cn } from "../components/ui.js";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form.js";
import { useToast } from "../components/toast.js";
import { useConfirm } from "../components/ConfirmDialog.js";
import type { Doc, SchemaField, VersionStatus } from "../lib/types.js";

/**
 * Builds a loose, per-field zod schema from the runtime field defs so the
 * form gets typed field-level validation (shown via <FormMessage/>) without
 * blocking draft saves — see `save()`, which reads `form.getValues()`
 * directly rather than gating on `form.handleSubmit`. Mirrors the
 * nullable/required rules `writableBody` already enforces on write.
 */
const AI_ENRICH_LABEL: Record<"improve" | "summarize" | "seoTitle" | "seoDescription", string> = {
  improve: "Improve writing",
  summarize: "Summarize",
  seoTitle: "Generate SEO title",
  seoDescription: "Generate SEO description",
};

function buildDocSchema(fields: SchemaField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    const required = f.required === true;
    let s: z.ZodTypeAny;
    switch (f.type) {
      case "text": {
        const maxLength = f.maxLength as number | undefined;
        let t = z.string();
        if (typeof maxLength === "number") t = t.max(maxLength, `Must be ${maxLength} characters or fewer`);
        s = required ? t.min(1, "Required") : t.optional();
        break;
      }
      case "slug":
        s = required ? z.string().min(1, "Required") : z.string().optional();
        break;
      case "select":
        s = required ? z.string().min(1, "Required") : z.string().optional();
        break;
      case "number":
        s = required ? z.number({ message: "Required" }) : z.number().optional();
        break;
      case "boolean":
        s = z.boolean().optional();
        break;
      case "date":
        s = required ? z.number({ message: "Required" }) : z.number().optional();
        break;
      case "media":
        // Single is nullable per `writableBody`'s nullable-field set; many is an
        // ordered array of ids, mirroring many-relation.
        s = f.many ? z.array(z.string()).optional() : z.string().nullable().optional();
        break;
      case "relation":
        s = f.many ? z.array(z.string()).optional() : z.string().nullable().optional();
        break;
      case "richText":
      case "custom":
      default:
        // TipTap JSON / plugin-defined shapes aren't meaningfully zod-validatable.
        s = z.any().optional();
        break;
    }
    shape[f.name] = s;
  }
  return z.object(shape).passthrough();
}

export function DocumentEditor({
  docId,
  singleton = false,
}: { docId?: string; singleton?: boolean } = {}) {
  const params = useParams();
  const collection = params.collection ?? "";
  // Singletons are rendered without an `:id` route param — the wrapper resolves
  // the sole entry's id and passes it in (or "new" when none exists yet).
  const id = docId ?? params.id;
  const isNew = id === "new" || id === undefined;
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: schema } = useSchema();
  const def = schema?.collections.find((c) => c.name === collection);

  const localized = (def?.locales.length ?? 0) > 0;
  const [activeLocale, setActiveLocale] = useState<string | null>(null);
  const effectiveLocale = localized ? (activeLocale ?? def!.locales[0]) : undefined;

  const qc = useQueryClient();
  // Locale switching only applies to an existing entity, never a brand-new one.
  const { data: doc, isLoading, isError } = useDoc(collection, isNew ? undefined : id, isNew ? undefined : effectiveLocale);
  const create = useCreateDoc(collection);
  const remove = useDeleteDoc(collection);
  const improve = useAiImprove();
  const translate = useAiTranslate();
  const summarize = useAiSummarize();
  const seo = useAiSeo();

  const docSchema = useMemo(() => buildDocSchema(def?.fields ?? []), [def]);
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(docSchema),
    defaultValues: {},
  });

  // A single-relation field literally named "author" defaults to an entry
  // representing the signed-in user: matched by name/email against the
  // target collection's title field, creating one inline if none exists yet.
  const { data: currentUser } = useCurrentUser();
  const authorField = def?.fields.find((f) => f.type === "relation" && !f.many && f.name.toLowerCase() === "author");
  const authorTargetName = authorField ? (authorField.to as string) : undefined;
  const authorTarget = schema?.collections.find((c) => c.name === authorTargetName);
  const { data: authorOptions } = useRelationOptions(authorTargetName ?? "");
  const authorDefaulted = useRef(false);

  const [diffOpen, setDiffOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const entityIdRef = useRef<string | undefined>(undefined);

  // Subscribes this component to every field so display-only reads below
  // (title, badges, slug source, locale) stay live while typing — the same
  // whole-document re-render the old `values` state produced.
  const values = form.watch();

  // Live-generate slug fields from their source while creating a new entry, up
  // until the user edits the slug themselves (RHF's per-field dirty tracking
  // is "touched" here). Existing docs keep their slug stable (changing a live
  // URL on every title edit would be surprising); the server also generates
  // one on save as the guarantee.
  useEffect(() => {
    if (!def || !isNew) return;
    for (const f of def.fields) {
      if (f.type !== "slug" || form.formState.dirtyFields[f.name]) continue;
      const source = values[(f as { from?: string }).from ?? ""];
      const next = typeof source === "string" ? slugify(source) : "";
      if (next !== (values[f.name] ?? "")) {
        form.setValue(f.name, next, { shouldDirty: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, isNew, values, form]);

  // The shown document may be the base row or a locale variant with its own id;
  // writes target that id, or POST when the switched-to locale has no row yet.
  const currentId = values.id as string | undefined;
  const isCreating = isNew || !currentId;
  const update = useUpdateDoc(collection, currentId ?? "");

  useEffect(() => {
    if (doc) {
      form.reset(doc);
      entityIdRef.current = (doc.entity_id as string | undefined) ?? doc.id;
    } else if (doc === null) {
      // The switched-to locale has no row yet — seed a fresh draft for it.
      form.reset({ entity_id: entityIdRef.current, locale: effectiveLocale });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, effectiveLocale]);

  useEffect(() => {
    if (!isNew || !authorField || !authorTarget || !currentUser || !authorOptions || authorDefaulted.current) return;
    if (form.getValues(authorField.name)) return; // already set (or user cleared it) — don't override
    authorDefaulted.current = true;
    const identity = currentUser.name?.trim() || currentUser.email;
    const writeField = authorTarget.titleField ?? authorTarget.fields.find((f) => f.type === "text")?.name;
    const existing = (authorOptions?.docs ?? []).find(
      (d) => writeField && String(d[writeField] ?? "").toLowerCase() === identity.toLowerCase(),
    );
    if (existing) {
      form.setValue(authorField.name, existing.id, { shouldDirty: false });
      return;
    }
    if (!writeField) return;
    // Publish immediately — this entry has no editorial workflow surfaced to
    // the user (they never see it as a separate document to publish), so it
    // must not sit invisible as a draft once this doc goes live. Fall back to
    // a plain (draft) create if the role can't publish this target collection.
    void api
      .post<{ doc: Doc }>(`/admin/api/${authorTargetName}`, { [writeField]: identity, published_at: Date.now() })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) {
          return api.post<{ doc: Doc }>(`/admin/api/${authorTargetName}`, { [writeField]: identity });
        }
        throw e;
      })
      .then((r) => {
        form.setValue(authorField.name, r.doc.id, { shouldDirty: false });
        void qc.invalidateQueries({ queryKey: ["docs", authorTargetName] });
      })
      .catch(() => {
        // Best-effort convenience default — leave the field empty if it fails.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, authorField, authorTarget, authorOptions, currentUser]);

  const aiEnabled = schema?.ai.enabled ?? false;
  const canImprove = aiEnabled && schema?.ai.features.includes("editorial-assist");
  const canTranslate = aiEnabled && schema?.ai.features.includes("translate");
  const versionsEnabled = (schema?.features?.versions ?? false) && !isNew;

  const primaryTextField = useMemo<SchemaField | undefined>(
    () => def?.fields.find((f) => f.type === "richText") ?? def?.fields.find((f) => f.type === "text"),
    [def],
  );

  const changedFields = useMemo(() => {
    if (!def) return [];
    return def.fields.filter((f) => form.formState.dirtyFields[f.name]).map((f) => f.label ?? f.name);
  }, [def, form.formState.dirtyFields]);

  if (!def) return null;

  const mutation = isCreating ? create : update;
  const publishStatus = (values.publishStatus as string) ?? (values.published_at ? "published" : "draft");

  // The editor keeps the whole document in `values` (including system/derived
  // fields the API never accepts on write). Build a body of only the writable
  // field values, matching the server's write schema: skip undefined, and skip
  // empty/null for fields that aren't nullable (only media + single relations
  // are), so empty optional fields are omitted rather than sent as invalid.
  function writableBody(values: Record<string, unknown>, extra?: Record<string, unknown>): Record<string, unknown> {
    if (!def) return { ...extra };
    const nullable = new Set(
      def.fields
        .filter((f) => (f.type === "media" || f.type === "relation") && !f.many)
        .map((f) => f.name),
    );
    const out: Record<string, unknown> = {};
    for (const f of def.fields) {
      const v = values[f.name];
      if (v === undefined) continue;
      if ((v === null || v === "") && !nullable.has(f.name)) continue;
      out[f.name] = v;
    }
    if (def.locales.length > 0 && values.locale != null) out.locale = values.locale;
    if (values.entity_id != null) out.entity_id = values.entity_id;
    return { ...out, ...extra };
  }

  async function save(extra?: Record<string, unknown>): Promise<void> {
    const body = writableBody(form.getValues(), extra);
    if (isCreating) {
      const created = await create.mutateAsync({ body });
      if (isNew && !singleton) navigate(`/${collection}/${created.id}`, { replace: true });
      else {
        // A new locale variant was created — adopt it so further edits update it.
        form.reset(created);
      }
    } else {
      await update.mutateAsync({ body });
    }
  }

  const publish = async () => {
    const prev = form.formState.defaultValues?.published_at;
    const wasCreating = isCreating;
    await save({ published_at: Date.now() });
    toast({
      title: "Published to production",
      desc: `${changedFields.length} field${changedFields.length === 1 ? "" : "s"} · live at the edge`,
      kind: "published",
      onUndo:
        !wasCreating && currentId
          ? () => void update.mutateAsync({ body: { published_at: (prev as number | null) ?? null } })
          : undefined,
    });
  };

  const primaryText = (): string => {
    if (!primaryTextField) return "";
    const cur = form.getValues(primaryTextField.name);
    return typeof cur === "string" ? cur : JSON.stringify(cur ?? "");
  };

  type AiEnrich = { action: "improve" | "summarize" | "seoTitle" | "seoDescription"; dependency?: string };

  /** Runs the AI action a field declares via `aiEnrich` in cms.config.ts, reading
   * its source text from `dependency` (or itself) and writing the result into
   * THIS field only — no name-matching guesswork about which field it affects. */
  const runAiEnrich = async (target: SchemaField) => {
    const enrich = target.aiEnrich as AiEnrich | undefined;
    if (!enrich) return;
    const sourceField = def.fields.find((f) => f.name === (enrich.dependency ?? target.name));
    const cur = sourceField ? form.getValues(sourceField.name) : undefined;
    const text = typeof cur === "string" ? cur : cur ? JSON.stringify(cur) : "";
    if (!text) {
      toast({ title: `Add some ${sourceField?.label ?? sourceField?.name ?? "content"} first`, kind: "info" });
      return;
    }
    let result: string;
    switch (enrich.action) {
      case "improve":
        result = await improve.mutateAsync({ text });
        break;
      case "summarize":
        result = await summarize.mutateAsync({ text });
        break;
      case "seoTitle":
        result = (await seo.mutateAsync({ text })).title;
        break;
      case "seoDescription":
        result = (await seo.mutateAsync({ text })).description;
        break;
    }
    form.setValue(target.name, result, { shouldDirty: true, shouldValidate: false });
    toast({ title: `${target.label ?? target.name} updated`, desc: "Review before publishing", kind: "published" });
  };

  const aiEnrichPending = (action: AiEnrich["action"]): boolean =>
    action === "improve" ? improve.isPending : action === "summarize" ? summarize.isPending : seo.isPending;

  // Translate the source text into the next locale, save that variant, and
  // record an mt-review version (`?review=mt`) so the "Needs review" badge
  // lights. Persists server-side without disturbing the current editor locale;
  // switch to the target locale to review the result.
  const runTranslate = async () => {
    const target = def.locales.find((l) => l !== (def.locales[0] ?? ""));
    if (!primaryTextField || !target) {
      toast({ title: "No target locale configured", kind: "info" });
      return;
    }
    const text = primaryText();
    if (!text) {
      toast({ title: `Add some ${primaryTextField.label ?? primaryTextField.name} first`, kind: "info" });
      return;
    }
    const translated = await translate.mutateAsync({ text, targetLocale: target });
    const entityId = (form.getValues("entity_id") as string | undefined) ?? entityIdRef.current ?? currentId;
    const body = { ...writableBody(form.getValues()), [primaryTextField.name]: translated, entity_id: entityId, locale: target };
    const existing = await api
      .get<{ doc: Doc | null }>(`/admin/api/${collection}/${id}?locale=${encodeURIComponent(target)}`)
      .then((r) => r.doc)
      .catch(() => null);
    if (existing) await api.patch(`/admin/api/${collection}/${existing.id}?review=mt`, body);
    else await api.post(`/admin/api/${collection}?review=mt`, body);
    await qc.invalidateQueries({ queryKey: ["doc", collection] });
    await qc.invalidateQueries({ queryKey: ["docs", collection] });
    toast({ title: `Translated to ${target}`, desc: "Saved · marked for MT review", kind: "published" });
  };

  const askDelete = () =>
    confirm({
      title: `Delete this ${def.name}?`,
      message: "This permanently removes the entry. Type delete to confirm.",
      typeToConfirm: "delete",
      confirmLabel: "Delete entry",
      danger: true,
      onConfirm: async () => {
        await remove.mutateAsync(currentId ?? id!);
        toast({ title: "Entry deleted", kind: "danger" });
        navigate(`/${collection}`);
      },
    });

  const savedLabel = mutation.isPending ? "Saving…" : changedFields.length ? "Unsaved changes" : "All changes saved";
  const titleField = def.titleField ?? primaryTextField?.name;
  const title = titleField ? String(values[titleField] ?? "Untitled entry") : "Untitled entry";

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="h-14 flex-shrink-0 flex items-center gap-2 sm:gap-3 px-4 sm:px-5 border-b border-border">
        {!singleton && (
          <button
            onClick={() => navigate(`/${collection}`)}
            className="w-8 h-8 flex-shrink-0 rounded-lg border border-border bg-card text-muted-foreground flex items-center justify-center hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-muted-foreground hidden sm:inline">{def.name}</span>
          {!singleton && <ChevronRight size={14} className="text-subtle-foreground hidden sm:inline" />}
          {!singleton && (
            <span className="text-sm font-semibold truncate max-w-[130px] sm:max-w-[340px]">{isNew ? "New entry" : title}</span>
          )}
          <StatusBadge status={publishStatus} mt={values.mt as boolean | undefined} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:inline">{savedLabel}</span>
          <Button disabled={mutation.isPending} onClick={() => void save().then(() => toast({ title: "Draft saved", kind: "info" }))}>
            Save draft
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* fields column */}
        <div className="flex-1 min-w-0 lg:overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-4 sm:px-8 pt-6 sm:pt-7 pb-10 lg:pb-32">
            {mutation.isError && (
              <div className="mb-5">
                <ErrorBanner message={mutation.error instanceof ApiError ? mutation.error.message : "Save failed"} />
              </div>
            )}
            {isError ? (
              <ErrorBanner message="This document failed to load." />
            ) : isLoading && !isNew ? (
              <div className="flex flex-col gap-6">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-52 w-full" />
              </div>
            ) : (
              <Form {...form}>
                <div className="flex flex-col gap-[22px]">
                  {def.fields.map((field) =>
                    field.type === "slug" ? (
                      <FormField
                        key={field.name}
                        control={form.control}
                        name={field.name}
                        render={({ field: rhfField }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-1.5">
                              {field.label ?? field.name}
                              {field.required && <span className="text-danger">*</span>}
                            </FormLabel>
                            <div className="flex items-center h-10 bg-muted border border-input rounded-lg overflow-hidden">
                              <span className="pl-3 pr-0.5 text-subtle-foreground font-mono text-[13px]">/{collection}/</span>
                              <input
                                value={(rhfField.value as string) ?? ""}
                                onChange={(e) => rhfField.onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}
                                className="flex-1 h-full pr-3 bg-transparent outline-none text-foreground font-mono text-[13px]"
                              />
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        key={field.name}
                        control={form.control}
                        name={field.name}
                        render={({ field: rhfField }) => {
                          const enrich = canImprove ? (field.aiEnrich as AiEnrich | undefined) : undefined;
                          return (
                            <FormItem>
                              <FormLabel className="flex items-center gap-1.5">
                                {field.label ?? field.name}
                                {field.required && <span className="text-danger">*</span>}
                                {enrich && (
                                  <button
                                    type="button"
                                    title={AI_ENRICH_LABEL[enrich.action]}
                                    disabled={aiEnrichPending(enrich.action)}
                                    onClick={() => void runAiEnrich(field)}
                                    className="ml-auto flex items-center gap-1 text-[11px] font-medium text-brand-subtle-fg hover:opacity-80 disabled:opacity-50"
                                  >
                                    <Sparkles size={12} />
                                    {aiEnrichPending(enrich.action) ? "Working…" : AI_ENRICH_LABEL[enrich.action]}
                                  </button>
                                )}
                              </FormLabel>
                              <FieldEditor field={field} value={rhfField.value} onChange={rhfField.onChange} />
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    ),
                  )}
                </div>
              </Form>
            )}
          </div>
        </div>

        {/* meta rail — stacks below the fields on narrow screens */}
        <aside className="w-full lg:w-[340px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border lg:overflow-y-auto bg-card-2">
          <div className="p-4 space-y-4">
            {/* publish bar */}
            <Card className="overflow-hidden">
              <div className="p-4 pb-3 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-subtle-foreground">Publish</span>
                  <StatusBadge status={publishStatus} mt={values.mt as boolean | undefined} />
                </div>
                <button onClick={() => setDiffOpen((o) => !o)} className="flex items-center gap-1.5 mt-1 w-full">
                  <span className={cn("w-[7px] h-[7px] rounded-full", changedFields.length ? "bg-draft" : "bg-published")} />
                  <span className="text-[13px] font-medium" style={{ color: changedFields.length ? "hsl(var(--draft-fg))" : "hsl(var(--published-fg))" }}>
                    {changedFields.length ? `${changedFields.length} unsaved change${changedFields.length === 1 ? "" : "s"}` : "No unsaved changes"}
                  </span>
                </button>
                {diffOpen && changedFields.length > 0 && (
                  <div className="mt-2.5 flex flex-col gap-px border border-border rounded-lg overflow-hidden">
                    {changedFields.map((f) => (
                      <div key={f} className="flex items-center gap-2 px-2.5 py-1.5 bg-card-2 text-[12.5px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-draft" />
                        <span className="flex-1">{f}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">changed</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {def.locales.length > 0 && (
                <div className="p-4 py-3 border-b border-border">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-subtle-foreground mb-2">Locales</div>
                  <div className="flex flex-col gap-1.5">
                    {def.locales.map((l, i) => {
                      const active = effectiveLocale === l;
                      return (
                        <button
                          key={l}
                          type="button"
                          disabled={isNew}
                          onClick={() => setActiveLocale(l)}
                          className={cn(
                            "flex items-center gap-2 text-[13px] w-full text-left rounded-md px-1.5 py-1 -mx-1.5",
                            active ? "bg-accent" : "hover:bg-accent/60",
                            isNew && "opacity-60 cursor-default hover:bg-transparent",
                          )}
                        >
                          <span className="font-mono text-[11px] w-6 text-muted-foreground uppercase">{l}</span>
                          <span className="flex-1">{i === 0 ? "Default" : "Translation"}</span>
                          {active ? <StatusBadge status={publishStatus} /> : <Badge variant="neutral">—</Badge>}
                        </button>
                      );
                    })}
                  </div>
                  {isNew && <div className="mt-2 text-[11px] text-muted-foreground">Save this entry to edit other locales.</div>}
                </div>
              )}

              {scheduleOpen && (
                <div className="p-4 py-3 border-b border-border flex flex-col gap-2">
                  <label className="text-xs font-semibold">Schedule for</label>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="h-9 px-2.5 bg-card border border-input rounded-lg text-foreground text-[13px] outline-none"
                  />
                </div>
              )}

              <div className="p-4 py-3 flex flex-col gap-2">
                <Button
                  variant="default"
                  className="h-10"
                  disabled={mutation.isPending}
                  onClick={() =>
                    scheduleOpen && scheduleAt
                      ? void save({ published_at: new Date(scheduleAt).getTime() }).then(() => toast({ title: "Scheduled", kind: "published" }))
                      : void publish()
                  }
                >
                  <Send size={16} />
                  {scheduleOpen && scheduleAt ? "Schedule publish" : publishStatus === "published" ? "Republish" : "Publish"}
                </Button>
                <div className="flex gap-2">
                  <Button className="flex-1" size="sm" onClick={() => setScheduleOpen((o) => !o)}>
                    <Clock size={14} />
                    {scheduleOpen ? "Cancel" : "Schedule"}
                  </Button>
                  <Button className="flex-1" size="sm" onClick={() => toast({ title: "Preview", desc: "Opens the front-end preview", kind: "info" })}>
                    <Eye size={14} />
                    Preview
                  </Button>
                </div>
              </div>
            </Card>

            {/* AI assist — per-field actions (Improve/Summarize/SEO) render inline on
                the fields they affect (see `aiEnrich` in cms.config.ts) instead of
                here, so it's always clear which field a click will change. This
                panel only holds Translate, which acts on the whole document/locale. */}
            {aiEnabled && (
              <Card className="overflow-hidden">
                <div className="p-4 pb-2 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-brand-subtle-fg" />
                  <span className="text-[13px] font-semibold">AI assist</span>
                </div>
                <div className="px-3 pb-3 flex flex-col gap-1">
                  {canTranslate && def.locales.length > 1 && (
                    <AiAction label={`Translate to ${def.locales[1]}`} pending={translate.isPending} onClick={runTranslate} />
                  )}
                  {canImprove && def.fields.some((f) => f.aiEnrich) && (
                    <div className="px-2.5 py-2 text-[12px] text-muted-foreground">
                      More AI actions are available inline on the fields they affect.
                    </div>
                  )}
                  {!canImprove && !canTranslate && <div className="px-2.5 py-2 text-[12px] text-muted-foreground">No AI features enabled for this project.</div>}
                </div>
              </Card>
            )}

            {/* version history */}
            {versionsEnabled && <VersionHistory collection={collection} id={id!} />}

            {!isNew && !singleton && (
              <Button variant="destructive" className="w-full h-9" onClick={askDelete}>
                <Trash2 size={14} />
                Delete entry
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function AiAction({ label, pending, onClick }: { label: string; pending: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-[13px] text-left hover:bg-accent disabled:opacity-50"
    >
      <Sparkles size={14} className="text-muted-foreground" />
      {pending ? "Working…" : label}
    </button>
  );
}

const VERSION_DOT: Record<VersionStatus, string> = {
  published: "hsl(var(--published))",
  draft: "hsl(var(--draft))",
  scheduled: "hsl(var(--brand))",
  "mt-review": "hsl(var(--mt))",
  autosave: "hsl(var(--subtle-foreground))",
};

function VersionHistory({ collection, id }: { collection: string; id: string }) {
  const { data: versions, isLoading } = useVersions(collection, id);
  const restore = useRestoreVersion(collection, id);
  const confirm = useConfirm();
  const toast = useToast();

  return (
    <Card className="overflow-hidden">
      <div className="p-4 pb-2.5 text-[13px] font-semibold">Version history</div>
      <div className="px-4 pb-3">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !versions?.length ? (
          <div className="text-[12px] text-muted-foreground">No versions yet.</div>
        ) : (
          versions.map((v, i) => (
            <button
              key={v.id}
              onClick={() =>
                confirm({
                  title: "Restore this version?",
                  message: "The stored snapshot becomes the current draft. A new version is recorded, so nothing is lost.",
                  confirmLabel: "Restore",
                  onConfirm: () =>
                    void restore.mutateAsync(v.id).then(() => toast({ title: "Version restored", kind: "published" })),
                })
              }
              className="flex gap-2.5 py-1.5 w-full text-left hover:opacity-80"
            >
              <div className="flex flex-col items-center pt-1">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: VERSION_DOT[v.status] }} />
                {i < versions.length - 1 && <span className="w-px flex-1 bg-border mt-1" style={{ minHeight: 14 }} />}
              </div>
              <div className="flex-1 min-w-0 pb-1.5">
                <div className="text-[12.5px] font-medium capitalize">{v.status.replace("-", " ")}</div>
                <div className="text-[11.5px] text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </Card>
  );
}

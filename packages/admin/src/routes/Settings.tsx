import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  useApiKeys,
  useCreateApiKey,
  useCreateUser,
  useCreateWebhook,
  useCurrentUser,
  useDeleteApiKey,
  useDeleteUser,
  useDeleteWebhook,
  useRevokeApiKey,
  useSchema,
  useUpdateUser,
  useUsers,
  useWebhooks,
} from "../lib/hooks.js";
import { Badge, Button, Card, Input, cn } from "../components/ui.js";
import { Checkbox } from "../components/ui/checkbox.js";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../components/ui/form.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import { useToast } from "../components/toast.js";
import { useConfirm } from "../components/ConfirmDialog.js";
import { useCan } from "../lib/permissions.js";
import { buildApiKeyGrants } from "../lib/api-key-grants.js";
import type { PermissionAction, PermissionGrant, WebhookEvent } from "../lib/types.js";

type Tab = "users" | "keys" | "webhooks" | "ai";

export function Settings() {
  const { data: schema } = useSchema();
  const canManageUsers = useCan("manage", "users");
  const canManageKeys = useCan("manage", "api_keys");
  const canManageWebhooks = useCan("manage", "webhooks");
  const [tab, setTab] = useState<Tab>("ai");

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "users", label: "Users & roles", show: canManageUsers },
    { id: "keys", label: "API keys", show: canManageKeys },
    { id: "webhooks", label: "Webhooks", show: canManageWebhooks && (schema?.features?.webhooks ?? true) },
    { id: "ai", label: "AI features", show: true },
  ];

  // Default to the first tab the user can actually see.
  const visible = tabs.filter((t) => t.show);
  const activeTab = visible.some((t) => t.id === tab) ? tab : (visible[0]?.id ?? "ai");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="h-14 flex-shrink-0 flex items-center px-4 sm:px-5 border-b border-border">
        <h1 className="text-base font-semibold">Settings</h1>
      </header>
      <Tabs value={activeTab} onValueChange={(v) => setTab(v as Tab)} className="flex-1 min-h-0 flex flex-col">
        <div className="flex-shrink-0 px-4 sm:px-5 border-b border-border overflow-x-auto">
          <TabsList className="h-auto gap-1 rounded-none bg-transparent p-0 justify-start">
            {visible.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="-mb-px rounded-none border-b-2 border-transparent px-3 py-3 text-[13px] font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
          <div className="max-w-2xl mx-auto">
            <TabsContent value="users" className="mt-0">
              <UsersPanel />
            </TabsContent>
            <TabsContent value="keys" className="mt-0">
              <ApiKeysPanel collections={schema?.collections.map((c) => c.name) ?? []} />
            </TabsContent>
            <TabsContent value="webhooks" className="mt-0">
              <WebhooksPanel />
            </TabsContent>
            <TabsContent value="ai" className="mt-0">
              <AiPanel />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

function SectionHead({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}

const selectClass =
  "h-8 rounded-md border border-border bg-background px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand/40";

const inviteUserSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    name: z.string().optional(),
    role: z.string().min(1, "A role is required"),
    setPwMode: z.boolean(),
    password: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.setPwMode && (!d.password || d.password.length < 8)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must be at least 8 characters",
        path: ["password"],
      });
    }
  });
type InviteUserValues = z.infer<typeof inviteUserSchema>;

function UsersPanel() {
  const { data: me } = useCurrentUser();
  const { data } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const toast = useToast();
  const confirm = useConfirm();

  const roles = data?.roles ?? [];
  const fallbackRole = roles.find((r) => !r.admin)?.name || roles[0]?.name || "";
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const form = useForm<InviteUserValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { email: "", name: "", role: "", setPwMode: false, password: "" },
  });
  const setPwMode = form.watch("setPwMode");

  useEffect(() => {
    if (!form.getValues("role") && fallbackRole) {
      form.setValue("role", fallbackRole);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackRole]);

  const onSubmit = async (values: InviteUserValues) => {
    try {
      const res = await createUser.mutateAsync({
        email: values.email,
        role: values.role,
        ...(values.name?.trim() ? { name: values.name.trim() } : {}),
        ...(values.setPwMode && values.password ? { password: values.password } : {}),
      });
      form.resetField("email");
      form.resetField("name");
      form.resetField("password");
      setTemporaryPassword(res.temporaryPassword ?? null);
      if (res.inviteUrl && !res.emailed) {
        setInviteUrl(res.inviteUrl);
        toast({ title: "Invite created", desc: "Email isn't configured — copy the link and password to share.", kind: "info" });
      } else if (res.emailed) {
        toast({ title: "Invite email sent", kind: "published" });
      } else {
        toast({ title: "User created", kind: "published" });
      }
    } catch (e) {
      toast({ title: "Couldn't add user", desc: (e as Error).message, kind: "danger" });
    }
  };

  const changeRole = (id: string, nextRole: string) =>
    updateUser
      .mutateAsync({ id, role: nextRole })
      .then(() => toast({ title: "Role updated", kind: "info" }))
      .catch((e: Error) => toast({ title: "Couldn't update role", desc: e.message, kind: "danger" }));

  const changeName = (id: string, name: string) =>
    updateUser
      .mutateAsync({ id, name: name.trim() || null })
      .catch((e: Error) => toast({ title: "Couldn't update name", desc: e.message, kind: "danger" }));

  const toggleDisabled = (id: string, disabled: boolean) =>
    updateUser
      .mutateAsync({ id, disabled })
      .then(() => toast({ title: disabled ? "User disabled" : "User enabled", kind: "info" }))
      .catch((e: Error) => toast({ title: "Couldn't update user", desc: e.message, kind: "danger" }));

  return (
    <div>
      <SectionHead title="Users & roles" description="Who can access this project and what they can do." />
      <div className="space-y-2 mb-5">
        {data?.users.map((u) => {
          const isMe = u.id === me?.id;
          const disabled = u.disabledAt != null;
          return (
            <Card key={u.id} className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-mt-subtle text-mt-fg flex items-center justify-center font-semibold text-sm">
                {(u.name || u.email).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <input
                  key={u.id + (u.name ?? "")}
                  defaultValue={u.name ?? ""}
                  placeholder="Add a name…"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next !== (u.name ?? "")) void changeName(u.id, next);
                  }}
                  className="w-full text-sm font-medium bg-transparent outline-none placeholder:text-muted-foreground placeholder:font-normal rounded px-1 -mx-1 hover:bg-accent/60 focus:bg-accent/60"
                />
                <div className="text-xs text-muted-foreground truncate px-1">
                  {u.email} {isMe && <span>(you)</span>}
                </div>
                {disabled && <div className="text-[11px] text-danger-fg px-1">disabled</div>}
              </div>
              <Select value={u.role} disabled={updateUser.isPending} onValueChange={(v) => void changeRole(u.id, v)}>
                <SelectTrigger className={cn(selectClass, "w-auto")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Ensure the current role shows even if it's no longer declared. */}
                  {!roles.some((r) => r.name === u.role) && <SelectItem value={u.role}>{u.role}</SelectItem>}
                  {roles.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                title={disabled ? "Enable" : "Disable"}
                onClick={() => void toggleDisabled(u.id, !disabled)}
                className="text-muted-foreground hover:text-foreground rounded-md p-1.5"
              >
                {disabled ? <RotateCcw size={15} /> : <Ban size={15} />}
              </button>
              <button
                onClick={() =>
                  confirm({
                    title: `Delete "${u.email}"?`,
                    message: "This permanently removes the user and their access.",
                    confirmLabel: "Delete",
                    danger: true,
                    onConfirm: () =>
                      void deleteUser
                        .mutateAsync(u.id)
                        .then(() => toast({ title: "User deleted", kind: "danger" }))
                        .catch((e: Error) => toast({ title: "Couldn't delete user", desc: e.message, kind: "danger" })),
                  })
                }
                className="text-danger-fg hover:bg-danger-subtle rounded-md p-1.5"
              >
                <Trash2 size={15} />
              </button>
            </Card>
          );
        })}
      </div>
      {inviteUrl && (
        <Card className="p-3 mb-4 border-brand/40 bg-brand-subtle">
          <div className="text-[12px] font-semibold text-brand-subtle-fg mb-1">Invite link — share it with the new user</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[12px] truncate text-brand-subtle-fg">{inviteUrl}</code>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(inviteUrl);
                toast({ title: "Copied", kind: "info" });
              }}
              className="text-brand-subtle-fg hover:opacity-80"
            >
              <Copy size={15} />
            </button>
          </div>
        </Card>
      )}
      {temporaryPassword && (
        <Card className="p-3 mb-4 border-brand/40 bg-brand-subtle">
          <div className="text-[12px] font-semibold text-brand-subtle-fg mb-1">
            Temporary password — they can sign in with it right away
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[12px] truncate text-brand-subtle-fg">{temporaryPassword}</code>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(temporaryPassword);
                toast({ title: "Copied", kind: "info" });
              }}
              className="text-brand-subtle-fg hover:opacity-80"
            >
              <Copy size={15} />
            </button>
          </div>
        </Card>
      )}
      <Card className="p-4">
        <div className="text-[13px] font-semibold mb-3">Invite a user</div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-3 sm:grid-cols-2 mb-3">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormControl>
                      <Input placeholder="Email" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormControl>
                      <Input placeholder="Name (optional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={selectClass}>
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.name} value={r.name}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="setPwMode"
              render={({ field }) => (
                <FormItem className="flex items-center gap-1.5 space-y-0 mb-3">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(!!c)} />
                  </FormControl>
                  <FormLabel className="!mt-0 text-[13px] font-normal cursor-pointer">
                    Set a password instead of emailing an invite
                  </FormLabel>
                </FormItem>
              )}
            />
            {setPwMode && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="space-y-1 mb-3">
                    <FormControl>
                      <Input placeholder="Temporary password (8+ chars)" type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <Button type="submit" variant="default" disabled={createUser.isPending}>
              <Plus size={15} />
              {setPwMode ? "Add user" : "Send invite"}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}

const KEY_ACTIONS: PermissionAction[] = ["read", "create", "update", "delete", "publish"];
const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: "Never", days: null },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

function grantSummary(grants: PermissionGrant[]): string {
  if (grants.length === 0) return "no permissions";
  return grants
    .map((g) => {
      const subjects = g.subjects === "*" ? "all collections" : g.subjects.join(", ");
      const actions = g.actions === "*" ? "all" : g.actions.join("/");
      return `${actions} · ${subjects}`;
    })
    .join(" | ");
}

const apiKeyFormSchema = z.object({
  name: z.string().trim().min(1, "Key name is required"),
  actions: z
    .record(z.string(), z.boolean())
    .refine((a) => Object.values(a).some(Boolean), { message: "Select at least one permission" }),
  scopedCollections: z.array(z.string()),
  /** Grant the Media library subject (upload/list/manage assets via the API/MCP). */
  media: z.boolean(),
  expiryDays: z.number().nullable(),
});
type ApiKeyFormValues = z.infer<typeof apiKeyFormSchema>;

function ApiKeysPanel({ collections }: { collections: string[] }) {
  const { data: keys } = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const del = useDeleteApiKey();
  const toast = useToast();
  const confirm = useConfirm();
  const [revealed, setRevealed] = useState<string | null>(null);

  const form = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeyFormSchema),
    defaultValues: { name: "", actions: { read: true }, scopedCollections: [], media: false, expiryDays: null },
  });

  const onSubmit = async (values: ApiKeyFormValues) => {
    const selectedActions = KEY_ACTIONS.filter((a) => values.actions[a]);
    const grants = buildApiKeyGrants({
      collections: values.scopedCollections,
      media: values.media,
      actions: selectedActions,
    });
    const expiresAt = values.expiryDays ? Date.now() + values.expiryDays * 86_400_000 : null;
    const res = await create.mutateAsync({ name: values.name, grants, expiresAt });
    setRevealed(res.rawKey);
    form.resetField("name");
    toast({ title: "API key created", desc: "Copy it now — it won't be shown again.", kind: "published" });
  };

  return (
    <div>
      <SectionHead title="API keys" description="Scoped tokens for the content API, MCP, and R2. Rotate regularly." />
      {revealed && (
        <Card className="p-3 mb-4 border-brand/40 bg-brand-subtle">
          <div className="text-[12px] font-semibold text-brand-subtle-fg mb-1">New key — copy it now</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[12px] truncate text-brand-subtle-fg">{revealed}</code>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(revealed);
                toast({ title: "Copied", kind: "info" });
              }}
              className="text-brand-subtle-fg hover:opacity-80"
            >
              <Copy size={15} />
            </button>
          </div>
        </Card>
      )}
      <div className="space-y-2 mb-5">
        {keys?.map((k) => {
          const revoked = k.revokedAt != null;
          const expired = k.expiresAt != null && k.expiresAt < Date.now();
          return (
            <Card key={k.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {k.name}
                  {revoked ? (
                    <Badge variant="danger">revoked</Badge>
                  ) : expired ? (
                    <Badge variant="neutral">expired</Badge>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">
                  {k.keyPrefix}… · {grantSummary(k.grants)}
                  {k.expiresAt && !expired ? ` · expires ${new Date(k.expiresAt).toLocaleDateString()}` : ""}
                </div>
              </div>
              {!revoked && (
                <button
                  title="Revoke"
                  onClick={() =>
                    confirm({
                      title: `Revoke "${k.name}"?`,
                      message: "Any client using this key immediately loses access.",
                      confirmLabel: "Revoke",
                      danger: true,
                      onConfirm: () => void revoke.mutateAsync(k.id).then(() => toast({ title: "Key revoked", kind: "danger" })),
                    })
                  }
                  className="text-muted-foreground hover:text-foreground rounded-md p-1.5"
                >
                  <Ban size={15} />
                </button>
              )}
              <button
                title="Delete"
                onClick={() =>
                  confirm({
                    title: `Delete "${k.name}"?`,
                    message: "This permanently removes the key record.",
                    confirmLabel: "Delete",
                    danger: true,
                    onConfirm: () => void del.mutateAsync(k.id).then(() => toast({ title: "Key deleted", kind: "danger" })),
                  })
                }
                className="text-danger-fg hover:bg-danger-subtle rounded-md p-1.5"
              >
                <Trash2 size={15} />
              </button>
            </Card>
          );
        })}
      </div>
      <Card className="p-4">
        <div className="text-[13px] font-semibold mb-3">New key</div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-1 mb-3">
                  <FormControl>
                    <Input placeholder="Key name (e.g. Production site)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="actions"
              render={({ field }) => (
                <FormItem className="mb-3">
                  <div className="text-[12px] font-medium text-muted-foreground mb-1.5">Permissions</div>
                  <FormControl>
                    <div className="flex flex-wrap gap-3">
                      {KEY_ACTIONS.map((a) => (
                        <label key={a} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                          <Checkbox
                            checked={!!field.value[a]}
                            onCheckedChange={(checked) => field.onChange({ ...field.value, [a]: !!checked })}
                          />
                          {a}
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {collections.length > 0 && (
              <FormField
                control={form.control}
                name="scopedCollections"
                render={({ field }) => (
                  <FormItem className="mb-3">
                    <div className="text-[12px] font-medium text-muted-foreground mb-1.5">
                      Collections <span className="font-normal">(none selected = all)</span>
                    </div>
                    <FormControl>
                      <div className="flex flex-wrap gap-3">
                        {collections.map((col) => (
                          <label key={col} className="flex items-center gap-1.5 text-[13px] cursor-pointer font-mono">
                            <Checkbox
                              checked={field.value.includes(col)}
                              onCheckedChange={(checked) =>
                                field.onChange(checked ? [...field.value, col] : field.value.filter((c) => c !== col))
                              }
                            />
                            {col}
                          </label>
                        ))}
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="media"
              render={({ field }) => (
                <FormItem className="mb-3">
                  <div className="text-[12px] font-medium text-muted-foreground mb-1.5">Media library</div>
                  <FormControl>
                    <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(!!checked)} />
                      Allow uploading &amp; managing media files
                    </label>
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex items-center gap-3">
              <FormField
                control={form.control}
                name="expiryDays"
                render={({ field }) => (
                  <Select
                    value={field.value == null ? "never" : String(field.value)}
                    onValueChange={(v) => field.onChange(v === "never" ? null : Number(v))}
                  >
                    <SelectTrigger className={cn(selectClass, "w-32")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((o) => (
                        <SelectItem key={o.label} value={o.days == null ? "never" : String(o.days)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Button type="submit" variant="default" disabled={create.isPending}>
                <Plus size={15} />
                Generate key
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}

const EVENTS: WebhookEvent[] = ["document.published", "document.updated", "document.deleted"];

const webhookFormSchema = z.object({
  url: z.string().refine((v) => v.startsWith("https://"), { message: "URL must start with https://" }),
  events: z
    .record(z.string(), z.boolean())
    .refine((e) => Object.values(e).some(Boolean), { message: "Select at least one event" }),
});
type WebhookFormValues = z.infer<typeof webhookFormSchema>;

function WebhooksPanel() {
  const { data: webhooks } = useWebhooks();
  const create = useCreateWebhook();
  const del = useDeleteWebhook();
  const toast = useToast();
  const confirm = useConfirm();
  const [revealed, setRevealed] = useState<string | null>(null);

  const form = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookFormSchema),
    defaultValues: {
      url: "",
      events: { "document.published": true, "document.updated": false, "document.deleted": false },
    },
  });

  const onSubmit = async (values: WebhookFormValues) => {
    const selected = EVENTS.filter((e) => values.events[e]);
    const res = await create.mutateAsync({ url: values.url, events: selected });
    setRevealed(res.secret);
    form.resetField("url");
    toast({ title: "Webhook created", desc: "Copy the signing secret now.", kind: "published" });
  };

  return (
    <div>
      <SectionHead title="Webhooks" description="POST to your endpoints when content changes. Payloads are HMAC-signed." />
      {revealed && (
        <Card className="p-3 mb-4 border-brand/40 bg-brand-subtle">
          <div className="text-[12px] font-semibold text-brand-subtle-fg mb-1">Signing secret — copy it now</div>
          <code className="font-mono text-[12px] break-all text-brand-subtle-fg">{revealed}</code>
        </Card>
      )}
      <div className="space-y-2 mb-5">
        {webhooks?.map((w) => (
          <Card key={w.id} className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate font-mono">{w.url}</div>
              <div className="text-[11px] text-muted-foreground">{w.events.join(" · ")}</div>
            </div>
            {w.active ? <Badge variant="published">active</Badge> : <Badge variant="neutral">off</Badge>}
            <button
              onClick={() =>
                confirm({
                  title: "Delete this webhook?",
                  message: "You'll stop receiving events at this endpoint.",
                  confirmLabel: "Delete",
                  danger: true,
                  onConfirm: () => void del.mutateAsync(w.id).then(() => toast({ title: "Webhook deleted", kind: "danger" })),
                })
              }
              className="text-danger-fg hover:bg-danger-subtle rounded-md p-1.5"
            >
              <Trash2 size={15} />
            </button>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="text-[13px] font-semibold mb-3">New webhook</div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem className="space-y-1 mb-3">
                  <FormControl>
                    <Input placeholder="https://your-app.com/hooks/kalayaan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="events"
              render={({ field }) => (
                <FormItem className="mb-3">
                  <FormControl>
                    <div className="flex flex-wrap gap-3">
                      {EVENTS.map((e) => (
                        <label key={e} className="flex items-center gap-1.5 text-[13px] cursor-pointer font-mono">
                          <Checkbox
                            checked={!!field.value[e]}
                            onCheckedChange={(checked) => field.onChange({ ...field.value, [e]: !!checked })}
                          />
                          {e}
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" variant="default" disabled={create.isPending}>
              <Plus size={15} />
              Add webhook
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}

function AiPanel() {
  const { data: schema } = useSchema();
  const all = ["alt-text", "editorial-assist", "translate", "semantic-search"];
  const enabled = new Set(schema?.ai.features ?? []);
  return (
    <div>
      <SectionHead title="AI features" description="Configured in cms.config.ts. Toggle features there and redeploy." />
      {!schema?.ai.enabled && <Card className="p-4 text-[13px] text-muted-foreground mb-4">AI is disabled for this project.</Card>}
      <div className="space-y-2">
        {all.map((f) => (
          <Card key={f} className="p-3.5 flex items-center gap-3">
            <div className="flex-1 text-sm font-medium capitalize">{f.replace("-", " ")}</div>
            {schema?.ai.enabled && enabled.has(f) ? <Badge variant="published">on</Badge> : <Badge variant="neutral">off</Badge>}
          </Card>
        ))}
      </div>
    </div>
  );
}

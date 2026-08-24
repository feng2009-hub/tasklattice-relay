import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  platformSettingsSections,
  providerPresets,
  type PlatformOrganizationView,
  type PlatformSettingsSection,
  type PlatformSettingsView,
  type UpdatePlatformSettingsInput,
} from "@tali/contracts";
import {
  Boxes,
  Building2,
  CheckCircle2,
  Container,
  Layers3,
  Network,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  Waypoints,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { CreateProjectSheet } from "@/components/project/create-project-sheet";
import { ProviderIcon } from "@/components/providers/provider-icon";
import { PageHeader } from "@/components/layout/page-header";
import { AccountAvatar } from "@/components/account/account-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useProject } from "@/hooks/use-project";
import {
  getPlatformOrganization,
  getPlatformSettings,
  platformOrganizationQueryKey,
  platformSettingsQueryKey,
  updatePlatformSettings,
} from "@/services/platform-settings";

export const Route = createFileRoute("/platform/settings")({
  validateSearch: (search): { section?: PlatformSettingsSection } => ({
    ...(typeof search.section === "string"
      && platformSettingsSections.includes(search.section as PlatformSettingsSection)
      ? { section: search.section as PlatformSettingsSection }
      : {}),
  }),
  component: PlatformSettingsPage,
});

const sectionItems = [
  {
    id: "overview",
    label: "Overview",
    icon: Layers3,
  },
  {
    id: "runtime-images",
    label: "Runtime images",
    icon: Container,
  },
  {
    id: "model-providers",
    label: "Model Providers",
    icon: Network,
  },
  {
    id: "organization",
    label: "Organization",
    icon: Building2,
  },
] as const satisfies ReadonlyArray<{
  id: PlatformSettingsSection;
  label: string;
  icon: typeof Layers3;
}>;

function PlatformSettingsPage() {
  const { user } = useAuth();
  const { currentProject } = useProject();
  const { section = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: platformSettingsQueryKey,
    queryFn: getPlatformSettings,
    enabled: user?.systemRole === "platform_administrator",
  });
  const save = useMutation({
    mutationFn: updatePlatformSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(platformSettingsQueryKey, updated);
    },
  });

  if (user?.systemRole !== "platform_administrator") {
    return (
      <section className="mx-auto max-w-xl px-6 py-16 text-center" role="alert">
        <span className="mx-auto grid size-12 place-items-center rounded-full border bg-muted/35 text-muted-foreground">
          <ShieldAlert className="size-5" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-medium">Platform access required</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Platform Setting is available only to a Platform Administrator. Department
          and Project administrator roles do not inherit this platform scope.
        </p>
        {currentProject ? (
          <Button asChild variant="outline" className="mt-6">
            <Link to="/$projectId" params={{ projectId: currentProject.id }}>
              Return to Project
            </Link>
          </Button>
        ) : null}
      </section>
    );
  }

  if (settings.isPending) return <PlatformSettingsSkeleton />;
  if (settings.error || !settings.data) {
    return (
      <section className="mx-auto max-w-xl px-6 py-16 text-center" role="alert">
        <ShieldAlert className="mx-auto size-8 text-destructive" />
        <h1 className="mt-4 text-xl font-semibold">Platform settings unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {settings.error?.message ?? "The platform configuration could not be loaded."}
        </p>
        <Button className="mt-5" variant="outline" onClick={() => void settings.refetch()}>
          <RefreshCw />
          Try again
        </Button>
      </section>
    );
  }

  const update = (input: UpdatePlatformSettingsInput) => save.mutate(input);
  const changeSection = (next: PlatformSettingsSection) => {
    save.reset();
    void navigate({ replace: true, search: { section: next } });
  };

  return (
    <div
      className="flex min-h-[calc(100svh-4rem)] w-full bg-background"
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
    >
      <Sidebar collapsible="none" className="hidden min-h-[calc(100svh-4rem)] shrink-0 border-r border-sidebar-border md:flex">
        <SidebarHeader className="border-b border-sidebar-border px-5 py-5">
          <strong className="font-display text-xl font-medium">Platform</strong>
          <span className="text-xs text-muted-foreground">Platform Administrator</span>
        </SidebarHeader>
        <SidebarContent className="py-3">
          <nav aria-label="Platform settings sections">
            <SidebarGroup>
              <SidebarGroupLabel>Platform settings</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sectionItems.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        type="button"
                        size="lg"
                        className="h-11"
                        isActive={section === item.id}
                        aria-current={section === item.id ? "page" : undefined}
                        onClick={() => changeSection(item.id)}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="min-h-[calc(100svh-4rem)]">
        <div className="border-b border-sidebar-border p-4 md:hidden">
          <Select value={section} onValueChange={(value) => changeSection(value as PlatformSettingsSection)}>
            <SelectTrigger size="lg" className="w-full" aria-label="Platform settings section">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sectionItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <item.icon />
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mx-auto w-full max-w-[1600px] space-y-7 p-5 sm:p-6 lg:p-8">
          <PageHeader
            title="Platform Setting"
            badge={
              <Badge className="border-primary/20 bg-primary/7 text-primary" variant="outline">
                <ShieldCheck />
                Platform Administrator
              </Badge>
            }
            description="Manage platform-wide runtime defaults, Provider admission, and organizational structure. Quotas remain governed at the Department scope."
          />

          {save.isSuccess ? (
            <p className="flex items-center gap-2 border-l-2 border-emerald-500 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300" role="status">
              <CheckCircle2 className="size-4" />
              Platform settings saved as revision {save.data.revision}.
            </p>
          ) : null}
          {save.error ? (
            <p className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
              {save.error.message}
            </p>
          ) : null}

          <section className="min-w-0">
            {section === "overview" ? (
              <PlatformOverview settings={settings.data} onSectionChange={changeSection} />
            ) : null}
            {section === "runtime-images" ? (
              <RuntimeImagesSettings
                key={`runtime-${settings.data.revision}`}
                settings={settings.data}
                saving={save.isPending}
                onSave={update}
              />
            ) : null}
            {section === "model-providers" ? (
              <ModelProviderSettings
                key={`providers-${settings.data.revision}`}
                settings={settings.data}
                saving={save.isPending}
                onSave={update}
              />
            ) : null}
            {section === "organization" ? <OrganizationSettings /> : null}
          </section>
        </div>
      </SidebarInset>
    </div>
  );
}

function PlatformOverview({
  onSectionChange,
  settings,
}: {
  onSectionChange: (section: PlatformSettingsSection) => void;
  settings: PlatformSettingsView;
}) {
  const summary = [
    { label: "Departments", value: settings.summary.departments, icon: Building2 },
    { label: "Projects", value: settings.summary.projects, icon: Boxes },
    { label: "People", value: settings.summary.people, icon: Users },
    { label: "Instances", value: settings.summary.instances, icon: Waypoints },
    { label: "Provider connections", value: settings.summary.providerConnections, icon: Network },
  ];
  return (
    <div>
      <div className="grid border-b sm:grid-cols-2 2xl:grid-cols-5">
        {summary.map((item) => (
          <div key={item.label} className="flex min-h-24 items-center gap-3 border-b p-4 last:border-b-0 sm:nth-[2n]:border-l sm:nth-[n+4]:border-b-0 2xl:border-b-0 2xl:border-l 2xl:first:border-l-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground">
              <item.icon className="size-4" />
            </span>
            <span>
              <strong className="block font-mono text-xl tabular-nums">{item.value}</strong>
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 p-5 lg:p-6 2xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <Card className="shadow-none">
          <CardHeader className="border-b">
            <CardTitle>Administration hierarchy</CardTitle>
            <CardDescription>Each administrator role has its own explicit scope.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y px-0 pb-0">
            <AuthorityRow level="01" title="Platform Administrator" description="Controls platform defaults, Provider admission, and organization-wide inventory." active />
            <AuthorityRow level="02" title="Department Administrator" description="Controls one Department, its people, budget boundary, and Project portfolio." />
            <AuthorityRow level="03" title="Project Administrator" description="Controls one Project, its members, resources, and routing within Department limits." />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Configuration status</h2>
          <OverviewAction
            icon={Container}
            title="Runtime images"
            description={settings.runtimeStatus.available
              ? `${settings.runtimeStatus.mode ?? "Runtime"} is reachable`
              : "Runtime is currently unreachable"}
            action="Review images"
            onClick={() => onSectionChange("runtime-images")}
          />
          <OverviewAction
            icon={PackageCheck}
            title="Provider admission"
            description={`${settings.enabledProviderKinds.length} of ${providerPresets.length} Provider types enabled`}
            action="Review Providers"
            onClick={() => onSectionChange("model-providers")}
          />
          <OverviewAction
            icon={Building2}
            title="Organization"
            description={`${settings.summary.departments} Departments · ${settings.summary.projects} Projects · ${settings.summary.people} people`}
            action="Review organization"
            onClick={() => onSectionChange("organization")}
          />
        </div>
      </div>
    </div>
  );
}

function AuthorityRow({ active = false, description, level, title }: { active?: boolean; description: string; level: string; title: string }) {
  return (
    <div className="grid gap-3 px-4 py-4 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:items-start">
      <span className="font-mono text-xs text-muted-foreground">{level}</span>
      <span>
        <strong className="block text-sm">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      {active ? <Badge variant="secondary">Current scope</Badge> : null}
    </div>
  );
}

function OverviewAction({ action, description, icon: Icon, onClick, title }: { action: string; description: string; icon: typeof Container; onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-20 w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors hover:border-primary/25 hover:bg-primary/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted/55 text-muted-foreground group-hover:text-primary"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span></span>
      <span className="text-xs font-medium text-primary">{action}</span>
    </button>
  );
}

function RuntimeImagesSettings({ onSave, saving, settings }: SettingsEditorProps) {
  const [openclaw, setOpenclaw] = useState(settings.runtimeImages.openclaw ?? "");
  const [hermes, setHermes] = useState(settings.runtimeImages.hermes ?? "");
  const dirty = openclaw !== (settings.runtimeImages.openclaw ?? "")
    || hermes !== (settings.runtimeImages.hermes ?? "");
  return (
    <SettingsSection
      title="Runtime sandbox images"
      description="Set the default image used when a new OpenClaw or Hermes Instance is provisioned. Existing Sandboxes are not restarted or migrated."
      action={<SaveButton dirty={dirty} saving={saving} onClick={() => onSave(settingsInput(settings, { runtimeImages: { openclaw: openclaw.trim() || null, hermes: hermes.trim() || null } }))} />}
    >
      <div className="grid gap-5 2xl:grid-cols-2">
        <RuntimeImageCard label="OpenClaw Runtime" platform="openclaw" value={openclaw} effective={settings.effectiveRuntimeImages.openclaw} overridden={settings.runtimeImages.openclaw !== null} onChange={setOpenclaw} onReset={() => setOpenclaw("")} />
        <RuntimeImageCard label="Hermes Runtime" platform="hermes" value={hermes} effective={settings.effectiveRuntimeImages.hermes} overridden={settings.runtimeImages.hermes !== null} onChange={setHermes} onReset={() => setHermes("")} />
      </div>
      <p className="mt-5 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-amber-900 dark:text-amber-200">
        Use immutable tags or digests for release environments. Clearing an override returns that Runtime to the image supplied by the Runner deployment.
      </p>
    </SettingsSection>
  );
}

function RuntimeImageCard({ effective, label, onChange, onReset, overridden, platform, value }: { effective: string; label: string; onChange: (value: string) => void; onReset: () => void; overridden: boolean; platform: string; value: string }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <span><CardTitle>{label}</CardTitle><CardDescription className="mt-1 font-mono text-[11px]">{platform}</CardDescription></span>
          <Badge variant="outline" className={overridden ? "border-primary/25 text-primary" : ""}>{overridden ? "Platform override" : "Deployment default"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`runtime-${platform}`}>Container image reference</Label>
          <Input id={`runtime-${platform}`} className="h-11 font-mono text-xs" value={value} onChange={(event) => onChange(event.target.value)} placeholder={effective} />
        </div>
        <div className="flex items-start justify-between gap-3 border-t pt-3 text-xs">
          <span className="min-w-0"><span className="block text-muted-foreground">Effective image</span><code className="mt-1 block truncate" title={value || effective}>{value || effective}</code></span>
          <Button variant="ghost" size="sm" disabled={!value} onClick={onReset}><RotateCcw />Use deployment</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelProviderSettings({ onSave, saving, settings }: SettingsEditorProps) {
  const [enabled, setEnabled] = useState(() => new Set(settings.enabledProviderKinds));
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const visible = providerPresets.filter((provider) => `${provider.name} ${provider.category} ${provider.description}`.toLowerCase().includes(normalized));
  const nextKinds = providerPresets.map((provider) => provider.id).filter((id) => enabled.has(id));
  const dirty = JSON.stringify(nextKinds) !== JSON.stringify(settings.enabledProviderKinds);
  return (
    <SettingsSection
      title="Model Provider admission"
      description="Choose which Provider types Project Administrators may connect. Credentials and registered models remain isolated inside each Project."
      action={<SaveButton dirty={dirty} saving={saving} onClick={() => onSave(settingsInput(settings, { enabledProviderKinds: nextKinds }))} />}
    >
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input className="h-11 pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Provider catalog…" /></div>
        <span className="text-xs text-muted-foreground">{enabled.size} enabled · {providerPresets.length - enabled.size} blocked</span>
      </div>
      <div className="divide-y">
        {visible.map((provider) => {
          const checked = enabled.has(provider.id);
          return (
            <div key={provider.id} className="grid min-h-[76px] gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3"><ProviderIcon presetId={provider.id} className="size-10 shrink-0" /><span className="min-w-0"><strong className="block truncate text-sm">{provider.name}</strong><span className="mt-0.5 block truncate text-xs text-muted-foreground">{provider.description}</span></span></div>
              <Badge variant="outline" className="w-fit">{provider.category}</Badge>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 sm:justify-end"><span className="text-xs font-medium">{checked ? "Allowed" : "Blocked"}</span><Switch checked={checked} onCheckedChange={(next) => setEnabled((current) => { const copy = new Set(current); if (next) copy.add(provider.id); else copy.delete(provider.id); return copy; })} aria-label={`${checked ? "Disable" : "Enable"} ${provider.name}`} /></label>
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}

function OrganizationSettings() {
  const { user } = useAuth();
  const { refreshProjects } = useProject();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const organization = useQuery({ queryKey: platformOrganizationQueryKey, queryFn: getPlatformOrganization });
  const departments = organization.data?.departments ?? [];
  const departmentOptions = useMemo(() => departments.map(({ id, name }) => ({ id, name })), [departments]);
  return (
    <div>
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between lg:p-6">
        <div><h2 className="font-sans text-lg font-semibold">Organization structure</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Inspect Departments, Projects, and people without changing the distinct administrator roles assigned inside each scope.</p></div>
        <Button className="h-11" disabled={!departments.some((department) => department.status === "active")} onClick={() => setCreateOpen(true)}><Plus />Create Project</Button>
      </div>
      {organization.isPending ? <div className="grid min-h-64 place-items-center"><Spinner /></div> : organization.error ? <div className="m-5 border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive" role="alert">{organization.error.message}</div> : departments.length ? <div className="space-y-5 p-5 lg:p-6">{departments.map((department) => <DepartmentArchiveCard key={department.id} department={department} />)}</div> : <div className="grid min-h-64 place-items-center p-8 text-center"><div><Building2 className="mx-auto size-7 text-muted-foreground" /><h3 className="mt-3 text-sm font-semibold">No Departments</h3><p className="mt-1 text-xs text-muted-foreground">Create a Department before provisioning Projects.</p></div></div>}
      <CreateProjectSheet
        authority="platform"
        departmentOptions={departmentOptions}
        open={createOpen}
        onOpenChange={setCreateOpen}
        user={user}
        onCreated={async () => {
          await Promise.all([
            refreshProjects(),
            queryClient.invalidateQueries({ queryKey: platformOrganizationQueryKey }),
            queryClient.invalidateQueries({ queryKey: platformSettingsQueryKey }),
          ]);
        }}
      />
    </div>
  );
}

function DepartmentArchiveCard({ department }: { department: PlatformOrganizationView["departments"][number] }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b bg-muted/[0.12]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <span><span className="flex flex-wrap items-center gap-2"><CardTitle>{department.name}</CardTitle><Badge variant="outline" className={department.status === "active" ? "border-emerald-500/25 text-emerald-700 dark:text-emerald-300" : ""}>{department.status}</Badge></span><CardDescription className="mt-1">{department.description || "No Department description."}</CardDescription></span>
          <span className="flex gap-2"><Badge variant="secondary">{department.projects.length} Projects</Badge><Badge variant="secondary">{department.members.length} people</Badge></span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 2xl:grid-cols-2">
        <section><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Projects</h3><div className="mt-3 divide-y border-y">{department.projects.length ? department.projects.map((project) => <div key={project.id} className="flex min-h-14 items-center justify-between gap-3 py-2.5"><span className="min-w-0"><strong className="block truncate text-sm">{project.name}</strong><code className="text-[11px] text-muted-foreground">{project.id}</code></span><strong className="shrink-0 text-xs font-medium">{project.memberCount} members</strong></div>) : <p className="py-6 text-center text-xs text-muted-foreground">No Projects in this Department.</p>}</div></section>
        <section><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">People</h3><div className="mt-3 divide-y border-y">{department.members.length ? department.members.map((member) => <div key={member.id} className="flex min-h-14 items-center gap-3 py-2.5"><AccountAvatar identity={{ displayName: member.displayName, email: member.email }} className="size-8" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{member.displayName}</strong><span className="block truncate text-[11px] text-muted-foreground">{member.email}</span></span><Badge variant="outline">{member.role === "administrator" ? "Department Administrator" : "Member"}</Badge></div>) : <p className="py-6 text-center text-xs text-muted-foreground">No people assigned to this Department.</p>}</div></section>
      </CardContent>
    </Card>
  );
}

function SettingsSection({ action, children, description, title }: { action: ReactNode; children: ReactNode; description: string; title: string }) {
  return <div><div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-start sm:justify-between lg:p-6"><div><h2 className="font-sans text-lg font-semibold">{title}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p></div>{action}</div><div className="p-5 lg:p-6">{children}</div></div>;
}

function SaveButton({ dirty, onClick, saving }: { dirty: boolean; onClick: () => void; saving: boolean }) {
  return <Button className="h-11" disabled={!dirty || saving} onClick={onClick}>{saving ? <Spinner /> : <Save />}Save changes</Button>;
}

function PlatformSettingsSkeleton() {
  return (
    <div
      className="flex min-h-[calc(100svh-4rem)] w-full"
      style={{ "--sidebar-width": "15rem" } as CSSProperties}
      aria-label="Loading Platform Setting"
    >
      <div className="hidden w-(--sidebar-width) shrink-0 border-r p-5 md:block">
        <div className="h-6 w-24 animate-pulse rounded-sm bg-muted/65" />
        <div className="mt-2 h-4 w-32 animate-pulse rounded-sm bg-muted/50" />
        <div className="mt-10 space-y-2">
          {sectionItems.map((item) => (
            <div key={item.id} className="h-10 animate-pulse rounded-md bg-muted/45" />
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 p-5 sm:p-6 lg:p-8">
        <div className="h-24 animate-pulse rounded-md bg-muted/65" />
        <div className="mt-7 grid gap-5 border-t pt-6 2xl:grid-cols-2">
          <div className="h-80 animate-pulse rounded-md bg-muted/45" />
          <div className="h-80 animate-pulse rounded-md bg-muted/35" />
        </div>
      </div>
    </div>
  );
}

type SettingsEditorProps = {
  onSave: (input: UpdatePlatformSettingsInput) => void;
  saving: boolean;
  settings: PlatformSettingsView;
};

function settingsInput(
  settings: PlatformSettingsView,
  patch: Partial<UpdatePlatformSettingsInput>,
): UpdatePlatformSettingsInput {
  return {
    runtimeImages: patch.runtimeImages ?? settings.runtimeImages,
    enabledProviderKinds:
      patch.enabledProviderKinds ?? settings.enabledProviderKinds,
  };
}

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  departmentNameSchema,
  departmentSettingsSections,
  scopedEntityNameLimits,
  updateDepartmentSettingsSchema,
  type DepartmentRoutingMode,
  type DepartmentSettingsSection,
  type DepartmentSettingsView,
  type UpdateDepartmentSettingsInput,
} from "@tali/contracts";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Database,
  FolderKanban,
  Gauge,
  Network,
  Plus,
  Route as RouteIcon,
  Save,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { AccountAvatar } from "@/components/account/account-avatar";
import { useAuth } from "@/components/auth/auth-provider";
import { ContextSidebarLayout } from "@/components/layout/context-sidebar-layout";
import { PageHeader } from "@/components/layout/page-header";
import { CreateProjectSheet } from "@/components/project/create-project-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useProject } from "@/hooks/use-project";
import {
  departmentQueryKey,
  departmentSettingsQueryKey,
  getDepartment,
  getDepartments,
  getDepartmentSettings,
  updateDepartment,
  updateDepartmentSettings,
} from "@/services/department";
import type { DepartmentDetail, DepartmentSummary } from "@/types/department";

export const Route = createFileRoute("/departments/$departmentId")({
  validateSearch: (search): { section?: DepartmentSettingsSection } => ({
    ...(typeof search.section === "string"
      && departmentSettingsSections.includes(
        search.section as DepartmentSettingsSection,
      )
      ? { section: search.section as DepartmentSettingsSection }
      : {}),
  }),
  component: DepartmentSettingsPage,
});

type SectionItem = {
  id: DepartmentSettingsSection;
  label: string;
  icon: typeof Building2;
};

const sectionGroups = [
  {
    label: "Department",
    items: [{ id: "general", label: "General", icon: Building2 }],
  },
  {
    label: "Project defaults",
    items: [
      { id: "models", label: "Models", icon: Database },
      { id: "routing", label: "Routing", icon: RouteIcon },
    ],
  },
  {
    label: "Governance",
    items: [{ id: "quota", label: "Quota", icon: Gauge }],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  items: readonly SectionItem[];
}>;

function DepartmentSettingsPage() {
  const { departmentId } = Route.useParams();
  const { section = "general" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: getDepartments,
    staleTime: 30_000,
  });
  const department = useQuery({
    queryKey: departmentQueryKey(departmentId),
    queryFn: () => getDepartment(departmentId),
  });
  const settings = useQuery({
    queryKey: departmentSettingsQueryKey(departmentId),
    queryFn: () => getDepartmentSettings(departmentId),
  });

  const changeSection = (next: DepartmentSettingsSection) => {
    void navigate({ replace: true, search: { section: next } });
  };
  const changeDepartment = (nextDepartmentId: string) => {
    void navigate({
      to: "/departments/$departmentId",
      params: { departmentId: nextDepartmentId },
      search: { section },
    });
  };
  const renderLayout = (content: ReactNode) => (
    <ContextSidebarLayout
      sidebarWidth="15rem"
      sidebar={(
        <DepartmentContextSidebar
          departmentId={departmentId}
          departments={departments.data ?? []}
          section={section}
          onDepartmentChange={changeDepartment}
          onSectionChange={changeSection}
        />
      )}
      mobileNavigation={(
        <DepartmentMobileNavigation
          departmentId={departmentId}
          departments={departments.data ?? []}
          section={section}
          onDepartmentChange={changeDepartment}
          onSectionChange={changeSection}
        />
      )}
    >
      {content}
    </ContextSidebarLayout>
  );

  if (department.isPending || settings.isPending) {
    return renderLayout(<DepartmentSettingsSkeleton />);
  }
  if (department.error || settings.error || !department.data || !settings.data) {
    const error = department.error ?? settings.error;
    return renderLayout(
      <section className="mx-auto max-w-xl px-6 py-16 text-center" role="alert">
        <span className="mx-auto grid size-12 place-items-center rounded-full border bg-muted/35 text-muted-foreground">
          <ShieldAlert className="size-5" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-medium">
          Department access required
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {error?.message
            ?? "Department Setting is available only to an administrator of this Department."}
        </p>
      </section>,
    );
  }

  return renderLayout(
    <div className="mx-auto w-full max-w-[1600px] space-y-7 p-5 sm:p-6 lg:p-8">
      <PageHeader
        title="Department Setting"
        badge={(
          <Badge className="border-primary/20 bg-primary/7 text-primary" variant="outline">
            <ShieldCheck />
            Department Administrator
          </Badge>
        )}
        description={`Manage ${department.data.name} and define the defaults and resource boundaries inherited by new Projects.`}
      />

      <section className="min-w-0">
        {section === "general" ? (
          <GeneralSection department={department.data} />
        ) : null}
        {section === "models" ? (
          <ModelsSection departmentId={departmentId} settings={settings.data} />
        ) : null}
        {section === "routing" ? (
          <RoutingSection departmentId={departmentId} settings={settings.data} />
        ) : null}
        {section === "quota" ? (
          <QuotaSection departmentId={departmentId} settings={settings.data} />
        ) : null}
      </section>
    </div>,
  );
}

function DepartmentContextSidebar({
  departmentId,
  departments,
  onDepartmentChange,
  onSectionChange,
  section,
}: {
  departmentId: string;
  departments: DepartmentSummary[];
  onDepartmentChange: (departmentId: string) => void;
  onSectionChange: (section: DepartmentSettingsSection) => void;
  section: DepartmentSettingsSection;
}) {
  const current = departments.find((department) => department.id === departmentId);
  return (
    <>
      <SidebarHeader className="min-h-16 shrink-0 justify-center border-b border-sidebar-border px-4 py-2">
        {departments.length > 1 ? (
          <Select value={departmentId} onValueChange={onDepartmentChange}>
            <SelectTrigger className="h-11 w-full border-0 bg-transparent px-1 shadow-none" aria-label="Administered Department">
              <Building2 className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <strong className="truncate font-display text-xl font-medium">
            {current?.name ?? departmentId}
          </strong>
        )}
        <span className="text-xs text-muted-foreground">Department Administrator</span>
      </SidebarHeader>
      <SidebarContent className="py-3">
        <nav aria-label="Department settings sections">
          {sectionGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        type="button"
                        size="lg"
                        className="h-11"
                        isActive={section === item.id}
                        aria-current={section === item.id ? "page" : undefined}
                        onClick={() => onSectionChange(item.id)}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
    </>
  );
}

function DepartmentMobileNavigation({
  departmentId,
  departments,
  onDepartmentChange,
  onSectionChange,
  section,
}: {
  departmentId: string;
  departments: DepartmentSummary[];
  onDepartmentChange: (departmentId: string) => void;
  onSectionChange: (section: DepartmentSettingsSection) => void;
  section: DepartmentSettingsSection;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {departments.length > 1 ? (
        <Select value={departmentId} onValueChange={onDepartmentChange}>
          <SelectTrigger size="lg" className="w-full" aria-label="Administered Department">
            <Building2 />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Select value={section} onValueChange={(value) => onSectionChange(value as DepartmentSettingsSection)}>
        <SelectTrigger size="lg" className="w-full" aria-label="Department settings section">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sectionGroups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <item.icon />
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function GeneralSection({ department }: { department: DepartmentDetail }) {
  const { user } = useAuth();
  const { refreshProjects } = useProject();
  const queryClient = useQueryClient();
  const [name, setName] = useState(department.name);
  const [description, setDescription] = useState(department.description ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    setName(department.name);
    setDescription(department.description ?? "");
  }, [department.description, department.name]);
  const save = useMutation({
    mutationFn: () => updateDepartment(department.id, {
      name: name.trim(),
      description: description.trim() || null,
      hardBudgetUsd: department.hardBudgetUsd,
    }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(departmentQueryKey(department.id), updated);
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
      await refreshProjects();
    },
  });
  const validatedName = departmentNameSchema.safeParse(name);
  const dirty = name !== department.name || description !== (department.description ?? "");

  return (
    <SettingsSection
      title="Department profile"
      description="Maintain the organizational identity and review the Projects and people inside this boundary."
      action={(
        <Button className="h-11" disabled={!dirty || !validatedName.success || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Spinner /> : <Save />}
          Save profile
        </Button>
      )}
    >
      <SaveFeedback mutation={save} success="Department profile saved." />
      <div className="grid gap-6 border-y py-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="department-name">Department name</Label>
            <Input id="department-name" className="h-11 max-w-xl" value={name} maxLength={scopedEntityNameLimits.max} onChange={(event) => { setName(event.target.value); save.reset(); }} />
            <p className="text-xs leading-5 text-muted-foreground">
              {scopedEntityNameLimits.min}–{scopedEntityNameLimits.max} characters. Slashes, backslashes, and control characters are not allowed.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="department-description">Description</Label>
            <Textarea id="department-description" className="max-w-3xl" rows={4} maxLength={500} value={description} onChange={(event) => { setDescription(event.target.value); save.reset(); }} />
            <p className="text-xs text-muted-foreground">{description.length}/500 characters</p>
          </div>
        </div>
        <dl className="grid content-start divide-y border-y text-sm">
          <Fact label="Department ID" value={department.id} />
          <Fact label="Projects" value={String(department.projectCount)} />
          <Fact label="People" value={String(department.memberCount)} />
          <Fact label="Settings ownership" value="Department" />
        </dl>
      </div>

      <div className="mt-7 grid gap-7 xl:grid-cols-2">
        <section aria-labelledby="department-projects-title">
          <div className="flex min-h-11 items-center justify-between gap-4 border-b pb-3">
            <div>
              <h3 id="department-projects-title" className="text-sm font-semibold">Projects</h3>
              <p className="mt-1 text-xs text-muted-foreground">New Projects inherit the current Department defaults as a creation snapshot.</p>
            </div>
            <Button className="h-11" onClick={() => setCreateOpen(true)}><Plus />New Project</Button>
          </div>
          <div className="divide-y border-b">
            {department.projects.length ? department.projects.map((project) => (
              <Link key={project.id} to="/$projectId" params={{ projectId: project.id }} className="flex min-h-16 items-center gap-3 py-3 outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/35">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><FolderKanban className="size-4" /></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{project.name}</strong><span className="text-xs text-muted-foreground">{project.memberCount} members</span></span>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </Link>
            )) : <p className="py-8 text-center text-sm text-muted-foreground">No Projects in this Department.</p>}
          </div>
        </section>
        <section aria-labelledby="department-people-title">
          <div className="min-h-11 border-b pb-3">
            <h3 id="department-people-title" className="text-sm font-semibold">People</h3>
            <p className="mt-1 text-xs text-muted-foreground">Department membership is separate from Project business Roles.</p>
          </div>
          <div className="divide-y border-b">
            {department.members.map((member) => (
              <div key={member.id} className="flex min-h-16 items-center gap-3 py-3">
                <AccountAvatar identity={member} className="size-9" />
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{member.displayName}</strong><span className="block truncate text-xs text-muted-foreground">{member.email}</span></span>
                <Badge variant="outline">{member.role === "administrator" ? "Administrator" : "Member"}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>

      <CreateProjectSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        user={user}
        departmentOptions={[{ id: department.id, name: department.name }]}
        onCreated={async () => {
          await refreshProjects();
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: departmentQueryKey(department.id) }),
            queryClient.invalidateQueries({ queryKey: departmentSettingsQueryKey(department.id) }),
          ]);
        }}
      />
    </SettingsSection>
  );
}

function ModelsSection({ departmentId, settings }: SettingsSectionProps) {
  const [chatModel, setChatModel] = useState(settings.models.defaultChatModel ?? "");
  const [embeddingModel, setEmbeddingModel] = useState(settings.models.defaultEmbeddingModel ?? "");
  useEffect(() => {
    setChatModel(settings.models.defaultChatModel ?? "");
    setEmbeddingModel(settings.models.defaultEmbeddingModel ?? "");
  }, [settings.models.defaultChatModel, settings.models.defaultEmbeddingModel]);
  const save = useDepartmentSettingsMutation(departmentId);
  const input = settingsInput(settings, {
    models: {
      defaultChatModel: nullable(chatModel),
      defaultEmbeddingModel: nullable(embeddingModel),
    },
  });
  const valid = updateDepartmentSettingsSchema.safeParse(input).success;
  const dirty = chatModel !== (settings.models.defaultChatModel ?? "") || embeddingModel !== (settings.models.defaultEmbeddingModel ?? "");
  return (
    <SettingsSection
      title="Model defaults"
      description="Define the model references copied into a new Project. Each Project resolves these references against its own registered Provider models."
      action={<Button className="h-11" disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate(input)}>{save.isPending ? <Spinner /> : <Save />}Save defaults</Button>}
    >
      <SaveFeedback mutation={save} success={`Model defaults saved as revision ${save.data?.revision ?? settings.revision}.`} />
      <div className="divide-y border-y">
        <SettingRow title="Default chat model" description="Used as the primary text-generation reference for newly created Projects.">
          <Label htmlFor="default-chat-model">Provider/model reference</Label>
          <Input id="default-chat-model" className="mt-2 h-11 font-mono text-xs" value={chatModel} onChange={(event) => { setChatModel(event.target.value); save.reset(); }} placeholder="openai/gpt-5" />
        </SettingRow>
        <SettingRow title="Default embedding model" description="Used by inherited semantic search and Memory configuration.">
          <Label htmlFor="default-embedding-model">Provider/model reference</Label>
          <Input id="default-embedding-model" className="mt-2 h-11 font-mono text-xs" value={embeddingModel} onChange={(event) => { setEmbeddingModel(event.target.value); save.reset(); }} placeholder="openai/text-embedding-3-large" />
        </SettingRow>
      </div>
      <InheritanceNotice />
    </SettingsSection>
  );
}

function RoutingSection({ departmentId, settings }: SettingsSectionProps) {
  const [mode, setMode] = useState<DepartmentRoutingMode>(settings.routing.mode);
  const [fallbackModel, setFallbackModel] = useState(settings.routing.fallbackModel ?? "");
  useEffect(() => {
    setMode(settings.routing.mode);
    setFallbackModel(settings.routing.fallbackModel ?? "");
  }, [settings.routing.fallbackModel, settings.routing.mode]);
  const save = useDepartmentSettingsMutation(departmentId);
  const input = settingsInput(settings, {
    routing: { mode, fallbackModel: mode === "FAILOVER" ? nullable(fallbackModel) : null },
  });
  const parsed = updateDepartmentSettingsSchema.safeParse(input);
  const dirty = mode !== settings.routing.mode || (mode === "FAILOVER" ? fallbackModel : "") !== (settings.routing.fallbackModel ?? "");
  return (
    <SettingsSection
      title="Routing defaults"
      description="Choose how a new Project starts routing model traffic. Project Administrators can replace the inherited snapshot later."
      action={<Button className="h-11" disabled={!dirty || !parsed.success || save.isPending} onClick={() => save.mutate(input)}>{save.isPending ? <Spinner /> : <Save />}Save routing</Button>}
    >
      <SaveFeedback mutation={save} success={`Routing defaults saved as revision ${save.data?.revision ?? settings.revision}.`} />
      <div className="grid gap-6 border-y py-5 lg:grid-cols-[minmax(16rem,0.6fr)_minmax(24rem,1.4fr)]">
        <div>
          <h3 className="text-sm font-semibold">Inheritance mode</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">The inherited policy contains references only; credentials and Provider connections remain Project-owned.</p>
        </div>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="routing-mode">Routing behavior</Label>
            <Select value={mode} onValueChange={(value) => { setMode(value as DepartmentRoutingMode); save.reset(); }}>
              <SelectTrigger id="routing-mode" size="lg" className="w-full"><Network /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROJECT_MANAGED">Project managed</SelectItem>
                <SelectItem value="SINGLE">Single default model</SelectItem>
                <SelectItem value="FAILOVER">Default with failover</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{mode === "PROJECT_MANAGED" ? "The Project starts without an active inherited route." : mode === "SINGLE" ? "The Department chat model becomes the Project's initial route." : "Traffic starts on the Department chat model and fails over to a second reference."}</p>
          </div>
          {mode === "FAILOVER" ? (
            <div className="grid gap-2">
              <Label htmlFor="fallback-model">Fallback model reference</Label>
              <Input id="fallback-model" className="h-11 font-mono text-xs" value={fallbackModel} onChange={(event) => { setFallbackModel(event.target.value); save.reset(); }} placeholder="anthropic/claude-sonnet" />
            </div>
          ) : null}
          {!parsed.success ? <p className="border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200" role="alert">{parsed.error.issues[0]?.message}</p> : null}
        </div>
      </div>
      <InheritanceNotice />
    </SettingsSection>
  );
}

type QuotaForm = {
  softBudgetUsd: string;
  hardBudgetUsd: string;
  softMaxInstances: string;
  hardMaxInstances: string;
  softMaxMcpIntegrations: string;
  hardMaxMcpIntegrations: string;
  softMaxKnowledgeBaseIntegrations: string;
  hardMaxKnowledgeBaseIntegrations: string;
  defaultHardBudgetUsd: string;
  defaultBudgetDuration: "1d" | "7d" | "30d";
  defaultTpmLimit: string;
  defaultMaxInstances: string;
  defaultMaxMcpIntegrations: string;
  defaultMaxKnowledgeBaseIntegrations: string;
};

function QuotaSection({ departmentId, settings }: SettingsSectionProps) {
  const [form, setForm] = useState<QuotaForm>(() => quotaForm(settings));
  useEffect(() => setForm(quotaForm(settings)), [settings]);
  const save = useDepartmentSettingsMutation(departmentId);
  const input = settingsInput(settings, {
    quota: {
      softBudgetUsd: optionalNumber(form.softBudgetUsd),
      hardBudgetUsd: optionalNumber(form.hardBudgetUsd),
      softMaxInstances: optionalNumber(form.softMaxInstances),
      hardMaxInstances: optionalNumber(form.hardMaxInstances),
      softMaxMcpIntegrations: optionalNumber(form.softMaxMcpIntegrations),
      hardMaxMcpIntegrations: optionalNumber(form.hardMaxMcpIntegrations),
      softMaxKnowledgeBaseIntegrations: optionalNumber(form.softMaxKnowledgeBaseIntegrations),
      hardMaxKnowledgeBaseIntegrations: optionalNumber(form.hardMaxKnowledgeBaseIntegrations),
    },
    projectDefaults: {
      hardBudgetUsd: optionalNumber(form.defaultHardBudgetUsd),
      budgetDuration: form.defaultHardBudgetUsd ? form.defaultBudgetDuration : null,
      tpmLimit: optionalNumber(form.defaultTpmLimit),
      maxInstances: optionalNumber(form.defaultMaxInstances),
      maxMcpIntegrations: optionalNumber(form.defaultMaxMcpIntegrations),
      maxKnowledgeBaseIntegrations: optionalNumber(form.defaultMaxKnowledgeBaseIntegrations),
    },
  });
  const parsed = updateDepartmentSettingsSchema.safeParse(input);
  const dirty = JSON.stringify(form) !== JSON.stringify(quotaForm(settings));
  const set = (field: keyof QuotaForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    save.reset();
  };
  return (
    <SettingsSection
      title="Department quota"
      description="Soft quotas warn before saturation. Hard quotas block both Project allocations and new resources across every Project in this Department."
      action={<Button className="h-11" disabled={!dirty || !parsed.success || save.isPending} onClick={() => save.mutate(input)}>{save.isPending ? <Spinner /> : <Save />}Save quota</Button>}
    >
      <SaveFeedback mutation={save} success={`Department quota saved as revision ${save.data?.revision ?? settings.revision}.`} />
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-y bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span><strong className="text-foreground">Soft</strong> — warning threshold; work continues.</span>
        <span><strong className="text-foreground">Hard</strong> — admission boundary; new allocations and resources are rejected.</span>
        <span><strong className="text-foreground">Allocated</strong> — total limits reserved by child Projects.</span>
      </div>
      <div className="divide-y border-b">
        <QuotaRow title="Spend budget" description="Aggregate Project budget allocations." actual={settings.usage.allocatedBudgetUsd} allocated={settings.usage.allocatedBudgetUsd} soft={form.softBudgetUsd} hard={form.hardBudgetUsd} money onSoftChange={(value) => set("softBudgetUsd", value)} onHardChange={(value) => set("hardBudgetUsd", value)} />
        <QuotaRow title="Instances" description="All running Agent Instances in the Department." actual={settings.usage.actualInstances} allocated={settings.usage.allocatedInstances} soft={form.softMaxInstances} hard={form.hardMaxInstances} onSoftChange={(value) => set("softMaxInstances", value)} onHardChange={(value) => set("hardMaxInstances", value)} />
        <QuotaRow title="MCP integrations" description="Connected MCP servers across child Projects." actual={settings.usage.actualMcpIntegrations} allocated={settings.usage.allocatedMcpIntegrations} soft={form.softMaxMcpIntegrations} hard={form.hardMaxMcpIntegrations} onSoftChange={(value) => set("softMaxMcpIntegrations", value)} onHardChange={(value) => set("hardMaxMcpIntegrations", value)} />
        <QuotaRow title="Knowledge Base integrations" description="Knowledge sources across child Projects." actual={settings.usage.actualKnowledgeBaseIntegrations} allocated={settings.usage.allocatedKnowledgeBaseIntegrations} soft={form.softMaxKnowledgeBaseIntegrations} hard={form.hardMaxKnowledgeBaseIntegrations} onSoftChange={(value) => set("softMaxKnowledgeBaseIntegrations", value)} onHardChange={(value) => set("hardMaxKnowledgeBaseIntegrations", value)} />
      </div>

      <div className="mt-8">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">New Project allocation defaults</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Copied into the Project quota record at creation. Existing Projects keep their current allocations.</p>
        </div>
        <div className="grid gap-4 border-y py-5 sm:grid-cols-2 xl:grid-cols-4">
          <QuotaInput id="default-project-budget" label="Hard budget (USD)" value={form.defaultHardBudgetUsd} step="0.01" onChange={(value) => set("defaultHardBudgetUsd", value)} />
          <div className="grid gap-2"><Label htmlFor="default-budget-duration">Budget reset</Label><Select disabled={!form.defaultHardBudgetUsd} value={form.defaultBudgetDuration} onValueChange={(value) => set("defaultBudgetDuration", value)}><SelectTrigger id="default-budget-duration" className="h-11 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1d">Daily</SelectItem><SelectItem value="7d">Every 7 days</SelectItem><SelectItem value="30d">Every 30 days</SelectItem></SelectContent></Select></div>
          <QuotaInput id="default-project-tpm" label="Tokens per minute" value={form.defaultTpmLimit} onChange={(value) => set("defaultTpmLimit", value)} />
          <QuotaInput id="default-project-instances" label="Instances" value={form.defaultMaxInstances} onChange={(value) => set("defaultMaxInstances", value)} />
          <QuotaInput id="default-project-mcp" label="MCP integrations" value={form.defaultMaxMcpIntegrations} onChange={(value) => set("defaultMaxMcpIntegrations", value)} />
          <QuotaInput id="default-project-knowledge" label="Knowledge Base integrations" value={form.defaultMaxKnowledgeBaseIntegrations} onChange={(value) => set("defaultMaxKnowledgeBaseIntegrations", value)} />
        </div>
      </div>
      {!parsed.success ? <p className="mt-5 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-xs text-amber-900 dark:text-amber-200" role="alert">{parsed.error.issues[0]?.message}</p> : null}
    </SettingsSection>
  );
}

function QuotaRow({ actual, allocated, description, hard, money = false, onHardChange, onSoftChange, soft, title }: { actual: number; allocated: number; description: string; hard: string; money?: boolean; onHardChange: (value: string) => void; onSoftChange: (value: string) => void; soft: string; title: string }) {
  const softNumber = optionalNumber(soft);
  const exceeded = softNumber !== null && Math.max(actual, allocated) >= softNumber;
  return (
    <div className="grid gap-4 py-5 lg:grid-cols-[minmax(14rem,0.85fr)_minmax(12rem,0.55fr)_minmax(13rem,0.8fr)_minmax(13rem,0.8fr)] lg:items-end">
      <div><div className="flex items-center gap-2"><h4 className="text-sm font-semibold">{title}</h4>{exceeded ? <Badge variant="outline" className="border-amber-500/30 text-amber-800 dark:text-amber-200"><TriangleAlert />Soft quota reached</Badge> : null}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
      <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Actual</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{formatQuota(actual, money)}</dd></div><div><dt className="text-muted-foreground">Allocated</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{formatQuota(allocated, money)}</dd></div></dl>
      <QuotaInput id={`soft-${title.toLowerCase().replaceAll(" ", "-")}`} label="Soft quota" value={soft} {...(money ? { step: "0.01" } : {})} onChange={onSoftChange} />
      <QuotaInput id={`hard-${title.toLowerCase().replaceAll(" ", "-")}`} label="Hard quota" value={hard} {...(money ? { step: "0.01" } : {})} onChange={onHardChange} />
    </div>
  );
}

function QuotaInput({ id, label, onChange, step, value }: { id: string; label: string; onChange: (value: string) => void; step?: string; value: string }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><Input id={id} className="h-11 font-mono tabular-nums" type="number" min="0" step={step ?? "1"} value={value} placeholder="Unlimited" onChange={(event) => onChange(event.target.value)} /></div>;
}

function SettingsSection({ action, children, description, title }: { action?: ReactNode; children: ReactNode; description: string; title: string }) {
  return <section><div className="flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-start"><div><h2 className="font-sans text-lg font-semibold">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action}</div><div className="pt-5">{children}</div></section>;
}

function SettingRow({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return <div className="grid gap-4 py-5 lg:grid-cols-[minmax(14rem,0.65fr)_minmax(24rem,1.35fr)]"><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div><div>{children}</div></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="flex min-h-12 items-center justify-between gap-4 py-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-mono text-xs font-semibold text-right">{value}</dd></div>;
}

function InheritanceNotice() {
  return <p className="mt-5 border-l-2 border-primary/50 bg-primary/[0.04] px-4 py-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Creation snapshot.</strong> Changes apply to Projects created after this revision. Existing Projects are not silently rewritten.</p>;
}

function SaveFeedback({ mutation, success }: { mutation: { error: Error | null; isSuccess: boolean; reset: () => void }; success: string }) {
  if (mutation.error) return <p className="mb-5 border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{mutation.error.message}</p>;
  if (mutation.isSuccess) return <p className="mb-5 flex items-center gap-2 border-l-2 border-emerald-500 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300" role="status"><CheckCircle2 className="size-4" />{success}</p>;
  return null;
}

function useDepartmentSettingsMutation(departmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateDepartmentSettingsInput) => updateDepartmentSettings(departmentId, input),
    onSuccess: (updated) => queryClient.setQueryData(departmentSettingsQueryKey(departmentId), updated),
  });
}

function settingsInput(settings: DepartmentSettingsView, patch: Partial<Pick<UpdateDepartmentSettingsInput, "models" | "routing" | "quota" | "projectDefaults">>): UpdateDepartmentSettingsInput {
  return { models: patch.models ?? settings.models, routing: patch.routing ?? settings.routing, quota: patch.quota ?? settings.quota, projectDefaults: patch.projectDefaults ?? settings.projectDefaults };
}

function quotaForm(settings: DepartmentSettingsView): QuotaForm {
  return {
    softBudgetUsd: field(settings.quota.softBudgetUsd), hardBudgetUsd: field(settings.quota.hardBudgetUsd),
    softMaxInstances: field(settings.quota.softMaxInstances), hardMaxInstances: field(settings.quota.hardMaxInstances),
    softMaxMcpIntegrations: field(settings.quota.softMaxMcpIntegrations), hardMaxMcpIntegrations: field(settings.quota.hardMaxMcpIntegrations),
    softMaxKnowledgeBaseIntegrations: field(settings.quota.softMaxKnowledgeBaseIntegrations), hardMaxKnowledgeBaseIntegrations: field(settings.quota.hardMaxKnowledgeBaseIntegrations),
    defaultHardBudgetUsd: field(settings.projectDefaults.hardBudgetUsd), defaultBudgetDuration: settings.projectDefaults.budgetDuration ?? "30d",
    defaultTpmLimit: field(settings.projectDefaults.tpmLimit), defaultMaxInstances: field(settings.projectDefaults.maxInstances),
    defaultMaxMcpIntegrations: field(settings.projectDefaults.maxMcpIntegrations), defaultMaxKnowledgeBaseIntegrations: field(settings.projectDefaults.maxKnowledgeBaseIntegrations),
  };
}

function nullable(value: string): string | null { return value.trim() || null; }
function optionalNumber(value: string): number | null { return value.trim() ? Number(value) : null; }
function field(value: number | null): string { return value === null ? "" : String(value); }
function formatQuota(value: number, money: boolean): string { return money ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value) : new Intl.NumberFormat("en-US").format(value); }

function DepartmentSettingsSkeleton() {
  return <div className="mx-auto w-full max-w-[1600px] space-y-7 p-5 sm:p-6 lg:p-8" aria-label="Loading Department Setting"><div className="h-24 animate-pulse rounded-md bg-muted/60" /><div className="h-72 animate-pulse rounded-md bg-muted/40" /></div>;
}

type SettingsSectionProps = { departmentId: string; settings: DepartmentSettingsView };

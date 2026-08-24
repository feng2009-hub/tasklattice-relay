import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  Boxes,
  Building2,
  CheckCircle2,
  Database,
  FolderKanban,
  Gauge,
  Network,
  Plus,
  Route as RouteIcon,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { AccountAvatar } from "@/components/account/account-avatar";
import { useAuth } from "@/components/auth/auth-provider";
import { ContextSidebarLayout } from "@/components/layout/context-sidebar-layout";
import {
  ContextSettingsMobileNavigation,
  ContextSettingsSidebar,
  type ContextSettingsSectionGroup,
} from "@/components/layout/context-settings-navigation";
import { PageHeader } from "@/components/layout/page-header";
import { CreateProjectSheet } from "@/components/project/create-project-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { projectRoleLabels } from "@/types/project";

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

const sectionGroups = [
  {
    label: "Department",
    items: [
      { id: "general", label: "Overview", icon: Building2 },
      { id: "projects", label: "Projects", icon: FolderKanban },
      { id: "people", label: "People", icon: Users },
    ],
  },
  {
    label: "Inference",
    items: [
      { id: "models", label: "Models", icon: Database },
      { id: "routing", label: "Routing", icon: RouteIcon },
    ],
  },
  {
    label: "Resources",
    items: [{ id: "quota", label: "Quota", icon: Gauge }],
  },
] as const satisfies readonly ContextSettingsSectionGroup<DepartmentSettingsSection>[];

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
        <ContextSettingsSidebar
          ariaLabel="Department settings sections"
          groups={sectionGroups}
          header={(
            <DepartmentSettingsHeader
              departmentId={departmentId}
              departments={departments.data ?? []}
              onDepartmentChange={changeDepartment}
            />
          )}
          section={section}
          onSectionChange={changeSection}
        />
      )}
      mobileNavigation={(
        <ContextSettingsMobileNavigation
          ariaLabel="Department settings section"
          groups={sectionGroups}
          leading={departments.data && departments.data.length > 1 ? (
            <DepartmentSelect
              departmentId={departmentId}
              departments={departments.data}
              onDepartmentChange={changeDepartment}
            />
          ) : undefined}
          section={section}
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
        description={`Manage ${department.data.name}, its Projects and people, inference policy, and resource boundaries.`}
      />

      <section className="min-w-0">
        {section === "general" ? (
          <OverviewSection department={department.data} settings={settings.data} />
        ) : null}
        {section === "projects" ? (
          <ProjectsSection department={department.data} />
        ) : null}
        {section === "people" ? (
          <PeopleSection department={department.data} />
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

function DepartmentSettingsHeader({
  departmentId,
  departments,
  onDepartmentChange,
}: {
  departmentId: string;
  departments: DepartmentSummary[];
  onDepartmentChange: (departmentId: string) => void;
}) {
  const current = departments.find((department) => department.id === departmentId);
  return (
    <>
      {departments.length > 1 ? (
        <DepartmentSelect
          departmentId={departmentId}
          departments={departments}
          onDepartmentChange={onDepartmentChange}
          borderless
        />
      ) : (
        <strong className="truncate font-display text-xl font-medium">
          {current?.name ?? departmentId}
        </strong>
      )}
      <span className="text-xs text-muted-foreground">Department Administrator</span>
    </>
  );
}

function DepartmentSelect({
  borderless = false,
  departmentId,
  departments,
  onDepartmentChange,
}: {
  borderless?: boolean;
  departmentId: string;
  departments: DepartmentSummary[];
  onDepartmentChange: (departmentId: string) => void;
}) {
  return (
    <Select value={departmentId} onValueChange={onDepartmentChange}>
      <SelectTrigger
        size="lg"
        className={borderless ? "w-full border-0 bg-transparent px-1 shadow-none" : "w-full"}
        aria-label="Administered Department"
      >
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
  );
}

function OverviewSection({
  department,
  settings,
}: {
  department: DepartmentDetail;
  settings: DepartmentSettingsView;
}) {
  const { refreshProjects } = useProject();
  const queryClient = useQueryClient();
  const [name, setName] = useState(department.name);
  const [description, setDescription] = useState(department.description ?? "");
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
      title="Department overview"
      description="Review this organizational boundary at a glance, then maintain its name and purpose."
      action={(
        <Button className="h-11" disabled={!dirty || !validatedName.success || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Spinner /> : <Save />}
          Save profile
        </Button>
      )}
    >
      <SaveFeedback mutation={save} success="Department profile saved." />
      <dl className="grid border-y sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat label="Projects" value={department.projectCount} detail="Active in this Department" />
        <SummaryStat label="People" value={department.memberCount} detail="Department members" />
        <SummaryStat label="Instances" value={settings.usage.actualInstances} detail="Across all Projects" />
        <SummaryStat
          label="Resources"
          value={settings.usage.actualMcpIntegrations + settings.usage.actualKnowledgeBaseIntegrations}
          detail={`${settings.usage.actualMcpIntegrations} MCP · ${settings.usage.actualKnowledgeBaseIntegrations} Knowledge`}
        />
      </dl>
      <div className="mt-6 grid gap-6 border-y py-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
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
          <Fact label="Created" value={new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(department.createdAt))} />
          <Fact label="Settings ownership" value="Department" />
        </dl>
      </div>
    </SettingsSection>
  );
}

function ProjectsSection({ department }: { department: DepartmentDetail }) {
  const { user } = useAuth();
  const { refreshProjects } = useProject();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const projects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return department.projects.filter((project) =>
      !query || `${project.name} ${project.id}`.toLowerCase().includes(query),
    );
  }, [department.projects, search]);
  const totals = department.projects.reduce(
    (result, project) => ({
      people: result.people + project.memberCount,
      instances: result.instances + project.instanceCount,
      models: result.models + project.modelCount,
      resources: result.resources + project.mcpIntegrationCount + project.knowledgeBaseCount,
    }),
    { people: 0, instances: 0, models: 0, resources: 0 },
  );

  return (
    <SettingsSection
      title="Projects"
      description="Query every Project in this Department and compare its people, Instances, inference assets, and connected resources."
      action={<Button className="h-11" onClick={() => setCreateOpen(true)}><Plus />New Project</Button>}
    >
      <dl className="grid border-y sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat label="Projects" value={department.projects.length} detail="Active Projects" />
        <SummaryStat label="Project memberships" value={totals.people} detail="Memberships, not unique people" />
        <SummaryStat label="Instances" value={totals.instances} detail="Running across Projects" />
        <SummaryStat label="Connected resources" value={totals.resources} detail={`${totals.models} registered models`} />
      </dl>
      <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Label htmlFor="department-project-search" className="sr-only">Search Projects</Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="department-project-search" className="h-11 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Project name or ID…" />
        </div>
        <span className="text-xs text-muted-foreground">Showing {projects.length} of {department.projects.length}</span>
      </div>
      {projects.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1080px] text-left">
              <thead className="border-b bg-muted/20 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 text-right font-medium">People</th>
                  <th className="px-4 py-2.5 text-right font-medium">Instances</th>
                  <th className="px-4 py-2.5 font-medium">Inference</th>
                  <th className="px-4 py-2.5 font-medium">Resources</th>
                  <th className="px-4 py-2.5 text-right font-medium">Hard budget</th>
                  <th className="px-4 py-2.5 font-medium">Inherited defaults</th>
                  <th className="w-14"><span className="sr-only">Open Project</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-muted/[0.12]">
                    <td className="px-5 py-3"><strong className="block text-sm">{project.name}</strong><code className="mt-0.5 block text-[11px] text-muted-foreground">{project.id}</code></td>
                    <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">{project.memberCount}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">{project.instanceCount}</td>
                    <td className="px-4 py-3 text-xs"><strong className="font-mono">{project.modelCount}</strong> models <span className="text-muted-foreground">·</span> <strong className="font-mono">{project.routingCount}</strong> Routing</td>
                    <td className="px-4 py-3 text-xs"><strong className="font-mono">{project.mcpIntegrationCount}</strong> MCP <span className="text-muted-foreground">·</span> <strong className="font-mono">{project.knowledgeBaseCount}</strong> Knowledge</td>
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">{project.hardBudgetUsd === null ? "Unlimited" : formatQuota(project.hardBudgetUsd, true)}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="font-mono">{project.inheritedSettingsRevision === null ? "None" : `Revision ${project.inheritedSettingsRevision}`}</Badge></td>
                    <td className="px-2 py-3"><Button asChild size="icon" variant="ghost"><Link to="/$projectId" params={{ projectId: project.id }} aria-label={`Open ${project.name}`}><ArrowUpRight /></Link></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">
            {projects.map((project) => (
              <article key={project.id} className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm">{project.name}</strong><code className="text-[11px] text-muted-foreground">{project.id}</code></div><Button asChild size="icon" variant="ghost"><Link to="/$projectId" params={{ projectId: project.id }} aria-label={`Open ${project.name}`}><ArrowUpRight /></Link></Button></div>
                <dl className="grid grid-cols-2 gap-3 text-xs"><CompactFact label="People" value={project.memberCount} /><CompactFact label="Instances" value={project.instanceCount} /><CompactFact label="Models / Routing" value={`${project.modelCount} / ${project.routingCount}`} /><CompactFact label="MCP / Knowledge" value={`${project.mcpIntegrationCount} / ${project.knowledgeBaseCount}`} /></dl>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="grid min-h-48 place-items-center border-b p-8 text-center"><div><FolderKanban className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{department.projects.length ? "No Projects match this search" : "No Projects in this Department"}</p><p className="mt-1 text-xs text-muted-foreground">{department.projects.length ? "Try a different Project name or ID." : "Create the first Project to start allocating resources."}</p></div></div>
      )}

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

function PeopleSection({ department }: { department: DepartmentDetail }) {
  const [search, setSearch] = useState("");
  const [departmentRole, setDepartmentRole] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const members = useMemo(() => {
    const query = search.trim().toLowerCase();
    return department.members.filter((member) => {
      const matchesQuery = !query || [
        member.displayName,
        member.email,
        ...member.projects.flatMap((project) => [
          project.name,
          ...project.roles.map((role) => projectRoleLabels[role]),
        ]),
      ].join(" ").toLowerCase().includes(query);
      return matchesQuery
        && (departmentRole === "all" || member.role === departmentRole)
        && (projectId === "all" || member.projects.some((project) => project.id === projectId));
    });
  }, [department.members, departmentRole, projectId, search]);
  const projectMemberships = department.members.reduce((total, member) => total + member.projects.length, 0);
  const filtersActive = Boolean(search || departmentRole !== "all" || projectId !== "all");

  return (
    <SettingsSection
      title="People"
      description="See every Department member and the exact Roles they hold in each Project. Department access and Project permissions remain separate scopes."
    >
      <dl className="grid border-y sm:grid-cols-3">
        <SummaryStat label="People" value={department.members.length} detail="Unique Department members" />
        <SummaryStat label="Administrators" value={department.members.filter((member) => member.role === "administrator").length} detail="Department scope" />
        <SummaryStat label="Project memberships" value={projectMemberships} detail="Across all Projects" />
      </dl>
      <div className="grid gap-3 border-b px-4 py-4 md:grid-cols-2 xl:grid-cols-[minmax(18rem,1fr)_15rem_15rem_auto]">
        <div className="relative min-w-0">
          <Label htmlFor="department-people-search" className="sr-only">Search people</Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="department-people-search" className="h-11 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search person, Project, or Role…" />
        </div>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="h-11 w-full" aria-label="Filter by Project"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Projects</SelectItem>{department.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={departmentRole} onValueChange={setDepartmentRole}>
          <SelectTrigger className="h-11 w-full" aria-label="Filter by Department role"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Department roles</SelectItem><SelectItem value="administrator">Administrator</SelectItem><SelectItem value="member">Member</SelectItem></SelectContent>
        </Select>
        <Button type="button" variant="outline" className="h-11" disabled={!filtersActive} onClick={() => { setSearch(""); setDepartmentRole("all"); setProjectId("all"); }}>Clear filters</Button>
      </div>
      {members.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b bg-muted/20 text-xs text-muted-foreground"><tr><th className="px-5 py-2.5 font-medium">Person</th><th className="px-4 py-2.5 font-medium">Department role</th><th className="px-4 py-2.5 font-medium">Project access and Roles</th></tr></thead>
              <tbody className="divide-y">
                {members.map((member) => (
                  <tr key={member.id} className="align-top hover:bg-muted/[0.12]">
                    <td className="px-5 py-4"><div className="flex min-w-0 items-center gap-3"><AccountAvatar identity={member} className="size-9" /><span className="min-w-0"><strong className="block truncate text-sm">{member.displayName}</strong><span className="block truncate text-xs text-muted-foreground">{member.email}</span></span></div></td>
                    <td className="px-4 py-4"><Badge variant="outline">{member.role === "administrator" ? "Administrator" : "Member"}</Badge></td>
                    <td className="px-4 py-3"><ProjectAccessList projects={member.projects} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y md:hidden">{members.map((member) => <article key={member.id} className="space-y-4 p-4"><div className="flex items-center gap-3"><AccountAvatar identity={member} className="size-9" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{member.displayName}</strong><span className="block truncate text-xs text-muted-foreground">{member.email}</span></span><Badge variant="outline">{member.role === "administrator" ? "Administrator" : "Member"}</Badge></div><ProjectAccessList projects={member.projects} /></article>)}</div>
        </>
      ) : (
        <div className="grid min-h-48 place-items-center border-b p-8 text-center"><div><Users className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No people match these filters</p><p className="mt-1 text-xs text-muted-foreground">Try another person, Project, or Role.</p></div></div>
      )}
      <div className="border-t px-5 py-2.5 text-xs text-muted-foreground">Showing {members.length} of {department.members.length} people</div>
    </SettingsSection>
  );
}

function ProjectAccessList({ projects }: { projects: DepartmentDetail["members"][number]["projects"] }) {
  if (!projects.length) return <span className="text-xs text-muted-foreground">No Project access</span>;
  return <div className="grid gap-2">{projects.map((project) => <div key={project.id} className="flex flex-wrap items-center gap-2"><Link to="/$projectId/setting" params={{ projectId: project.id }} search={{ section: "members" }} className="min-w-32 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35">{project.name}</Link><span className="flex flex-wrap gap-1">{project.roles.map((role) => <Badge key={role} variant="secondary">{projectRoleLabels[role]}</Badge>)}</span></div>)}</div>;
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
  const configuredModels = [chatModel, embeddingModel].filter((model) => model.trim()).length;
  return (
    <SettingsSection
      title="Available models"
      description="Define the model references made available to newly created Projects. Provider connections and credentials always remain Project-owned."
      action={<Button className="h-11" disabled={!dirty || !valid || save.isPending} onClick={() => save.mutate(input)}>{save.isPending ? <Spinner /> : <Save />}Save models</Button>}
    >
      <SaveFeedback mutation={save} success={`Model defaults saved as revision ${save.data?.revision ?? settings.revision}.`} />
      <div className="mb-5 grid gap-3 border-y bg-muted/[0.12] px-4 py-4 sm:grid-cols-3">
        <PolicyFact icon={<Database />} label="Department availability" value={configuredModels ? `${configuredModels} model reference${configuredModels === 1 ? "" : "s"}` : "No inherited models"} />
        <PolicyFact icon={<ArrowUpRight />} label="New Projects" value={configuredModels ? "Copy current revision" : "Start Project-managed"} />
        <PolicyFact icon={<Boxes />} label="Existing Projects" value="Keep their current snapshot" />
      </div>
      <div className="divide-y border-y">
        <SettingRow title="Chat model" description="Primary text-generation reference available to a new Project. Leave blank to inherit no chat model.">
          <Label htmlFor="default-chat-model">Provider/model reference</Label>
          <Input id="default-chat-model" className="mt-2 h-11 font-mono text-xs" value={chatModel} onChange={(event) => { setChatModel(event.target.value); save.reset(); }} placeholder="openai/gpt-5" />
        </SettingRow>
        <SettingRow title="Embedding model" description="Semantic search and Memory reference available to a new Project. Leave blank to inherit none.">
          <Label htmlFor="default-embedding-model">Provider/model reference</Label>
          <Input id="default-embedding-model" className="mt-2 h-11 font-mono text-xs" value={embeddingModel} onChange={(event) => { setEmbeddingModel(event.target.value); save.reset(); }} placeholder="openai/text-embedding-3-large" />
        </SettingRow>
      </div>
      <InheritanceNotice enabled={configuredModels > 0} />
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
      title="Routing availability"
      description="Choose whether a new Project receives no Department Routing, a single-model route, or a failover route."
      action={<Button className="h-11" disabled={!dirty || !parsed.success || save.isPending} onClick={() => save.mutate(input)}>{save.isPending ? <Spinner /> : <Save />}Save routing</Button>}
    >
      <SaveFeedback mutation={save} success={`Routing defaults saved as revision ${save.data?.revision ?? settings.revision}.`} />
      <div className="mb-5 grid gap-3 border-y bg-muted/[0.12] px-4 py-4 sm:grid-cols-3">
        <PolicyFact icon={<RouteIcon />} label="Department policy" value={mode === "PROJECT_MANAGED" ? "No inherited Routing" : mode === "SINGLE" ? "Single-model snapshot" : "Failover snapshot"} />
        <PolicyFact icon={<ArrowUpRight />} label="New Projects" value={mode === "PROJECT_MANAGED" ? "Start Project-managed" : "Copy current revision"} />
        <PolicyFact icon={<Boxes />} label="Existing Projects" value="Keep their current Routing" />
      </div>
      <div className="grid gap-6 border-y py-5 lg:grid-cols-[minmax(16rem,0.6fr)_minmax(24rem,1.4fr)]">
        <div>
          <h3 className="text-sm font-semibold">Inheritance mode</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Routing is copied as an explicit creation snapshot. Credentials and Provider connections remain Project-owned.</p>
        </div>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="routing-mode">Routing behavior</Label>
            <Select value={mode} onValueChange={(value) => { setMode(value as DepartmentRoutingMode); save.reset(); }}>
              <SelectTrigger id="routing-mode" size="lg" className="w-full"><Network /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PROJECT_MANAGED">Do not inherit · Project managed</SelectItem>
                <SelectItem value="SINGLE">Inherit · Single model</SelectItem>
                <SelectItem value="FAILOVER">Inherit · Primary with failover</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{mode === "PROJECT_MANAGED" ? "The Project starts without Department Routing and configures its own policy." : mode === "SINGLE" ? "The Department chat model becomes the Project's initial route." : "Traffic starts on the Department chat model and fails over to the second reference."}</p>
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
      <InheritanceNotice enabled={mode !== "PROJECT_MANAGED"} />
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

function SummaryStat({ detail, label, value }: { detail: string; label: string; value: number }) {
  return <div className="min-w-0 border-b p-4 last:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">{new Intl.NumberFormat("en-US").format(value)}</dd><span className="mt-1 block truncate text-[11px] text-muted-foreground" title={detail}>{detail}</span></div>;
}

function CompactFact({ label, value }: { label: string; value: number | string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{value}</dd></div>;
}

function PolicyFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground [&>svg]:size-4">{icon}</span><span className="min-w-0"><span className="block text-[11px] text-muted-foreground">{label}</span><strong className="mt-0.5 block text-xs leading-5">{value}</strong></span></div>;
}

function InheritanceNotice({ enabled }: { enabled: boolean }) {
  return <p className="mt-5 border-l-2 border-primary/50 bg-primary/[0.04] px-4 py-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Deterministic inheritance.</strong> {enabled ? "A new Project receives the saved Department revision once, at creation. Existing Projects are never rewritten, and Project Administrators may replace the snapshot." : "No Department inference configuration is copied. The new Project starts Project-managed and existing Projects remain unchanged."}</p>;
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

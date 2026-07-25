import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Gauge, ShieldCheck, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectModelProfilesSettings } from "@/components/project/project-model-profiles-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectAvatar } from "@/components/project/project-item";
import { ProjectMembers } from "@/components/project/project-members";
import { ProjectQuotaSettings } from "@/components/project/project-quota-settings";
import { useProject } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { deleteProject, renameProject } from "@/services/project";
import type { Project } from "@/types/project";

export const Route = createFileRoute("/$projectId/setting/")({
  validateSearch: (search): { section?: ProjectSettingsSection } => {
    const section =
      search.section === "members" ||
      search.section === "model-profiles" ||
      search.section === "quota" ||
      search.section === "settings"
        ? search.section
        : undefined;
    return section ? { section } : {};
  },
  component: ProjectSettingsPage,
});

type ProjectSettingsSection = "settings" | "members" | "model-profiles" | "quota";

function ProjectSettingsPage() {
  const navigate = Route.useNavigate();
  const { section = "settings" } = Route.useSearch();
  const {
    currentProject: project,
    refreshProjects,
    selectProject,
  } = useProject();
  const permissions = useProjectPermissions(project?.role);

  if (!project) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
        Loading Project settings…
      </div>
    );
  }

  if (!permissions.canManageProject) {
    return (
      <section
        className="mx-auto max-w-xl rounded-lg border bg-background p-6"
        aria-labelledby="project-settings-restricted"
      >
        <ShieldCheck className="size-8 text-muted-foreground" />
        <h1
          id="project-settings-restricted"
          className="mt-4 font-heading text-2xl"
        >
          Project settings are restricted
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Only Project administrators can manage Project identity, members,
          Model Profiles, and quota. Your personal details remain available
          from Personal profile in the account menu.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project settings"
        description="Manage this Project’s identity, members, and default Model Profile."
      />

      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="flex min-h-[72px] items-center gap-3 border-b px-4">
          <ProjectAvatar className="size-10" project={project} />
          <div className="min-w-0">
            <h2 className="truncate font-heading text-lg">{project.name}</h2>
            <p className="text-xs capitalize text-muted-foreground">
              {project.type === "personal" ? "Default project" : "Team project"} ·{" "}
              {project.role}
            </p>
          </div>
        </div>

        <Tabs
          value={section}
          onValueChange={(value) => {
            void navigate({
              replace: true,
              search: { section: value as ProjectSettingsSection },
            });
          }}
        >
          <TabsList
            variant="line"
            className="w-full justify-start overflow-x-auto px-2"
          >
            <TabsTrigger value="settings">
              <ShieldCheck />
              General
            </TabsTrigger>
            <TabsTrigger value="members">
              <Users />
              Members
            </TabsTrigger>
            <TabsTrigger value="model-profiles">
              <SlidersHorizontal />
              Model Profiles
            </TabsTrigger>
            <TabsTrigger value="quota">
              <Gauge />
              Quota
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-0">
            <ProjectGeneralSettings
              project={project}
              onChanged={refreshProjects}
              onDeleted={async () => {
                const remaining = await refreshProjects();
                const fallback = remaining.find(
                  (candidate) => candidate.id !== project.id,
                );
                if (fallback) await selectProject(fallback.id);
              }}
            />
          </TabsContent>
          <TabsContent value="members" className="mt-0">
            <ProjectMembers project={project} />
          </TabsContent>
          <TabsContent value="model-profiles" className="mt-0">
            <ProjectModelProfilesSettings
              project={project}
            />
          </TabsContent>
          <TabsContent value="quota" className="mt-0">
            <ProjectQuotaSettings project={project} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function ProjectGeneralSettings({
  onChanged,
  onDeleted,
  project,
}: {
  onChanged: () => Promise<Project[]>;
  onDeleted: () => void | Promise<void>;
  project: Project;
}) {
  const permissions = useProjectPermissions(project.role);
  const canRename =
    permissions.canManageProject && project.type !== "personal";
  const [name, setName] = useState(project.name);
  useEffect(() => setName(project.name), [project.id, project.name]);
  const rename = useMutation({
    mutationFn: () => renameProject(project.id, name.trim()),
    onSuccess: () => onChanged(),
  });
  const remove = useMutation({
    mutationFn: () => deleteProject(project.id),
    onSuccess: () => onDeleted(),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canRename && name.trim() && name.trim() !== project.name) {
      rename.mutate();
    }
  };

  return (
    <div className="divide-y">
      <form
        className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        onSubmit={submit}
      >
        <div className="space-y-2">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            className="h-11 max-w-lg"
            value={name}
            disabled={!canRename}
            onChange={(event) => setName(event.target.value)}
          />
          {project.type === "personal" ? (
            <p className="text-xs text-muted-foreground">
              Your personal Project name always matches your username.
            </p>
          ) : !permissions.canManageProject ? (
            <p className="text-xs text-muted-foreground">
              Members have view-only access to Project settings.
            </p>
          ) : null}
          {rename.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {rename.error.message}
            </p>
          ) : null}
        </div>
        {canRename ? (
          <Button
            className="h-11"
            type="submit"
            variant="outline"
            disabled={
              rename.isPending ||
              !name.trim() ||
              name.trim() === project.name
            }
          >
            {rename.isPending ? <Spinner /> : null}
            Save name
          </Button>
        ) : null}
      </form>

      <div className="grid gap-1 p-5 text-sm">
        <span className="font-medium">Project ID</span>
        <code className="text-xs text-muted-foreground">{project.id}</code>
      </div>

      {permissions.canDeleteProject && project.type !== "personal" ? (
        <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-semibold text-destructive">
              Delete Project
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanently remove this Project and its isolated resources.
            </p>
          </div>
          <Button
            className="h-11"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete ${project.name}? This action cannot be undone.`,
                )
              ) {
                remove.mutate();
              }
            }}
          >
            {remove.isPending ? <Spinner /> : <Trash2 />}
            Delete Project
          </Button>
          {remove.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {remove.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

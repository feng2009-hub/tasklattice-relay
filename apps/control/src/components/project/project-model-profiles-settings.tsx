import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ModelProfile } from "@tasklattice/contracts";
import {
  ArrowRight,
  Cable,
  Check,
  CircleAlert,
  Plus,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { CreateModelProfileSheet } from "@/components/providers/create-model-profile-sheet";
import { ModelProfileStatus } from "@/components/providers/model-profile-status";
import { ProviderRegistrationDrawer } from "@/components/providers/provider-registration-drawer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { useCurrentProjectId } from "@/hooks/use-project";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

export function ProjectModelProfilesSettings({ project }: { project: Project }) {
  return <CurrentProjectModelProfiles project={project} />;
}

function CurrentProjectModelProfiles({ project }: { project: Project }) {
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const canManage = project.role === "admin";
  const profiles = useQuery({
    queryKey: scope.key("model-profiles"),
    queryFn: api.listModelProfiles,
  });
  const deployments = useQuery({
    queryKey: scope.key("model-deployments"),
    queryFn: api.listModelDeployments,
  });
  const setDefault = useMutation({
    mutationFn: (profile: ModelProfile) =>
      api.updateModelProfile(profile.id, { isDefault: true }),
    onSuccess: async (profile) => {
      setSuccessMessage(`${profile.name} is now the Project default.`);
      await queryClient.invalidateQueries({
        queryKey: scope.key("model-profiles"),
      });
    },
  });
  const refresh = useMutation({
    mutationFn: api.refreshModelProfile,
    onSuccess: async () =>
      queryClient.invalidateQueries({
        queryKey: scope.key("model-profiles"),
      }),
  });
  const items = profiles.data ?? [];
  const defaultProfile = items.find((profile) => profile.isDefault);

  return (
    <div className="divide-y">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Project Model Profiles</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            The default Profile is automatically applied when this Project
            creates a new Instance. Profiles package model identity, routing,
            compliance, and isolated credentials.
          </p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => setConnectionOpen(true)}
            >
              <Cable />
              Add upstream
            </Button>
            <Button className="h-11" onClick={() => setCreateOpen(true)}>
              <Plus />
              Create Profile
            </Button>
          </div>
        ) : null}
      </div>

      {profiles.isPending ? (
        <div className="flex min-h-40 items-center justify-center gap-3 p-5 text-sm text-muted-foreground">
          <Spinner />
          Loading Project Model Profiles…
        </div>
      ) : profiles.error ? (
        <div
          role="alert"
          className="flex items-start gap-3 border-l-2 border-destructive bg-destructive/5 p-5 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{profiles.error.message}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void profiles.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : items.length ? (
        <>
          {!defaultProfile ? (
            <div
              role="alert"
              className="flex gap-3 border-l-2 border-amber-500 bg-amber-500/5 px-5 py-4 text-sm"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <span>
                <strong className="block">No default Model Profile</strong>
                <span className="mt-1 block text-xs text-muted-foreground">
                  New Instances cannot provision model access until a Ready
                  Profile is selected.
                </span>
              </span>
            </div>
          ) : null}

          {successMessage ? (
            <p
              role="status"
              className="border-l-2 border-emerald-500 bg-emerald-500/5 px-5 py-3 text-sm text-emerald-800"
            >
              {successMessage}
            </p>
          ) : null}
          {setDefault.error ? (
            <p
              role="alert"
              className="border-l-2 border-destructive bg-destructive/5 px-5 py-3 text-sm text-destructive"
            >
              {setDefault.error.message}
            </p>
          ) : null}

          <ul className="divide-y" aria-label={`${project.name} Model Profiles`}>
            {items.map((profile) => (
              <ProfileSettingRow
                key={profile.id}
                canManage={canManage}
                profile={profile}
                refreshing={
                  refresh.isPending && refresh.variables === profile.id
                }
                selecting={
                  setDefault.isPending &&
                  setDefault.variables?.id === profile.id
                }
                onRefresh={() => refresh.mutate(profile.id)}
                onSelectDefault={() => {
                  setSuccessMessage("");
                  setDefault.mutate(profile);
                }}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
          <span className="grid size-10 place-items-center rounded-sm bg-primary/[0.07] text-primary">
            <SlidersHorizontal className="size-5" />
          </span>
          <h3 className="mt-4 text-sm font-semibold">
            No Model Profiles in this Project
          </h3>
          <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
            Create the first validated Profile and it will become the Project
            default automatically.
          </p>
          {canManage ? (
            <Button className="mt-4 h-11" onClick={() => setCreateOpen(true)}>
              <Plus />
              Create Model Profile
            </Button>
          ) : null}
        </div>
      )}

      <CreateModelProfileSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        availableModels={deployments.data ?? []}
        defaultIsDefault={!defaultProfile}
        modelsLoading={deployments.isPending}
        {...(deployments.error?.message
          ? { modelsError: deployments.error.message }
          : {})}
        onAddUpstream={() => {
          setCreateOpen(false);
          setConnectionOpen(true);
        }}
      />
      <ProviderRegistrationDrawer
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
      />
    </div>
  );
}

function ProfileSettingRow({
  canManage,
  onRefresh,
  onSelectDefault,
  profile,
  refreshing,
  selecting,
}: {
  canManage: boolean;
  onRefresh: () => void;
  onSelectDefault: () => void;
  profile: ModelProfile;
  refreshing: boolean;
  selecting: boolean;
}) {
  const projectId = useCurrentProjectId();
  const canBecomeDefault =
    canManage && profile.status === "READY" && !profile.isDefault;
  return (
    <li
      className={cn(
        "grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
        profile.isDefault && "bg-primary/[0.035]",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm border",
            profile.isDefault
              ? "border-primary/25 bg-primary/10 text-primary"
              : "text-muted-foreground",
          )}
        >
          {profile.isDefault ? (
            <Check className="size-4" />
          ) : (
            <SlidersHorizontal className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="truncate text-sm">{profile.name}</strong>
            {profile.isDefault ? (
              <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Project default
              </span>
            ) : null}
            <ModelProfileStatus status={profile.status} />
          </span>
          <code className="mt-1 block truncate text-xs text-muted-foreground">
            {profile.publicModelAlias}
          </code>
          <span className="mt-1 block text-xs text-muted-foreground">
            {profile.complianceDomain === "CN_MAINLAND"
              ? "CN Mainland"
              : "Global"}{" "}
            · {profile.consumers} active{" "}
            {profile.consumers === 1 ? "consumer" : "consumers"}
          </span>
          {!profile.isDefault && profile.status !== "READY" ? (
            <span className="mt-1 block text-xs text-amber-700">
              Validate this Profile before making it the default.
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Refresh ${profile.name}`}
          disabled={!canManage || refreshing}
          onClick={onRefresh}
        >
          <RefreshCw className={cn(refreshing && "animate-spin")} />
        </Button>
        {!profile.isDefault && canManage ? (
          <Button
            className="h-11"
            variant="outline"
            disabled={!canBecomeDefault || selecting}
            onClick={onSelectDefault}
          >
            {selecting ? <Spinner /> : <Check />}
            Set as default
          </Button>
        ) : null}
        <Button asChild className="h-11" variant="ghost">
          <Link
            to="/$projectId/setting/model-profiles/$profileId"
            params={{ projectId, profileId: profile.id }}
          >
            Details
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </li>
  );
}

import { useState } from "react";
import type {
  AccessPolicy,
  VirtualEmployee,
  VirtualEmployeeStatus,
} from "@tasklattice/contracts";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bot,
  CircleAlert,
  MoreHorizontal,
  Plus,
  Power,
  RotateCw,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { CreateVirtualEmployeeSheet } from "@/components/project/create-virtual-employee-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useProject } from "@/hooks/use-project";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import { useProjectQueryScope } from "@/hooks/use-project-query-scope";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/project";

export type VirtualEmployeeLifecycleAction =
  | "activate"
  | "provision"
  | "suspend";

type LifecycleVariables = {
  action: VirtualEmployeeLifecycleAction | "delete";
  id: string;
};

export function lifecycleActionForStatus(
  status: VirtualEmployeeStatus,
): VirtualEmployeeLifecycleAction | null {
  if (status === "active") return "suspend";
  if (status === "provisioning") return null;
  if (status === "error") return "provision";
  return "activate";
}

const statusLabels: Record<VirtualEmployeeStatus, string> = {
  active: "Active",
  draft: "Draft",
  pending_approval: "Pending approval",
  provisioning: "Provisioning",
  suspended: "Suspended",
  expired: "Expired",
  error: "Error",
};

function statusClass(status: VirtualEmployeeStatus): string {
  if (status === "active") {
    return "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "error" || status === "expired") {
    return "border-destructive/25 bg-destructive/5 text-destructive";
  }
  if (status === "pending_approval" || status === "provisioning") {
    return "border-amber-500/25 bg-amber-500/8 text-amber-800 dark:text-amber-300";
  }
  return "text-muted-foreground";
}

function actionLabel(action: VirtualEmployeeLifecycleAction): string {
  if (action === "suspend") return "Suspend";
  if (action === "provision") return "Retry provisioning";
  return "Activate";
}

function actionIcon(action: VirtualEmployeeLifecycleAction) {
  if (action === "suspend") return <ShieldOff />;
  if (action === "provision") return <RotateCw />;
  return <Power />;
}

export function ProjectVirtualEmployees({ project }: { project: Project }) {
  const scope = useProjectQueryScope();
  const queryClient = useQueryClient();
  const { refreshProjects } = useProject();
  const permissions = useProjectPermissions(project.role);
  const [createOpen, setCreateOpen] = useState(false);
  const employees = useQuery({
    queryKey: scope.key("virtual-employees"),
    queryFn: api.listVirtualEmployees,
  });
  const policies = useQuery({
    queryKey: scope.key("access-policies"),
    queryFn: api.listAccessPolicies,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: scope.key("virtual-employees"),
      }),
      queryClient.invalidateQueries({
        queryKey: ["project", project.id, "members"],
      }),
      refreshProjects(),
    ]);
  };

  const lifecycle = useMutation({
    mutationFn: async ({
      action,
      id,
    }: LifecycleVariables) => {
      if (action === "delete") return api.deleteVirtualEmployee(id);
      if (action === "suspend") return api.suspendVirtualEmployee(id);
      if (action === "provision") return api.provisionVirtualEmployee(id);
      return api.activateVirtualEmployee(id);
    },
    onSuccess: refresh,
  });

  const items = employees.data ?? [];
  const activeCount = items.filter((item) => item.status === "active").length;
  const attentionCount = items.filter(
    (item) => item.status === "error" || item.status === "expired",
  ).length;

  return (
    <div>
      <div className="flex min-h-16 flex-col justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-semibold">Virtual Employees</h2>
          <p className="text-xs text-muted-foreground">
            {employees.isLoading
              ? "Loading lifecycle state…"
              : `${items.length} total · ${activeCount} active${attentionCount ? ` · ${attentionCount} need attention` : ""}`}
          </p>
        </div>
        {permissions.canManageProject ? (
          <Button
            className="h-11"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
            Create Virtual Employee
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">View only</span>
        )}
      </div>

      {employees.isLoading ? (
        <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading Virtual Employees…
        </div>
      ) : employees.isError ? (
        <div className="m-4 border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">
          <p>{employees.error.message}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void employees.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : items.length ? (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_12rem_8rem_9rem_auto] gap-4 border-b bg-muted/20 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
            <span>Identity</span>
            <span>Binding Policy</span>
            <span>Instances</span>
            <span>Lifecycle</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y" aria-label={`${project.name} Virtual Employees`}>
            {items.map((employee) => (
              <VirtualEmployeeRow
                key={employee.id}
                employee={employee}
                lifecycle={lifecycle}
                policies={policies.data ?? []}
                projectId={project.id}
                canManage={permissions.canManageProject}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="grid min-h-64 place-items-center p-8 text-center">
          <div>
            <Bot className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No Virtual Employees yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Create a Project permission identity and bind it to an existing
              Access Policy.
            </p>
            {permissions.canManageProject ? (
              <Button
                className="mt-5 h-11"
                variant="outline"
                onClick={() => setCreateOpen(true)}
              >
                <Plus />
                Create first Virtual Employee
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {lifecycle.error ? (
        <p
          className="m-4 border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {lifecycle.error.message}
        </p>
      ) : null}

      <CreateVirtualEmployeeSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refresh()}
      />
    </div>
  );
}

function VirtualEmployeeRow({
  canManage,
  employee,
  lifecycle,
  policies,
  projectId,
}: {
  canManage: boolean;
  employee: VirtualEmployee;
  lifecycle: UseMutationResult<
    VirtualEmployee | void,
    Error,
    LifecycleVariables
  >;
  policies: AccessPolicy[];
  projectId: string;
}) {
  const primaryAction = lifecycleActionForStatus(employee.status);
  const pending =
    lifecycle.isPending && lifecycle.variables?.id === employee.id;
  const hasInstances = employee.boundInstanceIds.length > 0;
  const boundPolicies = policies.filter((policy) =>
    policy.virtualEmployeeIds.includes(employee.id),
  );

  return (
    <li className="grid min-h-24 gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_12rem_8rem_9rem_auto] md:items-center md:gap-4">
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md border bg-primary/5 text-primary">
          <Bot className="size-5" />
        </span>
        <span className="min-w-0">
          <Link
            className="block truncate text-sm font-semibold hover:text-primary hover:underline"
            to="/$projectId/setting/virtual-employees/$employeeId"
            params={{ employeeId: employee.id, projectId }}
          >
            {employee.displayName}
          </Link>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {employee.name}
          </span>
        </span>
      </span>

      <span className="min-w-0 text-xs">
        <span className="block text-muted-foreground md:hidden">Binding Policy</span>
        <strong className="mt-1 block truncate">
          {boundPolicies[0]?.name ?? "Not bound"}
        </strong>
        {boundPolicies.length ? (
          <span className="mt-0.5 block text-muted-foreground">
            {boundPolicies[0]?.status === "ACTIVE" ? "Active" : "Draft"}
            {boundPolicies.length > 1
              ? ` · +${boundPolicies.length - 1} more`
              : ""}
          </span>
        ) : (
          <span className="mt-0.5 block text-amber-700 dark:text-amber-300">
            No effective permissions
          </span>
        )}
      </span>

      <span className="text-xs">
        <span className="block text-muted-foreground md:hidden">Instances</span>
        <strong className="mt-1 block">
          {employee.boundInstanceIds.length} bound
        </strong>
      </span>

      <span>
        <Badge
          variant="outline"
          className={cn("capitalize", statusClass(employee.status))}
        >
          {employee.status === "error" ? <CircleAlert /> : null}
          {statusLabels[employee.status]}
        </Badge>
      </span>

      <span className="flex items-center gap-2 md:justify-end">
        {canManage && primaryAction ? (
          <Button
            className="h-11"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              lifecycle.mutate({
                action: primaryAction,
                id: employee.id,
              })
            }
          >
            {pending ? <Spinner /> : actionIcon(primaryAction)}
            {actionLabel(primaryAction)}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Actions for ${employee.displayName}`}
            >
              {pending ? <Spinner /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                to="/$projectId/setting/virtual-employees/$employeeId"
                params={{ employeeId: employee.id, projectId }}
              >
                View lifecycle details
              </Link>
            </DropdownMenuItem>
            {canManage && primaryAction ? (
              <DropdownMenuItem
                disabled={pending}
                onSelect={() =>
                  lifecycle.mutate({
                    action: primaryAction,
                    id: employee.id,
                  })
                }
              >
                {actionIcon(primaryAction)}
                {actionLabel(primaryAction)}
              </DropdownMenuItem>
            ) : null}
            {canManage ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={pending || hasInstances}
                  title={
                    hasInstances
                      ? "Unbind every Instance before deleting this Virtual Employee."
                      : undefined
                  }
                  onSelect={() => {
                    if (
                      window.confirm(
                        `Delete ${employee.displayName}? This cannot be undone.`,
                      )
                    ) {
                      lifecycle.mutate({
                        action: "delete",
                        id: employee.id,
                      });
                    }
                  }}
                >
                  <Trash2 />
                  {hasInstances
                    ? "Delete blocked by Instances"
                    : "Delete Virtual Employee"}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </li>
  );
}

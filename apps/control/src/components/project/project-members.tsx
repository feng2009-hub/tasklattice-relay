import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bot,
  MoreHorizontal,
  Plus,
  UserPlus,
  UserRound,
  UserX,
} from "lucide-react";
import { CreateVirtualEmployeeSheet } from "@/components/project/create-virtual-employee-sheet";
import { ProjectInviteDialog } from "@/components/project/project-invite-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  getProjectMembers,
  removeMember,
} from "@/services/project";
import type { Project, ProjectMember } from "@/types/project";

function memberInitials(member: ProjectMember): string {
  return member.name
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function virtualStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function ProjectMembers({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const { refreshProjects } = useProject();
  const permissions = useProjectPermissions(project.role);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createVirtualOpen, setCreateVirtualOpen] = useState(false);
  const members = useQuery({
    queryKey: ["project", project.id, "members"],
    queryFn: () => getProjectMembers(project.id),
  });

  const refreshTeam = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["project", project.id, "members"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["project", project.id, "virtual-employees"],
      }),
      refreshProjects(),
    ]);
  };

  const removeHuman = useMutation({
    mutationFn: (memberId: string) => removeMember(project.id, memberId),
    onSuccess: refreshTeam,
  });
  const virtualAction = useMutation({
    mutationFn: async ({
      id,
      kind,
    }: {
      id: string;
      kind: "activate" | "delete" | "provision" | "suspend";
    }) => {
      if (kind === "delete") return api.deleteVirtualEmployee(id);
      if (kind === "suspend") return api.suspendVirtualEmployee(id);
      if (kind === "provision") return api.provisionVirtualEmployee(id);
      return api.activateVirtualEmployee(id);
    },
    onSuccess: refreshTeam,
  });

  const team = members.data ?? [];
  const humanCount = team.filter((member) => member.kind === "human").length;
  const virtualCount = team.length - humanCount;
  const pendingError = removeHuman.error ?? virtualAction.error;

  return (
    <div>
      <div className="flex min-h-16 flex-col justify-between gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-sm font-semibold">Project members</h2>
          <p className="text-xs text-muted-foreground">
            {members.isLoading
              ? "Loading members…"
              : `${humanCount} human · ${virtualCount} virtual`}
          </p>
        </div>
        {permissions.canManageProject ? (
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-10 flex-1 sm:flex-none"
              size="sm"
              variant="outline"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus />
              Invite person
            </Button>
            <Button
              className="h-10 flex-1 sm:flex-none"
              size="sm"
              onClick={() => setCreateVirtualOpen(true)}
            >
              <Plus />
              Create Virtual Employee
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">View only</span>
        )}
      </div>

      {members.isLoading ? (
        <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading Project members…
        </div>
      ) : members.isError ? (
        <div className="m-4 border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive">
          <p>{members.error.message}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void members.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : team.length ? (
        <ul className="divide-y" aria-label={`${project.name} Project members`}>
          {team.map((member) => {
            const virtual = member.kind === "virtual";
            const pending =
              (removeHuman.isPending && removeHuman.variables === member.id) ||
              (virtualAction.isPending &&
                virtualAction.variables?.id === member.id);

            return (
              <li
                key={`${member.kind}-${member.id}`}
                className="flex min-h-[72px] items-center gap-3 px-4 py-2.5"
              >
                <Avatar className="size-9">
                  <AvatarFallback
                    className={cn(
                      "text-xs font-semibold",
                      virtual
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {virtual ? <Bot className="size-4" /> : memberInitials(member)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {virtual ? (
                      <Link
                        className="truncate text-sm font-semibold hover:text-primary hover:underline"
                        to="/$projectId/setting/virtual-employees/$employeeId"
                        params={{
                          employeeId: member.id,
                          projectId: project.id,
                        }}
                      >
                        {member.name}
                      </Link>
                    ) : (
                      <strong className="truncate text-sm">{member.name}</strong>
                    )}
                    {member.kind === "human" &&
                    member.status === "invited" ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/25 bg-amber-500/8 text-[10px] text-amber-800"
                      >
                        Invited
                      </Badge>
                    ) : null}
                    {virtual ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize",
                          member.status === "active"
                            ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700"
                            : "text-muted-foreground",
                        )}
                      >
                        {virtualStatusLabel(member.status)}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {virtual
                      ? member.businessRole ||
                        `${member.environment} environment`
                      : member.email}
                  </span>
                </span>
                <span className="hidden text-xs font-medium capitalize text-muted-foreground sm:block">
                  {virtual ? "Virtual member" : member.role}
                </span>
                {permissions.canManageProject ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Actions for ${member.name}`}
                      >
                        {pending ? <Spinner /> : <MoreHorizontal />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {virtual ? (
                        <>
                          <DropdownMenuItem asChild>
                            <Link
                              to="/$projectId/setting/virtual-employees/$employeeId"
                              params={{
                                employeeId: member.id,
                                projectId: project.id,
                              }}
                            >
                              View details
                            </Link>
                          </DropdownMenuItem>
                          {member.status === "active" ? (
                            <DropdownMenuItem
                              onSelect={() =>
                                virtualAction.mutate({
                                  id: member.id,
                                  kind: "suspend",
                                })
                              }
                            >
                              Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() =>
                                virtualAction.mutate({
                                  id: member.id,
                                  kind:
                                    member.status === "error"
                                      ? "provision"
                                      : "activate",
                                })
                              }
                            >
                              {member.status === "error"
                                ? "Retry provisioning"
                                : "Activate"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => {
                              if (
                                window.confirm(
                                  `Delete ${member.name}? This cannot be undone.`,
                                )
                              ) {
                                virtualAction.mutate({
                                  id: member.id,
                                  kind: "delete",
                                });
                              }
                            }}
                          >
                            <UserX />
                            Delete Virtual Employee
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => removeHuman.mutate(member.id)}
                        >
                          <UserX />
                          Remove member
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="w-9" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid min-h-52 place-items-center p-8 text-center">
          <div>
            <UserRound className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No team members found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Invite a person or create a Virtual Employee to build this
              Project roster.
            </p>
          </div>
        </div>
      )}

      {pendingError ? (
        <p
          className="m-4 border-l-2 border-destructive bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {pendingError.message}
        </p>
      ) : null}

      <ProjectInviteDialog
        project={project}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={refreshTeam}
      />
      <CreateVirtualEmployeeSheet
        open={createVirtualOpen}
        onOpenChange={setCreateVirtualOpen}
        onCreated={() => void refreshTeam()}
      />
    </div>
  );
}
